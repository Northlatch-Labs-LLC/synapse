import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

// No provider selected → default "none" (opt-in convention). Zhipu is pinned
// to the quark engine variant here so its no-count wire behavior can be
// exercised (config is import-once, so variant env lives in this file).
// Empty string, NOT delete: env-bootstrap's dotenv would repopulate a DELETED
// key from the root .env at config import; "" is present-but-unset to config.
process.env.WEB_SEARCH_PROVIDER = ""
process.env.WEBSEARCH_SEARXNG_URL = ""
process.env.WEBSEARCH_ZHIPU_API_KEY = "zhipu-test-key"
process.env.WEBSEARCH_ZHIPU_SEARCH_ENGINE = "search_pro_quark"
// Ensure the cloud-adapter fetch path is the globalThis.fetch swap, never a
// real ProxyAgent picked up from the host environment.
process.env.WEBSEARCH_HTTPS_PROXY = ""
process.env.HTTPS_PROXY = ""
process.env.https_proxy = ""
process.env.HTTP_PROXY = ""
process.env.http_proxy = ""

const { resolveWebSearchProvider, selectWebSearchProvider } =
  await import("./registry.js")
const { zhipuWebSearchProvider } = await import("./providers/zhipu.js")

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

test("registry: unset WEB_SEARCH_PROVIDER resolves to the null provider", async () => {
  const provider = resolveWebSearchProvider()
  assert.equal(provider.key, "none")
  assert.equal(provider.isConfigured(), false)
  const result = await provider.search({ query: "anything", count: 5 })
  assert.ok(!result.ok)
  assert.equal(result.retryable, false)
})

test("registry: select() branches — known keys, none, unknown → null provider", () => {
  assert.equal(selectWebSearchProvider("searxng").key, "searxng")
  assert.equal(selectWebSearchProvider("zhipu").key, "zhipu")
  assert.equal(selectWebSearchProvider("bocha").key, "bocha")
  assert.equal(selectWebSearchProvider("langsearch").key, "langsearch")
  assert.equal(selectWebSearchProvider("tavily").key, "tavily")
  assert.equal(selectWebSearchProvider("serper").key, "serper")
  assert.equal(selectWebSearchProvider("none").key, "none")
  assert.equal(selectWebSearchProvider("bogus-typo").key, "none")
  // warn-once: a second unknown lookup must not throw either
  assert.equal(selectWebSearchProvider("bogus-typo").key, "none")
})

test("registry: searxng without URL reports unconfigured (tool stays hidden)", () => {
  assert.equal(selectWebSearchProvider("searxng").isConfigured(), false)
})

test("search_web tool: resolve() is INACTIVE when no provider is configured", async () => {
  const { registerWebSearchToolPlugins } =
    await import("../ai/web-search-tools.js")
  const { getToolPlugin } = await import("../ai/tool-plugins.js")
  registerWebSearchToolPlugins()
  const plugin = getToolPlugin("search_web")
  assert.ok(plugin?.resolve)
  const resolved = await plugin!.resolve!({} as never)
  assert.equal(resolved.active, false)
})

test("zhipu quark variant: count omitted from the wire, slice still applies", async () => {
  let body: Record<string, unknown> = {}
  globalThis.fetch = (async (_url: any, init?: any) => {
    body = JSON.parse(String(init?.body))
    return jsonResponse(200, {
      search_result: Array.from({ length: 15 }, (_, i) => ({
        title: `Q${i}`,
        link: `https://q.example/${i}`,
        content: "c",
      })),
    })
  }) as typeof globalThis.fetch

  const result = await zhipuWebSearchProvider.search({ query: "q", count: 3 })
  assert.ok(result.ok)
  assert.equal(result.results.length, 3)
  assert.equal(body.count, undefined)
  assert.equal(body.search_engine, "search_pro_quark")
  assert.equal(zhipuWebSearchProvider.engineVersion, "search_pro_quark")
})
