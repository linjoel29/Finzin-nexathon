// ResetPinScreen.jsx - Allows setting and confirming a new 4-digit PIN following OTP verification.
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function ResetPinScreen() {
  const { resetPin, loading, error, setError, setAuthStep } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [validationError, setValidationError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setValidationError('PIN must be exactly 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setValidationError('PINs do not match');
      return;
    }

    setValidationError('');
    try {
      await resetPin(newPin);
    } catch (err) {
      // Backend error displayed via context
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-between py-6">
      <div className="flex flex-col items-center pt-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand/15 text-2xl font-black text-brand shadow-sm">
          🔑
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Set New Security PIN</h1>
        <p className="mt-1 text-sm text-muted">Choose a new 4-digit PIN to secure your Finzin account</p>
      </div>

      <div className="rounded-3xl bg-card p-6 shadow-sm border border-line">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              New 4-Digit PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="••••"
              value={newPin}
              onChange={(e) => {
                setNewPin(e.target.value.replace(/\D/g, ''));
                if (validationError) setValidationError('');
                if (error) setError(null);
              }}
              className="w-full rounded-2xl border border-line bg-bg/50 px-4 py-3 text-center text-xl font-bold tracking-widest text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              Confirm New PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="••••"
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/\D/g, ''));
                if (validationError) setValidationError('');
                if (error) setError(null);
              }}
              className="w-full rounded-2xl border border-line bg-bg/50 px-4 py-3 text-center text-xl font-bold tracking-widest text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-sm"
            />
          </div>

          {(validationError || error) && (
            <div className="rounded-xl bg-err/10 px-4 py-2.5 text-xs font-medium text-err text-center">
              {validationError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || newPin.length !== 4 || confirmPin.length !== 4}
            className="mt-2 flex w-full items-center justify-center rounded-2xl bg-btn py-3.5 text-sm font-semibold text-btntx shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Updating PIN...
              </span>
            ) : (
              'Save PIN & Unlock'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-line/60 pt-4 text-center">
          <button
            type="button"
            onClick={() => setAuthStep('unlock')}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            ← Cancel and back to unlock
          </button>
        </div>
      </div>

      <div className="text-center text-[11px] text-muted">
        <span>Never share your PIN with anyone, including Finzin support</span>
      </div>
    </div>
  );
}
