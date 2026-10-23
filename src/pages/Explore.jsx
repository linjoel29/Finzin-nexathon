// Explore.jsx - Explore screen featuring top spending chart, recharge shortcuts, and a dedicated History drawer.
// Changes:
// 1. Removed inline transaction history from the page body.
// 2. Added a top-right History icon button in the header that opens a dedicated slide-up drawer.
// 3. Complete transaction list with filters, date grouping, timestamps, counterparty, category badges, and details sheet.
import { useState, useEffect, useMemo } from "react";
import { Trophy } from "lucide-react";
import Card from "../components/Card";
import Donut from "../components/Donut";
import { api } from "../api/client";
import { CATEGORIES } from "../utils/categories";
import { formatINR, monthName } from "../utils/money";
import FinzinLeague from "./FinzinLeague";

const BILLS = [
  { name: "Mobile", icon: "📱" },
  { name: "Electricity", icon: "⚡" },
  { name: "Credit card", icon: "💳" },
  { name: "More", icon: "•••" },
];

/**
 * Converts a YYYY-MM-DD date into friendly relative day headers:
 * "Today", "Yesterday", or "20 Oct".
 */
function formatGroupDate(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterday);

  if (dateStr === todayStr) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";

  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Formats ISO string into clean 12-hour timestamp for display.
 */
function formatFullDateTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeOnly(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function Explore({
  onOpenTracker,
  onOpenAI,
  transactions: propTransactions,
  setTransactions: propSetTransactions,
}) {
  // Expense summary for top Donut card
  const [expenseData, setExpenseData] = useState({
    spent: 0,
    byCategory: {},
  });

  // Local fallback if no shared state provided
  const [localTransactions, setLocalTransactions] = useState([]);
  const transactions = propTransactions ?? localTransactions;
  const setTransactions = propSetTransactions ?? setLocalTransactions;
  const [loadingTx, setLoadingTx] = useState(false);

  // Filter chips inside drawer: "all" | "spent" | "received"
  const [filter, setFilter] = useState("all");

  // State for dedicated Transaction History slide-up drawer and details sheet
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  // Finzin League entry and summary state
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [leagueSummary, setLeagueSummary] = useState({ lifetimeXp: 0, activeStreak: 0 });

  // Current month string 'YYYY-MM'
  const currentMonthStr = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    return parts.slice(0, 7);
  }, []);

  // Fetch Finzin League summary for the Explore card
  useEffect(() => {
    let cancelled = false;
    api
      .get("/league/summary")
      .then((data) => {
        if (!cancelled && data) {
          setLeagueSummary({
            lifetimeXp: data.lifetimeXp ?? 0,
            activeStreak: data.activeStreak ?? 0,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueOpen]);

  // Fetch summary and transactions on mount
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoadingTx(true);
      try {
        const [expRes, txRes] = await Promise.allSettled([
          api.get("/expenses/summary", { month: currentMonthStr }),
          api.get("/payments/history"),
        ]);

        if (!cancelled) {
          if (expRes.status === "fulfilled" && expRes.value) {
            setExpenseData(expRes.value);
          }
          if (txRes.status === "fulfilled" && Array.isArray(txRes.value)) {
            setTransactions((prev) => {
              if (prev && prev.length > 0) {
                const fetchedIds = new Set(
                  txRes.value.map((x) => x.id || x.transaction_id)
                );
                const localOnly = prev.filter(
                  (p) => !fetchedIds.has(p.id || p.transaction_id)
                );
                return [...localOnly, ...txRes.value];
              }
              return txRes.value;
            });
          }
        }
      } catch (err) {
        // Handled silently
      } finally {
        if (!cancelled) setLoadingTx(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [currentMonthStr, setTransactions]);

  // Transform category totals into Donut rows
  const donutRows = useMemo(() => {
    return Object.entries(expenseData.byCategory || {})
      .filter(([_, amt]) => amt > 0)
      .map(([cat, amt]) => ({
        key: cat,
        label: (CATEGORIES[cat] || CATEGORIES.others).label,
        color: (CATEGORIES[cat] || CATEGORIES.others).color,
        total: amt,
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenseData]);

  // Filtered transactions for the drawer
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const typeLower = (t.type || "").toLowerCase();
      if (filter === "spent") return typeLower === "debit";
      if (filter === "received") return typeLower === "credit";
      return true;
    });
  }, [transactions, filter]);

  // Group transactions by date string
  function groupTransactions(list) {
    const groups = {};
    for (const t of list) {
      const d =
        t.date ||
        (t.createdAt ? t.createdAt.slice(0, 10) : "") ||
        (t.created_at ? t.created_at.slice(0, 10) : "") ||
        "Today";
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    }
    return Object.entries(groups).map(([date, items]) => ({
      date,
      title: formatGroupDate(date),
      items,
    }));
  }

  const groupedTimeline = useMemo(
    () => groupTransactions(filteredTransactions),
    [filteredTransactions]
  );

  // If user opens Finzin League from the card
  if (leagueOpen) {
    return <FinzinLeague onBack={() => setLeagueOpen(false)} onOpenAI={onOpenAI} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      {/* HEADER: Title + History Icon Button */}
      <div className="flex items-center justify-between py-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Explore</h1>
          <p className="text-xs text-muted">Smart student campus spends</p>
        </div>

        {/* Transaction History icon button (Lucide History) */}
        <button
          onClick={() => setHistoryDrawerOpen(true)}
          aria-label="Open Transaction History"
          title="Transaction History"
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-card text-ink shadow-sm transition hover:border-brand/40 active:scale-95"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </svg>
          {transactions.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-[#123b46] shadow-xs">
              {transactions.length > 9 ? "9+" : transactions.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-col gap-3.5">
        {/* 1. TOP: MONTHLY SPENDING CHART CARD (Bigger donut, tappable to open Tracker) */}
        <button
          onClick={onOpenTracker}
          className="rounded-3xl border border-line bg-card p-5 text-left shadow-sm transition hover:border-brand/40 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                {monthName(currentMonthStr).split(" ")[0]} Spends
              </div>
              <div className="mt-1 text-3xl font-black text-ink">
                {formatINR(expenseData.spent || 0)}
              </div>
              <div className="mt-2 text-xs font-semibold text-brand flex items-center gap-1">
                Open Expense Tracker <span>→</span>
              </div>
            </div>

            <div className="shrink-0">
              <Donut
                rows={donutRows}
                size={112}
                centerTop={donutRows.length > 0 ? `${donutRows.length}` : "₹0"}
                centerBottom={donutRows.length > 0 ? "categories" : "spent"}
              />
            </div>
          </div>
        </button>

        {/* FINZIN LEAGUE CARD (Section 3 Placement: Immediately below spending overview) */}
        <Card className="rounded-3xl border border-line bg-card p-4.5 shadow-sm transition hover:border-brand/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/15 text-brand shadow-xs">
                <Trophy className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-brand">
                  FINZIN LEAGUE
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-ink">
                  Build habits. Complete challenges. Rise together.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-xs font-bold text-ink">
            <div>
              <span className="text-muted font-medium">Your Points: </span>
              <span>{leagueSummary.lifetimeXp} XP</span>
            </div>
            <div className="border-l border-line/60 pl-3">
              <span className="text-muted font-medium">Current Streak: </span>
              <span>{leagueSummary.activeStreak} days</span>
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={() => setLeagueOpen(true)}
              className="w-full rounded-2xl bg-btn py-2 text-xs font-bold text-btntx shadow-sm transition hover:opacity-95 active:scale-[0.99] flex items-center justify-center gap-1.5"
            >
              <span>Explore Finzin League</span>
              <span className="text-brand">→</span>
            </button>
          </div>
        </Card>

        {/* 2. RECHARGE & BILLS */}
        <Card className="rounded-3xl p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">Recharge &amp; Bills</h2>
            <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[11px] font-bold text-brand">
              ₹0 Convenience Fee
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {BILLS.map((b) => (
              <div key={b.name} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bg text-lg shadow-sm border border-line/60 transition group-hover:border-brand/40 group-active:scale-95">
                  {b.icon}
                </span>
                <span className="text-ink font-medium text-[11px]">{b.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 3. AI FINANCIAL ADVISOR PROMPT CARD */}
        <Card className="rounded-3xl p-4 shadow-sm flex items-center justify-between bg-gradient-to-r from-card to-brand/5 border border-line">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand">
              Finzin AI Coach
            </div>
            <p className="mt-1 text-xs text-ink font-medium">
              Want smart tips on your campus spending and budget?
            </p>
          </div>
          <button
            onClick={onOpenAI}
            className="rounded-2xl bg-btn px-4 py-2 text-xs font-bold text-btntx shadow-sm transition hover:opacity-95 shrink-0"
          >
            Chat AI
          </button>
        </Card>
      </div>

      {/* DEDICATED TRANSACTION HISTORY SLIDE-UP DRAWER / MODAL */}
      {historyDrawerOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setHistoryDrawerOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Drawer container (mobile-width centered) */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Transaction History"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[85dvh] max-w-[430px] flex-col rounded-t-[32px] bg-bg shadow-2xl border-t border-line text-ink transition-transform duration-300"
          >
            {/* Grab Bar & Header */}
            <div className="shrink-0 p-5 pb-3 bg-card rounded-t-[32px] border-b border-line shadow-xs">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-line" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/15 text-brand">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M12 7v5l4 2" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-ink">Transaction History</h2>
                    <p className="text-[11px] text-muted">
                      {transactions.length} record{transactions.length !== 1 ? "s" : ""} found
                    </p>
                  </div>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => setHistoryDrawerOpen(false)}
                  aria-label="Close History"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-line text-sm font-bold text-ink transition hover:bg-line/80 active:scale-95"
                >
                  ✕
                </button>
              </div>

              {/* Filter Chips: All / Spent / Received */}
              <div className="mt-3 flex gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "spent", label: "Spent" },
                  { id: "received", label: "Received" },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setFilter(c.id)}
                    className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                      filter === c.id
                        ? "bg-btn text-btntx shadow-xs"
                        : "bg-bg text-muted hover:text-ink border border-line"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable list area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingTx ? (
                <div className="py-16 text-center text-xs text-muted flex flex-col items-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  Loading transactions...
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="py-16 text-center text-xs text-muted">
                  <div className="text-3xl mb-2">📜</div>
                  <p className="font-semibold text-ink text-sm">No transactions yet</p>
                  <p className="mt-1 text-muted">Your simulated transfers and credits will show up here.</p>
                </div>
              ) : (
                groupedTimeline.map((group) => (
                  <div key={group.date} className="flex flex-col">
                    <div className="pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                      {group.title}
                    </div>

                    <div className="divide-y divide-line/60 rounded-2xl bg-card border border-line px-3 shadow-xs">
                      {group.items.map((t) => {
                        const isCredit = (t.type || "").toLowerCase() === "credit";
                        const catConfig = CATEGORIES[t.category] || CATEGORIES.others;

                        return (
                          <div
                            key={t.id || t.transaction_id}
                            onClick={() => setSelectedTx(t)}
                            className="flex items-center justify-between py-3 cursor-pointer hover:bg-bg/40 -mx-1 px-1 rounded-xl transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Category colored badge circle */}
                              <div
                                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white shadow-xs"
                                style={{
                                  backgroundColor: isCredit ? "#16845B" : catConfig.color,
                                }}
                              >
                                {isCredit ? "↓" : catConfig.label[0]}
                              </div>

                              <div className="flex flex-col min-w-0">
                                <span className="truncate text-sm font-semibold text-ink">
                                  {t.counterparty_name || t.title}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                                  <span>{formatTimeOnly(t.createdAt || t.created_at) || group.title}</span>
                                  <span>•</span>
                                  <span
                                    className="rounded px-1.5 py-0.2 text-[10px] font-semibold"
                                    style={{
                                      backgroundColor: `${catConfig.color}20`,
                                      color: catConfig.color,
                                    }}
                                  >
                                    {catConfig.label}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Credited / Debited Amount: Green for credits, Red for debits */}
                            <div
                              className={`text-sm font-bold shrink-0 text-right ${
                                isCredit ? "text-ok" : "text-err"
                              }`}
                            >
                              {isCredit ? "+" : "-"}
                              {formatINR(t.amount)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* TRANSACTION DETAILS BOTTOM SHEET */}
      {selectedTx && (
        <>
          <div
            onClick={() => setSelectedTx(null)}
            aria-hidden="true"
            className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs transition-opacity"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Transaction Details"
            className="fixed bottom-0 left-1/2 z-60 w-full max-w-[430px] -translate-x-1/2 rounded-t-3xl bg-card p-6 shadow-2xl border-t border-line text-ink transition-transform"
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-line" />

            <div className="text-center pb-4 border-b border-line">
              <div
                className={`text-3xl font-black ${
                  selectedTx.type === "credit" ? "text-ok" : "text-ink"
                }`}
              >
                {selectedTx.type === "credit" ? "+" : "-"}
                {formatINR(selectedTx.amount)}
              </div>
              <p className="mt-1 text-sm font-semibold text-ink">{selectedTx.title}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-semibold text-ok">
                <span>✓</span> {selectedTx.status || "Completed"}
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-muted">Date &amp; Time</span>
                <span className="font-semibold text-ink">
                  {formatFullDateTime(selectedTx.createdAt) || selectedTx.date}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">Category</span>
                <span className="font-semibold text-ink capitalize">
                  {selectedTx.category || "General"}
                </span>
              </div>
              {selectedTx.note && (
                <div className="flex justify-between py-1">
                  <span className="text-muted">Note</span>
                  <span className="font-semibold text-ink">{selectedTx.note}</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-muted">Reference ID</span>
                <span className="font-mono text-[10px] text-muted max-w-[200px] truncate">
                  {selectedTx.id}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTx(null)}
              className="mt-6 w-full rounded-2xl bg-btn py-3 text-sm font-bold text-btntx shadow-sm transition active:scale-98"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
