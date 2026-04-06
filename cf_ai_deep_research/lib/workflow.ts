import {
  createWorkflow,
  getWorkflow,
  saveResearchResult,
  setWorkflowOutput,
  setWorkflowStatus,
  setWorkflowStepStatus,
} from "./state";
import { AiMessage, ResearchResult } from "./types";
import { workersAiCompletion } from "./workers-ai";

function parseJsonArray(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`Could not parse sub-questions from model output: ${text}`);
  }

  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Sub-question output was not an array.");
  }

  return parsed
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .slice(0, 3);
}

async function generateSubQuestions(question: string): Promise<string[]> {
  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        "You are a research coordinator. Decompose each input into exactly 3 focused sub-questions. Return only a JSON array of 3 strings.",
    },
    {
      role: "user",
      content: `Decompose this question into exactly 3 sub-questions: \"${question}\"`,
    },
  ];

  const text = await workersAiCompletion(messages, 250);
  return parseJsonArray(text);
}

async function researchSubQuestion(subQuestion: string): Promise<string> {
  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        "You are a precise research analyst. Answer in under 250 words with concrete details and no fluff.",
    },
    {
      role: "user",
      content: subQuestion,
    },
  ];

  return workersAiCompletion(messages, 500);
}

async function synthesize(question: string, subQuestions: string[], subAnswers: Record<string, string>): Promise<string> {
  const context = subQuestions
    .map((subQuestion, index) => {
      const finding = subAnswers[subQuestion] ?? "";
      return `Sub-question ${index + 1}: ${subQuestion}\nFinding: ${finding}`;
    })
    .join("\n\n");

  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        "You are a senior research analyst. Write a markdown synthesis with: 1) direct answer up front, 2) integrated reasoning, 3) implications, 4) key takeaways. Keep it under 500 words.",
    },
    {
      role: "user",
      content: `Original question: ${question}\n\nResearch findings:\n${context}`,
    },
  ];

  return workersAiCompletion(messages, 900);
}

export async function enqueueResearchWorkflow(sessionId: string, question: string): Promise<string> {
  const workflow = await createWorkflow(sessionId, question);

  void runResearchWorkflow(workflow.id).catch(async (error) => {
    await setWorkflowStatus(workflow.id, "failed", String(error));
  });

  return workflow.id;
}

export async function runResearchWorkflow(workflowId: string): Promise<void> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found.`);
  }

  await setWorkflowStatus(workflowId, "running");

  try {
    await setWorkflowStepStatus(workflowId, "decompose", "running");
    const subQuestions = await generateSubQuestions(workflow.question);
    await setWorkflowStepStatus(workflowId, "decompose", "done");

    const subAnswers: Record<string, string> = {};

    const researchSteps: Array<"research1" | "research2" | "research3"> = ["research1", "research2", "research3"];

    for (let index = 0; index < researchSteps.length; index++) {
      const stepKey = researchSteps[index];
      const subQuestion = subQuestions[index] ?? `Additional angle ${index + 1} for: ${workflow.question}`;

      await setWorkflowStepStatus(workflowId, stepKey, "running");
      subAnswers[subQuestion] = await researchSubQuestion(subQuestion);
      await setWorkflowStepStatus(workflowId, stepKey, "done");
    }

    await setWorkflowStepStatus(workflowId, "synthesize", "running");
    const synthesis = await synthesize(workflow.question, subQuestions, subAnswers);
    await setWorkflowStepStatus(workflowId, "synthesize", "done");

    const result: ResearchResult = {
      question: workflow.question,
      subQuestions,
      subAnswers,
      synthesis,
      timestamp: Date.now(),
      workflowId,
    };

    await setWorkflowStepStatus(workflowId, "store", "running");
    await saveResearchResult(workflow.sessionId, result);
    await setWorkflowStepStatus(workflowId, "store", "done");

    await setWorkflowOutput(workflowId, result);
  } catch (error) {
    await setWorkflowStatus(workflowId, "failed", String(error));
    throw error;
  }
}
