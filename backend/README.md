# Finzin Backend API (Steps 1–6 Complete)

Finzin is a secure, student-focused banking API built for hackathons. All money is **simulated** using integer paise (Rs 1 = 100 paise) with zero float arithmetic and real banking-grade security patterns (HMAC-SHA256 OTPs, bcrypt PIN lockout, row-level locks, idempotency keys, strict Zod schemas, and privacy-first AI).

---

## 1. Prerequisites & Environment Setup (Windows)

1. Open PowerShell or Command Prompt in the `Finzin_nexathon/backend` folder:
   ```cmd
   cd backend
   copy .env.example .env
   ```

2. Generate a cryptographically strong 32+ character `JWT_SECRET`:
   ```cmd
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. **Supabase Postgres (Database):**
   - Create a free project at [supabase.com](https://supabase.com).
   - Go to **Project Settings** -> **Database** -> **Connection string** -> Select **Session pooler** (IPv4).
   - Note: Do NOT use the Direct Connection string on Windows (direct connection is IPv6-only).
   - If your password contains symbols (`@ # / :`), URL-encode them (`@` = `%40`, `#` = `%23`).
   - Set `DATABASE_URL` in `.env`.

4. **Gmail SMTP Setup (Step 2 Email OTPs):**
   - Enable **2-Step Verification** on your Google Account: [myaccount.google.com/security](https://myaccount.google.com/security).
   - Create an **App Password**: Go to Security -> 2-Step Verification -> App Passwords -> Create an app password for "Finzin".
   - Set `GMAIL_USER=your_email@gmail.com` and `GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx` in `.env`.
   - *Demo alternative*: Set `DEMO_OTP=123456` in development to use a fixed 6-digit code. Note: `DEMO_OTP` is automatically rejected in production.

5. **Google AI Studio (Step 6 Gemini AI Coach):**
   - Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com).
   - Set `GEMINI_API_KEY=your_key_here` and `GEMINI_MODEL=gemini-2.0-flash` in `.env`.
   - If omitted, the API automatically falls back to deterministic rule-based advice.

---

## 2. Installation & Running

```cmd
npm install
npm run db:setup      # Applies sql/schema.sql and confirms RLS on all 5 tables
npm run dev           # Starts development server on http://localhost:5000 with --watch
npm start             # Production entry point
npm test              # Runs the complete Node.js test suite
```

Check health:
- `GET http://localhost:5000/api/health` -> `{"status":"ok","db":"connected"}`

---

## 3. Architecture & API Reference

### Step 2: Authentication (`/api/auth`)
- `POST /api/auth/send-otp` `{ email }` - Generates 6-digit OTP, stores HMAC-SHA256 hash only, 5-minute expiry, 60-second cooldown, identical response for known/unknown emails.
- `POST /api/auth/verify-otp` `{ email, code }` - Constant-time comparison, destroyed after 5 failed guesses. Existing user returns `{ token, user, otpFresh: true }`; new user returns `{ registrationToken, isNewUser: true }`.
- `POST /api/auth/register` - Atomic transaction provisioning user, account, welcome credit (Rs 5,000), and welcome ledger entry. 12-digit account number, UPI ID `<mobile>@finzin`, bcrypt cost 10 PIN.
- `POST /api/auth/unlock` `{ pin }` - Session unlock with atomic 3-attempt 15-minute lockout (HTTP 423).
- `POST /api/auth/reset-pin` `{ newPin }` - Requires session token with `otpFresh=true` issued within 10 minutes.

### Step 3: Profile (`/api/profile`)
- `GET /api/profile` - Full profile with masked mobile (`******1234`) and account number (`********1234`). Never exposes `pin_hash`.
- `POST /api/profile/account-details` `{ pin }` - Discloses unmasked account number and demo IFSC (`FNZN0000001`) upon PIN validation.
- `PATCH /api/profile` - Strict Zod schema editable only for `address`, `nominee`, and `college`. Rejects unknown fields.

### Step 4: Payments, Transactions & Expenses
- `GET /api/users/lookup?mode=upi|mobile|bank&value=...&ifsc=...` - Server-resolved payee verification returning only `{ name, upiId }`. Rate limited to 15/min.
- `POST /api/payments/transfer` - Bank-grade transfer with strict rupee-to-paise parser, separate pre-committed PIN check, self-pay prevention, max Rs 50,000 limit, sorted row-level locks (`SELECT FOR UPDATE`) to eliminate deadlocks, and idempotency key deduplication.
- `POST /api/payments/save` - Moves funds from spendable wallet into Vault with ledger type `save`.
- `GET /api/me` - Dashboard summary returning `{ user: { name, handle }, balance, savings }`.
- `GET /api/transactions?limit=20&before=...` - Paginated ledger history with friendly titles and Asia/Kolkata dates.
- `GET /api/expenses/summary?month=YYYY-MM` - Monthly expense breakdown (`budget: 8000`, `spent`, `remaining`, `byCategory`, `days`), counting only `transfer` debits.

### Step 5: Vault & Goals (`/api/vault`, `/api/goals`, `/api/portfolio`)
- **Lazy 4% p.a. Interest**: Computed on every interaction using integer BigInt math without cron jobs:
  `accrued = floor(principal * 400 * elapsedSeconds / (10000 * 31536000))`.
- `POST /api/vault/deposit` `{ amount, pin, idempotencyKey }` - Moves spendable wallet funds into savings pot.
- `POST /api/vault/withdraw` `{ amount, pin, idempotencyKey }` - Withdraws accrued savings back into spendable balance.
- `GET /api/portfolio` - Complete wealth view with compounded monthly projections (1, 3, 6, 12 months at 4% p.a.).
- `POST /api/goals`, `PATCH /api/goals/:id`, `DELETE /api/goals/:id` - Savings goals linked to vault balance.

### Step 6: AI Financial Coach (`/api/ai/advice`)
- `POST /api/ai/advice` `{ month }` - Server aggregates category totals and transmits **ONLY** anonymous amounts and budget 8000 to Gemini (zero PII transmitted).
- 8-second timeout via `AbortController`, header-only `x-goog-api-key`, validated with Zod.
- Automatic fallback to `services/adviceRules.js` on quota limits, network drops, or timeouts.

---

## 4. Running Tests

```cmd
# Run pure unit tests (money, masks, vault math, AI coach, security JWTs):
npm test

# Run database integration tests with local or test Supabase:
set TEST_DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-xx.pooler.supabase.com:5432/postgres
npm test
```

---

## 5. Known Limitations
- Simulated KYC: Aadhaar/PAN is simulated via last-4 display string; no actual UIDAI integration.
- Supabase SSL: Uses `{ rejectUnauthorized: false }` for rapid hackathon deployment; production should download Supabase's CA certificate.
- Opportunistic OTP Cleanup: Postgres has no native TTL indexes, so expired OTP rows are swept opportunistically on send/verify.
