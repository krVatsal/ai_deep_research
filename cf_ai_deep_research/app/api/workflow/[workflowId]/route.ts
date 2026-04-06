import { getWorkflow } from "@/lib/state";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await context.params;
  const workflow = await getWorkflow(workflowId);

  if (!workflow) {
    return Response.json({ error: "workflow not found" }, { status: 404 });
  }

  return Response.json(workflow);
}
