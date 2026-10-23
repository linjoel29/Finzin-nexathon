// UnlockScreen.jsx - PIN unlock screen with numeric keypad, 15-min lockout handling, and forgot PIN flow.
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function UnlockScreen() {
  const { user, unlock, startForgotPin, logout, loading, error, setError } = useAuth();
  const [pin, setPin] = useState('');
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutMsg, setLockoutMsg] = useState('');

  // Handle keyboard typing for desktop/laptop users
  useEffect(() => {
    function handleKeyDown(e) {
      if (loading || isLockedOut) return;

      if (/^[0-9]$/.test(e.key)) {
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        deleteDigit();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, loading, isLockedOut]);

  // Check if error is 423 lockout
  useEffect(() => {
    if (error && (error.toLowerCase().includes('locked') || error.toLowerCase().includes('423'))) {
      setIsLockedOut(true);
      setLockoutMsg(error);
    }
  }, [error]);

  function appendDigit(digit) {
    if (pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    if (error) setError(null);

    if (nextPin.length === 4) {
      submitPin(nextPin);
    }
  }

  function deleteDigit() {
    setPin((prev) => prev.slice(0, -1));
    if (error) setError(null);
  }

  async function submitPin(pinToSubmit) {
    try {
      await unlock(pinToSubmit);
    } catch (err) {
      setPin('');
      if (err.status === 423 || err.message?.toLowerCase().includes('locked')) {
        setIsLockedOut(true);
        setLockoutMsg(err.message || 'Account temporarily locked for 15 minutes');
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-between py-6">
      {/* Header & Avatar */}
      <div className="flex flex-col items-center pt-8 text-center">
        <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand/15 text-3xl font-black text-brand shadow-sm">
          <span>{user?.fullName ? user.fullName[0].toUpperCase() : 'F'}</span>
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-card border-2 border-bg text-xs">
            🔒
          </div>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-ink">
          Welcome back, {user?.fullName?.split(' ')[0] || 'Student'}!
        </h1>
        <p className="mt-1 text-xs text-muted">
          {user?.college || 'Enter your 4-digit PIN to unlock Finzin'}
        </p>
      </div>

      {/* PIN Dots Indicator */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((idx) => {
            const filled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`h-4 w-4 rounded-full transition-all duration-200 ${
                  filled
                    ? 'scale-110 bg-brand shadow-sm shadow-brand/40'
                    : 'border-2 border-line bg-card'
                }`}
              />
            );
          })}
        </div>

        {/* Lockout or Error Alert */}
        {isLockedOut ? (
          <div className="mx-6 rounded-2xl bg-err/10 p-4 text-center border border-err/20">
            <p className="text-xs font-bold text-err">Security Lockout Active</p>
            <p className="mt-1 text-xs text-err/90">{lockoutMsg}</p>
            <button
              type="button"
              onClick={startForgotPin}
              className="mt-3 inline-block rounded-xl bg-card px-3 py-1.5 text-xs font-semibold text-brand shadow-sm border border-line hover:bg-bg"
            >
              Reset PIN with OTP
            </button>
          </div>
        ) : error ? (
          <div className="rounded-xl bg-err/10 px-4 py-2 text-xs font-medium text-err text-center">
            {error}
          </div>
        ) : loading ? (
          <div className="text-xs font-medium text-brand animate-pulse">
            Verifying security PIN...
          </div>
        ) : null}
      </div>

      {/* Custom Numeric Keypad */}
      <div className="mx-auto w-full max-w-[280px]">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              disabled={loading || isLockedOut}
              onClick={() => appendDigit(String(num))}
              className="flex h-16 items-center justify-center rounded-2xl bg-card border border-line text-xl font-bold text-ink shadow-sm transition active:scale-95 active:bg-bg hover:border-brand/40 disabled:opacity-30"
            >
              {num}
            </button>
          ))}

          {/* Bottom row: Reset, 0, Backspace */}
          <button
            type="button"
            disabled={loading}
            onClick={startForgotPin}
            className="flex h-16 items-center justify-center rounded-2xl text-[11px] font-semibold text-muted hover:text-brand transition"
          >
            Forgot?
          </button>

          <button
            type="button"
            disabled={loading || isLockedOut}
            onClick={() => appendDigit('0')}
            className="flex h-16 items-center justify-center rounded-2xl bg-card border border-line text-xl font-bold text-ink shadow-sm transition active:scale-95 active:bg-bg hover:border-brand/40 disabled:opacity-30"
          >
            0
          </button>

          <button
            type="button"
            disabled={loading || pin.length === 0}
            onClick={deleteDigit}
            className="flex h-16 items-center justify-center rounded-2xl bg-card border border-line text-lg text-ink shadow-sm transition active:scale-95 active:bg-bg hover:border-brand/40 disabled:opacity-30"
          >
            ⌫
          </button>
        </div>

        {/* Account Switcher */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={logout}
            className="text-xs font-medium text-muted hover:text-ink transition"
          >
            Sign in to another account
          </button>
        </div>
      </div>
    </div>
  );
}
