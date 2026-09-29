import type { Pool } from "pg"

/**
 * Structural logger surface this helper needs. Declared locally (not the pino
 * type) so the unit test can pass a plain capturing object without spinning
 * the real logger/telemetry graph.
 */
export type PoolErrorLogger = {
  error: (obj: Record<string, unknown>, msg: string) => void
}

/**
 * Contain pool-level client errors so a postgres blip never escalates to a
 * process death (issue #4).
 *
 * Mechanism: when a pooled client's TCP connection dies while IDLE (postgres
 * restart, network hiccup, failover), pg emits `error` on the Pool itself —
 * there is no query/await to reject into. With no listener, Node treats it as
 * an uncaughtException and the whole API exits. With this listener the event
 * is logged and contained: pg discards the dead client and establishes a
 * fresh connection on the next acquire, so the pool self-heals. In-flight
 * queries are unaffected — they reject through their own call sites.
 *
 * This is the RECOVERABLE tier of the process error policy; the
 * uncaughtException handler in instrumentation.ts stays as the backstop for
 * everything else.
 */
export function attachPoolErrorHandler(pool: Pool, log: PoolErrorLogger): void {
  pool.on("error", (err: Error) => {
    log.error(
      { err },
      "postgres pool client error — recoverable, pool will reconnect on next use"
    )
  })
}
