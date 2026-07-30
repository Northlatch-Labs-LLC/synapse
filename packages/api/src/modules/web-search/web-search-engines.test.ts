import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

// Variant env: explicit SearXNG engine narrowing + language/safesearch, and the
// zhipu sogou engine (10-step count rounding). Config validates once at import,
// so these variants live in their own test process.
process.env.WEB_SEARCH_PROVIDER = "searxng"
process.env.WEBSEARCH_SEARXNG_URL = "http://searxng.test/"
process.env.WEBSEARCH_SEARXNG_ENGINES = "baidu, sogou,quark"
process.env.WEBSEARCH_SEARXNG_LANGUAGE = "zh-CN"
process.env.WEBSEARCH_SEARXNG_SAFESEARCH = "1"
process.env.WEBSEARCH_ZHIPU_API_KEY = "zhipu-test-key"
process.env.WEBSEARCH_ZHIPU_SEARCH_ENGINE = "search_pro_sogou"
process.env.WEBSEARCH_SERPER_API_KEY = "serper-test-key"
process.env.WEBSEARCH_SERPER_GL = "cn"
process.env.WEBSEARCH_SERPER_HL = "zh-cn"
// Empty string, NOT delete: env-bootstrap's dotenv would repopulate a DELETED
// key from the root .env at config import; "" is present-but-unset to config.
// Also ensures the cloud-adapter fetch path is the globalThis.fetch swap,
// never a real ProxyAgent picked up from the host environment.
process.env.WEBSEARCH_HTTPS_PROXY = ""
process.env.HTTPS_PROXY = ""
process.env.https_proxy = ""
process.env.HTTP_PROXY = ""
process.env.http_proxy = ""

const { searxngWebSearchProvider } = await import("./providers/searxng.js")
const { zhipuWebSearchProvider } = await import("./providers/zhipu.js")
const { serperWebSearchProvider } = await import("./providers/serper.js")

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

test("searxng: engines= narrows and categories is OMITTED (never both)", async () => {
  let url: URL = new URL("http://unset/")
  globalThis.fetch = (async (input: any) => {
    url = new URL(String(input))
    return jsonResponse(200, { results: [], unresponsive_engines: [] })
  }) as typeof globalThis.fetch

  await searxngWebSearchProvider.search({ query: "中文查询", count: 5 })
  // Whitespace in the CSV is normalized by config assembly.
  assert.equal(url.searchParams.get("engines"), "baidu,sogou,quark")
  // SearXNG APPENDS category engines on top of an explicit engine list, so
  // categories must be absent whenever engines= is sent.
  assert.equal(url.searchParams.get("categories"), null)
  assert.equal(url.searchParams.get("language"), "zh-CN")
  assert.equal(url.searchParams.get("safesearch"), "1")
})

test("searxng: engineVersion carries the engine-set suffix", () => {
  assert.equal(
    searxngWebSearchProvider.engineVersion,
    "searxng:baidu,sogou,quark"
  )
})

test("zhipu sogou variant: count rounds UP to the next multiple of 10, slice to req.count", async () => {
  let body: Record<string, unknown> = {}
  globalThis.fetch = (async (_url: any, init?: any) => {
    body = JSON.parse(String(init?.body))
    return jsonResponse(200, {
      search_result: Array.from({ length: 20 }, (_, i) => ({
        title: `S${i}`,
        link: `https://s.example/${i}`,
        content: "c",
      })),
    })
  }) as typeof globalThis.fetch

  const result = await zhipuWebSearchProvider.search({ query: "q", count: 15 })
  assert.ok(result.ok)
  assert.equal(body.count, 20)
  assert.equal(result.results.length, 15)
})

test("serper: gl/hl locale hints are sent when configured", async () => {
  let body: Record<string, unknown> = {}
  globalThis.fetch = (async (_url: any, init?: any) => {
    body = JSON.parse(String(init?.body))
    return jsonResponse(200, { searchParameters: { q: "q" }, organic: [] })
  }) as typeof globalThis.fetch

  const result = await serperWebSearchProvider.search({ query: "q", count: 3 })
  assert.ok(result.ok)
  assert.equal(body.gl, "cn")
  assert.equal(body.hl, "zh-cn")
})
