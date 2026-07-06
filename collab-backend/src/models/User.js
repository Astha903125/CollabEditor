const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true,
    trim: true, minlength: 3, maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/  // alphanumeric + underscore only
  },
  email: {
    type: String, required: true, unique: true,
    lowercase: true, trim: true
  },
  password:  { type: String, required: true, minlength: 6 },
  color:     { type: String, default: '#6366f1' },  // avatar color
  createdAt: { type: Date, default: Date.now }
})

// Runs BEFORE every .save() — automatic, you never call this manually
// Why async without next()? Newer Mongoose waits for the promise automatically.
// If you use async function(next) and call next(), you get "next is not a function"
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  // genSalt(10) = 2^10 = 1024 iterations
  // Higher = slower hash = harder to brute-force
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

// Instance method available on every fetched User document
// bcrypt.compare extracts salt from stored hash, hashes candidate with same salt, compares
// You can't do string comparison because same password hashed twice = different hash (different salt)
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password)
}

module.exports = mongoose.model('User', userSchema)
