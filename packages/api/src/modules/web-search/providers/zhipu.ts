// zhipu provider — BigModel web_search API (the house engine; wire shape proven
// by the z-ai builtin plugin, packages/api/src/modules/mcp-plugins/builtin/
// z-ai/toolkit/search.ts — deliberately NOT imported: the plugin plane reads
// per-workspace config, this provider plane reads operator env).
//
// Vendor peculiarities encoded here:
//   - search_pro_quark does NOT support count → omit the field for quark;
//   - search_pro_sogou only accepts count in {10,20,30,40,50} → round UP;
//   - business error codes ride inside HTTP-4xx bodies and take PRECEDENCE
//     over the generic status classification: 1701 (web-search concurrency
//     cap) and the platform transient-rate codes 1302/1303/1305 are
//     retryable; 1703 = no valid data (empty SUCCESS); anything else (incl.
//     the 1304/1308/1310 quota caps) is a terminal error carrying the raw
//     code;
//   - the unconditional slice to req.count covers quark/sogou over-returns.

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

const log = createLogger("websearch.zhipu")

const KEY = "zhipu"
const MAX_COUNT = 50

const RECENCY_TO_FILTER: Record<WebSearchRecency, string> = {
  day: "oneDay",
  week: "oneWeek",
  month: "oneMonth",
  year: "oneYear",
}

// Transient signals worth retrying: 1701 web-search concurrency cap, plus the
// platform rate codes (1302 concurrency, 1303 frequency, 1305 flow limit —
// same taxonomy as mcp-plugins zhipu-errors.ts). Quota-cap codes (1304 etc.)
// stay terminal: retrying cannot help within a turn and caching is correct.
const RETRYABLE_BUSINESS_CODES = new Set(["1701", "1302", "1303", "1305"])
// Codes recognized even when the body carries no error object/message (a bare
// {"code":"1703"} must still map to its semantic, not fall through to ok-empty).
const KNOWN_BUSINESS_CODES = new Set([...RETRYABLE_BUSINESS_CODES, "1703"])

function fail(retryable: boolean, error: string): WebSearchResult {
  return {
    ok: false,
    provider: KEY,
    engineVersion: config.webSearch.zhipu.searchEngine,
    retryable,
    error,
  }
}

/** {error:{code,message}} | {code,msg} → normalized {code,message}, else undefined. */
function extractBusinessError(
  data: Record<string, unknown>
): { code: string; message: string } | undefined {
  const errObj =
    data.error && typeof data.error === "object"
      ? (data.error as Record<string, unknown>)
      : undefined
  const rawCode = errObj?.code ?? data.code
  if (rawCode === undefined || rawCode === null || rawCode === "") {
    return undefined
  }
  const code = String(rawCode)
  // A code-200-style success envelope must never be misread as an error.
  if (code === "200") return undefined
  // Otherwise treat a code as an error when an error object or message
  // accompanies it, OR when it is a known business code (a bare
  // {"code":"1703"} still carries its semantic).
  const message =
    (typeof errObj?.message === "string" && errObj.message) ||
    (typeof data.msg === "string" && data.msg) ||
    ""
  if (!errObj && !message && !KNOWN_BUSINESS_CODES.has(code)) return undefined
  return { code, message }
}

async function search(req: WebSearchProviderRequest): Promise<WebSearchResult> {
  const cfg = config.webSearch.zhipu
  if (!cfg.apiKey) {
    return fail(false, "zhipu web-search API key is not configured")
  }

  let endpoint: string
  try {
    endpoint = new URL(
      "web_search",
      cfg.baseUrl.endsWith("/") ? cfg.baseUrl : `${cfg.baseUrl}/`
    ).toString()
  } catch {
    return fail(
      false,
      "invalid zhipu base URL (check WEBSEARCH_ZHIPU_BASE_URL)"
    )
  }

  const body: Record<string, unknown> = {
    search_query: req.query,
    search_engine: cfg.searchEngine,
    search_intent: false,
  }
  if (cfg.searchEngine === "search_pro_sogou") {
    // Sogou accepts only multiples of 10 (10..50); round up, slice below.
    body.count = Math.min(50, Math.ceil(req.count / 10) * 10)
  } else if (cfg.searchEngine !== "search_pro_quark") {
    // Quark does not support count at all — omit the field entirely.
    body.count = req.count
  }
  if (req.recency) body.search_recency_filter = RECENCY_TO_FILTER[req.recency]

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

    const data = parseJsonObject(await response.text())

    // Business-code mapping takes precedence over HTTP status (codes arrive
    // inside 4xx bodies; 1703 under a 4xx must still be empty-success).
    const business = extractBusinessError(data)
    if (business?.code === "1703") {
      return {
        ok: true,
        provider: KEY,
        engineVersion: cfg.searchEngine,
        results: [],
      }
    }
    if (business && RETRYABLE_BUSINESS_CODES.has(business.code)) {
      const suffix = business.message ? `: ${business.message}` : ""
      return fail(
        true,
        `zhipu web-search transient limit (code ${business.code})${suffix}`
      )
    }
    if (business) {
      const suffix = business.message ? `: ${business.message}` : ""
      return fail(
        false,
        `zhipu web-search API error (code ${business.code})${suffix}`
      )
    }
    if (!response.ok) {
      return fail(
        response.status === 429 || response.status >= 500,
        `zhipu web-search API returned HTTP ${response.status}`
      )
    }
    // Malformed-success guard: a 2xx body with NO recognized envelope key
    // (proxy/CDN error page, vendor envelope change) must be a terminal decode
    // error, never an ok-empty that the facade would cache as a success.
    // NOTE search_result itself is OPTIONAL on genuine zero-hit successes.
    if (
      !("search_result" in data) &&
      !("search_intent" in data) &&
      !("id" in data) &&
      !("created" in data) &&
      !("request_id" in data)
    ) {
      return fail(false, "zhipu web-search returned a malformed response")
    }

    const rawResults = Array.isArray(data.search_result)
      ? data.search_result
      : []
    const items: WebSearchResultItem[] = []
    for (const raw of rawResults) {
      if (items.length >= req.count) break
      if (!raw || typeof raw !== "object") continue
      const entry = raw as Record<string, unknown>
      if (typeof entry.link !== "string" || typeof entry.title !== "string") {
        continue
      }
      items.push({
        title: entry.title,
        url: entry.link,
        snippet: typeof entry.content === "string" ? entry.content : "",
        ...(typeof entry.publish_date === "string" && entry.publish_date
          ? { publishedAt: entry.publish_date }
          : {}),
        ...(typeof entry.media === "string" && entry.media
          ? { siteName: entry.media }
          : {}),
      })
    }

    return {
      ok: true,
      provider: KEY,
      engineVersion: cfg.searchEngine,
      results: items,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn({ err }, "zhipu web-search request failed")
    return fail(true, `zhipu web-search request failed: ${message}`)
  }
}

export const zhipuWebSearchProvider: WebSearchProvider = {
  key: KEY,
  get engineVersion() {
    return config.webSearch.zhipu.searchEngine
  },
  maxCount: MAX_COUNT,
  isConfigured: () => Boolean(config.webSearch.zhipu.apiKey),
  search,
}
