// Home.jsx - Core Payment and Keypad interface for Finzin.
// Flow: AMOUNT -> SELECT_METHOD -> INPUT_DETAILS -> PROCESSING -> RECEIPT.
// Preserves dark-teal & cyan aesthetics, on-screen keypad, live balance, and fast-scan gestures.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Landmark,
  Smartphone,
  ArrowLeftRight,
  CheckCircle2,
  ArrowLeft,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { formatINR } from "../utils/money";

// Keypad buttons in display order. "<" means backspace.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "<"];

// Payment transfer methods
const METHODS = [
  {
    id: "bank",
    title: "Pay to Bank Account",
    desc: "Instant transfer via Account Number & IFSC",
    icon: Landmark,
    color: "#22C7D6",
  },
  {
    id: "phone",
    title: "Pay via Phone Number",
    desc: "Send to any mobile number or UPI contact",
    icon: Smartphone,
    color: "#16845B",
  },
  {
    id: "self",
    title: "Self Transfer",
    desc: "Move funds to Finzin Vault or savings pockets",
    icon: ArrowLeftRight,
    color: "#E59B1D",
  },
];

export default function Home({
  onOpenQR,
  onFastScan,
  onOpenScanner,
  payee,
  onClearPayee,
  onPaymentSuccess,
}) {
  const { user } = useAuth();

  // ---------- VIEW STATE ENGINE ----------
  // 'AMOUNT' -> 'SELECT_METHOD' -> 'INPUT_DETAILS' -> 'PROCESSING' -> 'RECEIPT'
  const [viewState, setViewState] = useState("AMOUNT");

  // ---------- AMOUNT & BALANCE STATE ----------
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0);
  const [showBal, setShowBal] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------- PAYMENT METHOD & FORM DETAILS ----------
  const [selectedMethod, setSelectedMethod] = useState(null);

  // Bank Account Form (FNZN0000001 is Finzin default demo IFSC)
  const [bankDetails, setBankDetails] = useState({
    accountNumber: "",
    confirmAccountNumber: "",
    ifsc: "FNZN0000001",
    holderName: "",
  });

  // Phone Number Form
  const [phoneDetails, setPhoneDetails] = useState({
    mobile: "",
  });

  // Self Transfer Form
  const [selfDetails, setSelfDetails] = useState({
    destination: "Finzin Vault (4% p.a. interest)",
  });

  // Completed Receipt Data
  const [receiptData, setReceiptData] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Fetch live wallet balance from backend
  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      try {
        const data = await api.get("/me");
        if (!cancelled && data) {
          setBalance(data.balance ?? 0);
        }
      } catch (err) {}
    }
    loadBalance();
    return () => {
      cancelled = true;
    };
  }, [viewState]);

  // Personal Payment QR modal opener: opens user's own payment QR on click or tap
  const handleOpenQR = useCallback(() => {
    if (typeof onOpenQR === "function") {
      onOpenQR();
    }
  }, [onOpenQR]);

  // Hide balance automatically after 4 seconds
  useEffect(() => {
    if (!showBal) return;
    const id = setTimeout(() => setShowBal(false), 4000);
    return () => clearTimeout(id);
  }, [showBal]);

  // Hide toast message after 2.4 seconds
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // Number validation
  const parsedAmount = useMemo(() => {
    const val = parseFloat(amount);
    return isNaN(val) ? 0 : val;
  }, [amount]);

  // ---------- ON-SCREEN KEYPAD LOGIC ----------
  function pressKey(key) {
    setError("");

    if (key === "<") {
      setAmount((a) => a.slice(0, -1));
      return;
    }

    if (key === ".") {
      if (amount.includes(".")) return;
      setAmount((a) => (a || "0") + ".");
      return;
    }

    if (amount.length >= 8) return;
    const decimals = amount.split(".")[1];
    if (decimals !== undefined && decimals.length >= 2) return;

    setAmount((a) => (a === "0" ? key : a + key));
  }

  // Validate amount against wallet balance
  function validateAmount() {
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Please enter a valid amount first");
      return false;
    }
    if (parsedAmount > balance) {
      setError("Insufficient wallet balance");
      return false;
    }
    return true;
  }

  // Step 1: User clicks "Pay" -> opens Method Selection
  function handleInitialPay() {
    if (!validateAmount()) return;
    setError("");

    // If a scanned payee is already active from QR scanner
    if (payee) {
      setSelectedMethod("phone");
      setPhoneDetails({ mobile: payee.handle });
      setViewState("INPUT_DETAILS");
      return;
    }

    setViewState("SELECT_METHOD");
  }

  // User clicks "Save" -> Direct to Self Transfer / Vault savings
  function handleInitialSave() {
    if (!validateAmount()) return;
    setError("");
    setSelectedMethod("self");
    setViewState("INPUT_DETAILS");
  }

  // Step 2: Choose Payment Method
  function handleSelectMethod(methodId) {
    setSelectedMethod(methodId);
    setError("");
    setViewState("INPUT_DETAILS");
  }

  // Step 3: Validate Form and Trigger Processing via Backend API
  async function handleConfirmDetails(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError("");

    if (!validateAmount()) return;

    let masked = "";
    let methodTitle = "";
    let payload = null;

    if (selectedMethod === "bank") {
      const { accountNumber, confirmAccountNumber, ifsc, holderName } = bankDetails;
      if (!accountNumber || accountNumber.length < 9) {
        setError("Account number must be at least 9 digits");
        return;
      }
      if (accountNumber !== confirmAccountNumber) {
        setError("Account numbers do not match");
        return;
      }
      if (!ifsc || ifsc.trim().length !== 11) {
        setError("Valid 11-character IFSC code is required (e.g. FNZN0000001)");
        return;
      }
      if (!holderName.trim() || holderName.trim().length < 2) {
        setError("Account holder name is required");
        return;
      }
      masked = `•••• ${accountNumber.slice(-4)} (${ifsc.toUpperCase()})`;
      methodTitle = "Bank Account Transfer";
      payload = {
        endpoint: "/payments/transfer",
        body: {
          payee: {
            mode: "bank",
            value: accountNumber,
            ifsc: ifsc.trim().toUpperCase(),
          },
          amount: parsedAmount,
          category: "others",
          description: `Bank transfer to ${holderName.trim()}`,
          idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `FNZ-TX-${Date.now()}`,
        },
      };
    } else if (selectedMethod === "phone") {
      const { mobile } = phoneDetails;
      const cleanMobile = mobile.replace(/\D/g, "");
      if (cleanMobile.length !== 10) {
        setError("Enter a valid 10-digit mobile number");
        return;
      }
      masked = `+91 ••••• ${cleanMobile.slice(-4)}`;
      methodTitle = "Phone Number / UPI";
      payload = {
        endpoint: "/payments/transfer",
        body: {
          payee: {
            mode: "mobile",
            value: cleanMobile,
          },
          amount: parsedAmount,
          category: "others",
          description: `Transfer to +91 ${cleanMobile}`,
          idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `FNZ-TX-${Date.now()}`,
        },
      };
    } else if (selectedMethod === "self") {
      masked = selfDetails.destination;
      methodTitle = "Self Transfer";
      payload = {
        endpoint: "/payments/save",
        body: {
          amount: parsedAmount,
          pin: "1234",
          idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `FNZ-SAVE-${Date.now()}`,
        },
      };
    }

    setIsSubmitting(true);
    try {
      const res = await api.post(payload.endpoint, payload.body);

      // Successfully processed on server!
      const newBal =
        res.balance !== undefined
          ? res.balance
          : Math.max(0, Math.round((balance - parsedAmount) * 100) / 100);
      setBalance(newBal);

      const txId =
        res.transaction_id ||
        res.transaction?.id ||
        `FNZ${new Date().getFullYear()}${Date.now().toString().slice(-6)}`;
      const now = new Date();
      const formattedTimestamp = now.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const receipt = {
        amount: parsedAmount,
        methodTitle,
        maskedDestination: res.counterparty_name ? `${res.counterparty_name} (${masked})` : masked,
        transactionId: txId,
        timestamp: formattedTimestamp,
      };
      setReceiptData(receipt);

      // Prepend to transaction history list state
      const createdTx = res.transaction || {
        id: txId,
        transaction_id: txId,
        title: res.counterparty_name || methodTitle,
        counterparty_name: res.counterparty_name || methodTitle,
        amount: parsedAmount,
        amount_paise: Math.round(parsedAmount * 100),
        type: "DEBIT",
        type_lower: "debit",
        category: res.category || "others",
        date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now),
        created_at: now.toISOString(),
        createdAt: now.toISOString(),
        status: "SUCCESS",
      };

      if (onPaymentSuccess) {
        onPaymentSuccess(createdTx, newBal);
      }

      // Transition to Step 4: Video Processing
      setViewState("PROCESSING");
    } catch (err) {
      // Ensure zero balance deduction occurs on failure and display server error cleanly
      setError(err.message || "Payment failed. Please verify recipient details.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Step 4: When processing video ends -> auto transition to Receipt
  const handleVideoEnd = useCallback(() => {
    setViewState("RECEIPT");
  }, []);

  // Safety timer for video transition (guarantees completion even if browser blocks autoplay or video path is unrendered)
  useEffect(() => {
    if (viewState === "PROCESSING") {
      const timer = setTimeout(() => {
        handleVideoEnd();
      }, 2600);
      return () => clearTimeout(timer);
    }
  }, [viewState, handleVideoEnd]);

  // Step 5: Reset All States back to Step 1
  function handleResetAll() {
    setViewState("AMOUNT");
    setAmount("");
    setSelectedMethod(null);
    setError("");
    setReceiptData(null);
    setCopiedId(false);
    if (payee && onClearPayee) {
      onClearPayee();
    }
    setBankDetails({
      accountNumber: "",
      confirmAccountNumber: "",
      ifsc: "",
      holderName: "",
    });
    setPhoneDetails({ mobile: "" });
  }

  // Copy Transaction ID to clipboard
  function copyTxId() {
    if (!receiptData?.transactionId) return;
    navigator.clipboard?.writeText(receiptData.transactionId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  const displayName = user?.fullName || "Student";
  const avatarLetter = displayName[0]?.toUpperCase() || "S";

  return (
    <div className="flex min-h-0 flex-1 flex-col select-none">
      {/* ----------------- GLOBAL HEADER ----------------- */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center py-3 border-b border-line/40 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-btn text-sm font-bold text-btntx shadow-sm">
            {avatarLetter}
          </div>
          <span className="truncate max-w-[100px]">{displayName.split(" ")[0]}</span>
        </div>

        {/* Center circular Finzin logo opens personal payment QR modal */}
        <button
          type="button"
          onClick={handleOpenQR}
          aria-label="View My Payment QR Code"
          title="View My Payment QR Code"
          className="cursor-pointer touch-manipulation flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-lg font-bold text-ink shadow-sm transition-all duration-150 hover:border-brand/40 hover:bg-card/80 active:scale-95 select-none"
        >
          Finzin
        </button>

        {/* Check balance toggle */}
        <button
          onClick={() => setShowBal(true)}
          className="min-w-[96px] justify-self-end rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink shadow-sm transition hover:border-brand/40"
        >
          {showBal ? `₹${balance.toLocaleString("en-IN")}` : "Check balance"}
        </button>
      </header>

      {/* ----------------- 1. INITIAL STATE: AMOUNT ENTRY SCREEN ----------------- */}
      {viewState === "AMOUNT" && (
        <div className="flex min-h-0 flex-1 flex-col justify-between py-2 animate-in fade-in duration-200">
          {/* Middle: Amount Display (No method pill above ₹0) */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
            {/* If a payee was scanned via QR, show friendly indicator */}
            {payee && (
              <div className="flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand mb-2">
                <span>Paying {payee.name}</span>
                <button
                  type="button"
                  onClick={onClearPayee}
                  className="rounded-full bg-card h-4 w-4 flex items-center justify-center text-[10px] text-ink"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Big Amount starting at ₹0 */}
            <div
              className={`text-[length:clamp(48px,13vw,64px)] font-black leading-none tracking-tight transition-all ${
                amount ? "text-ink scale-105" : "text-muted"
              }`}
            >
              ₹{amount || "0"}
            </div>

            {/* Error Message Space */}
            <div className="min-h-5 text-xs font-semibold text-err text-center px-4">
              {error}
            </div>
          </div>

          {/* On-screen Numeric Keypad */}
          <div className="grid grid-cols-3 gap-1 mb-2">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => pressKey(k)}
                aria-label={k === "<" ? "Delete" : k}
                className="h-14 rounded-2xl text-2xl font-semibold text-ink active:bg-line/60 transition active:scale-95 flex items-center justify-center"
              >
                {k === "<" ? "⌫" : k}
              </button>
            ))}
          </div>

          {/* Action Buttons: Save (Vault) & Pay (Cyan) */}
          <div className="grid grid-cols-2 gap-3 py-1">
            <button
              onClick={handleInitialSave}
              className="h-[52px] rounded-2xl border-2 border-btn text-base font-bold text-ink shadow-sm transition active:scale-98 hover:bg-card"
            >
              Save
            </button>
            <button
              onClick={handleInitialPay}
              disabled={parsedAmount <= 0}
              className="h-[52px] rounded-2xl bg-brand text-[#0B2830] text-base font-bold shadow-md transition hover:opacity-95 active:scale-98 disabled:opacity-40 disabled:pointer-events-none"
            >
              Pay
            </button>
          </div>
        </div>
      )}

      {/* ----------------- 2. PAYMENT METHOD SELECTION ----------------- */}
      {viewState === "SELECT_METHOD" && (
        <div className="flex min-h-0 flex-1 flex-col justify-between py-4 animate-in slide-in-from-bottom duration-300">
          <div>
            <div className="flex items-center gap-2 pb-3">
              <button
                onClick={() => setViewState("AMOUNT")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-card border border-line text-ink hover:bg-bg transition"
              >
                <ArrowLeft size={16} />
              </button>
              <h2 className="text-lg font-bold text-ink">Choose Transfer Method</h2>
            </div>

            {/* Amount Summary Pill */}
            <div className="rounded-2xl bg-card border border-line p-3.5 flex items-center justify-between mb-4 shadow-xs">
              <span className="text-xs text-muted font-medium">Paying Amount</span>
              <span className="text-xl font-black text-brand">{formatINR(parsedAmount)}</span>
            </div>

            {/* List of Transfer Methods */}
            <div className="space-y-3">
              {METHODS.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMethod(m.id)}
                    className="w-full rounded-2xl border border-line bg-card p-4 text-left shadow-xs transition hover:border-brand/60 active:scale-[0.99] flex items-center gap-3.5 group"
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-xs"
                      style={{ backgroundColor: m.color }}
                    >
                      <Icon size={22} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-ink group-hover:text-brand transition">
                        {m.title}
                      </div>
                      <div className="text-xs text-muted truncate mt-0.5">{m.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setViewState("AMOUNT")}
            className="w-full rounded-2xl border border-line bg-card py-3.5 text-xs font-semibold text-muted hover:text-ink transition"
          >
            ← Cancel & Change Amount
          </button>
        </div>
      )}

      {/* ----------------- 3. DYNAMIC FORM FIELDS ----------------- */}
      {viewState === "INPUT_DETAILS" && (
        <div className="flex min-h-0 flex-1 flex-col justify-between py-4 animate-in slide-in-from-right duration-300">
          <div className="overflow-y-auto pr-1">
            <div className="flex items-center gap-2 pb-3">
              <button
                onClick={() => setViewState("SELECT_METHOD")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-card border border-line text-ink hover:bg-bg transition"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h2 className="text-base font-bold text-ink">
                  {selectedMethod === "bank" && "Bank Account Details"}
                  {selectedMethod === "phone" && "Mobile / UPI Transfer"}
                  {selectedMethod === "self" && "Self Transfer Allocation"}
                </h2>
                <p className="text-xs text-muted">Amount: {formatINR(parsedAmount)}</p>
              </div>
            </div>

            {error && (
              <div className="mb-3 rounded-xl bg-err/10 border border-err/20 px-3.5 py-2 text-xs font-medium text-err">
                {error}
              </div>
            )}

            <form onSubmit={handleConfirmDetails} className="space-y-3.5 pt-1">
              {/* Bank Form */}
              {selectedMethod === "bank" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Account Number *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      placeholder="e.g. 123456789012"
                      value={bankDetails.accountNumber}
                      onChange={(e) =>
                        setBankDetails({
                          ...bankDetails,
                          accountNumber: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      className="w-full rounded-2xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Re-enter Account Number *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="Confirm Account Number"
                      value={bankDetails.confirmAccountNumber}
                      onChange={(e) =>
                        setBankDetails({
                          ...bankDetails,
                          confirmAccountNumber: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      className="w-full rounded-2xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      IFSC Code *
                    </label>
                    <input
                      type="text"
                      maxLength={11}
                      required
                      placeholder="e.g. SBIN0001234"
                      value={bankDetails.ifsc}
                      onChange={(e) =>
                        setBankDetails({
                          ...bankDetails,
                          ifsc: e.target.value.toUpperCase().trim(),
                        })
                      }
                      className="w-full rounded-2xl border border-line bg-card px-3.5 py-2.5 text-sm font-mono text-ink placeholder:text-muted/60 focus:border-brand outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Account Holder Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Beneficiary Name"
                      value={bankDetails.holderName}
                      onChange={(e) =>
                        setBankDetails({ ...bankDetails, holderName: e.target.value })
                      }
                      className="w-full rounded-2xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand outline-none"
                    />
                  </div>
                </>
              )}

              {/* Phone Form */}
              {selectedMethod === "phone" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Mobile Number or UPI ID *
                    </label>
                    <div className="flex">
                      <span className="flex items-center rounded-l-2xl border border-r-0 border-line bg-card px-3 text-xs font-semibold text-muted">
                        +91
                      </span>
                      <input
                        type="tel"
                        maxLength={10}
                        required
                        placeholder="Search or enter 10-digit number"
                        value={phoneDetails.mobile}
                        onChange={(e) =>
                          setPhoneDetails({
                            mobile: e.target.value.replace(/\D/g, ""),
                          })
                        }
                        className="w-full rounded-r-2xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand outline-none"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted">
                      Directly verifies registered Finzin accounts &amp; UPI handles
                    </p>
                  </div>
                </>
              )}

              {/* Self Transfer Form */}
              {selectedMethod === "self" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Destination Account *
                    </label>
                    <select
                      value={selfDetails.destination}
                      onChange={(e) =>
                        setSelfDetails({ destination: e.target.value })
                      }
                      className="w-full rounded-2xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink focus:border-brand outline-none"
                    >
                      <option value="Finzin Vault (4% p.a. interest)">
                        Finzin Vault (4% p.a. simulated interest)
                      </option>
                      <option value="Semester Fees Goal">Semester Fees Goal</option>
                      <option value="Emergency Savings Pocket">
                        Emergency Savings Pocket
                      </option>
                    </select>
                    <p className="mt-1.5 text-[11px] text-muted">
                      Funds transferred to Vault accrue daily simulated 4% p.a. returns
                    </p>
                  </div>
                </>
              )}
            </form>
          </div>

          <div className="pt-3">
            <button
              onClick={handleConfirmDetails}
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-brand py-3.5 text-sm font-bold text-[#0B2830] shadow-md transition hover:opacity-95 active:scale-98 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0B2830] border-t-transparent" />
                  <span>Processing Payment...</span>
                </>
              ) : (
                `Confirm Payment • ${formatINR(parsedAmount)}`
              )}
            </button>
          </div>
        </div>
      )}

      {/* ----------------- 4. PAYMENT PROCESSING ANIMATION ----------------- */}
      {viewState === "PROCESSING" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="relative mb-4 flex items-center justify-center">
            {/* Embedded custom payment animation video */}
            <video
              src="/path-to-video.mp4"
              autoPlay
              muted
              playsInline
              loop={false}
              className="w-48 h-48 mx-auto object-contain rounded-2xl"
              onEnded={handleVideoEnd}
              onError={() => {
                // Graceful fallback if video file is unrendered
                setTimeout(handleVideoEnd, 1500);
              }}
            />

            {/* Glowing cyan spinner ring backdrop */}
            <div className="absolute inset-0 pointer-events-none -z-10 flex items-center justify-center">
              <span className="h-44 w-44 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
            </div>
          </div>

          <h3 className="text-lg font-bold text-ink">Processing Payment</h3>
          <p className="mt-1 text-xs text-muted max-w-[240px]">
            Securing transaction and debiting simulated balance...
          </p>
        </div>
      )}

      {/* ----------------- 5. PAYMENT SUCCESS RECEIPT SCREEN ----------------- */}
      {viewState === "RECEIPT" && receiptData && (
        <div className="flex min-h-0 flex-1 flex-col justify-between py-4 animate-in zoom-in-95 duration-300">
          <div className="overflow-y-auto pr-1">
            {/* Top Success Badge */}
            <div className="flex flex-col items-center text-center pt-2 pb-4">
              <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-ok/15 text-ok shadow-sm">
                <CheckCircle2 size={36} className="text-ok animate-in zoom-in duration-300" />
                <span className="absolute -inset-1 rounded-3xl border-2 border-ok/30 animate-pulse" />
              </div>

              <span className="text-xs font-bold uppercase tracking-wider text-ok">
                Payment Successful
              </span>
              <div className="mt-1 text-3xl font-black text-ink">
                {formatINR(receiptData.amount)}
              </div>
              <p className="text-xs text-muted mt-0.5">Debited from Finzin Wallet</p>
            </div>

            {/* Receipt Summary Card */}
            <div className="rounded-3xl border border-line bg-card p-4 shadow-sm space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-line/50">
                <span className="text-muted">Payment Method</span>
                <span className="font-semibold text-ink">{receiptData.methodTitle}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-line/50">
                <span className="text-muted">Paid To</span>
                <span className="font-semibold text-ink font-mono text-right max-w-[190px] truncate">
                  {receiptData.maskedDestination}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-line/50">
                <span className="text-muted">Transaction ID</span>
                <button
                  type="button"
                  onClick={copyTxId}
                  className="flex items-center gap-1 font-mono text-brand font-semibold text-[11px] hover:underline"
                >
                  <span>{receiptData.transactionId}</span>
                  {copiedId ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
                </button>
              </div>

              <div className="flex justify-between py-1 border-b border-line/50">
                <span className="text-muted">Date &amp; Time</span>
                <span className="font-medium text-ink">{receiptData.timestamp}</span>
              </div>

              <div className="flex justify-between py-1 items-center">
                <span className="text-muted">Status</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-ok/10 px-2.5 py-0.5 text-[11px] font-bold text-ok">
                  <span>✓</span> Completed
                </span>
              </div>
            </div>

            {/* Security Guarantee Note */}
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted">
              <ShieldCheck size={14} className="text-brand" />
              <span>Finzin Simulated Instant Banking Network</span>
            </div>
          </div>

          {/* Reset / Back to Home Button */}
          <div className="pt-3">
            <button
              onClick={handleResetAll}
              className="w-full rounded-2xl bg-btn py-3.5 text-sm font-bold text-btntx shadow-md transition hover:opacity-95 active:scale-98"
            >
              Done • Back to Home
            </button>
          </div>
        </div>
      )}

      {/* Floating Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-32 left-1/2 -translate-x-1/2 rounded-xl bg-btn px-4 py-2.5 text-sm font-medium text-btntx shadow-lg z-30"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
