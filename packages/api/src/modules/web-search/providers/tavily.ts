// tavily provider — api.tavily.com/search (Bearer), the de-facto agent-search
// standard for overseas deployments.
//
// Vendor notes:
//   - 432 (plan limit) / 433 (PAYG limit) are TERMINAL: retrying within a turn
//     cannot help; only 429 is the retryable rate signal;
//   - published_date is NOT in the documented general-topic response schema
//     (news-topic-only in practice) — decoded as optional pass-through, expect
//     it absent;
//   - answer synthesis (include_answer) and raw page content
//     (include_raw_content) are deliberately off in v1.

import { parseJsonObject } from "@synapse/shared"
import { config } from "../../../config/index.js"
import { createLogger } from "../../../infrastructure/logger/index.js"
import { webSearchFetch } from "../websearch-fetch.js"
import type {
  WebSearchProvider,
  WebSearchProviderRequest,
  WebSearchResult,
  WebSearchResultItem,
} from "../types.js"

const log = createLogger("websearch.tavily")

const KEY = "tavily"
const MAX_COUNT = 20

function engineVersion(): string {
  return `tavily:${config.webSearch.tavily.searchDepth}`
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
  const cfg = config.webSearch.tavily
  if (!cfg.apiKey) {
    return fail(false, "tavily API key is not configured")
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
      "invalid tavily base URL (check WEBSEARCH_TAVILY_BASE_URL)"
    )
  }

  const body: Record<string, unknown> = {
    query: req.query,
    max_results: req.count,
    search_depth: cfg.searchDepth,
    include_answer: false,
    include_raw_content: false,
  }
  if (req.recency) body.time_range = req.recency

  try {
    const response = await webSearchFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })

    if (response.status === 401) {
      return fail(false, "tavily rejected the API key (HTTP 401)")
    }
    if (response.status === 429) {
      return fail(true, "tavily rate-limited the request (HTTP 429)")
    }
    if (response.status === 432 || response.status === 433) {
      return fail(
        false,
        `tavily plan/pay-as-you-go limit exceeded (HTTP ${response.status}) — raise the plan limit in the tavily dashboard`
      )
    }
    if (!response.ok) {
      return fail(
        response.status >= 500,
        `tavily returned HTTP ${response.status}`
      )
    }

    const data = parseJsonObject(await response.text())
    // Malformed-success guard: the documented schema always ships results[];
    // a 2xx body without it (proxy/CDN error page) is a terminal decode error,
    // never an ok-empty the facade would cache as a success.
    if (!Array.isArray(data.results)) {
      return fail(false, "tavily returned a malformed response")
    }
    const rawResults = data.results
    const items: WebSearchResultItem[] = []
    for (const raw of rawResults) {
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
        ...(typeof entry.published_date === "string" && entry.published_date
          ? { publishedAt: entry.published_date }
          : {}),
      })
    }

    return {
      ok: true,
      provider: KEY,
      engineVersion: engineVersion(),
      results: items,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn({ err }, "tavily search request failed")
    return fail(true, `tavily request failed: ${message}`)
  }
}

export const tavilyWebSearchProvider: WebSearchProvider = {
  key: KEY,
  get engineVersion() {
    return engineVersion()
  },
  maxCount: MAX_COUNT,
  isConfigured: () => Boolean(config.webSearch.tavily.apiKey),
  search,
}
