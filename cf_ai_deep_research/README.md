# cf_ai_deep_research

> An AI-powered multi-step research assistant built entirely on Cloudflare's edge infrastructure.

**Live demo:** `https://cf-ai-deep-research.<your-subdomain>.workers.dev`

---

## What it does

Deep Research is a two-mode AI assistant:

**Chat mode** — Conversational Q&A powered by Llama 3.3 70B. Responses stream token-by-token directly to the browser. Conversation history is persisted in a Durable Object, so your session survives page reloads.

**Research mode** — Triggers a durable multi-step Workflow that:
1. **Decomposes** your question into 3 focused sub-questions (LLM call)
2. **Researches** each sub-question independently (3 parallel-ish LLM calls with retries)
3. **Synthesizes** all findings into a comprehensive analytical report (LLM call)
4. **Stores** the result into the ChatSession Durable Object for follow-up conversation

The pipeline survives crashes — if a Worker restarts mid-Workflow, it resumes from the last completed step.

---

## Architecture

```
Browser (Pages)
    │
    ├─ POST /api/chat/:sessionId ──────► ChatSession (Durable Object)
    │                                        │
    │                                        ├─ Loads conversation history from DO storage
    │                                        ├─ Calls Workers AI (Llama 3.3, streaming)
    │                                        └─ Streams SSE back to browser
    │
    ├─ POST /api/research/:sessionId ─────► Cloudflare Workflow
    │                                        │
    │                                        ├─ step 1: decompose-question (LLM)
    │                                        ├─ step 2: research-subquestion-1 (LLM)
    │                                        ├─ step 3: research-subquestion-2 (LLM)
    │                                        ├─ step 4: research-subquestion-3 (LLM)
    │                                        ├─ step 5: synthesize-research (LLM)
    │                                        └─ step 6: store-result → ChatSession DO
    │
    ├─ GET  /api/workflow/:workflowId ────► Workflow status polling
    ├─ GET  /api/history/:sessionId ──────► ChatSession (load history)
    └─ GET  /api/session/:id/research-result ► ChatSession (get last research)
```

### Components mapped to requirements

| Requirement | Implementation |
|---|---|
| **LLM** | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via Workers AI (`env.AI.run`) |
| **Workflow / coordination** | `ResearchWorkflow` extends `WorkflowEntrypoint` — 6 durable steps with retries and exponential backoff |
| **User input via chat** | HTML/JS chat UI served via Pages assets; Server-Sent Events for streaming |
| **Memory / state** | `ChatSession` Durable Object — persists messages and research results in `ctx.storage` |

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- A Cloudflare account (free tier works)

---

## Local development

```bash
# 1. Clone the repo
git clone https://github.com/<you>/cf_ai_deep_research
cd cf_ai_deep_research

# 2. Install dependencies
npm install

# 3. Authenticate with Cloudflare
npx wrangler login

# 4. Start local dev server
npm run dev
```

Open `http://localhost:8787` in your browser.

> **Note:** Workers AI runs remotely even in local dev mode — you need a Cloudflare account and internet access. Durable Objects and Workflows also require a Cloudflare account for `wrangler dev`.

---

## Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

Wrangler will:
- Bundle and upload the Worker
- Create the Durable Object class (`ChatSession`) and run migrations
- Register the Workflow (`ResearchWorkflow`)
- Upload static assets from `/public` to serve via Workers Assets

Your app will be live at `https://cf-ai-deep-research.<subdomain>.workers.dev`.

---

## Project structure

```
cf_ai_deep_research/
├── src/
│   ├── index.ts              # Worker entry — HTTP routing
│   ├── ChatSession.ts        # Durable Object — session memory + LLM streaming
│   ├── ResearchWorkflow.ts   # Workflow — 6-step research pipeline
│   └── types.ts              # Shared TypeScript interfaces
├── public/
│   └── index.html            # Chat UI — terminal aesthetic, SSE streaming
├── wrangler.toml             # Cloudflare config (AI, DO, Workflow, Assets bindings)
├── package.json
├── tsconfig.json
├── README.md
└── PROMPTS.md                # AI prompts used during development
```

---

## Key design decisions

**Durable Objects for session memory** — Each browser session maps to a unique DO instance (keyed by session ID stored in `sessionStorage`). The DO holds the full conversation history in `ctx.storage`, so it survives Worker restarts and page reloads. This avoids external databases for state.

**Workflows for the research pipeline** — Each research task is a durable Workflow instance. If a step fails (e.g., a transient Workers AI timeout), the Workflow retries with exponential backoff without rerunning completed steps. The workflow ID is returned to the client for status polling.

**SSE streaming** — Chat responses stream token-by-token via Server-Sent Events, piped directly from Workers AI's streaming API through the Durable Object to the browser. This gives sub-second time-to-first-token.

**Research context injection** — After a research session completes, the synthesis is injected as a system message context on the next chat request. This lets you ask follow-up questions about the research findings conversationally.

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat/:sessionId` | Send a chat message; returns SSE stream |
| `GET`  | `/api/history/:sessionId` | Get full conversation history |
| `POST` | `/api/research/:sessionId` | Trigger deep research Workflow |
| `GET`  | `/api/workflow/:workflowId` | Poll Workflow status |
| `GET`  | `/api/session/:sessionId/research-result` | Get latest research result |

---

## License

MIT
