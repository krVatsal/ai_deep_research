"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "chat" | "research";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  type?: "chat" | "research";
};

type ResearchResult = {
  question: string;
  subQuestions: string[];
  subAnswers: Record<string, string>;
  synthesis: string;
  timestamp: number;
  workflowId?: string;
};

type WorkflowStep = {
  key: string;
  label: string;
  description: string;
  status: "pending" | "running" | "done" | "error";
};

type WorkflowState = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  steps: WorkflowStep[];
  output?: ResearchResult;
  error?: string;
};

const EXAMPLES: Record<Mode, string[]> = {
  chat: [
    "Explain Durable Objects in plain language.",
    "How does edge inference reduce latency?",
    "When should I use workflow orchestration?",
  ],
  research: [
    "What are the architectural implications of agentic AI in enterprise apps?",
    "How will synthetic data affect model reliability in healthcare?",
    "What tradeoffs do teams face when moving from APIs to AI-native interfaces?",
  ],
};

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
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n/g, "<br />");
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function makeClientSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.sessionStorage.getItem("cf_ai_session_id");
  if (existing) return existing;
  const created = `sess_${crypto.randomUUID().slice(0, 12)}`;
  window.sessionStorage.setItem("cf_ai_session_id", created);
  return created;
}

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [latestResearch, setLatestResearch] = useState<ResearchResult | null>(null);

  useEffect(() => {
    const id = makeClientSessionId();
    setSessionId(id);

    void (async () => {
      const res = await fetch(`/api/history/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages || []);

      const latestRes = await fetch(`/api/session/${id}/research-result`);
      if (latestRes.ok) {
        const result = (await latestRes.json()) as ResearchResult | null;
        setLatestResearch(result);
      }
    })();
  }, []);

  useEffect(() => {
    if (!workflow || workflow.status === "completed" || workflow.status === "failed") return;

    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/workflow/${workflow.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as WorkflowState;
      setWorkflow(data);

      if (data.status === "completed") {
        setLoading(false);
        const latestRes = await fetch(`/api/session/${sessionId}/research-result`);
        if (latestRes.ok) {
          const result = (await latestRes.json()) as ResearchResult | null;
          setLatestResearch(result);
          if (result) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: `**Deep Research Complete**\n\n${result.synthesis}`,
                timestamp: Date.now(),
                type: "research",
              },
            ]);
          }
        }
      }

      if (data.status === "failed") {
        setLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Research failed: ${data.error ?? "Unknown error"}`,
            timestamp: Date.now(),
            type: "chat",
          },
        ]);
      }
    }, 2200);

    return () => window.clearInterval(timer);
  }, [workflow, sessionId]);

  const modeDescription = useMemo(
    () =>
      mode === "chat"
        ? "Fast conversational response with persistent memory"
        : "Durable multi-step research workflow",
    [mode]
  );

  async function sendMessage(messageText: string) {
    if (!sessionId || !messageText.trim() || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText.trim(),
      timestamp: Date.now(),
      type: "chat",
    };

    setMessages((prev) => [...prev, userMessage]);
    setText("");

    if (mode === "research") {
      setLoading(true);
      const res = await fetch(`/api/research/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: messageText.trim() }),
      });

      if (!res.ok) {
        setLoading(false);
        const error = await res.json().catch(() => ({ error: "Research request failed" }));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: String(error.error || "Research request failed"),
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const data = (await res.json()) as { workflowId: string };
      setWorkflow({ id: data.workflowId, status: "queued", steps: [] });
      return;
    }

    setLoading(true);
    setMessages((prev) => [
      ...prev,
      {
        id: "streaming",
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      },
    ]);

    const response = await fetch(`/api/chat/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messageText.trim(),
        researchContext: latestResearch,
      }),
    });

    if (!response.ok || !response.body) {
      setLoading(false);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === "streaming"
            ? {
                ...message,
                id: crypto.randomUUID(),
                content: "Request failed. Check your API credentials and server logs.",
              }
            : message
        )
      );
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;

        try {
          const parsed = JSON.parse(payload) as { token?: string; done?: boolean; error?: string };
          if (parsed.token) {
            full += parsed.token;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === "streaming"
                  ? { ...message, content: full }
                  : message
              )
            );
          }

          if (parsed.error) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === "streaming"
                  ? { ...message, content: `Stream error: ${parsed.error}` }
                  : message
              )
            );
          }

          if (parsed.done) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === "streaming"
                  ? { ...message, id: crypto.randomUUID(), timestamp: Date.now() }
                  : message
              )
            );
          }
        } catch {
          // Ignore parse noise from partial SSE lines.
        }
      }
    }

    setLoading(false);
  }

  return (
    <main className="page">
      <section className="shell">
        <header className="topBar">
          <div>
            <p className="eyebrow">Cloudflare AI Assignment</p>
            <h1>Deep Research Studio</h1>
          </div>
          <div className="metaBlock">
            <span className="pill">Session {sessionId.slice(0, 16)}</span>
            <span className="modeText">{modeDescription}</span>
          </div>
        </header>

        <section className="modeSwitch" aria-label="Mode Switch">
          <button
            type="button"
            className={mode === "chat" ? "active" : ""}
            onClick={() => setMode("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={mode === "research" ? "active" : ""}
            onClick={() => setMode("research")}
          >
            Research
          </button>
        </section>

        {messages.length === 0 && (
          <section className="hero">
            <p>
              Build and test an AI-powered fullstack flow using <strong>Llama 3.3</strong>, workflow orchestration, chat input, and persisted memory/state.
            </p>
            <div className="chips">
              {EXAMPLES[mode].map((example) => (
                <button key={example} type="button" onClick={() => void sendMessage(example)}>
                  {example}
                </button>
              ))}
            </div>
          </section>
        )}

        {workflow && workflow.status !== "completed" && workflow.status !== "failed" && (
          <section className="pipeline">
            <h2>Workflow Progress</h2>
            <ul>
              {(workflow.steps || []).map((step) => (
                <li key={step.key} data-status={step.status}>
                  <span>{step.label}</span>
                  <small>{step.description}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="messages">
          {messages.map((message) => (
            <article key={message.id} className={`msg ${message.role} ${message.type || "chat"}`}>
              <div className="msgHeader">
                <strong>{message.role === "user" ? "You" : message.type === "research" ? "Research" : "Assistant"}</strong>
                <span>{formatTime(message.timestamp)}</span>
              </div>
              <div
                className="msgBody"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
              />
            </article>
          ))}
        </section>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(text);
          }}
        >
          <textarea
            value={text}
            placeholder={mode === "chat" ? "Ask a direct question" : "Ask a complex question for deep research"}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !text.trim()}>
            {loading ? "Running..." : mode === "chat" ? "Send" : "Start Workflow"}
          </button>
        </form>
      </section>

      <style jsx>{`
        .page {
          min-height: 100dvh;
          padding: 24px;
          display: flex;
          justify-content: center;
          align-items: stretch;
        }

        .shell {
          width: min(980px, 100%);
          border: 1px solid var(--line);
          background: color-mix(in srgb, var(--paper) 92%, white 8%);
          border-radius: 20px;
          box-shadow: 0 20px 45px rgba(29, 42, 51, 0.12);
          display: grid;
          gap: 14px;
          padding: 18px;
          animation: rise 350ms ease;
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .topBar {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          border-bottom: 1px dashed var(--line);
          padding-bottom: 10px;
        }

        .eyebrow {
          margin: 0;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-soft);
          font-size: 0.75rem;
        }

        h1 {
          margin: 4px 0 0;
          font-size: clamp(1.3rem, 3vw, 2rem);
          font-weight: 700;
        }

        .metaBlock {
          text-align: right;
          display: grid;
          gap: 8px;
        }

        .pill {
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.72rem;
          background: var(--accent-soft);
          color: var(--accent);
          border-radius: 999px;
          padding: 4px 10px;
          border: 1px solid color-mix(in srgb, var(--accent) 30%, white 70%);
        }

        .modeText {
          color: var(--ink-soft);
          font-size: 0.85rem;
        }

        .modeSwitch {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid var(--line);
        }

        .modeSwitch button {
          border: 0;
          padding: 8px 14px;
          background: transparent;
          color: var(--ink-soft);
          cursor: pointer;
          transition: 180ms ease;
        }

        .modeSwitch button.active {
          background: var(--night);
          color: #f8fbff;
        }

        .hero {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: linear-gradient(145deg, #fffef8, #fff6ea);
          padding: 14px;
          display: grid;
          gap: 10px;
        }

        .hero p {
          margin: 0;
          color: var(--ink-soft);
          line-height: 1.5;
        }

        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chips button {
          border: 1px solid var(--line);
          background: white;
          border-radius: 999px;
          padding: 8px 10px;
          cursor: pointer;
          color: var(--ink);
        }

        .chips button:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .pipeline {
          border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
          background: #fff6e8;
          border-radius: 14px;
          padding: 12px;
        }

        .pipeline h2 {
          margin: 0 0 10px;
          font-size: 0.92rem;
        }

        .pipeline ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 6px;
        }

        .pipeline li {
          border: 1px dashed var(--line);
          border-radius: 10px;
          padding: 8px;
          display: grid;
          gap: 4px;
        }

        .pipeline li[data-status='running'] {
          border-color: var(--warn);
          background: #fff0cf;
        }

        .pipeline li[data-status='done'] {
          border-color: var(--ok);
          background: #eef8ee;
        }

        .pipeline li[data-status='error'] {
          border-color: var(--error);
          background: #ffedec;
        }

        .pipeline small {
          color: var(--ink-soft);
        }

        .messages {
          display: grid;
          gap: 10px;
          max-height: 52dvh;
          overflow: auto;
          padding-right: 4px;
        }

        .msg {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 10px;
          display: grid;
          gap: 8px;
          animation: fadeIn 180ms ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .msg.user {
          background: #f7f9ff;
          border-color: #c7d4ef;
        }

        .msg.assistant.chat {
          background: #f8fff7;
          border-color: #c7e1c5;
        }

        .msg.assistant.research {
          background: #fff4ec;
          border-color: #f3c9ad;
        }

        .msgHeader {
          display: flex;
          justify-content: space-between;
          color: var(--ink-soft);
          font-size: 0.8rem;
        }

        .msgBody {
          line-height: 1.55;
        }

        .msgBody :global(code) {
          font-family: "IBM Plex Mono", monospace;
          background: #ece7db;
          border-radius: 6px;
          padding: 2px 4px;
          font-size: 0.85em;
        }

        .msgBody :global(h2),
        .msgBody :global(h3),
        .msgBody :global(h4) {
          margin: 0.3rem 0;
        }

        .composer {
          display: grid;
          gap: 8px;
          border-top: 1px dashed var(--line);
          padding-top: 12px;
        }

        textarea {
          width: 100%;
          resize: vertical;
          border-radius: 10px;
          border: 1px solid var(--line);
          padding: 10px;
          min-height: 64px;
          background: #fff;
          color: var(--ink);
        }

        button[type='submit'] {
          border: 0;
          background: var(--accent);
          color: #fff8f4;
          border-radius: 10px;
          font-weight: 600;
          padding: 10px 14px;
          justify-self: end;
          cursor: pointer;
        }

        button[type='submit']:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 760px) {
          .page {
            padding: 12px;
          }

          .shell {
            border-radius: 14px;
            padding: 12px;
          }

          .topBar {
            display: grid;
          }

          .metaBlock {
            text-align: left;
          }

          .messages {
            max-height: 45dvh;
          }

          button[type='submit'] {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
