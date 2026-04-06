import { promises as fs } from "fs";
import path from "path";
import { Message, ResearchResult, SessionState, WorkflowRecord, WorkflowStepKey } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const WORKFLOWS_FILE = path.join(DATA_DIR, "workflows.json");

function defaultSessionState(): SessionState {
  const now = Date.now();
  return {
    messages: [],
    createdAt: now,
    lastActive: now,
  };
}

const DEFAULT_STEPS = [
  { key: "decompose", label: "Decompose", description: "Breaking question into sub-topics" },
  { key: "research1", label: "Research 1", description: "Investigating sub-question 1" },
  { key: "research2", label: "Research 2", description: "Investigating sub-question 2" },
  { key: "research3", label: "Research 3", description: "Investigating sub-question 3" },
  { key: "synthesize", label: "Synthesize", description: "Assembling final report" },
  { key: "store", label: "Store", description: "Persisting session memory" },
] as const;

async function ensureDataFiles(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(SESSIONS_FILE);
  } catch {
    await fs.writeFile(SESSIONS_FILE, "{}", "utf8");
  }

  try {
    await fs.access(WORKFLOWS_FILE);
  } catch {
    await fs.writeFile(WORKFLOWS_FILE, "{}", "utf8");
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  await ensureDataFiles();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDataFiles();
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

export async function getSession(sessionId: string): Promise<SessionState> {
  const sessions = await readJson<Record<string, SessionState>>(SESSIONS_FILE, {});
  return sessions[sessionId] ?? defaultSessionState();
}

export async function saveSession(sessionId: string, session: SessionState): Promise<void> {
  const sessions = await readJson<Record<string, SessionState>>(SESSIONS_FILE, {});
  sessions[sessionId] = {
    ...session,
    lastActive: Date.now(),
  };
  await writeJson(SESSIONS_FILE, sessions);
}

export async function addMessage(sessionId: string, message: Message): Promise<SessionState> {
  const session = await getSession(sessionId);
  session.messages.push(message);
  session.lastActive = Date.now();
  await saveSession(sessionId, session);
  return session;
}

export async function saveResearchResult(sessionId: string, result: ResearchResult): Promise<SessionState> {
  const session = await getSession(sessionId);
  session.latestResearch = result;
  session.lastActive = Date.now();
  session.messages.push({
    id: crypto.randomUUID(),
    role: "assistant",
    content: `**Deep Research Complete**\n\n**Question:** ${result.question}\n\n${result.synthesis}`,
    timestamp: Date.now(),
    type: "research",
  });
  await saveSession(sessionId, session);
  return session;
}

export async function getWorkflow(workflowId: string): Promise<WorkflowRecord | null> {
  const workflows = await readJson<Record<string, WorkflowRecord>>(WORKFLOWS_FILE, {});
  return workflows[workflowId] ?? null;
}

export async function createWorkflow(sessionId: string, question: string): Promise<WorkflowRecord> {
  const workflows = await readJson<Record<string, WorkflowRecord>>(WORKFLOWS_FILE, {});
  const now = Date.now();
  const id = `wf_${crypto.randomUUID()}`;

  const record: WorkflowRecord = {
    id,
    sessionId,
    question,
    status: "queued",
    steps: DEFAULT_STEPS.map((step) => ({ ...step, status: "pending" })),
    createdAt: now,
    updatedAt: now,
  };

  workflows[id] = record;
  await writeJson(WORKFLOWS_FILE, workflows);

  return record;
}

export async function setWorkflowStatus(workflowId: string, status: WorkflowRecord["status"], error?: string): Promise<void> {
  const workflows = await readJson<Record<string, WorkflowRecord>>(WORKFLOWS_FILE, {});
  const record = workflows[workflowId];
  if (!record) return;

  record.status = status;
  record.updatedAt = Date.now();
  if (error) record.error = error;

  await writeJson(WORKFLOWS_FILE, workflows);
}

export async function setWorkflowStepStatus(workflowId: string, stepKey: WorkflowStepKey, status: "pending" | "running" | "done" | "error"): Promise<void> {
  const workflows = await readJson<Record<string, WorkflowRecord>>(WORKFLOWS_FILE, {});
  const record = workflows[workflowId];
  if (!record) return;

  record.steps = record.steps.map((step) => {
    if (step.key === stepKey) {
      return { ...step, status };
    }
    return step;
  });
  record.updatedAt = Date.now();

  await writeJson(WORKFLOWS_FILE, workflows);
}

export async function setWorkflowOutput(workflowId: string, output: ResearchResult): Promise<void> {
  const workflows = await readJson<Record<string, WorkflowRecord>>(WORKFLOWS_FILE, {});
  const record = workflows[workflowId];
  if (!record) return;

  record.output = output;
  record.status = "completed";
  record.updatedAt = Date.now();

  await writeJson(WORKFLOWS_FILE, workflows);
}
