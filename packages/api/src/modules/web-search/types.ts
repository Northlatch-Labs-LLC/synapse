// Web-search provider abstraction — types.
//
// The api core bundles NO search engine. This is the 6th sibling of the
// OCR / transcription / realtime-ASR / embedding / document-extraction
// provider abstractions: WEB_SEARCH_PROVIDER selects an out-of-process
// provider (the self-hosted SearXNG sidecar or a cloud vendor), default
// "none" => web search is disabled and the search_web actor tool is hidden.
//
// Request/response quartet style (facade + registry + adapters, never-reject,
// ok/retryable results) — NOT the asr session-factory style. Web *fetch*
// (URL → main content) is deliberately a SEPARATE future module, not a
// capability axis here.

/**
 * Facade input. NOT model-validated — the search_web tool layer has its own
 * input codec, and the facade re-gates everything anyway (non-tool callers
 * may appear later).
 */
export interface SearchWebInput {
  query: string
  /** Desired result count; the facade clamps to [1, min(20, provider.maxCount)]. */
  count?: number
  /** Restrict to pages published within this window; undefined = no limit. */
  recency?: WebSearchRecency
}

export const WEB_SEARCH_RECENCIES = ["day", "week", "month", "year"] as const
export type WebSearchRecency = (typeof WEB_SEARCH_RECENCIES)[number]

/** Normalized request handed to providers (post-gate, post-clamp). */
export interface WebSearchProviderRequest {
  query: string
  count: number
  recency?: WebSearchRecency
}

export interface WebSearchResultItem {
  title: string
  url: string
  /** Snippet or LLM-sized summary — the provider's best short text. */
  snippet: string
  /** Provider-supplied publish date, passed through verbatim when present. */
  publishedAt?: string
  /** Site/media label when the provider gives one. */
  siteName?: string
  /** Engine attribution (searxng: which upstream engine produced the hit). */
  source?: string
}

export type WebSearchResult =
  | {
      ok: true
      provider: string
      engineVersion: string
      results: WebSearchResultItem[]
    }
  | {
      ok: false
      provider: string
      engineVersion: string
      retryable: boolean
      error: string
    }

export interface WebSearchProvider {
  /** Registry key, e.g. "searxng". */
  readonly key: string
  /** Provenance label (adapter-specific, e.g. the zhipu engine variant). */
  readonly engineVersion: string
  /**
   * Vendor wire ceiling for the result count. Used only to clamp BELOW the
   * facade-wide cap of 20; values above 20 document the vendor ceiling and are
   * intentionally unreachable in v1.
   */
  readonly maxCount: number
  isConfigured(): boolean
  /**
   * MUST always resolve (never reject); ok:false + retryable on any error.
   * ok:true with results: [] is a legitimate outcome (query matched nothing).
   * MUST return at most req.count items — slice client-side when the vendor
   * over-returns (sogou round-up, searxng no-count-param, quark no-count).
   */
  search(req: WebSearchProviderRequest): Promise<WebSearchResult>
}
