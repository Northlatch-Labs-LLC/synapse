// Bing-SearchResponse-compatible adapter family → bocha + langsearch.
//
// Both vendors deliberately clone the retired Bing Web Search API envelope
// (POST /v1/web-search, Bearer; response {code, msg, data:{webPages:{value}}}),
// with near-identical request keys — one factory, two instances. Differences
// are the base URL, key, and the count ceiling (bocha 50, langsearch 10).
//
// Vendor notes:
//   - HTTP 200 with body code !== 200 is an error (body-level signalling);
//   - 401 invalid key / 403 insufficient balance (bocha: top up at
//     open.bochaai.com) / 429 rate limited (retryable);
//   - summary:true asks for the LLM-sized per-result summary field; the
//     mapper prefers summary over snippet;
//   - bocha officially recommends unrestricted freshness — recency-scoped
//     queries often legitimately return zero results (empty = success).

import { parseJsonObject } from "@synapse/shared"
import { createLogger } from "../../../infrastructure/logger/index.js"
import { webSearchFetch } from "../websearch-fetch.js"
import type {
  WebSearchProvider,
  WebSearchProviderRequest,
  WebSearchRecency,
  WebSearchResult,
  WebSearchResultItem,
} from "../types.js"

const RECENCY_TO_FRESHNESS: Record<WebSearchRecency, string> = {
  day: "oneDay",
  week: "oneWeek",
  month: "oneMonth",
  year: "oneYear",
}

export interface BingCompatibleOptions {
  readonly key: string
  readonly maxCount: number
  /** Read at call time so an unconfigured provider reports isConfigured()=false. */
  getBaseUrl(): string
  getApiKey(): string
  getTimeoutMs(): number
}

export function buildBingCompatibleWebSearchProvider(
  opts: BingCompatibleOptions
): WebSearchProvider {
  const log = createLogger("websearch.bing-compatible")

  function fail(retryable: boolean, error: string): WebSearchResult {
    return {
      ok: false,
      provider: opts.key,
      engineVersion: opts.key,
      retryable,
      error,
    }
  }

  function classifyHttp(status: number): WebSearchResult {
    if (status === 401) {
      return fail(false, `${opts.key} rejected the API key (HTTP 401)`)
    }
    if (status === 403) {
      return fail(
        false,
        `${opts.key} refused the request (HTTP 403) — usually insufficient account balance`
      )
    }
    if (status === 429) {
      return fail(true, `${opts.key} rate-limited the request (HTTP 429)`)
    }
    return fail(status >= 500, `${opts.key} returned HTTP ${status}`)
  }

  async function search(
    req: WebSearchProviderRequest
  ): Promise<WebSearchResult> {
    const apiKey = opts.getApiKey()
    if (!apiKey) {
      return fail(false, `${opts.key} web-search API key is not configured`)
    }
    const baseUrl = opts.getBaseUrl()
    let endpoint: string
    try {
      endpoint = new URL(
        "v1/web-search",
        baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
      ).toString()
    } catch {
      return fail(false, `invalid ${opts.key} base URL (check the env config)`)
    }

    const body: Record<string, unknown> = {
      query: req.query,
      summary: true,
      count: req.count,
    }
    if (req.recency) body.freshness = RECENCY_TO_FRESHNESS[req.recency]

    try {
      const response = await webSearchFetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.getTimeoutMs()),
      })

      if (!response.ok) return classifyHttp(response.status)

      const data = parseJsonObject(await response.text())
      // Malformed-success guard: both vendors always ship the envelope code;
      // a 2xx body without one (proxy/CDN error page) is a terminal decode
      // error, never an ok-empty the facade would cache as a success.
      if (typeof data.code !== "number" && typeof data.code !== "string") {
        return fail(false, `${opts.key} returned a malformed response`)
      }
      // Body-level signalling: HTTP 200 with code !== 200 is an error.
      const bodyCode = Number(data.code)
      if (bodyCode !== 200) {
        const msg = typeof data.msg === "string" && data.msg ? data.msg : ""
        const suffix = msg ? `: ${msg}` : ""
        // 429 and body-level 5xx are transient; other body codes terminal.
        if (bodyCode === 429 || bodyCode >= 500) {
          return fail(
            true,
            `${opts.key} web-search transient error (code ${bodyCode})${suffix}`
          )
        }
        return fail(
          false,
          `${opts.key} web-search API error (code ${bodyCode})${suffix}`
        )
      }

      const payload =
        data.data && typeof data.data === "object"
          ? (data.data as Record<string, unknown>)
          : {}
      const webPages =
        payload.webPages && typeof payload.webPages === "object"
          ? (payload.webPages as Record<string, unknown>)
          : {}
      // A code-200 body with no webPages.value is a legitimate zero-hit result.
      const rawValue = Array.isArray(webPages.value) ? webPages.value : []

      const items: WebSearchResultItem[] = []
      for (const raw of rawValue) {
        if (items.length >= req.count) break
        if (!raw || typeof raw !== "object") continue
        const entry = raw as Record<string, unknown>
        if (typeof entry.url !== "string" || typeof entry.name !== "string") {
          continue
        }
        const summary =
          typeof entry.summary === "string" && entry.summary
            ? entry.summary
            : undefined
        items.push({
          title: entry.name,
          url: entry.url,
          snippet:
            summary ?? (typeof entry.snippet === "string" ? entry.snippet : ""),
          ...(typeof entry.datePublished === "string" && entry.datePublished
            ? { publishedAt: entry.datePublished }
            : {}),
          ...(typeof entry.siteName === "string" && entry.siteName
            ? { siteName: entry.siteName }
            : {}),
        })
      }

      return {
        ok: true,
        provider: opts.key,
        engineVersion: opts.key,
        results: items,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn({ err, provider: opts.key }, "bing-compatible search failed")
      return fail(true, `${opts.key} web-search request failed: ${message}`)
    }
  }

  return {
    key: opts.key,
    engineVersion: opts.key,
    maxCount: opts.maxCount,
    isConfigured: () => Boolean(opts.getApiKey()),
    search,
  }
}
