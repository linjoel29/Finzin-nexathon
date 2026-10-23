// vault.js - Vault savings pot logic with lazy 4% p.a. interest calculation and goals management.
// RULES:
// 1. Lazy interest (no background cron jobs): interest is calculated and folded into vault_principal
//    whenever the account is modified (deposit, withdrawal, save) or queried.
// 2. Interest formula:
//    accrued = floor(principal * 400 * elapsedSeconds / (10000 * 31536000)) using BigInt.
// 3. Transactions are strictly atomic with row-level locks (SELECT FOR UPDATE).
// 4. Money is stored in integer paise and returned in rupees for display.
const { AppError } = require('../utils/AppError');
const { withTransaction } = require('../config/db');
const { rupeesToPaise, paiseToRupees } = require('../utils/money');

/**
 * Computes lazy accrued interest in paise since the last accrual timestamp.
 *
 * @param {number|string|bigint} principalPaise - Current vault principal in paise
 * @param {Date|string} lastAccruedAt - Timestamp of last interest fold
 * @param {Date} [currentTime=new Date()] - Evaluation time
 * @returns {bigint} Accrued interest in paise as a BigInt
 */
function calculateAccruedInterest(principalPaise, lastAccruedAt, currentTime = new Date()) {
  const principal = BigInt(principalPaise || 0);
  if (principal <= 0n) return 0n;

  const lastTime = new Date(lastAccruedAt).getTime();
  const nowTime = currentTime.getTime();
  const elapsedMs = Math.max(0, nowTime - lastTime);
  const elapsedSeconds = BigInt(Math.floor(elapsedMs / 1000));

  // 4% p.a. simulated interest over 365 days (31,536,000 seconds)
  // accrued = floor(principal * 400 * elapsedSeconds / (10000 * 31536000))
  const numerator = principal * 400n * elapsedSeconds;
  const denominator = 10000n * 31536000n;
  return numerator / denominator;
}

/**
 * Executes a vault deposit (from wallet into vault) or payment save operation.
 */
async function processVaultDeposit({ userId, amountRupees, idempotencyKey, pool, type = 'vault_deposit' }) {
  const amountPaise = rupeesToPaise(amountRupees);

  // Check idempotency first: if this exact key was already processed, return original
  const existing = await pool.query(
    'SELECT id, amount, created_at FROM transactions WHERE from_user = $1 AND idempotency_key = $2',
    [userId, idempotencyKey]
  );

  if (existing.rows.length > 0) {
    const tx = existing.rows[0];
    const acc = await pool.query('SELECT balance, vault_principal FROM accounts WHERE user_id = $1', [userId]);
    return {
      transaction: {
        id: tx.id,
        amount: paiseToRupees(tx.amount),
        date: tx.created_at,
        type: 'debit',
        kind: type,
      },
      walletBalance: paiseToRupees(acc.rows[0]?.balance || 0),
      vaultTotal: paiseToRupees(acc.rows[0]?.vault_principal || 0),
    };
  }

  return withTransaction(pool, async (client) => {
    // Lock the account row to prevent concurrent modification
    const accRes = await client.query(
      `SELECT balance, vault_principal, vault_interest_earned, vault_last_accrued_at
       FROM accounts
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (accRes.rows.length === 0) {
      throw new AppError(404, 'Account not found');
    }

    const acc = accRes.rows[0];

    // Fold accrued interest
    const accrued = calculateAccruedInterest(acc.vault_principal, acc.vault_last_accrued_at);
    const newPrincipalWithInterest = BigInt(acc.vault_principal) + accrued;
    const newInterestEarned = BigInt(acc.vault_interest_earned) + accrued;

    // Check spendable wallet balance
    if (acc.balance < amountPaise) {
      throw new AppError(400, 'Insufficient wallet balance');
    }

    const newWalletBalance = BigInt(acc.balance) - BigInt(amountPaise);
    const updatedVaultPrincipal = newPrincipalWithInterest + BigInt(amountPaise);

    // Update account
    await client.query(
      `UPDATE accounts
       SET balance = $1,
           vault_principal = $2,
           vault_interest_earned = $3,
           vault_last_accrued_at = now()
       WHERE user_id = $4`,
      [newWalletBalance.toString(), updatedVaultPrincipal.toString(), newInterestEarned.toString(), userId]
    );

    // Append to transactions ledger
    const note = type === 'save' ? 'Saved to Vault' : 'Deposit to Vault';
    const txRes = await client.query(
      `INSERT INTO transactions (type, from_user, to_user, amount, category, note, idempotency_key)
       VALUES ($1, $2, $2, $3, 'others', $4, $5)
       RETURNING id, created_at`,
      [type, userId, amountPaise, note, idempotencyKey]
    );

    return {
      transaction: {
        id: txRes.rows[0].id,
        amount: paiseToRupees(amountPaise),
        date: txRes.rows[0].created_at,
        type: 'debit',
        kind: type,
      },
      walletBalance: paiseToRupees(newWalletBalance),
      vaultTotal: paiseToRupees(updatedVaultPrincipal),
    };
  });
}

/**
 * Executes a vault withdrawal (from vault back to wallet balance).
 */
async function processVaultWithdraw({ userId, amountRupees, idempotencyKey, pool }) {
  const amountPaise = rupeesToPaise(amountRupees);

  // Check idempotency
  const existing = await pool.query(
    'SELECT id, amount, created_at FROM transactions WHERE from_user = $1 AND idempotency_key = $2',
    [userId, idempotencyKey]
  );

  if (existing.rows.length > 0) {
    const tx = existing.rows[0];
    const acc = await pool.query('SELECT balance, vault_principal FROM accounts WHERE user_id = $1', [userId]);
    return {
      transaction: {
        id: tx.id,
        amount: paiseToRupees(tx.amount),
        date: tx.created_at,
        type: 'credit',
        kind: 'vault_withdraw',
      },
      walletBalance: paiseToRupees(acc.rows[0]?.balance || 0),
      vaultTotal: paiseToRupees(acc.rows[0]?.vault_principal || 0),
    };
  }

  return withTransaction(pool, async (client) => {
    // Lock the account row
    const accRes = await client.query(
      `SELECT balance, vault_principal, vault_interest_earned, vault_last_accrued_at
       FROM accounts
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (accRes.rows.length === 0) {
      throw new AppError(404, 'Account not found');
    }

    const acc = accRes.rows[0];

    // Fold accrued interest first so the user gets all accrued gains
    const accrued = calculateAccruedInterest(acc.vault_principal, acc.vault_last_accrued_at);
    const totalAvailableVault = BigInt(acc.vault_principal) + accrued;
    const newInterestEarned = BigInt(acc.vault_interest_earned) + accrued;

    if (BigInt(amountPaise) > totalAvailableVault) {
      throw new AppError(400, 'Cannot withdraw more than available vault balance');
    }

    const newVaultPrincipal = totalAvailableVault - BigInt(amountPaise);
    const newWalletBalance = BigInt(acc.balance) + BigInt(amountPaise);

    // Update account
    await client.query(
      `UPDATE accounts
       SET balance = $1,
           vault_principal = $2,
           vault_interest_earned = $3,
           vault_last_accrued_at = now()
       WHERE user_id = $4`,
      [newWalletBalance.toString(), newVaultPrincipal.toString(), newInterestEarned.toString(), userId]
    );

    // Append to transactions ledger
    const txRes = await client.query(
      `INSERT INTO transactions (type, from_user, to_user, amount, category, note, idempotency_key)
       VALUES ('vault_withdraw', $1, $1, $2, 'others', 'Vault withdrawal', $3)
       RETURNING id, created_at`,
      [userId, amountPaise, idempotencyKey]
    );

    return {
      transaction: {
        id: txRes.rows[0].id,
        amount: paiseToRupees(amountPaise),
        date: txRes.rows[0].created_at,
        type: 'credit',
        kind: 'vault_withdraw',
      },
      walletBalance: paiseToRupees(newWalletBalance),
      vaultTotal: paiseToRupees(newVaultPrincipal),
    };
  });
}

/**
 * Helper to normalize SQL DATE / Date object into YYYY-MM-DD string without timezone offset.
 */
function formatTargetDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d).slice(0, 10);
}

/**
 * Executes a deposit from spendable wallet directly into a named Slice savings goal.
 * Uses integer paise, row-level locking (SELECT FOR UPDATE on accounts & goals), and idempotency.
 */
async function processSliceDeposit({ userId, goalId, amountRupees, idempotencyKey, pool }) {
  const amountPaise = rupeesToPaise(amountRupees);
  if (amountPaise <= 0) {
    throw new AppError(400, 'Deposit amount must be greater than zero');
  }

  // Idempotency check: if this key was already processed for this user, return recorded outcome
  const existing = await pool.query(
    'SELECT id, amount, created_at FROM transactions WHERE from_user = $1 AND idempotency_key = $2',
    [userId, idempotencyKey]
  );

  if (existing.rows.length > 0) {
    const tx = existing.rows[0];
    const acc = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [userId]);
    const gRes = await pool.query(
      'SELECT id, name, target_amount, allocated, target_date FROM goals WHERE id = $1 AND user_id = $2',
      [goalId, userId]
    );
    const g = gRes.rows[0];
    return {
      transaction: {
        id: tx.id,
        amount: paiseToRupees(tx.amount),
        date: tx.created_at,
        type: 'debit',
        kind: 'slice_deposit',
      },
      walletBalance: paiseToRupees(acc.rows[0]?.balance || 0),
      goal: g
        ? {
            id: g.id,
            name: g.name,
            target: g.target_amount ? paiseToRupees(g.target_amount) : null,
            targetDate: formatTargetDate(g.target_date),
            allocated: paiseToRupees(g.allocated),
          }
        : null,
    };
  }

  return withTransaction(pool, async (client) => {
    // Lock both account and goal rows to guarantee concurrency safety
    const accRes = await client.query(
      'SELECT balance FROM accounts WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (accRes.rows.length === 0) {
      throw new AppError(404, 'Account not found');
    }

    const goalRes = await client.query(
      'SELECT id, name, target_amount, allocated, target_date FROM goals WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [goalId, userId]
    );
    if (goalRes.rows.length === 0) {
      throw new AppError(404, 'Goal not found');
    }

    const acc = accRes.rows[0];
    const goal = goalRes.rows[0];

    // Verify sufficient spendable wallet balance
    if (BigInt(acc.balance) < BigInt(amountPaise)) {
      throw new AppError(400, 'Insufficient wallet balance');
    }

    const newWalletBalance = BigInt(acc.balance) - BigInt(amountPaise);
    const newAllocated = BigInt(goal.allocated) + BigInt(amountPaise);

    // Atomically debit wallet balance and credit goal pot
    await client.query(
      'UPDATE accounts SET balance = $1 WHERE user_id = $2',
      [newWalletBalance.toString(), userId]
    );

    await client.query(
      'UPDATE goals SET allocated = $1 WHERE id = $2 AND user_id = $3',
      [newAllocated.toString(), goalId, userId]
    );

    // Record in ledger
    const note = `Slice deposit: ${goal.name}`;
    const txRes = await client.query(
      `INSERT INTO transactions (type, from_user, to_user, amount, category, note, idempotency_key)
       VALUES ('save', $1, $1, $2, 'others', $3, $4)
       RETURNING id, created_at`,
      [userId, amountPaise, note, idempotencyKey]
    );

    return {
      transaction: {
        id: txRes.rows[0].id,
        amount: paiseToRupees(amountPaise),
        date: txRes.rows[0].created_at,
        type: 'debit',
        kind: 'slice_deposit',
      },
      walletBalance: paiseToRupees(newWalletBalance),
      goal: {
        id: goal.id,
        name: goal.name,
        target: goal.target_amount ? paiseToRupees(goal.target_amount) : null,
        targetDate: formatTargetDate(goal.target_date),
        allocated: paiseToRupees(newAllocated),
      },
    };
  });
}

/**
 * Executes a withdrawal from a named Slice savings goal back into the spendable wallet.
 * Uses integer paise, row-level locking (SELECT FOR UPDATE), and prevents overdrawing goal.
 */
async function processSliceWithdraw({ userId, goalId, amountRupees, idempotencyKey, pool }) {
  const amountPaise = rupeesToPaise(amountRupees);
  if (amountPaise <= 0) {
    throw new AppError(400, 'Withdrawal amount must be greater than zero');
  }

  // Idempotency check
  const existing = await pool.query(
    'SELECT id, amount, created_at FROM transactions WHERE from_user = $1 AND idempotency_key = $2',
    [userId, idempotencyKey]
  );

  if (existing.rows.length > 0) {
    const tx = existing.rows[0];
    const acc = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [userId]);
    const gRes = await pool.query(
      'SELECT id, name, target_amount, allocated, target_date FROM goals WHERE id = $1 AND user_id = $2',
      [goalId, userId]
    );
    const g = gRes.rows[0];
    return {
      transaction: {
        id: tx.id,
        amount: paiseToRupees(tx.amount),
        date: tx.created_at,
        type: 'credit',
        kind: 'slice_withdraw',
      },
      walletBalance: paiseToRupees(acc.rows[0]?.balance || 0),
      goal: g
        ? {
            id: g.id,
            name: g.name,
            target: g.target_amount ? paiseToRupees(g.target_amount) : null,
            targetDate: formatTargetDate(g.target_date),
            allocated: paiseToRupees(g.allocated),
          }
        : null,
    };
  }

  return withTransaction(pool, async (client) => {
    // Lock both account and goal rows
    const accRes = await client.query(
      'SELECT balance FROM accounts WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (accRes.rows.length === 0) {
      throw new AppError(404, 'Account not found');
    }

    const goalRes = await client.query(
      'SELECT id, name, target_amount, allocated, target_date FROM goals WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [goalId, userId]
    );
    if (goalRes.rows.length === 0) {
      throw new AppError(404, 'Goal not found');
    }

    const acc = accRes.rows[0];
    const goal = goalRes.rows[0];

    // Ensure withdrawal does not exceed goal's available allocated balance
    if (BigInt(goal.allocated) < BigInt(amountPaise)) {
      throw new AppError(400, 'Cannot withdraw more than available goal balance');
    }

    const newAllocated = BigInt(goal.allocated) - BigInt(amountPaise);
    const newWalletBalance = BigInt(acc.balance) + BigInt(amountPaise);

    // Atomically debit goal and credit wallet
    await client.query(
      'UPDATE goals SET allocated = $1 WHERE id = $2 AND user_id = $3',
      [newAllocated.toString(), goalId, userId]
    );

    await client.query(
      'UPDATE accounts SET balance = $1 WHERE user_id = $2',
      [newWalletBalance.toString(), userId]
    );

    // Record in ledger
    const note = `Slice withdrawal: ${goal.name}`;
    const txRes = await client.query(
      `INSERT INTO transactions (type, from_user, to_user, amount, category, note, idempotency_key)
       VALUES ('save', $1, $1, $2, 'others', $3, $4)
       RETURNING id, created_at`,
      [userId, amountPaise, note, idempotencyKey]
    );

    return {
      transaction: {
        id: txRes.rows[0].id,
        amount: paiseToRupees(amountPaise),
        date: txRes.rows[0].created_at,
        type: 'credit',
        kind: 'slice_withdraw',
      },
      walletBalance: paiseToRupees(newWalletBalance),
      goal: {
        id: goal.id,
        name: goal.name,
        target: goal.target_amount ? paiseToRupees(goal.target_amount) : null,
        targetDate: formatTargetDate(goal.target_date),
        allocated: paiseToRupees(newAllocated),
      },
    };
  });
}

/**
 * Returns portfolio overview: wallet, vault breakdown, slice goals, and compound projections.
 * Accurately reconciles wallet + vault + slice so funds are counted exactly once.
 */
async function getPortfolio(userId, pool) {
  const accRes = await pool.query(
    'SELECT balance, vault_principal, vault_interest_earned, vault_last_accrued_at FROM accounts WHERE user_id = $1',
    [userId]
  );

  if (accRes.rows.length === 0) {
    throw new AppError(404, 'Account not found');
  }

  const acc = accRes.rows[0];
  const accrued = calculateAccruedInterest(acc.vault_principal, acc.vault_last_accrued_at);
  const vaultTotalPaise = BigInt(acc.vault_principal) + accrued;

  const walletRupees = paiseToRupees(acc.balance);
  const vaultPrincipalRupees = paiseToRupees(acc.vault_principal);
  const accruedInterestRupees = paiseToRupees(accrued);
  const vaultTotalRupees = paiseToRupees(vaultTotalPaise);

  // Goals associated with this user
  const goalsRes = await pool.query(
    'SELECT id, name, target_amount, allocated, target_date, created_at FROM goals WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );

  const goals = goalsRes.rows.map((g) => ({
    id: g.id,
    name: g.name,
    target: g.target_amount ? paiseToRupees(g.target_amount) : null,
    targetDate: formatTargetDate(g.target_date),
    allocated: paiseToRupees(g.allocated),
    createdAt: g.created_at,
  }));

  const sliceTotalPaise = goalsRes.rows.reduce((sum, g) => sum + BigInt(g.allocated || 0), 0n);
  const sliceTotalRupees = paiseToRupees(sliceTotalPaise);

  // Total portfolio reconciles wallet + vault savings + slice goals
  const totalRupees = Math.round((walletRupees + vaultTotalRupees + sliceTotalRupees) * 100) / 100;

  // Compounded monthly projection at 4% p.a. on current vault total
  const monthlyRate = 0.04 / 12;
  const projection = [1, 3, 6, 12].map((m) => {
    const compounded = vaultTotalRupees * Math.pow(1 + monthlyRate, m);
    return {
      months: m,
      value: Math.round(compounded * 100) / 100,
    };
  });

  return {
    wallet: walletRupees,
    vault: {
      principal: vaultPrincipalRupees,
      accruedInterest: accruedInterestRupees,
      total: vaultTotalRupees,
    },
    slice: {
      total: sliceTotalRupees,
      count: goals.length,
    },
    goals,
    total: totalRupees,
    projection,
  };
}

module.exports = {
  calculateAccruedInterest,
  processVaultDeposit,
  processVaultWithdraw,
  processSliceDeposit,
  processSliceWithdraw,
  getPortfolio,
};
