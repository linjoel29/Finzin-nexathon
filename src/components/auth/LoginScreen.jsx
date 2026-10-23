// LoginScreen.jsx - Initial authentication screen: enter student email to receive OTP.
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen() {
  const { sendOtp, loading, error, setError } = useAuth();
  const [email, setEmail] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid student email address');
      return;
    }
    try {
      await sendOtp(email);
    } catch (err) {
      // Error handled in AuthContext
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-between py-6">
      <div className="flex flex-col items-center pt-8 text-center">
        {/* Finzin Brand Emblem */}
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand/15 text-2xl font-black text-brand shadow-sm">
          F
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Welcome to Finzin</h1>
        <p className="mt-1 text-sm text-muted">Smart student banking designed for campus life</p>
      </div>

      <div className="rounded-3xl bg-card p-6 shadow-sm border border-line">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              Student Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@college.edu or gmail"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              className="w-full rounded-2xl border border-line bg-bg/50 px-4 py-3.5 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-err/10 px-4 py-2.5 text-xs font-medium text-err">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="mt-2 flex w-full items-center justify-center rounded-2xl bg-btn py-3.5 text-sm font-semibold text-btntx shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Sending OTP...
              </span>
            ) : (
              'Continue with OTP'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-line/60 pt-4 text-center">
          <p className="text-xs text-muted">
            New here? Enter your email and you'll register in under a minute.
          </p>
        </div>
      </div>

      <div className="text-center text-[11px] text-muted">
        <span>Simulated Student Banking • Safe & Secure</span>
      </div>
    </div>
  );
}
