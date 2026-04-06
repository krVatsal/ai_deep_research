export type ResearchPhase = "idle" | "planning" | "researching" | "synthesizing" | "done" | "error";

export interface ResearchStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export interface ResearchResult {
  question: string;
  subQuestions: string[];
  subAnswers: Record<string, string>;
  synthesis: string;
  timestamp: number;
  workflowId?: string;
}

export interface ResearchState {
  researchPhase: ResearchPhase;
  researchQuestion: string | null;
  researchSteps: ResearchStep[];
  latestResearch: ResearchResult | null;
  researchHistory: ResearchResult[];
  updatedAt: string;
}
