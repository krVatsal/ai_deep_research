# PROMPTS.md

This file documents AI prompts used while converting `cf_ai_deep_research` into a Next.js fullstack project.

## 1. Next.js migration request

Prompt:

> Convert this Cloudflare Worker AI project into a Next.js fullstack app while keeping required assignment components: LLM, workflow coordination, chat input, and memory/state.

Result:

- App Router structure created (`app/`, `app/api/`)
- Server-side modules for orchestration and persistence in `lib/`
- Streaming chat endpoint and workflow polling endpoints

## 2. API design and endpoint parity

Prompt:

> Preserve API behavior using these endpoints in Next.js: `/api/chat/:sessionId`, `/api/history/:sessionId`, `/api/research/:sessionId`, `/api/workflow/:workflowId`, and `/api/session/:sessionId/research-result`.

Result:

- Route handlers implemented in `app/api/*`
- JSON + SSE behavior preserved

## 3. LLM integration prompt

Prompt:

> Implement Cloudflare Workers AI integration in server-side code with support for both non-streaming and streaming chat completions using environment variables.

Result:

- `lib/workers-ai.ts` with REST API calls
- `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and optional `CF_AI_MODEL`

## 4. Workflow orchestration prompt

Prompt:

> Implement an async workflow runner for deep research that executes these steps: decompose, research 1/2/3, synthesize, and store result. Expose workflow status for polling.

Result:

- `lib/workflow.ts` coordinates async steps
- `lib/state.ts` stores step progress and output

## 5. Frontend prompt

Prompt:

> Build a modern Next.js chat + research UI with mode switching, workflow progress panel, streaming token updates, and session persistence.

Result:

- `app/page.tsx` with chat/research modes
- Streaming token rendering for chat responses
- Workflow progress polling UI for research mode

## Notes

- AI-assisted coding was used for scaffolding and implementation speed.
- Architecture decisions and endpoint behavior were human-directed.
- No code was copied from other submissions.
