// Web-search provider registry — selects the active adapter from
// config.webSearch.provider. The api core never imports a concrete engine; it
// goes through here. An unknown or "none" provider resolves to the null
// provider (always ok:false), which the search_web tool treats as "hide the
// tool" via isConfigured(). Modelled on document-extraction/registry.ts
// (config-free select() split so it is unit-testable).

import { config } from "../../config/index.js"
import { createLogger } from "../../infrastructure/logger/index.js"
import { buildBingCompatibleWebSearchProvider } from "./providers/bing-compatible.js"
import { searxngWebSearchProvider } from "./providers/searxng.js"
import { serperWebSearchProvider } from "./providers/serper.js"
import { tavilyWebSearchProvider } from "./providers/tavily.js"
import { zhipuWebSearchProvider } from "./providers/zhipu.js"
import type { WebSearchProvider, WebSearchResult } from "./types.js"

const log = createLogger("websearch.registry")
const warnedUnknownProviders = new Set<string>()

const nullProvider: WebSearchProvider = {
  key: "none",
  engineVersion: "0",
  maxCount: 0,
  isConfigured: () => false,
  search: async (): Promise<WebSearchResult> => ({
    ok: false,
    provider: "none",
    engineVersion: "0",
    retryable: false,
    error: "no web-search provider is configured",
  }),
}

const bochaWebSearchProvider = buildBingCompatibleWebSearchProvider({
  key: "bocha",
  maxCount: 50,
  getBaseUrl: () => config.webSearch.bocha.baseUrl,
  getApiKey: () => config.webSearch.bocha.apiKey,
  getTimeoutMs: () => config.webSearch.bocha.timeoutMs,
})

const langsearchWebSearchProvider = buildBingCompatibleWebSearchProvider({
  key: "langsearch",
  maxCount: 10,
  getBaseUrl: () => config.webSearch.langsearch.baseUrl,
  getApiKey: () => config.webSearch.langsearch.apiKey,
  getTimeoutMs: () => config.webSearch.langsearch.timeoutMs,
})

/**
 * Pure name → provider mapping (no config read), so branches are unit-testable.
 * An unrecognized provider is a LOUD skip (warn-once), never a boot crash — a
 * typo or a not-yet-wired provider must degrade to "web search disabled", the
 * same posture as "none".
 */
export function selectWebSearchProvider(name: string): WebSearchProvider {
  switch (name) {
    case "searxng":
      return searxngWebSearchProvider
    case "zhipu":
      return zhipuWebSearchProvider
    case "bocha":
      return bochaWebSearchProvider
    case "langsearch":
      return langsearchWebSearchProvider
    case "tavily":
      return tavilyWebSearchProvider
    case "serper":
      return serperWebSearchProvider
    case "none":
      return nullProvider
    default:
      if (!warnedUnknownProviders.has(name)) {
        warnedUnknownProviders.add(name)
        log.warn(
          { provider: name },
          `unknown WEB_SEARCH_PROVIDER "${name}" — web search is disabled (search_web tool hidden)`
        )
      }
      return nullProvider
  }
}

/**
 * Resolve the active web-search provider. When a real provider is selected,
 * config.superRefine has already guaranteed its required env (sidecar URL /
 * vendor API key) is present, so the returned provider is reachable.
 */
export function resolveWebSearchProvider(): WebSearchProvider {
  return selectWebSearchProvider(config.webSearch.provider)
}
