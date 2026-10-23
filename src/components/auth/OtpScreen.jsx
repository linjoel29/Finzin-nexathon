// OtpScreen.jsx - 6-digit OTP verification screen with countdown resend and auto-focus.
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function OtpScreen({ isForgotPin = false }) {
  const {
    tempEmail,
    verifyOtp,
    verifyForgotPinOtp,
    sendOtp,
    setAuthStep,
    loading,
    error,
    setError,
  } = useAuth();

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef([]);

  // 60-second countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Focus first input box on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  function handleDigitChange(index, value) {
    if (error) setError(null);
    const char = value.slice(-1); // Only keep the last entered character

    if (char && !/^\d$/.test(char)) return; // Only numbers allowed

    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    // Auto-advance cursor to next input box
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 6 digits entered
    const completeCode = newDigits.join('');
    if (completeCode.length === 6 && !newDigits.includes('')) {
      submitOtp(completeCode);
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pasteData)) return;

    const chars = pasteData.split('');
    setDigits(chars);
    inputRefs.current[5]?.focus();
    submitOtp(pasteData);
  }

  async function submitOtp(codeToSubmit) {
    const code = codeToSubmit || digits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits of your OTP');
      return;
    }

    try {
      if (isForgotPin) {
        await verifyForgotPinOtp(code);
      } else {
        await verifyOtp(code);
      }
    } catch (err) {
      // Handled in context
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || loading) return;
    try {
      await sendOtp(tempEmail);
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {}
  }

  return (
    <div className="flex flex-1 flex-col justify-between py-6">
      <div className="flex flex-col items-center pt-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand/15 text-2xl font-black text-brand shadow-sm">
          F
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {isForgotPin ? 'Reset PIN Verification' : 'Verify Your Email'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          We sent a 6-digit verification code to
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-semibold text-ink text-sm">{tempEmail}</span>
          {!isForgotPin && (
            <button
              type="button"
              onClick={() => setAuthStep('login')}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Change
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-card p-6 shadow-sm border border-line">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitOtp();
          }}
          className="flex flex-col gap-6"
        >
          {/* 6 Digit Inputs */}
          <div>
            <label className="block text-center text-xs font-semibold uppercase tracking-wider text-muted mb-4">
              Enter 6-Digit Code
            </label>
            <div className="flex justify-between gap-2" onPaste={handlePaste}>
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className="h-13 w-12 rounded-2xl border border-line bg-bg/50 text-center text-xl font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-sm"
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-err/10 px-4 py-2.5 text-xs font-medium text-err text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || digits.join('').length !== 6}
            className="flex w-full items-center justify-center rounded-2xl bg-btn py-3.5 text-sm font-semibold text-btntx shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Verifying...
              </span>
            ) : (
              'Verify & Continue'
            )}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 border-t border-line/60 pt-4 text-center">
          {resendCooldown > 0 ? (
            <span className="text-xs text-muted">
              Resend code in <strong className="text-ink font-semibold">{resendCooldown}s</strong>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Resend Code
            </button>
          )}

          {isForgotPin && (
            <button
              type="button"
              onClick={() => setAuthStep('unlock')}
              className="mt-2 text-xs font-medium text-muted hover:text-ink"
            >
              ← Back to PIN Unlock
            </button>
          )}
        </div>
      </div>

      <div className="text-center text-[11px] text-muted">
        <span>Check your spam folder if code does not appear within seconds</span>
      </div>
    </div>
  );
}
