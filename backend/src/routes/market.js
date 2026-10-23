// market.js - Public educational endpoints for Fixed Deposits, Gold/Silver bullion, and Bonds.
const express = require('express');
const {
  FIXED_DEPOSITS,
  PRECIOUS_METALS_BENCHMARK,
  VERIFIED_BONDS,
  calculateFdMaturity,
} = require('../services/marketData');

function createMarketRouter({ env, pool }) {
  const router = express.Router();

  // GET /api/market/fixed-deposits - Fixed deposit comparison rates
  router.get('/fixed-deposits', (req, res) => {
    res.json({
      items: FIXED_DEPOSITS,
      disclaimer:
        'Educational rate comparison only. Finzin uses simulated money and is not a licensed deposit-taking bank or NBFC.',
      lastVerifiedAt: '2026-10-24T00:00:00Z',
    });
  });

  // GET /api/market/fixed-deposits/calculate - Educational FD Calculator
  router.get('/fixed-deposits/calculate', (req, res) => {
    const { principal = '10000', rate = '7.10', tenureMonths = '12' } = req.query;
    const result = calculateFdMaturity(principal, rate, tenureMonths);
    res.json(result);
  });

  // GET /api/market/gold-silver - Educational Gold & Silver price benchmarks
  router.get('/gold-silver', (req, res) => {
    // If a live bullion API key is configured in future, it can be seamlessly resolved here
    res.json({
      ...PRECIOUS_METALS_BENCHMARK,
      isLiveFeedConfigured: Boolean(env.GOLD_API_KEY || process.env.GOLD_API_KEY),
      disclaimer:
        'Indicative precious metals benchmark rates based on official IBJA quotes. Does not include GST, making charges, or dealer spreads. Finzin does not facilitate actual precious metal purchases or ownership.',
    });
  });

  // GET /api/market/bonds - Bond discovery and financial education
  router.get('/bonds', (req, res) => {
    res.json({
      items: VERIFIED_BONDS,
      disclaimer:
        'Educational bond discovery only. Secondary market yields fluctuate with RBI repo rate cycles. Finzin does not broker securities or execute trades.',
      lastVerifiedAt: '2026-10-24T00:00:00Z',
    });
  });

  return router;
}

module.exports = { createMarketRouter };
