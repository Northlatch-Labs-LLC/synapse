import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { attachRedisErrorListener } from "./error-listener.js"

type CapturedLine = { obj: Record<string, unknown>; msg: string }

function fakeClient(status = "reconnecting") {
  const client = new EventEmitter() as EventEmitter & { status: string }
  client.status = status
  return client
}

function capturingLogger(): {
  log: { warn: (obj: Record<string, unknown>, msg: string) => void }
  lines: CapturedLine[]
} {
  const lines: CapturedLine[] = []
  return {
    lines,
    log: {
      warn: (obj, msg) => {
        lines.push({ obj, msg })
      },
    },
  }
}

test("redis outage storm is throttled to one warn per window (issue #4)", () => {
  const client = fakeClient()
  const { log, lines } = capturingLogger()
  let clock = 1_000
  attachRedisErrorListener(client, {
    label: "redis:sub",
    log,
    now: () => clock,
    throttleMs: 30_000,
  })

  // An outage: ioredis retries on a ~1s backoff; each failed attempt emits
  // `error`. Ten emissions inside one window → exactly ONE warn.
  for (let i = 0; i < 10; i++) {
    clock += 1_000
    client.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6379"))
  }
  assert.equal(lines.length, 1)
  assert.equal(lines[0].obj.client, "redis:sub")
  assert.equal(lines[0].obj.status, "reconnecting")
  assert.match(lines[0].msg, /redis connection error/)

  // Still down past the window → the next failure logs again (exactly once
  // for the new window).
  clock += 31_000
  client.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6379"))
  client.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6379"))
  assert.equal(lines.length, 2)
})

test("each client label throttles independently", () => {
  const a = fakeClient()
  const b = fakeClient()
  const { log, lines } = capturingLogger()
  let clock = 0
  for (const [client, label] of [
    [a, "redis:sub"],
    [b, "redis:pub"],
  ] as const) {
    attachRedisErrorListener(client, { label, log, now: () => clock })
  }
  clock = 5_000
  a.emit("error", new Error("ECONNREFUSED"))
  b.emit("error", new Error("ECONNREFUSED"))
  assert.deepEqual(
    lines.map((l) => l.obj.client),
    ["redis:sub", "redis:pub"]
  )
})
