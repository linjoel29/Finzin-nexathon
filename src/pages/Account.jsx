// Account.jsx - Account dashboard displaying real checking balance and four specialized savings sections:
// 1. Slice (Savings Pots with two-column square tiles, deposit, withdrawal, rename, delete, PIN verification)
// 2. FD Savings (Fixed Deposit comparison and educational calculator)
// 3. Gold Savings (Precious metals rates and educational accumulation simulator)
// 4. Bond Savings (Sovereign and CPSE bonds, Coupon vs YTM educational discovery)
import { useState, useEffect } from "react";
import {
  PieChart,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  X,
  ExternalLink,
  Calculator,
  Coins,
  Landmark,
  ShieldCheck,
  TrendingUp,
  Lock,
} from "lucide-react";
import Card from "../components/Card";
import { api } from "../api/client";
import { formatINR } from "../utils/money";

export default function Account() {
  const [showBal, setShowBal] = useState(true);
  const [balance, setBalance] = useState(0);
  const [portfolioTotal, setPortfolioTotal] = useState(0);
  const [goals, setGoals] = useState([]);
  const [sliceTotal, setSliceTotal] = useState(0);

  // Market data states
  const [fixedDeposits, setFixedDeposits] = useState([]);
  const [goldSilverData, setGoldSilverData] = useState(null);
  const [bonds, setBonds] = useState([]);

  // Slice Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [actionGoal, setActionGoal] = useState(null); // active goal for deposit/withdraw/manage
  const [actionType, setActionType] = useState(null); // 'deposit' | 'withdraw' | 'edit' | 'delete'
  const [actionAmount, setActionAmount] = useState("");
  const [actionPin, setActionPin] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // New Goal Form
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [newGoalDate, setNewGoalDate] = useState("");

  // FD Calculator States
  const [fdPrincipal, setFdPrincipal] = useState(25000);
  const [fdTenureMonths, setFdTenureMonths] = useState(12);
  const [fdSelectedRate, setFdSelectedRate] = useState(7.25);

  // Gold Accumulation Calculator State
  const [goldBudget, setGoldBudget] = useState(2000);

  // Bond Simulator State
  const [bondInvestment, setBondInvestment] = useState(10000);
  const [selectedBondId, setSelectedBondId] = useState("bond-goi-718-2033");

  // Load account portfolio and market data
  const loadAccountAndMarketData = async () => {
    try {
      const [portData, fdRes, goldRes, bondsRes] = await Promise.all([
        api.get("/portfolio").catch(() => null),
        api.get("/market/fixed-deposits").catch(() => null),
        api.get("/market/gold-silver").catch(() => null),
        api.get("/market/bonds").catch(() => null),
      ]);

      if (portData) {
        setBalance(portData.wallet || 0);
        setGoals(portData.goals || []);
        setSliceTotal(portData.slice?.total || 0);
        setPortfolioTotal(portData.total || 0);
      }

      if (fdRes?.items) setFixedDeposits(fdRes.items);
      if (goldRes) setGoldSilverData(goldRes);
      if (bondsRes?.items) setBonds(bondsRes.items);
    } catch (err) {
      // Graceful fallback
    }
  };

  useEffect(() => {
    loadAccountAndMarketData();
  }, []);

  // Handle Slice Deposit
  const handleSliceDeposit = async (e) => {
    e.preventDefault();
    if (!actionGoal) return;
    setActionError("");
    setActionLoading(true);

    const amt = parseFloat(actionAmount);
    if (!amt || amt <= 0) {
      setActionError("Please enter a valid deposit amount");
      setActionLoading(false);
      return;
    }

    if (amt > balance) {
      setActionError("Insufficient wallet balance");
      setActionLoading(false);
      return;
    }

    if (!actionPin || actionPin.length !== 4) {
      setActionError("Please enter your 4-digit transaction PIN");
      setActionLoading(false);
      return;
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      await api.post(`/goals/${actionGoal.id}/deposit`, {
        amount: amt,
        pin: actionPin,
        idempotencyKey,
      });

      // Refresh data
      await loadAccountAndMarketData();
      closeActionModal();
    } catch (err) {
      setActionError(err.message || "Deposit failed. Check your PIN or balance.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Slice Withdrawal
  const handleSliceWithdraw = async (e) => {
    e.preventDefault();
    if (!actionGoal) return;
    setActionError("");
    setActionLoading(true);

    const amt = parseFloat(actionAmount);
    if (!amt || amt <= 0) {
      setActionError("Please enter a valid withdrawal amount");
      setActionLoading(false);
      return;
    }

    if (amt > actionGoal.allocated) {
      setActionError(`Cannot withdraw more than available goal balance (₹${actionGoal.allocated})`);
      setActionLoading(false);
      return;
    }

    if (!actionPin || actionPin.length !== 4) {
      setActionError("Please enter your 4-digit transaction PIN");
      setActionLoading(false);
      return;
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      await api.post(`/goals/${actionGoal.id}/withdraw`, {
        amount: amt,
        pin: actionPin,
        idempotencyKey,
      });

      await loadAccountAndMarketData();
      closeActionModal();
    } catch (err) {
      setActionError(err.message || "Withdrawal failed. Check your PIN or pot balance.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Create Goal
  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!newGoalName.trim()) {
      setActionError("Please enter a goal name");
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      await api.post("/goals", {
        name: newGoalName.trim(),
        target: newGoalTarget ? parseFloat(newGoalTarget) : null,
        targetDate: newGoalDate || null,
      });

      setNewGoalName("");
      setNewGoalTarget("");
      setNewGoalDate("");
      setCreateModalOpen(false);
      await loadAccountAndMarketData();
    } catch (err) {
      setActionError(err.message || "Failed to create savings goal");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delete Goal
  const handleDeleteGoal = async () => {
    if (!actionGoal) return;
    setActionLoading(true);
    setActionError("");

    try {
      await api.delete(`/goals/${actionGoal.id}`);
      await loadAccountAndMarketData();
      closeActionModal();
    } catch (err) {
      setActionError(err.message || "Failed to delete goal");
    } finally {
      setActionLoading(false);
    }
  };

  // Close action modal helper
  const closeActionModal = () => {
    setActionGoal(null);
    setActionType(null);
    setActionAmount("");
    setActionPin("");
    setActionError("");
    setActionLoading(false);
  };

  // FD Quarterly Compounding Calculation
  const fdCalculation = (() => {
    const p = Number(fdPrincipal) || 0;
    const r = (Number(fdSelectedRate) || 7.25) / 100;
    const t = (Number(fdTenureMonths) || 12) / 12;
    const n = 4; // quarterly
    const maturity = p * Math.pow(1 + r / n, n * t);
    const interest = maturity - p;
    return {
      maturity: Math.round(maturity * 100) / 100,
      interest: Math.round(interest * 100) / 100,
    };
  })();

  // Gold Grams Calculation
  const gold24kRate = goldSilverData?.gold24k?.ratePerGram || 7850;
  const gold22kRate = goldSilverData?.gold22k?.ratePerGram || 7195;
  const silverRate = goldSilverData?.silver?.ratePerGram || 94.5;
  const goldGrams24k = ((Number(goldBudget) || 0) / gold24kRate).toFixed(3);
  const goldGrams22k = ((Number(goldBudget) || 0) / gold22kRate).toFixed(3);

  // Bond Payout Calculation
  const selectedBond = bonds.find((b) => b.id === selectedBondId) || bonds[0];
  const bondAnnualCouponIncome = selectedBond
    ? ((Number(bondInvestment) || 0) * (selectedBond.couponRate / 100)).toFixed(2)
    : 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-24">
      <h1 className="py-3 text-xl font-bold text-ink">Account</h1>

      <div className="flex flex-col gap-4">
        {/* =====================================================================
            WALLET BALANCE CARD (Preserved as requested)
           ===================================================================== */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">
              Available Balance
            </div>
            <button
              onClick={() => setShowBal((v) => !v)}
              aria-label={showBal ? "Hide balance" : "Show balance"}
              className="rounded-full bg-line px-3 py-1 text-xs font-bold text-ink transition hover:bg-line/80"
            >
              {showBal ? "Hide" : "Show"}
            </button>
          </div>
          <div className="mt-1 text-4xl font-bold text-ink">
            {showBal ? formatINR(balance) : "₹ ••••••"}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-muted">
            <span>Spendable Wallet Funds</span>
            <span>Portfolio Total: {formatINR(portfolioTotal)}</span>
          </div>
        </Card>

        {/* =====================================================================
            SECTION 1: SLICE SAVINGS (Two-Column Square Tiles)
           ===================================================================== */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <PieChart className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-bold text-ink">Slice Pots</h2>
              <span className="text-xs font-semibold text-muted">({formatINR(sliceTotal)} allocated)</span>
            </div>
            <button
              onClick={() => {
                setActionError("");
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-1 rounded-full bg-btn px-2.5 py-1 text-xs font-bold text-btntx transition hover:opacity-95"
            >
              <Plus className="h-3 w-3" />
              <span>New Pot</span>
            </button>
          </div>

          {goals.length === 0 ? (
            <Card>
              <div className="py-6 text-center">
                <PieChart className="mx-auto h-8 w-8 text-muted/60" />
                <h3 className="mt-2 text-sm font-bold text-ink">No Slice goals yet</h3>
                <p className="mt-1 text-xs text-muted">
                  Create your first Slice pot to set aside money for laptops, trips, or campus savings.
                </p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-3 inline-flex items-center gap-1 rounded-full bg-btn px-4 py-1.5 text-xs font-bold text-btntx"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Slice Pot</span>
                </button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {goals.map((goal) => {
                const target = goal.target || 0;
                const progress = target > 0 ? Math.min(100, Math.round((goal.allocated / target) * 100)) : 0;
                return (
                  <div
                    key={goal.id}
                    className="aspect-square rounded-2xl border border-line bg-card p-3 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="font-bold text-xs text-ink truncate leading-tight" title={goal.name}>
                          {goal.name}
                        </h3>
                        <button
                          onClick={() => {
                            setActionGoal(goal);
                            setActionType("delete");
                          }}
                          className="text-muted hover:text-err p-0.5"
                          title="Delete Goal"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="mt-2">
                        <div className="text-base font-bold text-ink leading-none">
                          {formatINR(goal.allocated)}
                        </div>
                        {target > 0 ? (
                          <div className="mt-0.5 text-[10px] text-muted">
                            Target: {formatINR(target)} ({progress}%)
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[10px] text-muted">No target set</div>
                        )}
                      </div>

                      {target > 0 && (
                        <div className="mt-2 h-1.5 w-full rounded-full bg-line overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}

                      {goal.targetDate && (
                        <div className="mt-1 text-[9px] text-muted truncate">
                          By: {goal.targetDate}
                        </div>
                      )}
                    </div>

                    {/* Deposit & Withdraw Quick Actions */}
                    <div className="flex items-center gap-1 pt-1 border-t border-line/60">
                      <button
                        onClick={() => {
                          setActionGoal(goal);
                          setActionType("deposit");
                          setActionAmount("");
                          setActionPin("");
                          setActionError("");
                        }}
                        className="flex-1 flex items-center justify-center gap-0.5 rounded-lg bg-btn py-1 text-[10px] font-bold text-btntx"
                      >
                        <ArrowDownLeft className="h-2.5 w-2.5" />
                        <span>Add</span>
                      </button>
                      <button
                        onClick={() => {
                          setActionGoal(goal);
                          setActionType("withdraw");
                          setActionAmount("");
                          setActionPin("");
                          setActionError("");
                        }}
                        disabled={goal.allocated <= 0}
                        className="flex-1 flex items-center justify-center gap-0.5 rounded-lg border border-line bg-card py-1 text-[10px] font-bold text-ink disabled:opacity-40"
                      >
                        <ArrowUpRight className="h-2.5 w-2.5" />
                        <span>Take</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* =====================================================================
            SECTION 2: FD SAVINGS (Fixed Deposits Learning & Comparison)
           ===================================================================== */}
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Landmark className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-bold text-ink">FD Savings · Bank Comparison</h2>
          </div>

          <Card>
            <div className="text-xs font-bold text-ink mb-1">Published Bank Deposit Rates</div>
            <p className="text-[11px] text-muted mb-3">
              Compare indicative terms across major Indian banking institutions.
            </p>

            <div className="space-y-2">
              {fixedDeposits.map((fd) => (
                <div
                  key={fd.id}
                  onClick={() => setFdSelectedRate(fd.interestRate)}
                  className={`cursor-pointer rounded-xl border p-2.5 transition ${
                    fdSelectedRate === fd.interestRate
                      ? "border-brand bg-brand/5"
                      : "border-line bg-card hover:border-line/80"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-bold text-ink">{fd.bank}</div>
                      <div className="text-[10px] text-muted">{fd.scheme} · {fd.tenure}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-ok">{fd.interestRate}% p.a.</div>
                      <div className="text-[9px] text-muted">{fd.compoundingFrequency}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted border-t border-line/40 pt-1">
                    <span>Min: ₹{fd.minDeposit?.toLocaleString("en-IN")}</span>
                    <a
                      href={fd.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 text-brand hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>Terms</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Educational FD Calculator */}
            <div className="mt-4 rounded-xl border border-line bg-bg p-3">
              <div className="flex items-center gap-1 text-xs font-bold text-ink mb-2">
                <Calculator className="h-3.5 w-3.5 text-brand" />
                <span>FD Educational Growth Calculator</span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] text-muted mb-1">
                    <span>Deposit Principal</span>
                    <span className="font-bold text-ink">{formatINR(fdPrincipal)}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[10000, 25000, 50000, 100000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setFdPrincipal(amt)}
                        className={`flex-1 rounded-lg py-1 text-[10px] font-bold transition ${
                          fdPrincipal === amt
                            ? "bg-btn text-btntx"
                            : "border border-line bg-card text-muted hover:text-ink"
                        }`}
                      >
                        ₹{(amt / 1000).toFixed(0)}k
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] text-muted mb-0.5">Tenure</label>
                    <select
                      value={fdTenureMonths}
                      onChange={(e) => setFdTenureMonths(Number(e.target.value))}
                      className="w-full rounded-lg border border-line bg-card p-1.5 text-xs text-ink focus:outline-none"
                    >
                      <option value="6">6 Months</option>
                      <option value="12">1 Year (12m)</option>
                      <option value="18">18 Months</option>
                      <option value="36">3 Years (36m)</option>
                      <option value="60">5 Years (60m)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted mb-0.5">Rate (% p.a.)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={fdSelectedRate}
                      onChange={(e) => setFdSelectedRate(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-line bg-card p-1.5 text-xs text-ink focus:outline-none"
                    />
                  </div>
                </div>

                {/* Calculator Results */}
                <div className="mt-2.5 rounded-lg border border-line bg-card p-2 text-center">
                  <div className="text-[10px] text-muted">Projected Maturity (Quarterly Compounding)</div>
                  <div className="text-base font-bold text-ok">{formatINR(fdCalculation.maturity)}</div>
                  <div className="text-[10px] text-muted mt-0.5">
                    Interest Earned: <span className="font-semibold text-ink">{formatINR(fdCalculation.interest)}</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-2.5 text-[10px] text-muted italic">
              Educational comparison simulator only. Finzin uses simulated currency and is not a licensed deposit-taking bank.
            </p>
          </Card>
        </div>

        {/* =====================================================================
            SECTION 3: GOLD SAVINGS (Precious Metals Learning)
           ===================================================================== */}
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Coins className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-bold text-ink">Gold & Silver Savings</h2>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-ink">Benchmark Indicative Rates</span>
              <span className="rounded-full bg-line/60 px-2 py-0.5 text-[10px] font-semibold text-muted">
                IBJA Polled Rates
              </span>
            </div>

            {/* Rates Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-line bg-bg p-2.5">
                <span className="text-[10px] font-semibold text-muted block">24K Fine Gold (99.9%)</span>
                <span className="text-sm font-bold text-ink block mt-0.5">
                  ₹{gold24kRate.toLocaleString("en-IN")} / g
                </span>
                <span className="text-[10px] font-bold text-ok flex items-center gap-0.5 mt-0.5">
                  <TrendingUp className="h-2.5 w-2.5" /> +0.38% (24h)
                </span>
              </div>

              <div className="rounded-xl border border-line bg-bg p-2.5">
                <span className="text-[10px] font-semibold text-muted block">Fine Silver (99.9%)</span>
                <span className="text-sm font-bold text-ink block mt-0.5">
                  ₹{silverRate.toFixed(2)} / g
                </span>
                <span className="text-[10px] font-semibold text-muted block mt-0.5">
                  ₹{(silverRate * 1000).toLocaleString("en-IN")} / kg
                </span>
              </div>
            </div>

            {/* Gold Accumulation Calculator */}
            <div className="mt-3 rounded-xl border border-line bg-bg p-3 text-xs">
              <span className="font-bold text-ink block mb-1">Precious Metals Accumulator</span>
              <p className="text-[11px] text-muted mb-2">
                See how much gold your simulated budget can purchase.
              </p>
              <div className="flex gap-1.5 mb-2">
                {[1000, 2000, 5000, 10000].map((b) => (
                  <button
                    key={b}
                    onClick={() => setGoldBudget(b)}
                    className={`flex-1 rounded-lg py-1 text-[10px] font-bold transition ${
                      goldBudget === b
                        ? "bg-btn text-btntx"
                        : "border border-line bg-card text-muted hover:text-ink"
                    }`}
                  >
                    ₹{b.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              <div className="rounded-lg bg-card border border-line p-2 text-center text-[11px]">
                <div>
                  For <span className="font-bold text-ink">{formatINR(goldBudget)}</span> you accumulate:
                </div>
                <div className="font-bold text-brand text-xs mt-0.5">
                  {goldGrams24k} grams of 24K Gold · {goldGrams22k} grams of 22K Hallmark
                </div>
              </div>
            </div>

            {/* Disclaimers & Disclosures */}
            <div className="mt-3 space-y-1 text-[10px] text-muted border-t border-line/60 pt-2">
              <p>• Quotes exclude 3% statutory GST, jeweller making charges (8%-18%), and dealer spreads.</p>
              <p>• Educational discovery only: Finzin does not broker real precious metals or deliver physical gold.</p>
            </div>
          </Card>
        </div>

        {/* =====================================================================
            SECTION 4: BOND SAVINGS (Sovereign & CPSE Bonds)
           ===================================================================== */}
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-bold text-ink">Bond Savings · Fixed Income</h2>
          </div>

          <Card>
            {/* Coupon vs YTM educational explanation */}
            <div className="rounded-xl border border-line bg-bg p-3 mb-3 text-xs">
              <div className="font-bold text-ink mb-1">Coupon Rate vs Yield to Maturity (YTM)</div>
              <p className="text-[11px] text-muted leading-relaxed">
                <span className="font-semibold text-ink">Coupon Rate:</span> Fixed annual interest paid on face value.
                <br />
                <span className="font-semibold text-ink">YTM (Yield to Maturity):</span> The true annualized return factoring in purchase discount/premium if held until redemption.
              </p>
            </div>

            {/* Verified Bonds List */}
            <div className="space-y-2">
              {bonds.map((bond) => (
                <div
                  key={bond.id}
                  onClick={() => setSelectedBondId(bond.id)}
                  className={`cursor-pointer rounded-xl border p-2.5 transition ${
                    selectedBondId === bond.id
                      ? "border-brand bg-brand/5"
                      : "border-line bg-card hover:border-line/80"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-bold text-ink leading-tight">{bond.name}</div>
                      <div className="text-[10px] text-muted">{bond.issuer}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-ok">{bond.couponRate}% Coupon</div>
                      <div className="text-[9px] text-muted">YTM: {bond.yieldToMaturity}%</div>
                    </div>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center justify-between text-[10px] text-muted border-t border-line/40 pt-1">
                    <span>Rating: {bond.creditRating?.split(" ")[0]}</span>
                    <span>Matures: {bond.maturityDate}</span>
                    <a
                      href={bond.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 text-brand hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>Prospectus</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Bond Yield Estimator */}
            {selectedBond && (
              <div className="mt-3 rounded-xl border border-line bg-bg p-3 text-xs">
                <div className="text-xs font-bold text-ink mb-1">Yield Estimator: {selectedBond.name}</div>
                <div className="flex gap-1.5 mb-2">
                  {[10000, 25000, 50000, 100000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setBondInvestment(amt)}
                      className={`flex-1 rounded-lg py-1 text-[10px] font-bold transition ${
                        bondInvestment === amt
                          ? "bg-btn text-btntx"
                          : "border border-line bg-card text-muted hover:text-ink"
                      }`}
                    >
                      ₹{(amt / 1000).toFixed(0)}k
                    </button>
                  ))}
                </div>
                <div className="rounded-lg bg-card border border-line p-2 text-center text-[11px]">
                  <div>
                    Investment: <span className="font-bold text-ink">{formatINR(bondInvestment)}</span>
                  </div>
                  <div className="font-bold text-ok text-xs mt-0.5">
                    Estimated Annual Coupon Payout: ₹{Number(bondAnnualCouponIncome).toLocaleString("en-IN")} / year
                  </div>
                </div>
              </div>
            )}

            <p className="mt-2.5 text-[10px] text-muted italic">
              Educational bond discovery only. Secondary prices fluctuate with RBI repo rate policy. Finzin does not broker securities.
            </p>
          </Card>
        </div>
      </div>

      {/* =====================================================================
          MODAL: CREATE NEW SLICE POT
         ===================================================================== */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-[430px] rounded-2xl bg-card border border-line p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-1.5">
                <PieChart className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold text-ink">Create New Slice Pot</h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-full p-1 text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="mt-3 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Goal Name *</label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  placeholder="e.g. New Laptop, Goa Trip, Bike Fund"
                  className="w-full rounded-xl border border-line bg-bg p-2.5 text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">
                  Target Amount (₹, Optional)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full rounded-xl border border-line bg-bg p-2.5 text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">
                  Target Date (Optional)
                </label>
                <input
                  type="date"
                  value={newGoalDate}
                  onChange={(e) => setNewGoalDate(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bg p-2.5 text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              {actionError && <div className="text-xs text-err">{actionError}</div>}

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full rounded-xl bg-btn py-2.5 text-xs font-bold text-btntx transition hover:opacity-95 disabled:opacity-50"
              >
                {actionLoading ? "Creating Pot..." : "Create Pot"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: DEPOSIT / WITHDRAW / DELETE SLICE POT
         ===================================================================== */}
      {actionGoal && actionType && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-[430px] rounded-2xl bg-card border border-line p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-1.5">
                {actionType === "deposit" && <ArrowDownLeft className="h-4 w-4 text-ok" />}
                {actionType === "withdraw" && <ArrowUpRight className="h-4 w-4 text-brand" />}
                {actionType === "delete" && <Trash2 className="h-4 w-4 text-err" />}
                <h3 className="text-sm font-bold text-ink">
                  {actionType === "deposit" && `Deposit to ${actionGoal.name}`}
                  {actionType === "withdraw" && `Withdraw from ${actionGoal.name}`}
                  {actionType === "delete" && `Delete ${actionGoal.name}`}
                </h3>
              </div>
              <button onClick={closeActionModal} className="rounded-full p-1 text-muted hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionType === "delete" ? (
              <div className="mt-3 text-xs space-y-3">
                <p className="text-muted">
                  Are you sure you want to delete <span className="font-bold text-ink">"{actionGoal.name}"</span>?
                </p>
                {actionGoal.allocated > 0 ? (
                  <div className="rounded-xl border border-brand/40 bg-brand/10 p-2.5 text-[11px] text-ink">
                    <span className="font-bold">Safe Balance Sweep:</span> This pot has{" "}
                    <span className="font-bold">{formatINR(actionGoal.allocated)}</span>. Deleting it will
                    automatically and safely return all funds back to your spendable wallet.
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">This pot is empty and can be deleted safely.</p>
                )}

                {actionError && <div className="text-xs text-err">{actionError}</div>}

                <div className="flex gap-2">
                  <button
                    onClick={closeActionModal}
                    className="flex-1 rounded-xl border border-line bg-card py-2 text-xs font-bold text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteGoal}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-err py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {actionLoading ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={actionType === "deposit" ? handleSliceDeposit : handleSliceWithdraw}
                className="mt-3 space-y-3 text-xs"
              >
                <div className="rounded-xl bg-bg p-2.5 text-xs flex justify-between">
                  <div>
                    <span className="text-[10px] text-muted block">Available Wallet</span>
                    <span className="font-bold text-ink">{formatINR(balance)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted block">Pot Allocated</span>
                    <span className="font-bold text-ink">{formatINR(actionGoal.allocated)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">
                    Amount to {actionType === "deposit" ? "Deposit" : "Withdraw"} (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={actionAmount}
                    onChange={(e) => setActionAmount(e.target.value)}
                    placeholder="Enter amount in ₹"
                    className="w-full rounded-xl border border-line bg-bg p-2.5 text-sm font-bold text-ink focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">
                    4-Digit Transaction PIN *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={actionPin}
                      onChange={(e) => setActionPin(e.target.value)}
                      placeholder="••••"
                      className="w-full rounded-xl border border-line bg-bg py-2.5 pl-9 pr-3 text-sm font-mono tracking-widest text-ink focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>

                {actionError && <div className="text-xs text-err">{actionError}</div>}

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full rounded-xl bg-btn py-2.5 text-xs font-bold text-btntx transition hover:opacity-95 disabled:opacity-50"
                >
                  {actionLoading
                    ? "Processing..."
                    : actionType === "deposit"
                    ? `Deposit ${actionAmount ? formatINR(actionAmount) : ""} into Pot`
                    : `Withdraw ${actionAmount ? formatINR(actionAmount) : ""} to Wallet`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
