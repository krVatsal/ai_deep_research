import { AiMessage } from "./types";

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function getEnvConfig() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const model = process.env.CF_AI_MODEL || DEFAULT_MODEL;

  if (!accountId || !apiToken) {
    throw new Error("Missing CF_ACCOUNT_ID or CF_API_TOKEN environment variables.");
  }

  return { accountId, apiToken, model };
}

function endpointFor(model: string, accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

export async function workersAiCompletion(messages: AiMessage[], maxTokens: number): Promise<string> {
  const { accountId, apiToken, model } = getEnvConfig();

  const response = await fetch(endpointFor(model, accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      stream: false,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Workers AI request failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as {
    result?: { response?: string };
    errors?: Array<{ message?: string }>;
  };

  const text = payload.result?.response;
  if (!text) {
    const errorText = payload.errors?.[0]?.message ?? "No response text from model.";
    throw new Error(errorText);
  }

  return text.trim();
}

export async function workersAiStream(messages: AiMessage[], maxTokens: number): Promise<ReadableStream<Uint8Array>> {
  const { accountId, apiToken, model } = getEnvConfig();

  const response = await fetch(endpointFor(model, accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      stream: true,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Workers AI stream failed (${response.status}): ${detail}`);
  }

  if (!response.body) {
    throw new Error("Workers AI did not return a stream body.");
  }

  return response.body;
}
