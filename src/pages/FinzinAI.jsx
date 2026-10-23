// FinzinAI.jsx - AI Financial Coach interface connected to backend /api/ai/advice.
// Features: Bearer token auth, conversation history, typing indicator, plain text rendering,
// fallback banner when AI source is "rules", and quick question chips.
import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../api/client";

const QUICK = [
  "Where am I overspending?",
  "Will I stay in budget?",
  "How can I save more?",
];

/**
 * Formats structured advice into clean readable text.
 * @param {object} advice
 * @returns {string}
 */
function formatAdviceText(advice) {
  if (!advice) return "";
  const parts = [];

  if (advice.summary) {
    parts.push(advice.summary);
  }

  if (Array.isArray(advice.tips) && advice.tips.length > 0) {
    const tipList = advice.tips.map((t, i) => `${i + 1}. ${t}`).join("\n");
    parts.push(`Tips for you:\n${tipList}`);
  }

  if (advice.forecast) {
    parts.push(`Outlook: ${advice.forecast}`);
  }

  if (advice.warning) {
    parts.push(`⚠️ Note: ${advice.warning}`);
  }

  return parts.join("\n\n");
}

export default function FinzinAI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const endRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Fetch initial summary on screen mount
  useEffect(() => {
    let cancelled = false;

    async function loadInitialAdvice() {
      setLoading(true);
      try {
        const advice = await api.post("/ai/advice", {});
        if (!cancelled) {
          const text = formatAdviceText(advice);
          setMessages([
            {
              from: "ai",
              text,
              source: advice.source || "rules",
            },
          ]);
        }
      } catch (err) {
        if (!cancelled) {
          setMessages([
            {
              from: "ai",
              text: "Hello! I am Finzin AI, your personal campus money coach. Ask me anything about your monthly spending, savings, or budget.",
              source: "rules",
            },
          ]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitialLoaded(true);
        }
      }
    }

    if (!initialLoaded) {
      loadInitialAdvice();
    }

    return () => {
      cancelled = true;
    };
  }, [initialLoaded]);

  // Send a student question to the backend AI endpoint
  const send = useCallback(
    async (textToSend) => {
      const q = (textToSend || input).trim().slice(0, 300);
      if (!q || loading) return;

      // Add user's question to chat UI immediately
      const userMessage = { from: "user", text: q };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);

      // Build context history of up to 6 prior turns
      const history = messages.slice(-6).map((m) => ({
        role: m.from === "user" ? "user" : "model",
        text: (m.text || "").slice(0, 300),
      }));

      try {
        const advice = await api.post("/ai/advice", {
          question: q,
          history,
        });

        const replyText = formatAdviceText(advice);
        setMessages((prev) => [
          ...prev,
          {
            from: "ai",
            text: replyText,
            source: advice.source || "rules",
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            from: "ai",
            text: "Sorry, I could not analyze your finances right now. Please check your network or try again in a moment.",
            source: "rules",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-2">
      {/* Header */}
      <div className="flex items-center justify-between py-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Finzin AI</h1>
          <p className="text-xs text-muted">Your intelligent student financial coach</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
          <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
          Live Coach
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3 pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col ${
              m.from === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                m.from === "user"
                  ? "bg-btn text-btntx"
                  : "border border-line bg-card text-ink"
              }`}
            >
              {/* Plain text rendering prevents HTML injection */}
              {m.text}
            </div>

            {/* Note when advice is served from rule fallback */}
            {m.from === "ai" && m.source === "rules" && (
              <span className="mt-1 px-1 text-[10px] text-muted">
                Basic advice (AI is unavailable)
              </span>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-start">
            <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-card px-4 py-3 text-xs text-muted shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: "300ms" }} />
              <span className="ml-1 text-[11px]">Finzin AI is calculating advice...</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Quick question chips */}
      <div className="flex gap-2 overflow-x-auto py-2">
        {QUICK.map((q) => (
          <button
            key={q}
            disabled={loading}
            onClick={() => send(q)}
            className="shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink shadow-sm transition hover:border-brand/50 hover:bg-bg disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Text input and send action */}
      <div className="flex gap-2 pt-1">
        <input
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && send()}
          maxLength={300}
          placeholder="Ask about your budget, savings, or spending..."
          aria-label="Ask Finzin AI"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-brand disabled:opacity-60"
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="flex items-center justify-center rounded-2xl bg-btn px-5 text-sm font-bold text-btntx shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
