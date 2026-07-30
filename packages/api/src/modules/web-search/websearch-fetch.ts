// Shared fetch for the CLOUD web-search adapters (zhipu / bocha / langsearch /
// tavily / serper).
//
// When a proxy is configured (config.webSearch.proxyUrl — WEBSEARCH_HTTPS_PROXY
// falling back to the generic HTTPS_PROXY/HTTP_PROXY chain, mirroring
// ai/providers/proxy-fetch.ts), requests go through npm undici's OWN fetch with
// a ProxyAgent from the SAME undici build. Never pass an npm-undici dispatcher
// into Node's built-in fetch: dispatcher/fetch builds must match (undici's docs
// forbid mixing; it breaks across undici majors).
//
// With no proxy (the common case, and every unit test) this delegates to
// globalThis.fetch LAZILY, preserving the module test convention of swapping
// globalThis.fetch per test.
//
// The searxng sidecar adapter deliberately does NOT use this helper: the
// sidecar is a first-party dotless docker-DNS host and is never proxied.
import { ProxyAgent, fetch as undiciFetch } from "undici"
import { config } from "../../config/index.js"

const proxyUrl = config.webSearch.proxyUrl

const proxyAgent = proxyUrl
  ? new ProxyAgent({ uri: proxyUrl, keepAliveTimeout: 30_000 })
  : undefined

/**
 * fetch-compatible function for cloud web-search adapters. The cast is required
 * because undici's fetch/RequestInit are structurally compatible but nominally
 * distinct from the DOM lib types (same cast as ai/providers/proxy-fetch.ts).
 */
export const webSearchFetch: typeof globalThis.fetch = proxyAgent
  ? (((input: any, init?: any) =>
      undiciFetch(input, {
        ...(init ?? {}),
        dispatcher: proxyAgent,
      } as any)) as unknown as typeof globalThis.fetch)
  : (input, init) => globalThis.fetch(input, init)
