import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { ChatAgent } from "./server";
import type { ResearchResult, ResearchState } from "./types";

type Mode = "chat" | "research";

const EXAMPLE_PROMPTS: Record<Mode, string[]> = {
  chat: [
    "Explain Durable Objects like I'm new to Cloudflare.",
    "What does Workers AI do well for chat apps?",
    "How do agents keep memory across restarts?"
  ],
  research: [
    "What are the tradeoffs of agentic AI in customer support?",
    "How should a team design memory for long-running AI assistants?",
    "What makes a workflow durable and resumable?"
  ]
};

function getMessageText(message: UIMessage): string {
  const content = message as UIMessage & { content?: string };
  if (typeof content.content === "string") {
    return content.content;
  }

  return message.parts
    .map((part) => {
      if (part.type === "text") return part.text;
      return "";
    })
    .join("");
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function markdownToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/<li>(.+)<\/li>/gs, "<ul><li>$1</li></ul>")
    .replace(/\n/g, "<br />");
}

function StepPill({ status }: { status: string }) {
  return <span className={`stepPill ${status}`}>{status}</span>;
}

function ResearchResultCard({ result }: { result: ResearchResult }) {
  return (
    <article className="resultCard">
      <div className="resultHeader">
        <div>
          <p className="eyebrow">Latest research</p>
          <h3>{result.question}</h3>
        </div>
        <span className="timestamp">{formatTime(result.timestamp)}</span>
      </div>

      <div className="resultGrid">
        <div className="resultBlock">
          <h4>Sub-questions</h4>
          <ul>
            {result.subQuestions.map((subQuestion) => (
              <li key={subQuestion}>{subQuestion}</li>
            ))}
          </ul>
        </div>

        <div className="resultBlock resultSummary">
          <h4>Synthesis</h4>
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(result.synthesis) }} />
        </div>
      </div>
    </article>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const [input, setInput] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const [lastBroadcast, setLastBroadcast] = useState<ResearchResult | null>(null);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onMessage: useCallback((event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data)) as {
          type?: string;
          result?: ResearchResult;
        };
        if (data.type === "research-complete" && data.result) {
          setLastBroadcast(data.result);
        }
      } catch {
        // Ignore non-JSON agent events.
      }
    }, [])
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop
  } = useAgentChat({
    agent
  });

  const state = (agent.state ?? {
    researchPhase: "idle",
    researchQuestion: null,
    researchSteps: [],
    latestResearch: null,
    researchHistory: [],
    updatedAt: new Date().toISOString()
  }) as ResearchState;

  const activeResearch = state.latestResearch ?? lastBroadcast;
  const streaming = status === "streaming" || status === "submitted";

  const modeDescription = useMemo(
    () => (mode === "chat" ? "Conversational chat with persistent agent memory" : "Multi-step deep research workflow"),
    [mode]
  );

  const researchSteps = state.researchSteps.length > 0 ? state.researchSteps : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeResearch]);

  useEffect(() => {
    if (!researchBusy) return;
    if (state.researchPhase === "done" || state.researchPhase === "error") {
      setResearchBusy(false);
    }
  }, [researchBusy, state.researchPhase]);

  useEffect(() => {
    if (!streaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [streaming]);

  const handleSend = useCallback(async () => {
    const value = input.trim();
    if (!value) return;

    setInput("");

    if (mode === "chat") {
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: value }]
      });
      return;
    }

    setResearchBusy(true);
    try {
      await agent.stub.startResearch(value);
    } catch (error) {
      console.error("Research request failed:", error);
      setResearchBusy(false);
    }
  }, [agent.stub, input, mode, sendMessage]);

  const selectExample = useCallback(
    (example: string) => {
      setInput(example);
      textareaRef.current?.focus();
    },
    []
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void handleSend();
    },
    [handleSend]
  );

  const hasMessages = messages.length > 0;

  return (
    <main className="appShell">
      <section className="heroPanel">
        <div>
          <p className="eyebrow">Cloudflare Agents starter</p>
          <h1>Deep Research Assistant</h1>
          <p className="heroCopy">
            An original Cloudflare AI app with Workers AI, persisted agent state, and a durable multi-step research flow.
          </p>
        </div>

        <div className="heroMeta">
          <span className="badge">{connected ? "Connected" : "Connecting"}</span>
          <span className="badge badgeSoft">{modeDescription}</span>
          <span className="badge badgeSoft">Phase: {state.researchPhase}</span>
        </div>
      </section>

      <section className="modeBar" aria-label="Mode selector">
        <button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")} type="button">
          Chat
        </button>
        <button className={mode === "research" ? "active" : ""} onClick={() => setMode("research")} type="button">
          Research
        </button>
        <div className="modeHint">{mode === "chat" ? "Use chat for fast responses." : "Use research for the workflow pipeline."}</div>
      </section>

      <section className="contentGrid">
        <div className="chatColumn">
          <div className="panelTitleRow">
            <div>
              <p className="eyebrow">Conversation</p>
              <h2>Chat stream</h2>
            </div>
            <div className="panelActions">
              {streaming ? (
                <button type="button" className="secondaryButton" onClick={() => stop()}>
                  Stop
                </button>
              ) : null}
              <button type="button" className="secondaryButton" onClick={() => clearHistory()}>
                Clear
              </button>
            </div>
          </div>

          <div className="messageList">
            {!hasMessages ? (
              <div className="emptyState">
                <h3>Start a conversation or a research run</h3>
                <p>
                  Chat mode streams direct answers. Research mode runs a multi-step planning, research, and synthesis pipeline and stores the result in agent state.
                </p>
                <div className="exampleChips">
                  {EXAMPLE_PROMPTS[mode].map((example) => (
                    <button key={example} type="button" onClick={() => selectExample(example)}>
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) => {
              const text = getMessageText(message);
              const role = message.role === "user" ? "userBubble" : "assistantBubble";
              return (
                <article key={message.id} className={`messageBubble ${role}`}>
                  <div className="messageMeta">
                    <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
                    <span>{formatTime((message as UIMessage & { createdAt?: number }).createdAt ?? Date.now())}</span>
                  </div>
                  <div className="messageBody" dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />
                </article>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={mode === "chat" ? "Ask a question about Cloudflare, agents, AI, or workflows" : "Enter a research question to run the workflow"}
              rows={4}
              disabled={researchBusy || streaming}
            />
            <div className="composerFooter">
              <div className="composerMeta">
                <span>{mode === "chat" ? "Chat uses persisted agent memory." : "Research updates synced agent state."}</span>
              </div>
              <button type="submit" disabled={!input.trim() || researchBusy || streaming}>
                {mode === "chat" ? (streaming ? "Sending..." : "Send") : researchBusy ? "Researching..." : "Start research"}
              </button>
            </div>
          </form>
        </div>

        <aside className="researchColumn">
          <div className="panelTitleRow">
            <div>
              <p className="eyebrow">Workflow</p>
              <h2>Research state</h2>
            </div>
            <span className="smallNote">{state.updatedAt ? formatTime(Date.parse(state.updatedAt)) : ""}</span>
          </div>

          <section className="workflowCard">
            <h3>Progress</h3>
            <div className="stepList">
              {(researchSteps.length > 0 ? researchSteps : []).map((step) => (
                <div key={step.id} className={`stepRow ${step.status}`}>
                  <div className="stepHeader">
                    <strong>{step.label}</strong>
                    <StepPill status={step.status} />
                  </div>
                  <p>{step.detail}</p>
                </div>
              ))}
              {researchSteps.length === 0 ? <p className="muted">Run a research prompt to see the workflow steps animate here.</p> : null}
            </div>
          </section>

          {activeResearch ? <ResearchResultCard result={activeResearch} /> : null}

          {state.researchHistory.length > 0 ? (
            <section className="workflowCard">
              <h3>Recent results</h3>
              <div className="historyList">
                {state.researchHistory.map((result) => (
                  <button key={`${result.timestamp}-${result.question}`} type="button" className="historyItem" onClick={() => setLastBroadcast(result)}>
                    <strong>{result.question}</strong>
                    <span>{formatTime(result.timestamp)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

export default App;
