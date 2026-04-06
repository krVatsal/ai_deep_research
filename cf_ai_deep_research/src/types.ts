export interface Message {
  id: string;
  role: "user" | "assistant";
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

export interface WorkflowParams {
  question: string;
  sessionId: string;
}

export interface Env {
  AI: Ai;
  CHAT_SESSION: DurableObjectNamespace;
  RESEARCH_WORKFLOW: Workflow;
}

// Workers AI message format
export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
