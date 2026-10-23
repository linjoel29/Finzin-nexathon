// studentCorner.js - Routes for Internships, Scholarships, Student Offers, and Bookmarks.
const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { AppError } = require('../utils/AppError');
const {
  VERIFIED_INTERNSHIPS,
  VERIFIED_SCHOLARSHIPS,
  VERIFIED_OFFERS,
  evaluateScholarshipEligibility,
} = require('../services/studentData');

const eligibilitySchema = z
  .object({
    scholarshipId: z.string().min(1, 'Scholarship ID is required'),
    course: z.string().max(80).optional(),
    studyYear: z.union([z.number(), z.string()]).optional(),
    state: z.string().max(60).optional(),
    annualFamilyIncome: z.union([z.number(), z.string()]).optional(),
    academicScore: z.union([z.number(), z.string()]).optional(),
    gender: z.string().max(20).optional(),
  })
  .strict();

const toggleBookmarkSchema = z
  .object({
    itemType: z.enum(['internship', 'scholarship', 'offer'], {
      errorMap: () => ({ message: 'Item type must be internship, scholarship, or offer' }),
    }),
    itemId: z.string().min(1, 'Item ID is required').max(100),
  })
  .strict();

function createStudentCornerRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // Optional auth: allows logged-in users to have their bookmarks marked directly
  const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.split(' ')[1];
    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, env.JWT_SECRET);
      if (payload && payload.sub && payload.purpose === 'session') {
        req.user = { id: payload.sub, email: payload.email };
      }
    } catch (e) {
      // Ignore token parse failure on public endpoints
    }
    next();
  };

  // Helper to fetch user's bookmarked item IDs
  async function getUserBookmarkSet(userId) {
    if (!userId || !pool) return new Set();
    try {
      const { rows } = await pool.query(
        'SELECT item_type, item_id FROM user_bookmarks WHERE user_id = $1',
        [userId]
      );
      return new Set(rows.map((r) => `${r.item_type}:${r.item_id}`));
    } catch (e) {
      return new Set();
    }
  }

  // GET /api/student-corner/internships
  router.get('/internships', optionalAuth, async (req, res, next) => {
    try {
      const { search, workMode, paid, category, sort = 'deadline', page = '1', limit = '10' } = req.query;

      let items = [...VERIFIED_INTERNSHIPS];

      // Filter by search query
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        items = items.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.company.toLowerCase().includes(q) ||
            i.location.toLowerCase().includes(q) ||
            i.skills.some((s) => s.toLowerCase().includes(q))
        );
      }

      // Filter by work mode
      if (workMode && workMode !== 'all') {
        items = items.filter((i) => i.workMode === workMode);
      }

      // Filter by paid / unpaid
      if (paid === 'paid') {
        items = items.filter((i) => i.isPaid);
      } else if (paid === 'unpaid') {
        items = items.filter((i) => !i.isPaid);
      }

      // Filter by category
      if (category && category !== 'all') {
        items = items.filter((i) => i.category === category);
      }

      // Sorting
      if (sort === 'deadline') {
        items.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
      } else if (sort === 'newest') {
        items.sort((a, b) => new Date(b.lastVerifiedAt) - new Date(a.lastVerifiedAt));
      } else if (sort === 'stipend') {
        items.sort((a, b) => b.stipendAmount - a.stipendAmount);
      }

      // Attach bookmark status if user is authenticated
      const userBookmarks = await getUserBookmarkSet(req.user?.id);
      items = items.map((i) => ({
        ...i,
        isBookmarked: userBookmarks.has(`internship:${i.id}`),
      }));

      // Pagination
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
      const total = items.length;
      const totalPages = Math.ceil(total / limitNum) || 1;
      const paginated = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({
        items: paginated,
        total,
        page: pageNum,
        totalPages,
        sourceType: 'curated_verified',
        lastVerifiedAt: '2026-10-24T00:00:00Z',
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/student-corner/scholarships
  router.get('/scholarships', optionalAuth, async (req, res, next) => {
    try {
      const { search, course, state, category, sort = 'deadline', page = '1', limit = '10' } = req.query;

      let items = [...VERIFIED_SCHOLARSHIPS];

      // Search
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        items = items.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.provider.toLowerCase().includes(q) ||
            s.targetGroup.toLowerCase().includes(q) ||
            s.eligibleCourses.some((c) => c.toLowerCase().includes(q))
        );
      }

      // Filter by course
      if (course && course !== 'all') {
        items = items.filter(
          (s) =>
            s.courseCategory === 'general' ||
            s.courseCategory === course ||
            s.eligibleCourses.some((c) => c.toLowerCase().includes(course.toLowerCase()))
        );
      }

      // Filter by state
      if (state && state !== 'all') {
        items = items.filter(
          (s) =>
            s.stateRestrictions === 'All India' ||
            s.stateRestrictions.toLowerCase().includes(state.toLowerCase())
        );
      }

      // Filter by category
      if (category && category !== 'all') {
        items = items.filter(
          (s) => s.courseCategory === category || s.targetGroup.toLowerCase().includes(category.toLowerCase())
        );
      }

      // Sort
      if (sort === 'deadline') {
        items.sort((a, b) => new Date(a.closingDate) - new Date(b.closingDate));
      } else if (sort === 'amount') {
        items.sort((a, b) => b.awardAmountNum - a.awardAmountNum);
      }

      // Attach bookmark status
      const userBookmarks = await getUserBookmarkSet(req.user?.id);
      items = items.map((s) => ({
        ...s,
        isBookmarked: userBookmarks.has(`scholarship:${s.id}`),
      }));

      // Pagination
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
      const total = items.length;
      const totalPages = Math.ceil(total / limitNum) || 1;
      const paginated = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({
        items: paginated,
        total,
        page: pageNum,
        totalPages,
        sourceType: 'curated_verified',
        lastVerifiedAt: '2026-10-24T00:00:00Z',
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/student-corner/scholarships/eligibility
  router.post(
    '/scholarships/eligibility',
    validateBody(eligibilitySchema),
    async (req, res, next) => {
      try {
        const { scholarshipId, course, studyYear, state, annualFamilyIncome, academicScore, gender } =
          req.body;

        const scholarship = VERIFIED_SCHOLARSHIPS.find((s) => s.id === scholarshipId);
        if (!scholarship) {
          throw new AppError(404, 'Scholarship not found');
        }

        const evaluation = evaluateScholarshipEligibility(scholarship, {
          course,
          studyYear,
          state,
          annualFamilyIncome,
          academicScore,
          gender,
        });

        res.json(evaluation);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/student-corner/offers
  router.get('/offers', optionalAuth, async (req, res, next) => {
    try {
      const { search, category, sort = 'default', page = '1', limit = '10' } = req.query;

      let items = [...VERIFIED_OFFERS];

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        items = items.filter(
          (o) =>
            o.title.toLowerCase().includes(q) ||
            o.provider.toLowerCase().includes(q) ||
            o.discount.toLowerCase().includes(q) ||
            (o.promoCode && o.promoCode.toLowerCase().includes(q))
        );
      }

      if (category && category !== 'all') {
        items = items.filter((o) => o.category === category);
      }

      if (sort === 'expiry') {
        items.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      }

      const userBookmarks = await getUserBookmarkSet(req.user?.id);
      items = items.map((o) => ({
        ...o,
        isBookmarked: userBookmarks.has(`offer:${o.id}`),
      }));

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
      const total = items.length;
      const totalPages = Math.ceil(total / limitNum) || 1;
      const paginated = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({
        items: paginated,
        total,
        page: pageNum,
        totalPages,
        sourceType: 'curated_verified',
        lastVerifiedAt: '2026-10-24T00:00:00Z',
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/student-corner/bookmarks - list user's bookmarked opportunities
  router.get('/bookmarks', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { rows } = await pool.query(
        'SELECT item_type, item_id, created_at FROM user_bookmarks WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );

      // Hydrate bookmarked items
      const internships = [];
      const scholarships = [];
      const offers = [];

      for (const row of rows) {
        if (row.item_type === 'internship') {
          const item = VERIFIED_INTERNSHIPS.find((i) => i.id === row.item_id);
          if (item) internships.push({ ...item, isBookmarked: true, bookmarkedAt: row.created_at });
        } else if (row.item_type === 'scholarship') {
          const item = VERIFIED_SCHOLARSHIPS.find((s) => s.id === row.item_id);
          if (item) scholarships.push({ ...item, isBookmarked: true, bookmarkedAt: row.created_at });
        } else if (row.item_type === 'offer') {
          const item = VERIFIED_OFFERS.find((o) => o.id === row.item_id);
          if (item) offers.push({ ...item, isBookmarked: true, bookmarkedAt: row.created_at });
        }
      }

      res.json({
        bookmarks: {
          internships,
          scholarships,
          offers,
        },
        total: rows.length,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/student-corner/bookmarks/toggle - add or remove bookmark
  router.post(
    '/bookmarks/toggle',
    requireAuth,
    validateBody(toggleBookmarkSchema),
    async (req, res, next) => {
      try {
        const userId = req.user.id;
        const { itemType, itemId } = req.body;

        const checkRes = await pool.query(
          'SELECT 1 FROM user_bookmarks WHERE user_id = $1 AND item_type = $2 AND item_id = $3',
          [userId, itemType, itemId]
        );

        if (checkRes.rows.length > 0) {
          await pool.query(
            'DELETE FROM user_bookmarks WHERE user_id = $1 AND item_type = $2 AND item_id = $3',
            [userId, itemType, itemId]
          );
          return res.json({ bookmarked: false, itemType, itemId });
        } else {
          await pool.query(
            'INSERT INTO user_bookmarks (user_id, item_type, item_id) VALUES ($1, $2, $3)',
            [userId, itemType, itemId]
          );
          return res.json({ bookmarked: true, itemType, itemId });
        }
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createStudentCornerRouter };
