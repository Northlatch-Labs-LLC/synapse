// serper provider — google.serper.dev SERP relay (X-API-KEY). The cheapest
// path to Google-grade CJK relevance for overseas deployments.
//
// v1 maps `organic` results only; answerBox / knowledgeGraph / peopleAlsoAsk
// are documented later enhancements. Note num>10 bills 2 credits per call
// (.env.example carries the note).

import { parseJsonObject } from "@synapse/shared"
import { config } from "../../../config/index.js"
import { createLogger } from "../../../infrastructure/logger/index.js"
import { webSearchFetch } from "../websearch-fetch.js"
import type {
  WebSearchProvider,
  WebSearchProviderRequest,
  WebSearchRecency,
  WebSearchResult,
  WebSearchResultItem,
} from "../types.js"

const log = createLogger("websearch.serper")

const KEY = "serper"
const MAX_COUNT = 20
const ENGINE_VERSION = "google-serper"

const RECENCY_TO_TBS: Record<WebSearchRecency, string> = {
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
}

function fail(retryable: boolean, error: string): WebSearchResult {
  return {
    ok: false,
    provider: KEY,
    engineVersion: ENGINE_VERSION,
    retryable,
    error,
  }
}

async function search(req: WebSearchProviderRequest): Promise<WebSearchResult> {
  const cfg = config.webSearch.serper
  if (!cfg.apiKey) {
    return fail(false, "serper API key is not configured")
  }
  let endpoint: string
  try {
    endpoint = new URL(
      "search",
      cfg.baseUrl.endsWith("/") ? cfg.baseUrl : `${cfg.baseUrl}/`
    ).toString()
  } catch {
    return fail(
      false,
      "invalid serper base URL (check WEBSEARCH_SERPER_BASE_URL)"
    )
  }

  const body: Record<string, unknown> = {
    q: req.query,
    num: req.count,
  }
  if (cfg.gl) body.gl = cfg.gl
  if (cfg.hl) body.hl = cfg.hl
  if (req.recency) body.tbs = RECENCY_TO_TBS[req.recency]

  try {
    const response = await webSearchFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })

    if (response.status === 401 || response.status === 403) {
      return fail(
        false,
        `serper rejected the API key (HTTP ${response.status})`
      )
    }
    if (response.status === 429) {
      return fail(true, "serper rate-limited the request (HTTP 429)")
    }
    if (!response.ok) {
      return fail(
        response.status >= 500,
        `serper returned HTTP ${response.status}`
      )
    }

    const data = parseJsonObject(await response.text())
    // Malformed-success guard: serper echoes searchParameters on every real
    // response; a 2xx body with NEITHER organic nor searchParameters is a
    // terminal decode error, never an ok-empty the facade would cache.
    if (!Array.isArray(data.organic) && data.searchParameters === undefined) {
      return fail(false, "serper returned a malformed response")
    }
    const organic = Array.isArray(data.organic) ? data.organic : []
    const items: WebSearchResultItem[] = []
    for (const raw of organic) {
      if (items.length >= req.count) break
      if (!raw || typeof raw !== "object") continue
      const entry = raw as Record<string, unknown>
      if (typeof entry.link !== "string" || typeof entry.title !== "string") {
        continue
      }
      items.push({
        title: entry.title,
        url: entry.link,
        snippet: typeof entry.snippet === "string" ? entry.snippet : "",
        ...(typeof entry.date === "string" && entry.date
          ? { publishedAt: entry.date }
          : {}),
      })
    }

    return {
      ok: true,
      provider: KEY,
      engineVersion: ENGINE_VERSION,
      results: items,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn({ err }, "serper search request failed")
    return fail(true, `serper request failed: ${message}`)
  }
}

export const serperWebSearchProvider: WebSearchProvider = {
  key: KEY,
  engineVersion: ENGINE_VERSION,
  maxCount: MAX_COUNT,
  isConfigured: () => Boolean(config.webSearch.serper.apiKey),
  search,
}
