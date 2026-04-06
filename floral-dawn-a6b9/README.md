# cf_ai_deep_research

An original Cloudflare Agents assignment that combines chat, multi-step research coordination, and persistent agent state.

## Requirement mapping

| Requirement | Implementation |
|---|---|
| LLM | Workers AI via `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Workflow / coordination | A research orchestration method on the agent that runs plan → research → synthesize → persist steps |
| User input via chat | Agents SDK chat UI in the browser |
| Memory or state | Agent state for research state/history and AIChatAgent message persistence |

## What it does

- Chat mode streams normal conversational responses from Llama 3.3.
- Research mode runs a durable multi-step workflow inside the agent:
  - plans the question into three sub-questions
  - researches each sub-question
  - synthesizes the findings into a markdown answer
  - stores the latest research in synced state
- The UI shows workflow progress and the latest research result live.

## Local development

1. Install dependencies.

```bash
npm install
```

2. Start the dev server.

```bash
npm run dev
```

3. Open the app in your browser.

The starter usually runs at `http://localhost:5173`.

## Deploy

```bash
npm run deploy
```

This builds the app and deploys it with Wrangler.

## Project structure

```text
src/
  server.ts    # Cloudflare Agent with chat + research orchestration
  app.tsx      # Chat/research UI
  client.tsx   # React entry point
  styles.css   # Custom app styling
  types.ts     # Shared state/result types
```

## Notes

- This repo is named with the required `cf_ai_` prefix in the project configuration.
- No external API key is required for Workers AI when using the Cloudflare binding.
- `PROMPTS.md` documents the AI prompts used while building the assignment.
