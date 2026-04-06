import { getSession } from "@/lib/state";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const session = await getSession(sessionId);

  return Response.json({
    messages: session.messages,
    createdAt: session.createdAt,
    lastActive: session.lastActive,
  });
}
