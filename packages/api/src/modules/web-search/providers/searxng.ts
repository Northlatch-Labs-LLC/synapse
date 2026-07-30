// searxng provider — the self-hosted default engine. Speaks the stock SearXNG
// JSON API directly (GET /search?format=json); the sidecar is the unmodified
// official image, so THIS adapter owns the never-reject classification that
// the docextract-style FastAPI shims own elsewhere.
//
// Security posture (model-controlled query text):
//   - bang neutralization: leading "!"/"!!" tokens select engines or trigger
//     external-bang 302 redirects (which fire BEFORE format=json handling and
//     are not disableable server-side), so ASCII "!" runs are stripped from
//     token starts. Full-width "！" is untouched — CJK queries unaffected.
//   - redirect refusal: redirect:"manual" + an explicit 3xx/opaqueredirect
//     check makes any redirect a terminal failure instead of a server-side
//     follow of a model-steered URL.
//   - params go through url.searchParams.set() only — a query containing
//     "&format=csv" must not override operator params.

import { parseJsonObject } from "@synapse/shared"
import { config } from "../../../config/index.js"
import { createLogger } from "../../../infrastructure/logger/index.js"
import type {
  WebSearchProvider,
  WebSearchProviderRequest,
  WebSearchResult,
  WebSearchResultItem,
} from "../types.js"

const log = createLogger("websearch.searxng")

const KEY = "searxng"
const MAX_COUNT = 20

function engineVersion(): string {
  const engines = config.webSearch.searxng.engines
  return engines ? `searxng:${engines}` : "searxng"
}

/**
 * Strip SearXNG bang syntax from a model-controlled query: a leading run of
 * ASCII "!" on any whitespace-delimited token. The separator class must match
 * PYTHON's \s (SearXNG tokenizes with re.split(r'(\s+)')), which is wider
 * than ECMAScript \s by exactly FS/GS/RS/US (U+001C-001F) and NEL (U+0085) —
 * a bang smuggled behind one of those must not survive. Exported for tests.
 */
const PY_WHITESPACE_RUN = /([\s\u001c-\u001f\u0085]+)/
const PY_WHITESPACE_ONLY = /^[\s\u001c-\u001f\u0085]+$/

export function neutralizeSearxngBangs(query: string): string {
  return query
    .split(PY_WHITESPACE_RUN)
    .map((part) =>
      PY_WHITESPACE_ONLY.test(part) ? part : part.replace(/^!+/, "")
    )
    .join("")
    .trim()
}

function fail(retryable: boolean, error: string): WebSearchResult {
  return {
    ok: false,
    provider: KEY,
    engineVersion: engineVersion(),
    retryable,
    error,
  }
}

async function search(req: WebSearchProviderRequest): Promise<WebSearchResult> {
  const cfg = config.webSearch.searxng
  if (!cfg.url) {
    return fail(false, "searxng sidecar URL is not configured")
  }

  const query = neutralizeSearxngBangs(req.query)
  if (!query) {
    return fail(
      false,
      "query contained only SearXNG bang syntax — call again with plain search keywords"
    )
  }

  let endpoint: URL
  try {
    endpoint = new URL(
      "search",
      cfg.url.endsWith("/") ? cfg.url : `${cfg.url}/`
    )
  } catch {
    // Never embed the configured URL in the model-visible error (hygiene rule);
    // the operator finds the value in their env.
    return fail(
      false,
      "invalid searxng sidecar URL (check WEBSEARCH_SEARXNG_URL)"
    )
  }
  endpoint.searchParams.set("q", query)
  endpoint.searchParams.set("format", "json")
  endpoint.searchParams.set("pageno", "1")
  endpoint.searchParams.set("safesearch", cfg.safesearch)
  if (cfg.engines) {
    // Explicit engine list. Do NOT also send categories: SearXNG APPENDS the
    // category's engines on top of an explicit engines= list, which would
    // silently defeat the narrowing (e.g. mainland deployments would still fan
    // out to GFW-blocked engines).
    endpoint.searchParams.set("engines", cfg.engines)
  } else {
    endpoint.searchParams.set("categories", "general")
  }
  if (req.recency) endpoint.searchParams.set("time_range", req.recency)
  if (cfg.language) endpoint.searchParams.set("language", cfg.language)

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(cfg.timeoutMs),
      redirect: "manual",
    })

    if (
      response.type === "opaqueredirect" ||
      (response.status >= 300 && response.status < 400)
    ) {
      // A JSON search must never redirect; a redirect means bang-style engine
      // forwarding slipped through (or a misconfigured reverse proxy).
      return fail(false, "searxng responded with a redirect (refused)")
    }
    if (response.status === 403) {
      return fail(
        false,
        "searxng rejected the JSON request (HTTP 403) — enable the json format in settings.yml (search.formats: [html, json])"
      )
    }
    if (response.status === 429) {
      return fail(
        true,
        "searxng rate-limited the request (HTTP 429) — the bundled sidecar should run with limiter: false"
      )
    }
    if (!response.ok) {
      return fail(
        response.status >= 500,
        `searxng returned HTTP ${response.status}`
      )
    }

    const data = parseJsonObject(await response.text())
    if (!Array.isArray(data.results)) {
      return fail(false, "searxng returned a malformed JSON response")
    }

    const items: WebSearchResultItem[] = []
    for (const raw of data.results) {
      if (items.length >= req.count) break
      if (!raw || typeof raw !== "object") continue
      const entry = raw as Record<string, unknown>
      if (typeof entry.url !== "string" || typeof entry.title !== "string") {
        continue
      }
      items.push({
        title: entry.title,
        url: entry.url,
        snippet: typeof entry.content === "string" ? entry.content : "",
        ...(typeof entry.publishedDate === "string" && entry.publishedDate
          ? { publishedAt: entry.publishedDate }
          : {}),
        ...(typeof entry.engine === "string" && entry.engine
          ? { source: entry.engine }
          : {}),
      })
    }

    // Degraded-engines branch: zero results while upstream engines were
    // unresponsive is NOT "no results exist" — report a retryable failure so
    // (a) the model is not misled into answering from stale knowledge, and
    // (b) the facade's compare-and-delete eviction keeps it out of the LRU
    // (an ok-empty would be cached as a success for 10 minutes).
    const unresponsive = Array.isArray(data.unresponsive_engines)
      ? data.unresponsive_engines
          .filter((e): e is unknown[] => Array.isArray(e))
          .map((e) => {
            const name = typeof e[0] === "string" ? e[0] : "unknown"
            const reason = typeof e[1] === "string" ? e[1] : "error"
            return `${name} (${reason})`
          })
      : []
    if (items.length === 0 && unresponsive.length > 0) {
      return fail(
        true,
        `no results and ${unresponsive.length} search engine(s) were unresponsive: ` +
          `${unresponsive.join(", ")} — results may be unavailable rather than nonexistent`
      )
    }

    return {
      ok: true,
      provider: KEY,
      engineVersion: engineVersion(),
      results: items,
    }
  } catch (err) {
    // Network error / timeout / abort → transient, retryable.
    const message = err instanceof Error ? err.message : String(err)
    log.warn({ err }, "searxng search request failed")
    return fail(true, `searxng request failed: ${message}`)
  }
}

export const searxngWebSearchProvider: WebSearchProvider = {
  key: KEY,
  get engineVersion() {
    return engineVersion()
  },
  maxCount: MAX_COUNT,
  isConfigured: () => Boolean(config.webSearch.searxng.url),
  search,
}
