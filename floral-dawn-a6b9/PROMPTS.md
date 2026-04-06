# PROMPTS.md

This file records the AI prompts used while customizing the Cloudflare Agents starter into a deep research application.

## 1. Project direction

Prompt:

> Everything should stay inside this Cloudflare Agents starter pack and not become a Next.js project. Build an AI-powered Cloudflare app that includes an LLM, workflow/coordination, user input via chat, and memory/state.

Outcome:

- Kept the Agents starter runtime.
- Replaced the demo chat agent with a research-focused agent.
- Used Agent state for research progress/history.

## 2. Agent design

Prompt:

> Design a Cloudflare Agent that streams chat responses with Workers AI, stores persistent state for research results, and exposes a callable method that runs a multi-step research flow.

Outcome:

- Created `ChatAgent` with Workers AI chat streaming.
- Added `@callable()` research orchestration methods.
- Stored current and recent research results in synced state.

## 3. UI design

Prompt:

> Build a modern UI for a Cloudflare Agents app with chat mode, research mode, workflow progress, a latest research panel, and example prompts.

Outcome:

- Replaced the demo starter UI with a two-column deep research interface.
- Added a live workflow progress panel.
- Added a latest research result card and recent history list.

## 4. Repo documentation

Prompt:

> Update the README to explain how to run, deploy, and evaluate the Cloudflare assignment, and include clear component mapping to the required AI app features.

Outcome:

- README now documents the assignment requirements.
- Included local run and deploy instructions.
- Added a clear project structure summary.
