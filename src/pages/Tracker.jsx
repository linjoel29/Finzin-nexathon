import { useState } from "react";
import Card from "../components/Card";
import Donut from "../components/Donut";
import { TRANSACTIONS, MONTHLY_BUDGET } from "../data/dummy";
import { categoryTotals, totalSpent } from "../utils/advice";
import { formatINR, monthName } from "../utils/money";

// Months we have dummy data for, oldest first
const MONTHS = ["2026-09", "2026-10"];

// Props from App: onBack (return to Explore)
export default function Tracker({ onBack }) {
  const [idx, setIdx] = useState(MONTHS.length - 1); // start on the latest month
  const month = MONTHS[idx];

  // Everything below is calculated from the transactions of the chosen month
  const rows = categoryTotals(TRANSACTIONS, month);
  const spent = totalSpent(rows);
  const pct = Math.min(100, Math.round((spent / MONTHLY_BUDGET) * 100)); // bar width, capped at 100
  const over = spent > MONTHLY_BUDGET;                                  // overspent?

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      {/* Header with back button */}
      <div className="flex items-center gap-2 py-3">
        <button onClick={onBack} aria-label="Back to Explore" className="rounded-full bg-line px-3 py-1 text-sm font-bold">
          ‹ Back
        </button>
        <h1 className="text-xl font-bold">Expense tracker</h1>
      </div>

      <div className="flex flex-col gap-3">
        {/* Month switcher: previous / current / next (disabled at the ends) */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIdx((i) => i - 1)}
            disabled={idx === 0}
            aria-label="Previous month"
            className="h-9 w-9 rounded-full bg-line font-bold disabled:opacity-30"
          >
            ‹
          </button>
          <div className="font-semibold">{monthName(month)}</div>
          <button
            onClick={() => setIdx((i) => i + 1)}
            disabled={idx === MONTHS.length - 1}
            aria-label="Next month"
            className="h-9 w-9 rounded-full bg-line font-bold disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {/* Budget card with progress bar (turns red when over budget) */}
        <Card>
          <div className="text-xs font-semibold text-muted">SPENT THIS MONTH</div>
          <div className="text-3xl font-bold">
            {formatINR(spent)}{" "}
            <span className="text-sm font-medium text-muted">of {formatINR(MONTHLY_BUDGET)}</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-all duration-500 ${over ? "bg-err" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={`mt-2 text-xs font-semibold ${over ? "text-err" : "text-muted"}`}>
            {over
              ? `${formatINR(spent - MONTHLY_BUDGET)} over budget`
              : `${formatINR(MONTHLY_BUDGET - spent)} left in your budget`}
          </div>
        </Card>

        {/* Category breakdown: donut + one row per category */}
        <Card>
          <h2 className="mb-3 font-bold">By category</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">No spending recorded this month.</p>
          ) : (
            <>
              <div className="mb-4 flex justify-center">
                <Donut rows={rows} size={150} centerTop={formatINR(spent)} centerBottom="spent" />
              </div>
              <div className="flex flex-col gap-3">
                {rows.map((r) => (
                  <div key={r.key}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <i className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                        {r.label}
                      </span>
                      <span className="font-semibold">
                        {formatINR(r.total)} · {Math.round(r.share * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-line">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.share * 100}%`, background: r.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
