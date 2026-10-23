// leagueQuiz.js - Curated financial literacy questions and daily rotation.
// Server-authoritative: correct answers and scoring are strictly evaluated on the server.

const QUIZ_QUESTIONS = [
  {
    id: 'q_upi_pin',
    topic: 'Payment Safety',
    question: 'You receive a text claiming you won ₹5,000 and must enter your UPI PIN to receive the payment. What should you do?',
    options: [
      'Enter the PIN quickly before the offer expires',
      'Share the OTP instead of the PIN',
      'Never enter your UPI PIN; a PIN is ONLY required when SENDING money, never when receiving',
      'Ask a friend to enter their UPI PIN for you'
    ],
    correctIndex: 2,
    explanation: 'Crucial rule of UPI: You only enter your UPI PIN to DEBIT (send) money from your account. Receiving money never requires a PIN or OTP.',
  },
  {
    id: 'q_fd_vs_bond',
    topic: 'Savings & Investing',
    question: 'How does a Fixed Deposit (FD) differ fundamentally from a Sovereign Bond?',
    options: [
      'FDs have floating daily market prices while bonds are guaranteed by insurance',
      'FDs are fixed bank deposits with DICGC insurance up to ₹5 Lakh, whereas bonds are tradeable debt securities whose market prices fluctuate inversely with interest rates',
      'Bonds can never default under any circumstances',
      'FDs have a coupon rate while bonds only pay quarterly compounding interest'
    ],
    correctIndex: 1,
    explanation: 'Bank FDs are term deposits protected by DICGC up to ₹5 lakh per bank. Bonds are tradable debt instruments with market-determined yields that move inversely to interest rates.',
  },
  {
    id: 'q_50_30_20',
    topic: 'Budgeting Habits',
    question: 'According to the classic 50/30/20 student budgeting guideline, how should your monthly allowance/stipend be split?',
    options: [
      '50% Wants, 30% Savings, 20% Needs',
      '50% Needs (Food/Rent/Travel), 30% Wants (Fun/Dining), 20% Savings & Debt repayment',
      '70% Investments in stocks, 20% Wants, 10% Needs',
      '50% Savings, 50% Discretionary spending'
    ],
    correctIndex: 1,
    explanation: 'The 50/30/20 rule allocates 50% of income to essential needs, 30% to discretionary wants, and at least 20% toward savings, emergency funds, or debt paydown.',
  },
  {
    id: 'q_emergency_fund',
    topic: 'Financial Safety',
    question: 'Why should every student maintain an Emergency Pot (Slice Goal) before investing in risky assets?',
    options: [
      'To earn higher returns than the stock market',
      'Because banks freeze accounts that have zero savings',
      'To cover unexpected urgent costs (medical, travel, gadget repair) without borrowing or distress selling',
      'To avoid paying annual maintenance charges on debit cards'
    ],
    correctIndex: 2,
    explanation: 'An emergency fund provides immediate liquidity to weather unforeseen crises without taking high-interest loans or borrowing from peers.',
  },
  {
    id: 'q_inflation_impact',
    topic: 'Macroeconomics',
    question: 'If annual inflation is 6% and your zero-interest cash piggy bank holds ₹10,000, what happens to your purchasing power after one year?',
    options: [
      'Purchasing power increases by 6%',
      'The nominal amount drops to ₹9,400',
      'The nominal amount stays ₹10,000, but it can only buy what ₹9,434 bought a year ago',
      'Inflation has no effect on stored cash'
    ],
    correctIndex: 2,
    explanation: 'Inflation erodes real purchasing power: even though you still have ₹10,000 in notes, the goods that cost ₹10,000 previously now cost ₹10,600.',
  },
  {
    id: 'q_phishing_link',
    topic: 'Cybersecurity',
    question: 'You receive an SMS from "VK-SBI-ALRT" saying: "Your account is blocked. Update KYC at http://bit.ly/sbi-kyc-verify". How should you react?',
    options: [
      'Click the link and submit your Aadhaar and OTP immediately',
      'Forward the link to your college WhatsApp group to check',
      'Treat it as a phishing scam; banks never send unofficial shortened links to update KYC',
      'Reply to the SMS asking for customer care verification'
    ],
    correctIndex: 2,
    explanation: 'Banks and financial institutions never request confidential credentials or KYC documents through third-party shortened URLs (like bit.ly) or WhatsApp links.',
  },
  {
    id: 'q_compounding_frequency',
    topic: 'Smart Savings',
    question: 'Why does quarterly compounding on an FD or Savings Vault yield slightly more return than annual simple interest at the same nominal rate?',
    options: [
      'Because the government waives TDS on quarterly deposits',
      'Because interest earned each quarter is added to the principal, earning interest on interest in subsequent quarters',
      'Because banks double the interest rate in the last quarter',
      'It does not; all compounding methods yield identical sums'
    ],
    correctIndex: 1,
    explanation: 'Compound interest pays returns not only on your initial deposit, but also on the previously accumulated interest from each past compounding period.',
  }
];

/**
 * Deterministically retrieves today's financial literacy question for the whole platform.
 * Ensures all students in championships get the same daily question without timezone drift.
 *
 * @param {string} dateStr - Date formatted as YYYY-MM-DD
 * @returns {object} Client-safe question object (WITHOUT correctIndex)
 */
function getDailyQuizForDate(dateStr) {
  // Simple integer hash of the date string
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % QUIZ_QUESTIONS.length;
  const q = QUIZ_QUESTIONS[index];

  return {
    id: q.id,
    topic: q.topic,
    question: q.question,
    options: q.options,
    date: dateStr,
    // Note: correctIndex and explanation are kept private until submission
  };
}

/**
 * Server-side evaluation of the submitted quiz answer.
 *
 * @param {string} questionId
 * @param {number} selectedIndex
 * @returns {{ passed: boolean, explanation: string, correctIndex: number }}
 */
function evaluateQuizSubmission(questionId, selectedIndex) {
  const q = QUIZ_QUESTIONS.find((item) => item.id === questionId);
  if (!q) {
    throw new Error('Question not found');
  }

  const passed = q.correctIndex === Number(selectedIndex);
  return {
    passed,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  };
}

module.exports = {
  QUIZ_QUESTIONS,
  getDailyQuizForDate,
  evaluateQuizSubmission,
};
