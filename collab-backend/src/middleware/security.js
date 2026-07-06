const rateLimit = require('express-rate-limit')
const helmet    = require('helmet')

/**
 * helmet() sets secure HTTP response headers automatically.
 * One line that prevents ~10 common vulnerabilities:
 *   - X-Frame-Options: DENY  → prevents clickjacking
 *   - X-XSS-Protection       → mitigates reflected XSS
 *   - X-Content-Type-Options → prevents MIME sniffing
 *   - Strict-Transport-Security → forces HTTPS
 *   - Content-Security-Policy → restricts resource loading origins
 */
const helmetMiddleware = helmet()

/**
 * Global rate limiter: 100 requests per IP per 15 minutes.
 * Prevents:
 *   - Thundering herd (many clients overwhelming the server)
 *   - Basic DDoS at the app layer
 *   - Scraping / enumeration attacks
 *
 * standardHeaders: true → sends RateLimit-* headers in response
 * so clients know when their limit resets
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Strict auth limiter: 5 attempts per IP per 15 minutes.
 * Brute force protection for login/register.
 * skipSuccessfulRequests: true → only counts failures
 * so legitimate users don't hit the wall just by logging in often.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, try again later' },
  skipSuccessfulRequests: true,
})

module.exports = { helmetMiddleware, globalLimiter, authLimiter }
