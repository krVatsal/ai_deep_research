import { DurableObject } from "cloudflare:workers";
import { Env, Message, SessionState, AiMessage, ResearchResult } from "./types";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_HISTORY = 20; // Keep last 20 messages in context window

const SYSTEM_PROMPT = `You are Deep Research Assistant — a precise, intellectually rigorous AI built on Cloudflare's edge infrastructure. You help users explore complex topics through thoughtful conversation.

Characteristics:
- Concise but thorough: get to the point, then expand with nuance
- Cite uncertainty when you have it; don't fabricate confidence  
- When a question is complex, acknowledge the dimensions involved
- For simple questions, give direct answers without preamble
- Use markdown formatting: **bold** for key terms, \`code\` for technical terms, bullet points for lists

You have access to two modes:
1. **Chat mode** (current): conversational Q&A with memory across turns
2. **Deep Research mode**: triggered separately — decomposes questions, researches sub-topics, synthesizes findings

Keep responses under 400 words unless the topic genuinely demands more depth.`;

export class ChatSession extends DurableObject<Env> {
  private state: SessionState = {
    messages: [],
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Load state from storage
    await this.loadState();

    // GET /api/history/:sessionId
    if (request.method === "GET" && path.includes("/history/")) {
      return new Response(
        JSON.stringify({
          messages: this.state.messages,
          createdAt: this.state.createdAt,
          lastActive: this.state.lastActive,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // GET research-result
    if (request.method === "GET" && path.includes("/research-result")) {
      return new Response(
        JSON.stringify(this.state.latestResearch ?? null),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // POST /api/chat/:sessionId — streaming chat
    if (request.method === "POST") {
      const body = await request.json<{
        message: string;
        researchContext?: ResearchResult;
      }>();

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: body.message,
        timestamp: Date.now(),
        type: "chat",
      };

      this.state.messages.push(userMessage);
      this.state.lastActive = Date.now();

      // Build context window — system + recent messages
      const contextMessages: AiMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
      ];

      // If research context is injected, add a system note
      if (body.researchContext) {
        contextMessages.push({
          role: "system",
          content: `The user has just completed a Deep Research session on: "${body.researchContext.question}". 
Here is a summary of the findings:
${body.researchContext.synthesis}

Sub-topics researched: ${body.researchContext.subQuestions.join(", ")}

Use this context to inform your response.`,
        });
      }

      // Add recent conversation history
      const recentMessages = this.state.messages.slice(-MAX_HISTORY);
      for (const msg of recentMessages) {
        contextMessages.push({ role: msg.role, content: msg.content });
      }

      // Stream response from Workers AI
      const aiResponse = await this.env.AI.run(MODEL, {
        messages: contextMessages,
        stream: true,
        max_tokens: 1024,
      } as Parameters<typeof this.env.AI.run>[1]);

      // Collect full response while streaming
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      let fullContent = "";

      // Process the SSE stream from Workers AI and forward to client
      const reader = (aiResponse as ReadableStream).getReader();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  const token = parsed.response ?? "";
                  if (token) {
                    fullContent += token;
                    // Forward as SSE to client
                    await writer.write(
                      encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                    );
                  }
                } catch {
                  // skip malformed chunks
                }
              }
            }
          }

          // Store assistant response in memory
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullContent,
            timestamp: Date.now(),
            type: "chat",
          };
          this.state.messages.push(assistantMessage);
          await this.saveState();

          // Signal done
          await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch (err) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream error: " + String(err) })}\n\n`
            )
          );
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  }

  // Called by Workflow to store research results
  async storeResearchResult(result: ResearchResult): Promise<void> {
    await this.loadState();
    this.state.latestResearch = result;
    this.state.lastActive = Date.now();

    // Add a synthetic assistant message summarizing the research
    const researchMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `**Deep Research Complete**\n\n**Question:** ${result.question}\n\n${result.synthesis}`,
      timestamp: Date.now(),
      type: "research",
    };
    this.state.messages.push(researchMessage);
    await this.saveState();
  }

  private async loadState(): Promise<void> {
    const stored = await this.ctx.storage.get<SessionState>("state");
    if (stored) {
      this.state = stored;
    }
  }

  private async saveState(): Promise<void> {
    await this.ctx.storage.put("state", this.state);
  }
}
