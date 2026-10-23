import { useState } from "react";
import Card from "../components/Card";
import { START_BALANCE, START_SAVINGS } from "../data/dummy";
import { formatINR } from "../utils/money";

const RATE = 0.04;          // 4% per year. SIMULATED interest, not real money.
const STEP = 500;           // how much one "+" tap moves into a goal
const MONTHS_AHEAD = [1, 3, 6, 12]; // growth projections shown to the user

// Starting goals. "saved" is money already moved into the goal.
const START_GOALS = [
  { id: "fees", name: "Semester fees", target: 20000, saved: 0 },
  { id: "laptop", name: "New laptop", target: 60000, saved: 0 },
  { id: "emergency", name: "Emergency fund", target: 5000, saved: 0 },
];

export default function Account() {
  const [showBal, setShowBal] = useState(true);      // eye icon: show or hide the balance
  const [pocket, setPocket] = useState(START_SAVINGS); // savings not yet given to a goal
  const [goals, setGoals] = useState(START_GOALS);

  // Total savings = loose pocket money + everything inside goals. Interest applies to all of it.
  const totalSavings = pocket + goals.reduce((s, g) => s + g.saved, 0);
  const monthlyInterest = (totalSavings * RATE) / 12;

  // Projection: balance after m months with monthly compounding
  const projection = MONTHS_AHEAD.map((m) => ({
    m,
    value: totalSavings * Math.pow(1 + RATE / 12, m),
  }));
  const maxValue = projection[projection.length - 1].value; // longest bar = 100% width

  // Move STEP rupees from the pocket into one goal (cannot exceed the pocket or the goal target).
  // We calculate the amount first and then update both pieces of state separately,
  // so nothing runs twice in React StrictMode.
  function addToGoal(id) {
    const goal = goals.find((x) => x.id === id);
    if (!goal) return;
    const amount = Math.min(STEP, pocket, goal.target - goal.saved);
    if (amount <= 0) return;
    setPocket((p) => p - amount);
    setGoals((gs) => gs.map((x) => (x.id === id ? { ...x, saved: x.saved + amount } : x)));
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <h1 className="py-3 text-xl font-bold">Account</h1>

      <div className="flex flex-col gap-3">
        {/* Wallet balance card with show/hide */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted">AVAILABLE BALANCE · ····4821</div>
            <button
              onClick={() => setShowBal((v) => !v)}
              aria-label={showBal ? "Hide balance" : "Show balance"}
              className="rounded-full bg-line px-3 py-1 text-xs font-bold"
            >
              {showBal ? "Hide" : "Show"}
            </button>
          </div>
          <div className="mt-1 text-4xl font-bold">
            {showBal ? formatINR(START_BALANCE) : "₹ ••••••"}
          </div>
        </Card>

        {/* Savings card with simulated interest and growth */}
        <Card>
          <div className="text-xs font-semibold text-muted">TOTAL SAVINGS · {RATE * 100}% p.a. (simulated)</div>
          <div className="text-3xl font-bold text-ok">{formatINR(totalSavings.toFixed(2))}</div>
          <div className="mt-1 text-xs text-muted">
            Earning about {formatINR(monthlyInterest.toFixed(2))} per month
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {projection.map((p) => (
              <div key={p.m} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-muted">{p.m} month{p.m > 1 ? "s" : ""}</span>
                <div className="h-2 flex-1 rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${(p.value / maxValue) * 100}%` }}
                  />
                </div>
                <span className="w-20 text-right font-semibold">{formatINR(p.value.toFixed(2))}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Savings goals */}
        <div>
          <h2 className="mb-2 font-bold">Savings goals</h2>
          <div className="mb-2 text-xs text-muted">Free to allocate: {formatINR(pocket)}</div>
          <div className="flex flex-col gap-2">
            {goals.map((g) => {
              const pct = Math.round((g.saved / g.target) * 100);
              const done = g.saved >= g.target;
              return (
                <Card key={g.id} className="p-3!">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{g.name}</div>
                    <button
                      onClick={() => addToGoal(g.id)}
                      disabled={done || pocket <= 0}
                      className="rounded-full bg-btn px-3 py-1 text-xs font-bold text-btntx disabled:opacity-30"
                    >
                      {done ? "Done" : `+ ${formatINR(STEP)}`}
                    </button>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {formatINR(g.saved)} of {formatINR(g.target)} · {pct}%
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
