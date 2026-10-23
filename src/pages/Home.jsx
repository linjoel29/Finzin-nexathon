import { useState, useEffect } from "react";
import { START_BALANCE } from "../data/dummy";

// The three payment modes the chip rotates through
const PAY_MODES = ["Pay to UPI ID", "Pay to number", "Pay to bank account"];

// Keypad buttons in display order. "<" means backspace.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "<"];

// Props from App: onOpenQR (open QR sheet), payee (person chosen by scan or null),
// onClearPayee (forget the scanned person)
export default function Home({ onOpenQR, payee, onClearPayee }) {
  // ---------- STATE (data that changes and refreshes the screen) ----------
  const [amount, setAmount] = useState("");      // what the user typed, kept as text
  const [modeIdx, setModeIdx] = useState(0);     // which pay mode the chip shows
  const [paused, setPaused] = useState(false);   // true while the chip is touched
  const [balance, setBalance] = useState(START_BALANCE); // DUMMY balance (backend replaces this later)
  const [showBal, setShowBal] = useState(false); // is the balance currently visible?
  const [error, setError] = useState("");        // red message under the amount
  const [toast, setToast] = useState("");        // success message at the bottom

  // ---------- EFFECT 1: rotate the pay mode every 5 seconds ----------
  // Stops while paused or while a scanned payee is selected. The cleanup
  // function removes the old timer so we never have two timers at once.
  useEffect(() => {
    if (paused || payee) return;
    const id = setInterval(
      () => setModeIdx((i) => (i + 1) % PAY_MODES.length),
      5000
    );
    return () => clearInterval(id);
  }, [paused, payee]);

  // ---------- EFFECT 2: hide the balance again after 4 seconds ----------
  useEffect(() => {
    if (!showBal) return;
    const id = setTimeout(() => setShowBal(false), 4000);
    return () => clearTimeout(id);
  }, [showBal]);

  // ---------- EFFECT 3: hide the success message after 2.4 seconds ----------
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // ---------- KEYPAD LOGIC ----------
  function press(key) {
    setError(""); // clear any old error when the user types

    // Backspace: remove the last character
    if (key === "<") {
      setAmount((a) => a.slice(0, -1));
      return;
    }

    // Decimal point: only one allowed, and "." alone becomes "0."
    if (key === ".") {
      if (amount.includes(".")) return;
      setAmount((a) => (a || "0") + ".");
      return;
    }

    // Digits: limit total length, and allow max 2 digits after the decimal point
    if (amount.length >= 8) return;
    const decimals = amount.split(".")[1];
    if (decimals !== undefined && decimals.length >= 2) return;
    setAmount((a) => (a === "0" ? key : a + key)); // avoids "05"
  }

  // ---------- VALIDATION (used by both Pay and Save) ----------
  // Returns the amount as a number, or null if something is wrong.
  function validate() {
    const n = parseFloat(amount);
    if (!n || n <= 0) {
      setError("Enter an amount first");
      return null;
    }
    if (n > balance) {
      setError("Not enough balance");
      return null;
    }
    return n;
  }

  // Pay: subtract from balance (DUMMY: the real payment will go through the backend)
  function handlePay() {
    const n = validate();
    if (n === null) return;
    setBalance((b) => Math.round((b - n) * 100) / 100);
    const to = payee ? payee.name : PAY_MODES[modeIdx].replace("Pay to ", "");
    setToast(`Paid ₹${n.toFixed(2)} (${to})`);
    if (payee) onClearPayee(); // payment done, forget the payee
    setAmount("");
  }

  // Save: same check, but the money moves to savings (savings screen comes later)
  function handleSave() {
    const n = validate();
    if (n === null) return;
    setBalance((b) => Math.round((b - n) * 100) / 100);
    setToast(`Saved ₹${n.toFixed(2)} to savings`);
    setAmount("");
  }

  // ---------- SCREEN ----------
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* HEADER: avatar + name | Finzin logo (opens QR sheet) | Check balance */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-btn text-sm font-bold text-btntx">
            L
          </div>
          Lin
        </div>

        {/* Tapping the logo opens the QR bottom sheet */}
        <button
          onClick={onOpenQR}
          aria-label="Open my QR code"
          className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-lg font-bold"
        >
          Finzin
        </button>

        {/* Shows the balance for 4 seconds, then goes back to the label */}
        <button
          onClick={() => setShowBal(true)}
          className="min-w-[96px] justify-self-end rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold"
        >
          {showBal ? `₹${balance.toLocaleString("en-IN")}` : "Check balance"}
        </button>
      </header>

      {/* MIDDLE: pay-mode chip + amount + error message */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        {/* Pay-mode chip: pauses while touched, tap to switch manually.
            If a payee was scanned, it shows their name and tapping clears it. */}
        <button
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
          onClick={() =>
            payee ? onClearPayee() : setModeIdx((i) => (i + 1) % PAY_MODES.length)
          }
          className="min-w-[190px] rounded-full bg-btn px-5 py-2.5 text-sm font-semibold text-btntx"
        >
          {payee ? `Paying ${payee.name}` : PAY_MODES[modeIdx]}
        </button>

        {/* Big amount (greyed out while empty) */}
        <div
          className={`text-[length:clamp(44px,12vw,60px)] font-bold leading-none tracking-tight ${
            amount ? "" : "text-muted"
          }`}
        >
          ₹{amount || "0"}
        </div>

        {/* Error message (empty space is kept so the layout does not jump) */}
        <div className="min-h-4 text-xs font-medium text-err">{error}</div>
      </div>

      {/* KEYPAD: 12 buttons built from the KEYS list */}
      <div className="grid grid-cols-3 gap-0.5">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            aria-label={k === "<" ? "Delete" : k}
            className="h-14 rounded-2xl text-2xl font-medium active:bg-line"
          >
            {k === "<" ? "⌫" : k}
          </button>
        ))}
      </div>

      {/* ACTIONS: Save (outlined) and Pay (filled) */}
      <div className="grid grid-cols-2 gap-2.5 py-2.5">
        <button
          onClick={handleSave}
          className="h-[50px] rounded-2xl border-2 border-btn text-base font-bold"
        >
          Save
        </button>
        <button
          onClick={handlePay}
          className="h-[50px] rounded-2xl bg-btn text-base font-bold text-btntx"
        >
          Pay
        </button>
      </div>

      {/* TOAST: small success message, only shown when there is text */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-32 left-1/2 -translate-x-1/2 rounded-xl bg-btn px-4 py-2.5 text-sm font-medium text-btntx"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
