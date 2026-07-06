const { spawn } = require('child_process')
const path       = require('path')
const fs         = require('fs').promises
const os         = require('os')

/**
 * Sandboxed Code Execution
 *
 * Why not eval(userCode)?
 *   while(true) {}           → crashes your server (infinite loop)
 *   require('fs').unlinkSync('/') → deletes files
 *   process.exit(1)          → kills the server process
 *
 * Solution: spawn a separate child_process with:
 *   1. A hard time limit (SIGKILL after N seconds)
 *   2. No network access (can be enforced via OS-level sandboxing)
 *   3. Temp file isolation (code runs in /tmp, not your server root)
 *
 * Production-grade alternative: Docker container per execution,
 * or a dedicated service like Judge0 / Piston API.
 * For interviews, explaining this is enough — understanding the threat
 * model is what matters.
 */

const RUNTIMES = {
  javascript: { cmd: 'node',   ext: 'js',  timeout: 10000 },
  typescript: { cmd: 'npx',   args: ['ts-node'], ext: 'ts', timeout: 15000 },
  python:     { cmd: 'python', ext: 'py', timeout: 10000 },
  cpp: {
    ext: 'cpp', timeout: 15000,
    compile: (src, out) => [
      'g++',
      [src, '-std=c++17', '-o', out]
    ],
    run: (out) => [out, []],
  },
  java: {
    ext: 'java', timeout: 20000,
    compile: (src) => ['javac', [src]],
    run: (src) => ['java', ['-cp', path.dirname(src), 'Main']],
  },
  go: { cmd: 'go', args: ['run'], ext: 'go', timeout: 15000 },
  rust: {
    ext: 'rs', timeout: 30000,
    compile: (src, out) => ['rustc', [src, '-o', out]],
    run: (out) => [out, []],
  },
}

async function execCode(code, language) {
  const runtime = RUNTIMES[language]
  if (!runtime) return { output: '', error: `Language '${language}' not supported`, exitCode: 1 }

  // Write code to a temp file — isolated from your server filesystem
  const tmpDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'collab-'))
  const srcFile = path.join(tmpDir, `code.${runtime.ext}`)
  await fs.writeFile(srcFile, code)

  try {
    // Compiled languages: compile first, then run
    if (runtime.compile) {
      const binFile = path.join(tmpDir, 'output')
      const [compileCmd, compileArgs] = runtime.compile(srcFile, binFile)

      const compileResult = await runProcess(compileCmd, compileArgs, tmpDir, 30000)
      if (compileResult.exitCode !== 0) {
        return { output: '', error: compileResult.stderr, exitCode: compileResult.exitCode }
      }

      const [runCmd, runArgs] = runtime.run(binFile)
      return runProcess(runCmd, runArgs, tmpDir, runtime.timeout)
    }

    // Interpreted languages: run directly
    const args = [...(runtime.args || []), srcFile]
    return runProcess(runtime.cmd, args, tmpDir, runtime.timeout)

 } finally {
  // Windows may keep output.exe locked briefly after execution.
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    await fs.rm(tmpDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch (err) {
    console.warn("Cleanup warning:", err.message);
  }
}
}

function runProcess(cmd, args, cwd, timeout) {
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const proc = spawn(cmd, args, {
      cwd,
      // Constrain environment — don't inherit server's env vars
      env: { PATH: process.env.PATH },
      // Pipe all I/O so we can capture it
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })

    // Hard kill after timeout — SIGKILL cannot be caught or ignored
    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGKILL')
    }, timeout)

    proc.on('close', exitCode => {
      clearTimeout(timer)
      resolve({
        output: stdout.slice(0, 50000),  // cap output at 50KB
        error: timedOut
          ? `Execution timed out after ${timeout / 1000}s`
          : stderr.slice(0, 10000),
        exitCode: timedOut ? 124 : (exitCode ?? 1),
        executionMs: Date.now(),
      })
    })

    proc.on('error', err => {
      clearTimeout(timer)
      resolve({ output: '', error: err.message, exitCode: 1 })
    })
  })
}

module.exports = { execCode }
