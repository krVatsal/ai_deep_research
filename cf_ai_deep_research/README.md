# cf_ai_deep_research

AI-powered fullstack research assistant built with Next.js and Cloudflare Workers AI.

## Assignment requirement mapping

| Requirement | Implementation |
|---|---|
| LLM | Cloudflare Workers AI via REST API (`@cf/meta/llama-3.3-70b-instruct-fp8-fast` by default) |
| Workflow / coordination | Server-side orchestration engine in `lib/workflow.ts` with step state and polling |
| User input via chat | Next.js App Router UI with streaming chat and research mode |
| Memory or state | Session and workflow persistence in local JSON data store (`.data/`) |

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Cloudflare Workers AI API

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env.local`.

```bash
CF_ACCOUNT_ID=your_cloudflare_account_id
CF_API_TOKEN=your_cloudflare_api_token
CF_AI_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

3. Start dev server.

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Available scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
```

## Project structure

```text
cf_ai_deep_research/
├── app/
│   ├── api/
│   │   ├── chat/[sessionId]/route.ts
│   │   ├── history/[sessionId]/route.ts
│   │   ├── research/[sessionId]/route.ts
│   │   ├── workflow/[workflowId]/route.ts
│   │   └── session/[sessionId]/research-result/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── state.ts
│   ├── types.ts
│   ├── workers-ai.ts
│   └── workflow.ts
├── README.md
├── PROMPTS.md
├── package.json
└── tsconfig.json
```

## API reference

| Method | Path | Description |
|---|---|---|
| POST | `/api/chat/:sessionId` | Chat message, SSE token streaming response |
| GET | `/api/history/:sessionId` | Session message history |
| POST | `/api/research/:sessionId` | Start async deep research workflow |
| GET | `/api/workflow/:workflowId` | Workflow status and step progress |
| GET | `/api/session/:sessionId/research-result` | Latest synthesized research result |

## Notes

- State is persisted to `.data/sessions.json` and `.data/workflows.json` for local/demo use.
- This is an original implementation, not copied from other submissions.
