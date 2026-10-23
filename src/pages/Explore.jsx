import Card from "../components/Card";
import Donut from "../components/Donut";
import { TRANSACTIONS, CATEGORIES } from "../data/dummy";
import { categoryTotals, totalSpent } from "../utils/advice";
import { formatINR, formatDate, monthName } from "../utils/money";

const CURRENT_MONTH = "2026-10";                          // month shown on the October Spends card
const BILLS = ["Mobile", "Electricity", "Credit card", "More"]; // quick bill shortcuts (visual only for now)

// Props from App: onOpenTracker (open the expense tracker), onOpenAI (jump to the AI tab)
export default function Explore({ onOpenTracker, onOpenAI }) {
  // Category totals for this month, computed from the dummy transactions
  const rows = categoryTotals(TRANSACTIONS, CURRENT_MONTH);
  const spent = totalSpent(rows);
  const top = rows[0]; // biggest spending category (used for the AI tip)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <h1 className="py-3 text-xl font-bold">Explore</h1>

      <div className="flex flex-col gap-3">
        {/* 1. RECHARGE & BILLS */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Recharge &amp; bills</h2>
            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-[#123b46]">
              ₹0 fee
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {BILLS.map((b) => (
              <div key={b} className="flex flex-col items-center gap-1.5">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-line font-bold">
                  {b[0]}
                </span>
                {b}
              </div>
            ))}
          </div>
        </Card>

        {/* 2. AUTOPAY */}
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-muted">AUTOPAY</div>
            <div className="font-bold">2 active</div>
          </div>
          <div className="text-xs text-muted">Music subscription, Mess fee</div>
        </Card>

        {/* 3. OCTOBER SPENDS: tapping this card opens the full expense tracker */}
        <button
          onClick={onOpenTracker}
          className="rounded-2xl border border-line bg-card p-4 text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-muted">
                {monthName(CURRENT_MONTH).split(" ")[0].toUpperCase()} SPENDS
              </div>
              <div className="text-2xl font-bold">{formatINR(spent)}</div>
            </div>
            <Donut rows={rows} size={84} centerTop={`${rows.length}`} centerBottom="categories" />
          </div>
          <div className="mt-3 border-t border-line pt-2 text-xs font-semibold text-muted">
            Tap to open expense tracker →
          </div>
        </button>

        {/* 4. FINZIN AI TIP (built from the real totals above) */}
        {top && (
          <div className="rounded-2xl bg-btn p-4 text-btntx">
            <div className="text-xs font-bold uppercase tracking-wide opacity-80">Finzin AI tip</div>
            <p className="mt-1 text-sm">
              {top.label} is {Math.round(top.share * 100)}% of your spending this month.
              Try capping it next week.
            </p>
            <button onClick={onOpenAI} className="mt-2 text-sm font-bold underline">
              Ask Finzin AI
            </button>
          </div>
        )}

        {/* 5. TRANSACTION HISTORY (all dummy transactions, newest first) */}
        <div>
          <h2 className="mb-2 font-bold">Transaction history</h2>
          <div className="flex flex-col gap-2">
            {TRANSACTIONS.map((t) => {
              const credit = t.type === "credit";
              return (
                <Card key={t.id} className="flex items-center justify-between p-3!">
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-full bg-line font-bold ${
                        credit ? "text-ok" : ""
                      }`}
                    >
                      {credit ? "↓" : "↑"}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{t.title}</div>
                      <div className="text-xs text-muted">
                        {formatDate(t.date)} · {credit ? "Received" : CATEGORIES[t.category].label}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${credit ? "text-ok" : ""}`}>
                    {credit ? "+" : "-"}
                    {formatINR(t.amount)}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
