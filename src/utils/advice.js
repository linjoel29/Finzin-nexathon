// RULE-BASED "AI" ADVISOR. It reads the category totals and answers common
// money questions. It is the offline fallback: when the backend AI endpoint
// exists, FinzinAI.jsx can call that first and use this only if the call fails.
import { CATEGORIES, MONTHLY_BUDGET, TODAY } from "../data/dummy";
import { formatINR } from "./money";

// "2026-10-22" -> "2026-10"
export const monthKey = (date) => date.slice(0, 7);

// Adds up money SPENT (debits only) per category for one month.
// Returns [{ key, label, color, total, share }] sorted from biggest to smallest.
export function categoryTotals(transactions, month) {
  const sums = {};
  for (const t of transactions) {
    if (t.type !== "debit" || monthKey(t.date) !== month) continue;
    sums[t.category] = (sums[t.category] || 0) + t.amount;
  }
  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  return Object.entries(sums)
    .map(([key, value]) => ({
      key,
      ...CATEGORIES[key],
      total: value,
      share: total ? value / total : 0, // fraction of all spending (0 to 1)
    }))
    .sort((a, b) => b.total - a.total);
}

// Total spent = sum of all category totals
export const totalSpent = (rows) => rows.reduce((s, r) => s + r.total, 0);

// Day-of-month info from the fixed demo "today"
function dayInfo() {
  const [y, m, d] = TODAY.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return { day: d, daysLeft: daysInMonth - d, daysInMonth };
}

// Predicts month-end spending if the current pace continues
export function forecast(spent) {
  const { day, daysInMonth } = dayInfo();
  return Math.round((spent / day) * daysInMonth);
}

// Picks an answer by looking for keywords in the question
export function getAdvice(question, rows) {
  const q = question.toLowerCase();
  const spent = totalSpent(rows);
  if (!rows.length) return "I do not see any spending this month yet. Make a payment and ask me again.";

  const top = rows[0];
  const topPct = Math.round(top.share * 100);
  const { daysLeft } = dayInfo();
  const left = MONTHLY_BUDGET - spent;
  const perDay = daysLeft > 0 ? Math.max(0, Math.floor(left / daysLeft)) : 0;
  const projected = forecast(spent);

  // Budget / forecast questions
  if (/budget|stay|run out|enough|forecast|end of|month/.test(q)) {
    return projected > MONTHLY_BUDGET
      ? `At this pace you will spend about ${formatINR(projected)} this month, which is ${formatINR(projected - MONTHLY_BUDGET)} over your ${formatINR(MONTHLY_BUDGET)} budget. Keep daily spending near ${formatINR(perDay)} for the rest of the month.`
      : `Good news: at this pace you will spend about ${formatINR(projected)}, inside your ${formatINR(MONTHLY_BUDGET)} budget. You can spend about ${formatINR(perDay)} per day for the remaining ${daysLeft} days.`;
  }
  // Overspending questions
  if (/overspend|where|most|top|cut|reduce/.test(q)) {
    return `${top.label} is your biggest category: ${formatINR(top.total)}, which is ${topPct}% of everything you spent. Cutting it by 20% would save about ${formatINR(Math.round(top.total * 0.2))} this month.`;
  }
  // Saving questions
  if (/save|saving|invest/.test(q)) {
    return `Try this: move ${formatINR(Math.max(100, Math.round(left * 0.2 / 100) * 100))} to savings as soon as pocket money arrives, before you spend. Your savings pocket earns simulated interest, so money saved early grows the most.`;
  }
  // Category-specific questions
  for (const r of rows) {
    if (q.includes(r.label.toLowerCase())) {
      return `You spent ${formatINR(r.total)} on ${r.label} this month (${Math.round(r.share * 100)}% of your spending).`;
    }
  }
  // Default: a short summary
  return `So far this month you spent ${formatINR(spent)} of ${formatINR(MONTHLY_BUDGET)}. Your biggest category is ${top.label} (${topPct}%). Ask me where you are overspending or whether you will stay in budget.`;
}
