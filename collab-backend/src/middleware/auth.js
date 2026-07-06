const jwt = require('jsonwebtoken')

/**
 * Middleware: verify JWT on every protected route
 *
 * Flow:
 *   Request → authenticateToken → route handler
 *             ↓ (if invalid)
 *             401/403 response (route handler never runs)
 *
 * The Authorization header format is: "Bearer eyJhbGc..."
 * We split on space and take index [1] to get just the token part.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  // 401 = "I don't know who you are" (no token at all)
  if (!token) return res.status(401).json({ error: 'No token provided' })

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    // 403 = "I know who you claim to be, but the proof is invalid/expired"
    if (err) return res.status(403).json({ error: 'Invalid or expired token' })

    // Attach decoded payload { userId, email, username } to request
    // Any route handler after this can use req.user without DB lookup
    req.user = decoded
    next()
  })
}

module.exports = authenticateToken
