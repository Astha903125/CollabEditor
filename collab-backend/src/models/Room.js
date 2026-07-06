const mongoose = require('mongoose')

const snapshotSchema = new mongoose.Schema({
  label:     { type: String, required: true },
  content:   { type: String, required: true },
  author:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
})

const roomSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  roomId:   { type: String, required: true, unique: true },

  // ObjectId = MongoDB's foreign key equivalent
  // ref: 'User' enables .populate('owner') to replace ID with full User doc
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  language:  { type: String, default: 'javascript' },
  content:   { type: String, default: '// Start coding here\n' },
  snapshots: [snapshotSchema],  // version history
  isPublic:  { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

// Index for fast roomId lookups — this field is queried on every join
roomSchema.index({ roomId: 1 })

module.exports = mongoose.model('Room', roomSchema)
