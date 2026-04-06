import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, pruneMessages, streamText, type ModelMessage } from "ai";
import type { ResearchResult, ResearchState, ResearchStep } from "./types";

function inlineDataUrls(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || typeof message.content === "string") {
      return message;
    }

    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "file" || typeof part.data !== "string") {
          return part;
        }

        const match = part.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return part;

        const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
        return { ...part, data: bytes, mediaType: match[1] };
      })
    };
  });
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as const;
const MAX_HISTORY = 80;
const MAX_RESEARCH_HISTORY = 5;

const RESEARCH_STEPS = [
  { id: "plan", label: "Plan", status: "pending" as const, detail: "Break the question into research angles" },
  { id: "research-1", label: "Research 1", status: "pending" as const, detail: "Investigate the first angle" },
  { id: "research-2", label: "Research 2", status: "pending" as const, detail: "Investigate the second angle" },
  { id: "research-3", label: "Research 3", status: "pending" as const, detail: "Investigate the third angle" },
  { id: "synthesize", label: "Synthesize", status: "pending" as const, detail: "Combine findings into a report" },
  { id: "store", label: "Store", status: "pending" as const, detail: "Persist the final research result" }
] satisfies ResearchStep[];

const DEFAULT_STATE: ResearchState = {
  researchPhase: "idle",
  researchQuestion: null,
  researchSteps: RESEARCH_STEPS,
  latestResearch: null,
  researchHistory: [],
  updatedAt: new Date().toISOString()
};

function cloneSteps(status: ResearchStep["status"], detailById?: Record<string, string>): ResearchStep[] {
  return RESEARCH_STEPS.map((step) => ({
    ...step,
    status,
    detail: detailById?.[step.id] ?? step.detail
  }));
}

function updateStep(steps: ResearchStep[], stepId: string, status: ResearchStep["status"], detail?: string): ResearchStep[] {
  return steps.map((step) => (step.id === stepId ? { ...step, status, detail: detail ?? step.detail } : step));
}

function summarizeResearch(result: ResearchResult | null): string {
  if (!result) return "";
  return [
    `Question: ${result.question}`,
    `Sub-questions: ${result.subQuestions.join(" | ")}`,
    `Summary: ${result.synthesis}`
  ].join("\n\n");
}

function extractTextFromAiRunResponse(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload
      .map((item) => extractTextFromAiRunResponse(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const preferredKeys = ["response", "text", "output_text", "output", "result"];

  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    const value = extractTextFromAiRunResponse(record[key]);
    if (value) return value;
  }

  return "";
}

async function runTextModel(env: Env, messages: { role: "system" | "user" | "assistant"; content: string }[], maxTokens: number) {
  const response = await env.AI.run(MODEL, {
    messages,
    max_tokens: maxTokens
  });

  const text = extractTextFromAiRunResponse(response);
  if (!text) {
    throw new Error("Model returned an empty response.");
  }

  return text.trim();
}

function parseSubQuestionsFromText(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        const fromJson = parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
        if (fromJson.length >= 3) {
          return fromJson.slice(0, 3);
        }
      }
    } catch {
      // Fall back to line parsing below.
    }
  }

  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => (line.endsWith("?") ? line : `${line}?`));

  const unique = [...new Set(lines)];
  if (unique.length >= 3) {
    return unique.slice(0, 3);
  }

  return [];
}

async function generateSubQuestions(env: Env, question: string): Promise<string[]> {
  const text = await runTextModel(
    env,
    [
      {
        role: "system",
        content:
          "You are a research planner. Decompose each question into exactly 3 focused sub-questions. Return only valid JSON as an array of 3 strings. No markdown, no preamble."
      },
      {
        role: "user",
        content: `Decompose this question into 3 sub-questions: ${question}`
      }
    ],
    300
  );

  const subQuestions = parseSubQuestionsFromText(text);
  if (subQuestions.length !== 3) {
    throw new Error(`Could not parse sub-questions from model output: ${text}`);
  }

  return subQuestions;
}

async function researchSubQuestion(env: Env, question: string): Promise<string> {
  return runTextModel(
    env,
    [
      {
        role: "system",
        content:
          "You are a precise research analyst. Answer thoroughly but concisely in under 250 words. Focus on concrete facts, mechanisms, tradeoffs, and examples."
      },
      {
        role: "user",
        content: question
      }
    ],
    500
  );
}

async function synthesizeResearch(
  env: Env,
  question: string,
  subQuestions: string[],
  subAnswers: Record<string, string>
): Promise<string> {
  const findings = subQuestions
    .map((subQuestion, index) => `Sub-question ${index + 1}: ${subQuestion}\nFinding: ${subAnswers[subQuestion] ?? ""}`)
    .join("\n\n");

  return runTextModel(
    env,
    [
      {
        role: "system",
        content:
          "You are a senior research analyst. Write a markdown synthesis that opens with a direct answer, then integrates the findings, then closes with key takeaways. Keep it under 500 words."
      },
      {
        role: "user",
        content: `Original question: ${question}\n\nResearch findings:\n${findings}`
      }
    ],
    900
  );
}

export class ChatAgent extends AIChatAgent<Env, ResearchState> {
  maxPersistedMessages = MAX_HISTORY;
  initialState: ResearchState = DEFAULT_STATE;

  @callable()
  async clearResearch() {
    this.setState({
      ...this.state,
      researchPhase: "idle",
      researchQuestion: null,
      researchSteps: cloneSteps("pending"),
      latestResearch: null,
      researchHistory: [],
      updatedAt: new Date().toISOString()
    });
    return this.state;
  }

  @callable()
  async startResearch(question: string): Promise<ResearchResult> {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      throw new Error("Research question is required.");
    }

    if (this.state.researchPhase === "planning" || this.state.researchPhase === "researching" || this.state.researchPhase === "synthesizing") {
      throw new Error("A research run is already in progress.");
    }

    this.setState({
      ...this.state,
      researchPhase: "planning",
      researchQuestion: normalizedQuestion,
      researchSteps: cloneSteps("pending"),
      updatedAt: new Date().toISOString()
    });

    try {
      const subQuestions = await generateSubQuestions(this.env, normalizedQuestion);
      this.setState({
        ...this.state,
        researchPhase: "researching",
        researchSteps: updateStep(this.state.researchSteps, "plan", "done", "Generated 3 sub-questions")
      });

      const subAnswers: Record<string, string> = {};

      for (let index = 0; index < subQuestions.length; index++) {
        const stepId = `research-${index + 1}`;
        const subQuestion = subQuestions[index];

        this.setState({
          ...this.state,
          researchPhase: "researching",
          researchSteps: updateStep(this.state.researchSteps, stepId, "running", `Researching: ${subQuestion}`)
        });

        const answer = await researchSubQuestion(this.env, subQuestion);
        subAnswers[subQuestion] = answer;

        this.setState({
          ...this.state,
          researchPhase: "researching",
          researchSteps: updateStep(this.state.researchSteps, stepId, "done", answer.slice(0, 120) || "Research complete")
        });
      }

      this.setState({
        ...this.state,
        researchPhase: "synthesizing",
        researchSteps: updateStep(this.state.researchSteps, "synthesize", "running", "Creating the final synthesis")
      });

      const synthesis = await synthesizeResearch(this.env, normalizedQuestion, subQuestions, subAnswers);
      const result: ResearchResult = {
        question: normalizedQuestion,
        subQuestions,
        subAnswers,
        synthesis,
        timestamp: Date.now()
      };

      this.setState({
        ...this.state,
        researchPhase: "done",
        latestResearch: result,
        researchHistory: [result, ...this.state.researchHistory].slice(0, MAX_RESEARCH_HISTORY),
        researchSteps: cloneSteps("done"),
        updatedAt: new Date().toISOString()
      });

      this.broadcast(
        JSON.stringify({
          type: "research-complete",
          result
        })
      );

      return result;
    } catch (error) {
      this.setState({
        ...this.state,
        researchPhase: "error",
        researchSteps: cloneSteps("error"),
        updatedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const recentResearch = summarizeResearch(this.state.latestResearch);
    const researchContext = recentResearch
      ? `\n\nRecent deep research context:\n${recentResearch}`
      : "";

    const result = streamText({
      model: workersai(MODEL, {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a precise, intellectually rigorous AI assistant. Keep responses concise but useful, use markdown when helpful, and avoid generic filler.${researchContext}`,
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) || new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
