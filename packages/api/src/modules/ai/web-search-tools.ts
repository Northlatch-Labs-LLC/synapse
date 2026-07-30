// search_web — the built-in web-search actor tool, backed by the
// modules/web-search provider abstraction (WEB_SEARCH_PROVIDER, default
// "none"). The tool is HIDDEN via resolve() whenever no provider is
// configured, mirroring the provider modules' opt-in posture.
//
// Naming: deliberately NOT "web_search" — that is the Anthropic
// provider-native server-tool name (MODEL_SERVER_TOOL.WEB_SEARCH); a
// same-named callable would trip the server-tool collision invariant in the
// agent loop when a model candidate enables native search.

import { textBlocks, type ToolDefinition } from "@synapse/shared"
import {
  searchWeb,
  resolveWebSearchProvider,
  WEB_SEARCH_RECENCIES,
  type WebSearchRecency,
} from "../web-search/index.js"
import { registerToolPlugin } from "./tool-plugins.js"
import { throwInternalToolError, throwToolError } from "./tool-errors.js"

/**
 * Input codec — tool arguments arrive RAW from the model (build-tools passes
 * no validate fn; Synapse validates tool input itself, like every sibling
 * codec in session-tools-input-codec.ts). Exported for tests.
 */
export function parseSearchWebToolInput(input: unknown): {
  query: string
  count?: number
  recency?: WebSearchRecency
} {
  const record = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >

  const query = typeof record.query === "string" ? record.query.trim() : ""
  if (!query) {
    throwToolError(
      "query must be a non-empty string — call again with search keywords"
    )
  }

  let count: number | undefined
  if (record.count !== undefined) {
    const parsed = parseInt(String(record.count), 10)
    if (Number.isFinite(parsed)) {
      count = Math.max(1, Math.min(20, parsed))
    }
  }

  const recency =
    typeof record.recency === "string" &&
    (WEB_SEARCH_RECENCIES as readonly string[]).includes(record.recency)
      ? (record.recency as WebSearchRecency)
      : undefined

  return {
    query,
    ...(count !== undefined ? { count } : {}),
    ...(recency ? { recency } : {}),
  }
}

const definition: ToolDefinition = {
  name: "search_web",
  description:
    "Search the public web. Returns a ranked list of results with title, URL, and a text " +
    "snippet per result. Use this for current events, recent developments, and facts that " +
    "may have changed since your training data; do not use it for stable knowledge you " +
    "already have. Keep queries concise.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query. Non-empty. Keep it concise (a few keywords or a short question); very long queries reduce result quality.",
      },
      count: {
        type: "integer",
        description: "Number of results to return, 1 to 20. Default 10.",
      },
      recency: {
        type: "string",
        enum: [...WEB_SEARCH_RECENCIES],
        description:
          "Restrict results to pages published within this window. Omit for no time restriction.",
      },
    },
    required: ["query"],
  },
}

export function registerWebSearchToolPlugins(): void {
  registerToolPlugin({
    name: "search_web",
    definition,
    // Hidden whenever no web-search provider is configured (the null provider's
    // isConfigured() is false) — the opt-in posture of the provider modules.
    resolve: () => ({
      active: resolveWebSearchProvider().isConfigured(),
      definition,
    }),
    execute: async (input) => {
      const { query, count, recency } = parseSearchWebToolInput(input)

      const result = await searchWeb({ query, count, recency })

      if (!result.ok) {
        // THROW (never return bare isError) so metadata.toolError carries the
        // kind/retryable classification the turn loop consumes: retryable →
        // model_actionable (the model may retry), terminal (bad key / plan
        // limit / vendor business error) → internal so the do-not-retry system
        // notice suppresses retry loops.
        if (result.retryable) {
          throwToolError(`Web search failed: ${result.error}`, {
            retryable: true,
            code: "web_search_failed",
          })
        }
        throwInternalToolError(`Web search failed: ${result.error}`, {
          code: "web_search_failed",
        })
      }

      // Compact machine-readable sidecar for the presentation layer rides in
      // metadata (→ tool_results.metadata.toolMeta). Deliberately NOT
      // structuredContent: the to-model pipeline appends structuredContent as
      // a <structured_content> JSON suffix, which would double every result in
      // the context window on every subsequent turn.
      const meta = {
        webSearch: {
          provider: result.provider,
          resultCount: result.results.length,
        },
      }

      if (result.results.length === 0) {
        return {
          content: textBlocks("No results found for this query."),
          metadata: meta,
        }
      }

      const sections = result.results.map((item, index) =>
        [
          `[${index + 1}] ${item.title}`,
          `URL: ${item.url}`,
          item.siteName ? `Site: ${item.siteName}` : null,
          item.publishedAt ? `Published: ${item.publishedAt}` : null,
          item.source ? `Engine: ${item.source}` : null,
          item.snippet ? `Snippet: ${item.snippet}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      )

      return {
        content: textBlocks(
          `Search results (provider: ${result.provider}):\n\n${sections.join("\n\n")}`
        ),
        metadata: meta,
      }
    },
  })
}
