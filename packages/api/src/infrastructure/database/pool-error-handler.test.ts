import test from "node:test"
import assert from "node:assert/strict"
import pg from "pg"
import { attachPoolErrorHandler } from "./pool-error-handler.js"

type CapturedLine = { obj: Record<string, unknown>; msg: string }

function capturingLogger(): {
  log: { error: (obj: Record<string, unknown>, msg: string) => void }
  lines: CapturedLine[]
} {
  const lines: CapturedLine[] = []
  return {
    lines,
    log: {
      error: (obj, msg) => {
        lines.push({ obj, msg })
      },
    },
  }
}

// The exact failure signature from issue #4's evidence: pg emits
// "Connection terminated unexpectedly" on the POOL when an idle client's
// connection dies (postgres restart under the API). These tests pin the
// mechanism without a live postgres: emitting `error` on a real pg.Pool is
// byte-for-byte the same code path the library uses.
test("pool without the handler turns an idle-client error into an uncaughtException (regression red)", () => {
  const bare = new pg.Pool({
    // High closed port: the pool is never asked to connect; it exists only
    // as the EventEmitter whose `error` emission we exercise.
    connectionString: "postgresql://127.0.0.1:9/db",
    max: 1,
  })
  assert.throws(
    () => bare.emit("error", new Error("Connection terminated unexpectedly")),
    /Unhandled 'error' event|Connection terminated unexpectedly/
  )
  void bare.end().catch(() => {})
})

test("pool with the handler contains the error: logged once, no throw, listener survives (issue #4)", () => {
  const { log, lines } = capturingLogger()
  const pool = new pg.Pool({
    connectionString: "postgresql://127.0.0.1:9/db",
    max: 1,
  })
  attachPoolErrorHandler(pool, log)

  // Same emission that killed the process before the fix: must NOT throw.
  pool.emit("error", new Error("Connection terminated unexpectedly"))

  assert.equal(lines.length, 1)
  assert.match(lines[0].msg, /recoverable/)
  assert.ok(lines[0].obj.err instanceof Error)

  // Repeated blips (multiple idle clients dying in the same outage) each get
  // their own contained line — a storm must not re-open the hole.
  pool.emit("error", new Error("Connection terminated unexpectedly"))
  assert.equal(lines.length, 2)

  void pool.end().catch(() => {})
})
