# PROMPTS.md — AI Prompts Used in Development

This file documents the prompts used with AI coding assistants (Claude) during the development of `cf_ai_deep_research`.

---

## 1. Initial architecture design

**Prompt:**
> We plan to fast track review of candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include: LLM (recommend using Llama 3.3 on Workers AI), Workflow / coordination (recommend using Workflows, Workers or Durable Objects), User input via chat or voice (recommend using Pages or Realtime), Memory or state.
>
> Build a complete, production-quality Cloudflare AI application. Reference docs: https://developers.cloudflare.com/agents/ and https://agents.cloudflare.com/

**What was generated:** Full project scaffold including `src/index.ts`, `src/ChatSession.ts`, `src/ResearchWorkflow.ts`, `src/types.ts`, `wrangler.toml`, `package.json`, `tsconfig.json`.

---

## 2. Durable Object design for persistent chat memory

**Prompt used internally when designing `ChatSession.ts`:**
> Design a Cloudflare Durable Object called ChatSession that:
> - Stores conversation history in ctx.storage (key "state")
> - Handles POST requests for streaming LLM chat via Server-Sent Events
> - Calls Llama 3.3 70B on Workers AI with full conversation context
> - Supports a GET endpoint to return history
> - Has a storeResearchResult() RPC method callable by Workflows
> - Limits context window to last 20 messages
> - Uses a concise system prompt that describes both Chat and Research modes

---

## 3. Workflow multi-step pipeline design

**Prompt used internally when designing `ResearchWorkflow.ts`:**
> Design a Cloudflare Workflow called ResearchWorkflow that orchestrates a 3-step research pipeline:
> Step 1 (decompose-question): Use LLM to decompose the user's question into exactly 3 focused sub-questions. Return them as a JSON array.
> Step 2 (research-subquestion-N): For each sub-question, run an independent LLM call to research it thoroughly in under 250 words.
> Step 3 (synthesize-research): Combine all findings into a cohesive markdown synthesis report with direct answer, narrative integration, and key takeaways.
> Step 4 (store-result): Call storeResearchResult() on the ChatSession Durable Object to persist the result.
> Each step should have retries with exponential backoff. The workflow should take WorkflowParams { question, sessionId }.

---

## 4. Frontend UI design

**Prompt used internally when designing `public/index.html`:**
> Build a single-file HTML/CSS/JS chat interface for a research assistant with:
> - Dark terminal aesthetic: black background (#0a0a0c), IBM Plex Mono font, green (#4ade80) accent, scanline overlay effect
> - Two modes: Chat (streaming SSE) and Research (Workflow with pipeline progress steps)
> - Animated pipeline steps panel showing: decompose → research 1/2/3 → synthesize → store
> - Welcome screen with architecture overview showing LLM, Workflows, Durable Objects, Pages components
> - Auto-resizing textarea, markdown rendering, typing indicator, message history
> - Session persistence via sessionStorage
> - Example query chips for both modes
> No frameworks, no build step, pure HTML/CSS/JS. Avoid generic AI aesthetics.

---

## 5. HTTP routing in main Worker

**Prompt used internally for `src/index.ts`:**
> Write a Cloudflare Worker entry point that routes:
> - POST /api/chat/:sessionId → ChatSession Durable Object
> - GET /api/history/:sessionId → ChatSession Durable Object
> - POST /api/research/:sessionId → Create a ResearchWorkflow instance with { question, sessionId }; return { workflowId }
> - GET /api/workflow/:workflowId → Return workflow instance status
> - GET /api/session/:sessionId/research-result → ChatSession Durable Object
> Add CORS headers to all responses. Use try/catch with error logging.

---

## 6. System prompt for the LLM

**Prompt used to write the SYSTEM_PROMPT constant in ChatSession.ts:**
> Write a system prompt for an AI research assistant called "Deep Research Assistant" that:
> - Is precise and intellectually rigorous
> - Gives concise but thorough answers, under 400 words
> - Uses markdown formatting (bold for key terms, code for technical terms)
> - Acknowledges uncertainty honestly
> - Mentions it has two modes: Chat (current) and Deep Research (separate pipeline)
> - Avoids generic AI preambles like "Certainly!" or "Great question!"

---

## Notes on AI-assisted development

- The core architecture (Durable Objects + Workflows + Workers AI) was designed by the developer; Claude was used to generate implementation code matching that design.
- All business logic (pipeline step design, session state structure, routing) was human-directed.
- Code was reviewed, tested locally with `wrangler dev`, and refined before submission.
- No code was copied from other submissions or open-source Cloudflare AI examples.
