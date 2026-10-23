import { useState, useRef, useEffect } from "react";
import { TRANSACTIONS } from "../data/dummy";
import { categoryTotals, getAdvice } from "../utils/advice";

const MONTH = "2026-10";                      // month the advisor analyses
const QUICK = [                               // one-tap questions
  "Where am I overspending?",
  "Will I stay in budget?",
  "How can I save more?",
];

export default function FinzinAI() {
  // The advisor reads this month's category totals (computed from the dummy transactions)
  const rows = categoryTotals(TRANSACTIONS, MONTH);

  const [messages, setMessages] = useState([
    { from: "ai", text: getAdvice("summary", rows) }, // first message = a short summary
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef(null); // invisible marker at the bottom of the chat

  // Scroll to the newest message whenever the list changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Add the user's question and the advisor's answer.
  // LATER: replace getAdvice(...) with a call to the backend AI endpoint.
  function send(text) {
    const q = text.trim().slice(0, 200); // limit length so nobody pastes huge text
    if (!q) return;
    setMessages((m) => [...m, { from: "user", text: q }, { from: "ai", text: getAdvice(q, rows) }]);
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="py-3 text-xl font-bold">Finzin AI</h1>

      {/* Chat messages. Text is rendered as plain text by React, so it cannot inject HTML. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm ${
              m.from === "user"
                ? "self-end bg-btn text-btntx"
                : "self-start border border-line bg-card"
            }`}
          >
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Quick question buttons */}
      <div className="flex gap-2 overflow-x-auto py-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Text box + send button */}
      <div className="flex gap-2 pb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          maxLength={200}
          placeholder="Ask about your spending"
          aria-label="Ask Finzin AI"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() => send(input)}
          className="rounded-2xl bg-btn px-5 text-sm font-bold text-btntx"
        >
          Send
        </button>
      </div>
    </div>
  );
}
