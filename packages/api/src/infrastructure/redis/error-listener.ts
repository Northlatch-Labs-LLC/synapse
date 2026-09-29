/**
 * Structural surfaces this helper needs. Declared locally so the unit test
 * can pass a plain fake client + capturing logger without importing ioredis
 * or the config graph.
 */
export type RedisErrorClient = {
  on: (event: "error", listener: (err: unknown) => void) => unknown
  status?: unknown
}

export type RedisErrorLogger = {
  warn: (obj: Record<string, unknown>, msg: string) => void
}

export type ThrottledRedisErrorListenerOptions = {
  label: string
  log: RedisErrorLogger
  /** Injectable clock for tests. Default: Date.now. */
  now?: () => number
  /** Minimum ms between logged errors for one client. Default: 30s. */
  throttleMs?: number
}

/**
 * Attach a throttled `error` listener to an ioredis client (issue #4).
 *
 * ioredis reconnects on its own — with `maxRetriesPerRequest: null` queued
 * commands even wait out an outage instead of failing — so a redis blip is
 * survivable by design. But during the outage EVERY retry attempt emits
 * `error`, and with no listener ioredis prints its own
 * "[ioredis] Unhandled error event" line for each one: log flooding with no
 * domain tagging. This listener converts that to domain-tagged warns,
 * throttled to one per `throttleMs` window per client (the reconnect loop
 * keeps trying regardless — throttling only the LOGGING).
 */
export function attachRedisErrorListener(
  client: RedisErrorClient,
  options: ThrottledRedisErrorListenerOptions
): void {
  const { label, log } = options
  const now = options.now ?? Date.now
  const throttleMs = options.throttleMs ?? 30_000
  let lastLoggedAt = -Infinity
  client.on("error", (err) => {
    const at = now()
    if (at - lastLoggedAt < throttleMs) return
    lastLoggedAt = at
    log.warn(
      { err, client: label, status: client.status },
      "redis connection error — ioredis keeps retrying (throttled log)"
    )
  })
}
