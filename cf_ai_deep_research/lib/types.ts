export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  type?: "chat" | "research";
}

export interface ResearchResult {
  question: string;
  subQuestions: string[];
  subAnswers: Record<string, string>;
  synthesis: string;
  timestamp: number;
  workflowId?: string;
}

export interface SessionState {
  messages: Message[];
  latestResearch?: ResearchResult;
  createdAt: number;
  lastActive: number;
}

export type WorkflowStepKey =
  | "decompose"
  | "research1"
  | "research2"
  | "research3"
  | "synthesize"
  | "store";

export type WorkflowStepStatus = "pending" | "running" | "done" | "error";

export interface WorkflowStep {
  key: WorkflowStepKey;
  label: string;
  description: string;
  status: WorkflowStepStatus;
}

export interface WorkflowRecord {
  id: string;
  sessionId: string;
  question: string;
  status: "queued" | "running" | "completed" | "failed";
  steps: WorkflowStep[];
  output?: ResearchResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
