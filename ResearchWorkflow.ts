import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { Env, WorkflowParams, ResearchResult } from "./types";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * ResearchWorkflow — a Cloudflare Workflow that orchestrates a 3-step research pipeline:
 *
 * Step 1: DECOMPOSE  — Use LLM to break the question into 3–4 focused sub-questions
 * Step 2: RESEARCH   — Answer each sub-question independently (sequential, with retries)
 * Step 3: SYNTHESIZE — Combine all sub-answers into a comprehensive final response
 * Step 4: STORE      — Persist result to the ChatSession Durable Object
 *
 * Each step is durable: if the workflow crashes, it resumes from the last completed step.
 */
export class ResearchWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(
    event: WorkflowEvent<WorkflowParams>,
    step: WorkflowStep
  ): Promise<ResearchResult> {
    const { question, sessionId } = event.payload;

    // ─── STEP 1: Decompose the question ───────────────────────────────────────
    const subQuestions = await step.do<string[]>(
      "decompose-question",
      { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" } },
      async () => {
        const response = await this.env.AI.run(MODEL, {
          messages: [
            {
              role: "system",
              content: `You are a research coordinator. Given a complex question, decompose it into exactly 3 focused sub-questions that together cover the full topic. Each sub-question should be self-contained and answerable independently.

Respond ONLY with a JSON array of 3 strings. No preamble, no markdown, just raw JSON.
Example: ["What is X?", "How does Y work?", "What are the implications of Z?"]`,
            },
            {
              role: "user",
              content: `Decompose this question into 3 sub-questions: "${question}"`,
            },
          ],
          max_tokens: 256,
        } as Parameters<typeof this.env.AI.run>[1]);

        const text = (response as { response: string }).response.trim();
        // Extract JSON array from response
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error("Failed to parse sub-questions: " + text);
        return JSON.parse(match[0]) as string[];
      }
    );

    // ─── STEP 2: Research each sub-question ───────────────────────────────────
    const subAnswers: Record<string, string> = {};

    for (let i = 0; i < subQuestions.length; i++) {
      const sq = subQuestions[i];

      const answer = await step.do<string>(
        `research-subquestion-${i + 1}`,
        { retries: { limit: 3, delay: "1 second", backoff: "linear" } },
        async () => {
          const response = await this.env.AI.run(MODEL, {
            messages: [
              {
                role: "system",
                content: `You are a knowledgeable research analyst. Answer the question thoroughly but concisely. Use specific facts, mechanisms, or examples. Keep your answer under 250 words. Use plain prose — no headers, minimal bullet points.`,
              },
              {
                role: "user",
                content: sq,
              },
            ],
            max_tokens: 512,
          } as Parameters<typeof this.env.AI.run>[1]);

          return (response as { response: string }).response.trim();
        }
      );

      subAnswers[sq] = answer;
    }

    // ─── STEP 3: Synthesize findings ──────────────────────────────────────────
    const synthesis = await step.do<string>(
      "synthesize-research",
      { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" } },
      async () => {
        const researchContext = subQuestions
          .map((sq, i) => `**Sub-question ${i + 1}:** ${sq}\n**Finding:** ${subAnswers[sq]}`)
          .join("\n\n");

        const response = await this.env.AI.run(MODEL, {
          messages: [
            {
              role: "system",
              content: `You are a senior research analyst writing a synthesis report. Given research findings on sub-questions, write a cohesive, well-structured synthesis that:
1. Opens with a direct answer to the main question (2-3 sentences)
2. Integrates the sub-findings into a coherent narrative
3. Highlights connections and implications across sub-topics
4. Closes with key takeaways

Use markdown formatting. Keep it under 500 words. Be precise and analytical, not generic.`,
            },
            {
              role: "user",
              content: `Original question: "${question}"\n\nResearch findings:\n\n${researchContext}\n\nWrite a synthesis report.`,
            },
          ],
          max_tokens: 1024,
        } as Parameters<typeof this.env.AI.run>[1]);

        return (response as { response: string }).response.trim();
      }
    );

    // ─── STEP 4: Store result in Durable Object ────────────────────────────────
    const result: ResearchResult = {
      question,
      subQuestions,
      subAnswers,
      synthesis,
      timestamp: Date.now(),
      workflowId: event.instanceId,
    };

    await step.do(
      "store-result",
      { retries: { limit: 5, delay: "1 second", backoff: "linear" } },
      async () => {
        const id = this.env.CHAT_SESSION.idFromName(sessionId);
        const stub = this.env.CHAT_SESSION.get(id) as unknown as {
          storeResearchResult: (r: ResearchResult) => Promise<void>;
        };
        await stub.storeResearchResult(result);
      }
    );

    return result;
  }
}
