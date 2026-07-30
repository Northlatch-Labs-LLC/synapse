// Web-search facade — the function the api core (the search_web actor tool)
// calls to search the public web.
//
// Owns: the input gate + count clamp, an LRU single-flight cache, the defensive
// result-count slice, and the never-reject guarantee. Mirrors
// modules/document-extraction/index.ts.
//
// Cache policy: cache successes AND deterministic (non-retryable) failures for
// 10 minutes; NEVER persist a transient (retryable) failure. The LRU is a
// per-process, 200-entry, restart-wiped request COALESCER: agent loops repeat
// identical queries within a session and paid providers bill per call. It is
// process-wide, i.e. results are shared across users/sessions/workspaces —
// DELIBERATE and acceptable: inputs are public-web queries, outputs are
// public-web results. Keys embed sha256(query), never the raw query, so
// PII-bearing query text does not sit in map keys or key-level debug output.

import { createHash } from "node:crypto"
import { LRUCache } from "lru-cache"
import { createLogger } from "../../infrastructure/logger/index.js"
import { resolveWebSearchProvider } from "./registry.js"
import { WEB_SEARCH_RECENCIES } from "./types.js"
import type {
  SearchWebInput,
  WebSearchProvider,
  WebSearchRecency,
  WebSearchResult,
} from "./types.js"

const log = createLogger("websearch.facade")

/** Facade-wide result-count ceiling (also the search_web tool's documented cap). */
export const WEB_SEARCH_MAX_COUNT = 20
const DEFAULT_COUNT = 10

const cache = new LRUCache<string, Promise<WebSearchResult>>({
  max: 200,
  ttl: 10 * 60 * 1000, // 10 min — short enough for freshness
})

function failResult(
  provider: WebSearchProvider,
  error: string,
  retryable: boolean
): WebSearchResult {
  return {
    ok: false,
    provider: provider.key,
    engineVersion: provider.engineVersion,
    retryable,
    error,
  }
}

function clampCount(provider: WebSearchProvider, count: number | undefined) {
  const ceiling = Math.max(
    1,
    Math.min(WEB_SEARCH_MAX_COUNT, provider.maxCount || WEB_SEARCH_MAX_COUNT)
  )
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return Math.min(DEFAULT_COUNT, ceiling)
  }
  return Math.max(1, Math.min(ceiling, Math.floor(count)))
}

async function runSearch(
  provider: WebSearchProvider,
  query: string,
  count: number,
  recency: SearchWebInput["recency"]
): Promise<WebSearchResult> {
  try {
    const result = await provider.search({
      query,
      count,
      ...(recency ? { recency } : {}),
    })
    // Adapters contract to return ≤ count items; enforce it once, centrally.
    if (result.ok && result.results.length > count) {
      return { ...result, results: result.results.slice(0, count) }
    }
    return result
  } catch (err) {
    // Adapters must never reject; enforce it at the facade boundary too.
    log.error(
      { err, provider: provider.key },
      "web-search provider threw (contract violation)"
    )
    return failResult(
      provider,
      err instanceof Error ? err.message : "web-search provider threw",
      true
    )
  }
}

/** Search the public web. Always resolves (never rejects). */
export async function searchWeb(
  input: SearchWebInput
): Promise<WebSearchResult> {
  const provider = resolveWebSearchProvider()

  const query = typeof input.query === "string" ? input.query.trim() : ""
  if (!query) {
    return failResult(
      provider,
      "query must be a non-empty string — call again with search keywords",
      false
    )
  }
  const count = clampCount(provider, input.count)
  // Re-gate recency (the facade trusts NO caller): out-of-enum values are
  // dropped rather than forwarded into vendor request bodies.
  const recency: WebSearchRecency | undefined =
    typeof input.recency === "string" &&
    (WEB_SEARCH_RECENCIES as readonly string[]).includes(input.recency)
      ? input.recency
      : undefined

  const queryHash = createHash("sha256").update(query).digest("hex")
  const cacheKey = `${provider.key}:${provider.engineVersion}:${count}:${recency ?? "-"}:${queryHash}`

  const cached = cache.get(cacheKey)
  if (cached) return cached

  log.info(
    { provider: provider.key, queryLength: query.length, queryHash, count },
    "web search"
  )
  log.debug({ query }, "web search query")

  const pending = runSearch(provider, query, count, recency)
  cache.set(cacheKey, pending)

  const result = await pending
  // Evict transient failures so the next caller retries. Compare-and-delete:
  // only evict OUR entry, never a concurrent caller's freshly repopulated one.
  if (!result.ok && result.retryable && cache.get(cacheKey) === pending) {
    cache.delete(cacheKey)
  }
  return result
}

export {
  resolveWebSearchProvider,
  selectWebSearchProvider,
} from "./registry.js"
export { WEB_SEARCH_RECENCIES } from "./types.js"
export type {
  SearchWebInput,
  WebSearchProvider,
  WebSearchProviderRequest,
  WebSearchRecency,
  WebSearchResult,
  WebSearchResultItem,
} from "./types.js"
