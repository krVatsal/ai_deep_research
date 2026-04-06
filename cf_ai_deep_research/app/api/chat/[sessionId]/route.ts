import { NextRequest } from "next/server";
import { addMessage, getSession } from "@/lib/state";
import { AiMessage } from "@/lib/types";
import { workersAiStream } from "@/lib/workers-ai";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are Deep Research Assistant, a precise AI assistant.

Guidelines:
- Be concise but thorough.
- Use markdown for structure.
- Avoid filler and generic preambles.
- Acknowledge uncertainty honestly.
- Keep responses under 400 words unless depth is necessary.`;

const MAX_HISTORY = 20;

function toSseLine(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;

  const body = (await request.json()) as {
    message?: string;
    researchContext?: {
      question: string;
      subQuestions: string[];
      synthesis: string;
    };
  };

  if (!body.message || !body.message.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const userMessage = {
    id: crypto.randomUUID(),
    role: "user" as const,
    content: body.message.trim(),
    timestamp: Date.now(),
    type: "chat" as const,
  };

  await addMessage(sessionId, userMessage);

  const session = await getSession(sessionId);

  const contextMessages: AiMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (body.researchContext) {
    contextMessages.push({
      role: "system",
      content: `The user recently completed deep research on \"${body.researchContext.question}\".\n\nSummary:\n${body.researchContext.synthesis}\n\nSub-topics: ${body.researchContext.subQuestions.join(", ")}`,
    });
  }

  for (const message of session.messages.slice(-MAX_HISTORY)) {
    contextMessages.push({ role: message.role, content: message.content });
  }

  try {
    const upstream = await workersAiStream(contextMessages, 1024);
    const reader = upstream.getReader();
    const decoder = new TextDecoder();

    let fullContent = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === "[DONE]") continue;

              try {
                const parsed = JSON.parse(payload) as { response?: string; token?: string };
                const token = parsed.response ?? parsed.token ?? "";

                if (token) {
                  fullContent += token;
                  controller.enqueue(toSseLine({ token }));
                }
              } catch {
                // Ignore malformed chunks.
              }
            }
          }

          await addMessage(sessionId, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullContent,
            timestamp: Date.now(),
            type: "chat",
          });

          controller.enqueue(toSseLine({ done: true }));
          controller.close();
        } catch (error) {
          controller.enqueue(toSseLine({ error: String(error) }));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
