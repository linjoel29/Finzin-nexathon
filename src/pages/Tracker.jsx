// Tracker.jsx - Detailed expense tracker with real monthly category breakdown and budget progress.
import { useState, useEffect } from "react";
import Card from "../components/Card";
import Donut from "../components/Donut";
import { api } from "../api/client";
import { CATEGORIES } from "../utils/categories";
import { formatINR, monthName } from "../utils/money";

// Helper to format Date to YYYY-MM
function toMonthStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function Tracker({ onBack }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const monthStr = toMonthStr(currentDate);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    budget: 8000,
    spent: 0,
    remaining: 8000,
    byCategory: { food: 0, travel: 0, recharge: 0, shopping: 0, others: 0 },
    days: [],
  });

  useEffect(() => {
    let cancelled = false;
    async function fetchExpenses() {
      setLoading(true);
      try {
        const data = await api.get("/expenses/summary", { month: monthStr });
        if (!cancelled && data) {
          setSummary(data);
        }
      } catch (err) {
        // Fall back to clean 0 state on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchExpenses();
    return () => {
      cancelled = true;
    };
  }, [monthStr]);

  function prevMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  // Convert byCategory dictionary into Donut row array
  const rows = Object.entries(summary.byCategory || {})
    .filter(([_, amt]) => amt > 0)
    .map(([cat, amt]) => ({
      key: cat,
      label: (CATEGORIES[cat] || CATEGORIES.others).label,
      color: (CATEGORIES[cat] || CATEGORIES.others).color,
      total: amt,
    }))
    .sort((a, b) => b.total - a.total);

  const spent = summary.spent || 0;
  const budget = summary.budget || 8000;
  const pct = Math.min(100, Math.round((spent / budget) * 100));
  const over = spent > budget;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      {/* Header with back button */}
      <div className="flex items-center gap-2 py-3">
        <button
          onClick={onBack}
          aria-label="Back to Explore"
          className="rounded-full bg-line px-3 py-1 text-sm font-bold text-ink transition hover:bg-line/80"
        >
          ‹ Back
        </button>
        <h1 className="text-xl font-bold text-ink">Expense Tracker</h1>
      </div>

      <div className="flex flex-col gap-3">
        {/* Month switcher */}
        <div className="flex items-center justify-between">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="h-9 w-9 rounded-full bg-line font-bold text-ink transition hover:bg-line/80"
          >
            ‹
          </button>
          <div className="font-semibold text-ink">{monthName(monthStr)}</div>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="h-9 w-9 rounded-full bg-line font-bold text-ink transition hover:bg-line/80"
          >
            ›
          </button>
        </div>

        {/* Budget card */}
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            Spent This Month
          </div>
          <div className="text-3xl font-bold text-ink">
            {formatINR(spent)}{" "}
            <span className="text-sm font-medium text-muted">of {formatINR(budget)}</span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-line overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                over ? "bg-err" : "bg-brand"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{pct}% of monthly allowance</span>
            <span>{over ? "Over budget" : `${formatINR(summary.remaining)} left`}</span>
          </div>
        </Card>

        {/* Category Breakdown Donut */}
        <Card className="flex flex-col items-center p-4">
          <div className="mb-2 w-full text-xs font-semibold uppercase tracking-wider text-muted">
            Category Breakdown
          </div>
          <div className="my-2">
            <Donut
              rows={rows}
              size={120}
              centerTop={rows.length > 0 ? `${rows.length}` : "0"}
              centerBottom="categories"
            />
          </div>

          {rows.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted">
              No expenses recorded for this month yet
            </div>
          ) : (
            <div className="mt-3 flex w-full flex-col gap-2">
              {rows.map((r) => {
                const share = spent > 0 ? Math.round((r.total / spent) * 100) : 0;
                return (
                  <div key={r.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="font-semibold text-ink">{r.label}</span>
                    </div>
                    <div className="font-medium text-ink">
                      {formatINR(r.total)} <span className="text-muted">({share}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
