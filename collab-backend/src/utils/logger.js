const winston = require('winston')
const path    = require('path')
const fs      = require('fs')

// Ensure logs/ directory exists
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir)

/**
 * Why structured JSON logs over console.log?
 *
 * console.log('User joined room abc123')  → just a string, unsearchable
 *
 * logger.info('User joined room', { userId, roomId })  → JSON object.
 * In production tools like Datadog / CloudWatch / Loki you can query:
 *   "show all logs where roomId = 'abc123'"
 *   "count errors grouped by error.message in last 1h"
 *
 * This is the difference between "I think something broke" and
 * "Error rate spiked 3x at 14:32, all from /api/rooms/join, MongoDB timeout"
 */
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',

  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),  // include stack trace on errors
    winston.format.json()
  ),

  transports: [
    // Console: human-readable in development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
          return `${timestamp} [${level}] ${message}${extra}`
        })
      )
    }),

    // File: errors only (persistent, for post-mortem analysis)
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,  // 10MB
      maxFiles: 5,                 // rotate, keep last 5 files
    }),

    // File: everything (for audit trail)
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
})

module.exports = logger
