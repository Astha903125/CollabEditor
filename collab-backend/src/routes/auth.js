const express   = require('express')
const jwt       = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const User      = require('../models/User')
const logger    = require('../utils/logger')

const router = express.Router()

// ── Validation rule sets ─────────────────────────────────────────────────────
// express-validator runs these as middleware BEFORE the route handler.
// If any rule fails, errors accumulate in the request object.
// The `validate` function below reads them and short-circuits with a 400.

const registerRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be 3–20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, underscores'),
  body('email')
    .isEmail().withMessage('Invalid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
]

const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password required'),
]

function validate(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    })
  }
  next()
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', registerRules, validate, async (req, res) => {
  try {
    const { username, email, password } = req.body

    // Check for duplicate email OR username in one query
    // $or finds documents matching ANY of the conditions
    // Using one query instead of two separate ones
    const existing = await User.findOne({ $or: [{ email }, { username }] })
    if (existing) {
      // Deliberately vague — don't reveal which field exists (enumeration attack)
      return res.status(409).json({ error: 'Email or username already taken' })
    }

    // Password is hashed automatically by the pre('save') hook in User.js
    const user = new User({ username, email, password })
    await user.save()

    // Create JWT — three base64 parts: header.payload.signature
    // Payload is NOT encrypted — anyone can decode it. Never put secrets here.
    // The signature (HMAC-SHA256 of header+payload using JWT_SECRET) is what proves authenticity.
    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }  // auto-expires — limits damage from token theft
    )

    logger.info('User registered', { username, email })

    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email, color: user.color }
    })
  } catch (err) {
    logger.error('Register error', { error: err.message })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', loginRules, validate, async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })

    // IMPORTANT: same error message whether email doesn't exist OR password is wrong.
    // If you say "user not found" vs "wrong password", an attacker can enumerate
    // which emails have accounts (enumeration / user harvesting attack).
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const isMatch = await user.comparePassword(password)
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    logger.info('User logged in', { username: user.username })

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, color: user.color }
    })
  } catch (err) {
    logger.error('Login error', { error: err.message })
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
// Lets the client verify their stored token is still valid
const authenticateToken = require('../middleware/auth')
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password')
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
