// adviceRules.js - deterministic rule-based financial advice generator.
// Used as reliable fallback whenever the Gemini AI service is unavailable, times out, or fails validation.
// Evaluates category spend against the student monthly budget (default Rs 8,000) and produces
// structured recommendations.

/**
 * Generates rule-based financial advice from category spending totals, budget, and balance aggregates.
 *
 * @param {object} params
 * @param {Record<string, number>} params.categoryTotals - Spending per category in rupees
 * @param {number} [params.budget=8000] - Student monthly budget in rupees
 * @param {number} [params.totalSpent] - Total expenses this month in rupees
 * @param {number} [params.walletBalance] - Current checking balance in rupees
 * @param {number} [params.savingsTotal] - Total vault / slice savings in rupees
 * @param {number} [params.daysLeft] - Days remaining in the billing month
 * @returns {{ summary: string, tips: string[], forecast: string, warning: string|null, risk: 'low' | 'medium' | 'high' }}
 */
function getRuleBasedAdvice({
  categoryTotals = {},
  budget = 8000,
  totalSpent: explicitTotal,
  walletBalance = 0,
  savingsTotal = 0,
  daysLeft = 10,
}) {
  const food = Number(categoryTotals.food || 0);
  const travel = Number(categoryTotals.travel || 0);
  const recharge = Number(categoryTotals.recharge || 0);
  const shopping = Number(categoryTotals.shopping || 0);
  const others = Number(categoryTotals.others || 0);

  const calculatedTotal = Math.round((food + travel + recharge + shopping + others) * 100) / 100;
  const totalSpent = typeof explicitTotal === 'number' ? explicitTotal : calculatedTotal;
  const spentPercent = budget > 0 ? (totalSpent / budget) * 100 : 100;

  let risk = 'low';
  if (spentPercent > 90) {
    risk = 'high';
  } else if (spentPercent > 65) {
    risk = 'medium';
  }

  // Identify highest expenditure category
  const categories = [
    { name: 'food', amount: food, label: 'Food & Dining' },
    { name: 'travel', amount: travel, label: 'Travel & Commute' },
    { name: 'shopping', amount: shopping, label: 'Shopping' },
    { name: 'recharge', amount: recharge, label: 'Mobile & Utility' },
    { name: 'others', amount: others, label: 'General Expenses' },
  ].sort((a, b) => b.amount - a.amount);

  const topCategory = categories[0];

  // Compose concise summary
  let summary = '';
  if (totalSpent === 0) {
    summary = `You haven't made any transfer expenses this month. Your entire Rs ${budget.toLocaleString('en-IN')} budget is intact.`;
  } else if (risk === 'high') {
    summary = `You have utilized ${Math.round(spentPercent)}% of your monthly budget (Rs ${totalSpent.toLocaleString('en-IN')} / Rs ${budget.toLocaleString('en-IN')}). Consider curbing discretionary spends.`;
  } else if (risk === 'medium') {
    summary = `You have spent Rs ${totalSpent.toLocaleString('en-IN')} (${Math.round(spentPercent)}% of your Rs ${budget.toLocaleString('en-IN')} budget). Spending is moderate but warrants tracking.`;
  } else {
    summary = `Great job! You have spent only Rs ${totalSpent.toLocaleString('en-IN')} (${Math.round(spentPercent)}% of your Rs ${budget.toLocaleString('en-IN')} budget). Healthy savings margin maintained.`;
  }

  // Actionable student-friendly tips (max 3)
  const tips = [];

  // Tip 1: Top category insight
  if (topCategory && topCategory.amount > 0) {
    const topPct = totalSpent > 0 ? Math.round((topCategory.amount / totalSpent) * 100) : 0;
    tips.push(
      `${topCategory.label} is your highest expense at Rs ${topCategory.amount.toLocaleString('en-IN')} (${topPct}% of spending). Keep an eye on daily micro-purchases.`
    );
  } else {
    tips.push('Plan your essential expenses for textbooks, mess, and travel at the start of each month.');
  }

  // Tip 2: Discretionary spend control
  if (shopping > budget * 0.2) {
    tips.push(
      `Shopping accounts for Rs ${shopping.toLocaleString('en-IN')}, exceeding 20% of your budget. Apply the 48-hour rule before non-essential purchases.`
    );
  } else if (food > budget * 0.4) {
    tips.push(
      'Food & cafeteria spends are higher than 40% of your total budget. Group meal ordering or mess plans can curb delivery surcharges.'
    );
  } else {
    tips.push('Maintain an emergency cushion of at least 15% of your allowance for unexpected academic or travel needs.');
  }

  // Tip 3: Vault savings habit
  tips.push(
    'Transfer surplus cash to your Finzin Vault to earn 4% annual interest with zero lock-in period.'
  );

  // Compute projected forecast
  const remainingBudget = Math.max(0, budget - totalSpent);
  const safeDailySpend = daysLeft > 0 ? Math.floor(remainingBudget / daysLeft) : 0;
  const forecast =
    totalSpent === 0
      ? `Full budget available: you can spend up to Rs ${safeDailySpend.toLocaleString('en-IN')}/day for the remaining ${daysLeft} days.`
      : risk === 'high'
      ? `High spend pace: only Rs ${remainingBudget.toLocaleString('en-IN')} left. Keep daily spending under Rs ${safeDailySpend.toLocaleString('en-IN')} to avoid deficit.`
      : `On track: with Rs ${remainingBudget.toLocaleString('en-IN')} remaining, you have a comfortable limit of ~Rs ${safeDailySpend.toLocaleString('en-IN')}/day for ${daysLeft} days.`;

  // Warning if spend exceeds 80% or wallet balance is critically low
  let warning = null;
  if (spentPercent >= 85) {
    warning = `Budget alert: you have exceeded 85% of your planned monthly allowance.`;
  } else if (walletBalance > 0 && walletBalance < 500) {
    warning = `Low wallet balance: Rs ${walletBalance.toLocaleString('en-IN')} remaining in your active account.`;
  }

  return {
    summary,
    tips: tips.slice(0, 3),
    forecast,
    warning,
    risk,
  };
}

module.exports = {
  getRuleBasedAdvice,
};
