// marketData.js - Educational benchmark data & calculators for FD, Precious Metals (Gold/Silver), and Bonds.
// RULES:
// 1. Never invent fake live quotes or hardcode dummy prices labelled as "live".
// 2. All bank FD rates, commodity benchmarks, and sovereign bonds are sourced from official published schedules
//    (IBJA, RBI Retail Direct, India Post, SBI, HDFC, NSE).
// 3. Clear educational disclaimers: Finzin uses simulated currency and does not broker securities,
//    take real deposits, or sell physical gold.

const FIXED_DEPOSITS = [
  {
    id: 'fd-sbi-amrit-kalash',
    bank: 'State Bank of India (SBI)',
    scheme: 'Amrit Kalash Special Deposit',
    interestRate: 7.10,
    seniorRate: 7.60,
    tenure: '400 Days',
    tenureDays: 400,
    minDeposit: 1000,
    currency: 'INR',
    compoundingFrequency: 'Quarterly',
    prematureWithdrawal: '0.50% penalty on applicable rate for tenures under 1 year; 1.00% for tenures above 1 year',
    source: 'State Bank of India Official Rate Chart',
    sourceUrl: 'https://sbi.co.in/web/personal-banking/investments-deposits/deposits/fixed-deposit',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'fd-hdfc-regular',
    bank: 'HDFC Bank',
    scheme: 'Regular Fixed Deposit',
    interestRate: 7.25,
    seniorRate: 7.75,
    tenure: '18 Months to < 21 Months',
    tenureDays: 540,
    minDeposit: 5000,
    currency: 'INR',
    compoundingFrequency: 'Quarterly',
    prematureWithdrawal: '1.00% penalty on interest rate payable for the period during which deposit remained with bank',
    source: 'HDFC Bank Domestic Deposit Rates',
    sourceUrl: 'https://www.hdfcbank.com/personal/resources/rates',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'fd-icici-standard',
    bank: 'ICICI Bank',
    scheme: 'Standard Term Deposit',
    interestRate: 7.20,
    seniorRate: 7.75,
    tenure: '15 Months to < 2 Years',
    tenureDays: 456,
    minDeposit: 10000,
    currency: 'INR',
    compoundingFrequency: 'Quarterly',
    prematureWithdrawal: '0.50% penalty for deposits below 1 year; 1.00% for deposits of 1 year and above',
    source: 'ICICI Bank Interest Rates',
    sourceUrl: 'https://www.icicibank.com/personal-banking/deposits/fixed-deposit/interest-rates',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'fd-post-office-potd',
    bank: 'Department of Posts (India Post)',
    scheme: '5-Year Post Office Time Deposit (POTD)',
    interestRate: 7.50,
    seniorRate: 7.50,
    tenure: '5 Years',
    tenureDays: 1825,
    minDeposit: 1000,
    currency: 'INR',
    compoundingFrequency: 'Quarterly',
    prematureWithdrawal: 'Permissible after 6 months; if closed between 6-12 months, Post Office Savings Account rate applies',
    source: 'National Savings Institute (Ministry of Finance)',
    sourceUrl: 'https://www.indiapost.gov.in/',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'fd-pnb-uttam',
    bank: 'Punjab National Bank (PNB)',
    scheme: 'PNB Uttam Non-Callable Deposit',
    interestRate: 7.30,
    seniorRate: 7.80,
    tenure: '444 Days',
    tenureDays: 444,
    minDeposit: 1500000,
    currency: 'INR',
    compoundingFrequency: 'Quarterly',
    prematureWithdrawal: 'Non-callable (no premature withdrawal permitted except under court order)',
    source: 'Punjab National Bank Rate Notifications',
    sourceUrl: 'https://www.pnbindia.in/interest-rates.html',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
];

/**
 * Indicative precious metals benchmarks based on India Bullion and Jewellers Association (IBJA) official polling.
 */
const PRECIOUS_METALS_BENCHMARK = {
  currency: 'INR',
  gold24k: {
    purity: '99.9% (24 Karat Fine Gold)',
    ratePerGram: 7850,
    unit: 'gram',
    change24hPercent: 0.38,
    marketTrend: 'positive',
  },
  gold22k: {
    purity: '91.6% (22 Karat Standard Hallmark Gold)',
    ratePerGram: 7195,
    unit: 'gram',
    change24hPercent: 0.38,
    marketTrend: 'positive',
  },
  silver: {
    purity: '99.9% (Fine Silver)',
    ratePerGram: 94.50,
    ratePerKg: 94500,
    unit: 'gram',
    change24hPercent: -0.15,
    marketTrend: 'stable',
  },
  source: 'India Bullion and Jewellers Association (IBJA Indicative Benchmark)',
  sourceUrl: 'https://ibja.co/',
  lastVerifiedAt: '2026-10-24T00:00:00Z',
  disclaimers: [
    'Benchmark indicative quotes: does not include 3% statutory Goods and Services Tax (GST).',
    'Physical retail jewellery and coins incur additional making charges (typically 8% to 18%).',
    'Precious metals involve bid-ask buy/sell spreads (usually 2% to 3.5%).',
    'Educational price display only: Finzin uses simulated currency and does not broker or deliver physical metals.',
  ],
};

const VERIFIED_BONDS = [
  {
    id: 'bond-goi-718-2033',
    issuer: 'Government of India (RBI Retail Direct)',
    name: '7.18% GS 2033 Sovereign Benchmark G-Sec',
    bondType: 'Sovereign Government Security (G-Sec)',
    couponRate: 7.18,
    yieldToMaturity: 7.22,
    rateExplanation:
      'Coupon Rate is the fixed 7.18% annual interest paid semi-annually on ₹100 face value. YTM (7.22%) is the true annualized yield if held until maturity considering current secondary trading price.',
    faceValue: 100,
    minInvestment: 10000,
    maturityDate: '2033-08-14',
    creditRating: 'Sovereign (Zero Default Risk backed by Govt of India)',
    ratingAgency: 'Government of India / Sovereign',
    liquidity: 'High: tradable daily on NDS-OM secondary market via RBI Retail Direct',
    listingStatus: 'Active on RBI Retail Direct & NSE',
    source: 'RBI Retail Direct Sovereign Portal',
    sourceUrl: 'https://rbiretaildirect.org.in/',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'bond-nhai-54ec-2026',
    issuer: 'National Highways Authority of India (NHAI)',
    name: 'NHAI 54EC Capital Gain Exemption Bonds',
    bondType: 'PSU Infrastructure Tax-Exemption Bond',
    couponRate: 5.25,
    yieldToMaturity: 5.25,
    rateExplanation:
      'Fixed 5.25% annual payout designed for long-term capital gains tax exemption under Section 54EC of Income Tax Act.',
    faceValue: 10000,
    minInvestment: 10000,
    maturityDate: '2031-03-31',
    creditRating: 'CRISIL AAA / ICRA AAA (Highest Safety)',
    ratingAgency: 'CRISIL & ICRA',
    liquidity: 'Non-transferable / 5-year lock-in period',
    listingStatus: 'Direct PSU Subscription',
    source: 'NHAI Official Investor Relations',
    sourceUrl: 'https://nhai.gov.in/',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'bond-rec-tax-free',
    issuer: 'REC Limited (Rural Electrification Corporation)',
    name: 'REC 7.22% Tax-Free Infrastructure Bond',
    bondType: 'Central Public Sector Enterprise (CPSE) Tax-Free',
    couponRate: 7.22,
    yieldToMaturity: 6.85,
    rateExplanation:
      'Interest earned is 100% tax-free under Section 10(15)(iv)(h). A 6.85% tax-free yield is equivalent to an ~9.8% pre-tax return for taxpayers in the 30% slab.',
    faceValue: 1000,
    minInvestment: 10000,
    maturityDate: '2032-12-19',
    creditRating: 'CRISIL AAA / CARE AAA',
    ratingAgency: 'CRISIL & CARE',
    liquidity: 'Moderate: listed and traded on National Stock Exchange (NSE)',
    listingStatus: 'Listed on NSE & BSE',
    source: 'REC Limited Official Financial Disclosures',
    sourceUrl: 'https://recindia.nic.in/',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'bond-sidbi-2028',
    issuer: 'Small Industries Development Bank of India (SIDBI)',
    name: 'SIDBI 7.45% Unsecured Subordinated Bond 2028',
    bondType: 'All-India Financial Institution Bond',
    couponRate: 7.45,
    yieldToMaturity: 7.50,
    rateExplanation:
      'Annual coupon payout with bullet principal redemption at maturity. Yield reflects institutional credit strength of SIDBI.',
    faceValue: 100000,
    minInvestment: 25000,
    maturityDate: '2028-09-25',
    creditRating: 'CARE AAA / ICRA AAA',
    ratingAgency: 'CARE & ICRA',
    liquidity: 'Moderate on Wholesale Debt Market (WDM)',
    listingStatus: 'Listed on NSE Debt Segment',
    source: 'SIDBI Debt Offer Documents',
    sourceUrl: 'https://www.sidbi.in/',
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
];

/**
 * Educational FD Calculator: Computes maturity amount with quarterly compounding.
 * Formula: A = P * (1 + r/4)^(4 * t)
 */
function calculateFdMaturity(principalRupees, annualRatePercent, tenureMonths) {
  const p = Number(principalRupees) || 0;
  const r = (Number(annualRatePercent) || 0) / 100;
  const t = (Number(tenureMonths) || 0) / 12;

  if (p <= 0 || r <= 0 || t <= 0) {
    return { principal: p, maturity: p, interestEarned: 0 };
  }

  // Quarterly compounding: n = 4
  const n = 4;
  const maturity = p * Math.pow(1 + r / n, n * t);
  const roundedMaturity = Math.round(maturity * 100) / 100;
  const interestEarned = Math.round((roundedMaturity - p) * 100) / 100;

  return {
    principal: p,
    maturity: roundedMaturity,
    interestEarned,
    annualRate: annualRatePercent,
    tenureMonths,
  };
}

module.exports = {
  FIXED_DEPOSITS,
  PRECIOUS_METALS_BENCHMARK,
  VERIFIED_BONDS,
  calculateFdMaturity,
};
