import { ChatSession } from "./ChatSession";
import { ResearchWorkflow } from "./ResearchWorkflow";
import { Env } from "./types";

export { ChatSession, ResearchWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route: /api/chat/:sessionId — streaming chat via ChatSession Durable Object
      const chatMatch = path.match(/^\/api\/chat\/([^/]+)$/);
      if (chatMatch && request.method === "POST") {
        const sessionId = chatMatch[1];
        const id = env.CHAT_SESSION.idFromName(sessionId);
        const stub = env.CHAT_SESSION.get(id);
        const res = await stub.fetch(request);
        return addCors(res, corsHeaders);
      }

      // Route: /api/history/:sessionId — get conversation history
      const historyMatch = path.match(/^\/api\/history\/([^/]+)$/);
      if (historyMatch && request.method === "GET") {
        const sessionId = historyMatch[1];
        const id = env.CHAT_SESSION.idFromName(sessionId);
        const stub = env.CHAT_SESSION.get(id);
        const res = await stub.fetch(request);
        return addCors(res, corsHeaders);
      }

      // Route: /api/research/:sessionId — trigger deep research Workflow
      const researchMatch = path.match(/^\/api\/research\/([^/]+)$/);
      if (researchMatch && request.method === "POST") {
        const sessionId = researchMatch[1];
        const body = await request.json<{ question: string }>();

        const instance = await env.RESEARCH_WORKFLOW.create({
          params: { question: body.question, sessionId },
        });

        return new Response(
          JSON.stringify({ workflowId: instance.id, status: "started" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Route: /api/workflow/:workflowId — poll workflow status
      const workflowMatch = path.match(/^\/api\/workflow\/([^/]+)$/);
      if (workflowMatch && request.method === "GET") {
        const workflowId = workflowMatch[1];
        const instance = await env.RESEARCH_WORKFLOW.get(workflowId);
        const status = await instance.status();

        return new Response(JSON.stringify(status), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Route: /api/session/:sessionId/research-result — get latest research result from DO
      const resultMatch = path.match(/^\/api\/session\/([^/]+)\/research-result$/);
      if (resultMatch && request.method === "GET") {
        const sessionId = resultMatch[1];
        const id = env.CHAT_SESSION.idFromName(sessionId);
        const stub = env.CHAT_SESSION.get(id);
        const res = await stub.fetch(request);
        return addCors(res, corsHeaders);
      }

      // Fallback: 404
      return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error("Worker error:", err);
      return new Response(
        JSON.stringify({ error: "Internal server error", detail: String(err) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  },
};

function addCors(res: Response, corsHeaders: Record<string, string>): Response {
  const newHeaders = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    newHeaders.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: newHeaders,
  });
}
