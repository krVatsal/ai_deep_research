import { enqueueResearchWorkflow } from "@/lib/workflow";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;

  const body = (await request.json()) as { question?: string };
  if (!body.question || !body.question.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  try {
    const workflowId = await enqueueResearchWorkflow(sessionId, body.question.trim());
    return Response.json({ workflowId, status: "started" });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
