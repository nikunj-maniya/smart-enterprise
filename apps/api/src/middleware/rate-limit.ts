import rateLimit from 'express-rate-limit';

/** Coarse defense-in-depth limiter applied to every route. */
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Tighter limiter for unauthenticated, abuse-prone endpoints (login, password reset, public
 *  self-registration) — the paths credential-stuffing and scraping actually target. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
