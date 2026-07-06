const express           = require('express')
const { v4: uuidv4 }   = require('uuid')
const { body, validationResult } = require('express-validator')
const Room              = require('../models/Room')
const authenticateToken = require('../middleware/auth')
const logger            = require('../utils/logger')

const router = express.Router()

// All room routes require a valid JWT
router.use(authenticateToken)

function validate(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })
  next()
}

// ── POST /api/rooms/create ───────────────────────────────────────────────────
router.post('/create',
  [body('name').trim().isLength({ min: 1, max: 60 }).withMessage('Room name required')],
  validate,
  async (req, res) => {
    try {
      const { name, language, isPublic } = req.body

      const room = new Room({
        name,
        // uuidv4() generates a random v4 UUID: "a3f5c2d1-8b4e-4f3a-9c2d-..."
        // Random + unguessable = safe to share as a join link
        roomId: uuidv4(),
        owner: req.user.userId,
        members: [req.user.userId],
        language: language || 'javascript',
        isPublic: isPublic || false,
      })

      await room.save()
      logger.info('Room created', { roomId: room.roomId, owner: req.user.username })
      res.status(201).json({ room })
    } catch (err) {
      logger.error('Create room error', { error: err.message })
      res.status(500).json({ error: 'Server error' })
    }
  }
)

// ── POST /api/rooms/join ─────────────────────────────────────────────────────
router.post('/join',
  [body('roomId').trim().notEmpty().withMessage('Room ID required')],
  validate,
  async (req, res) => {
    try {
      const { roomId } = req.body

      const room = await Room.findOne({ roomId })
      if (!room) return res.status(404).json({ error: 'Room not found' })

      // Add to members if not already there — avoids duplicates
      if (!room.members.includes(req.user.userId)) {
        room.members.push(req.user.userId)
        await room.save()
      }

      res.json({ room })
    } catch (err) {
      res.status(500).json({ error: 'Server error' })
    }
  }
)

// ── GET /api/rooms/:roomId ───────────────────────────────────────────────────
router.get('/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
      // .populate() replaces ObjectId with actual document fields
      // Second arg 'username email' is projection — only return those fields, NOT password
      .populate('owner',   'username email color')
      .populate('members', 'username email color')

    if (!room) return res.status(404).json({ error: 'Room not found' })

    // Only members or public rooms are accessible
    const isMember = room.members.some(m => m._id.toString() === req.user.userId)
    if (!room.isPublic && !isMember) {
      return res.status(403).json({ error: 'Access denied' })
    }

    res.json({ room })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/rooms (my rooms) ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user.userId })
      .select('name roomId language updatedAt members')
      .sort({ updatedAt: -1 })
      .limit(20)
    res.json({ rooms })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/rooms/:roomId/snapshots ─────────────────────────────────────────
router.get('/:roomId/snapshots', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId }).select('snapshots')
    if (!room) return res.status(404).json({ error: 'Room not found' })
    res.json({ snapshots: room.snapshots })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
