import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

// Configure the web-search layer BEFORE importing config (validated once at
// import). provider=searxng requires WEBSEARCH_SEARXNG_URL (superRefine).
// Vendor keys are set too so every adapter can be exercised directly.
process.env.WEB_SEARCH_PROVIDER = "searxng"
process.env.WEBSEARCH_SEARXNG_URL = "http://searxng.test/"
process.env.WEBSEARCH_SEARXNG_TIMEOUT_MS = "5000"
// Empty string, NOT delete: env-bootstrap's dotenv would repopulate a DELETED
// key from the root .env at config import; "" is present-but-unset to config.
process.env.WEBSEARCH_SEARXNG_ENGINES = ""
process.env.WEBSEARCH_SEARXNG_LANGUAGE = ""
process.env.WEBSEARCH_ZHIPU_API_KEY = "zhipu-test-key"
process.env.WEBSEARCH_BOCHA_API_KEY = "bocha-test-key"
process.env.WEBSEARCH_LANGSEARCH_API_KEY = "langsearch-test-key"
process.env.WEBSEARCH_TAVILY_API_KEY = "tvly-test-key"
process.env.WEBSEARCH_SERPER_API_KEY = "serper-test-key"
process.env.WEBSEARCH_HTTPS_PROXY = ""
process.env.HTTPS_PROXY = ""
process.env.https_proxy = ""
process.env.HTTP_PROXY = ""
process.env.http_proxy = ""

const { neutralizeSearxngBangs, searxngWebSearchProvider } =
  await import("./providers/searxng.js")
const { zhipuWebSearchProvider } = await import("./providers/zhipu.js")
const { tavilyWebSearchProvider } = await import("./providers/tavily.js")
const { serperWebSearchProvider } = await import("./providers/serper.js")
const { selectWebSearchProvider } = await import("./registry.js")
const { searchWeb } = await import("./index.js")
const { parseSearchWebToolInput, registerWebSearchToolPlugins } =
  await import("../ai/web-search-tools.js")
const { getToolPlugin } = await import("../ai/tool-plugins.js")
const { isToolExecutionError } = await import("../ai/tool-errors.js")

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

interface Captured {
  url: URL
  init: RequestInit | undefined
  body: Record<string, unknown>
}

/** Swap fetch with a capturing stub returning `response`; returns the capture box. */
function captureFetch(response: Response | (() => Response)): Captured {
  const captured: Captured = {
    url: new URL("http://unset/"),
    init: undefined,
    body: {},
  }
  globalThis.fetch = (async (url: any, init?: any) => {
    captured.url = new URL(String(url))
    captured.init = init
    if (init?.body) captured.body = JSON.parse(String(init.body))
    return typeof response === "function" ? response() : response
  }) as typeof globalThis.fetch
  return captured
}

const SEARXNG_OK = {
  results: [
    {
      url: "https://example.com/a",
      title: "Result A",
      content: "snippet a",
      publishedDate: "2026-07-01",
      engine: "duckduckgo",
      score: 2,
    },
    { url: "https://example.com/b", title: "Result B", content: "snippet b" },
    { url: "https://example.com/c", title: "Result C", content: "snippet c" },
  ],
  unresponsive_engines: [],
}

// --- bang neutralization ------------------------------------------------------

test("neutralizeSearxngBangs strips leading ! runs per token, keeps full-width ！", () => {
  assert.equal(neutralizeSearxngBangs("!!g cats"), "g cats")
  assert.equal(neutralizeSearxngBangs("!ddg cats"), "ddg cats")
  assert.equal(neutralizeSearxngBangs("hello !bang world"), "hello bang world")
  assert.equal(neutralizeSearxngBangs("！你好 世界"), "！你好 世界")
  assert.equal(neutralizeSearxngBangs("!!"), "")
})

test("neutralizeSearxngBangs covers PYTHON-\\s separators JS \\s lacks (U+001C-001F, NEL)", () => {
  // SearXNG tokenizes with Python re.split(r'(\s+)'); a bang smuggled behind
  // FS/GS/RS/US or NEL must not survive neutralization.
  assert.equal(neutralizeSearxngBangs("cats\u0085!!google"), "cats\u0085google")
  assert.equal(neutralizeSearxngBangs("cats\u001c!google"), "cats\u001cgoogle")
  assert.equal(neutralizeSearxngBangs("cats\u001f!!g"), "cats\u001fg")
  // Ideographic space U+3000 is \s in BOTH engines — also covered.
  assert.equal(neutralizeSearxngBangs("你好　!g"), "你好　g")
})

// --- searxng adapter ----------------------------------------------------------

test("searxng: happy path maps fields, encodes params, slices to count", async () => {
  const captured = captureFetch(jsonResponse(200, SEARXNG_OK))
  const result = await searxngWebSearchProvider.search({
    query: "hello world & format=csv",
    count: 2,
  })
  assert.ok(result.ok)
  assert.equal(result.results.length, 2)
  assert.deepEqual(result.results[0], {
    title: "Result A",
    url: "https://example.com/a",
    snippet: "snippet a",
    publishedAt: "2026-07-01",
    source: "duckduckgo",
  })
  // Params built via searchParams — the & in the query must not leak params.
  assert.equal(captured.url.pathname, "/search")
  assert.equal(captured.url.searchParams.get("q"), "hello world & format=csv")
  assert.equal(captured.url.searchParams.get("format"), "json")
  assert.equal(captured.url.searchParams.get("categories"), "general")
  assert.equal(captured.url.searchParams.get("engines"), null)
  assert.equal(captured.url.searchParams.get("safesearch"), "0")
  assert.equal(captured.url.searchParams.get("time_range"), null)
  assert.equal(captured.url.searchParams.get("language"), null)
})

test("searxng: recency maps to time_range (week included)", async () => {
  const captured = captureFetch(jsonResponse(200, SEARXNG_OK))
  await searxngWebSearchProvider.search({
    query: "q1",
    count: 5,
    recency: "week",
  })
  assert.equal(captured.url.searchParams.get("time_range"), "week")
})

test("searxng: all-bang query is a terminal failure", async () => {
  const result = await searxngWebSearchProvider.search({
    query: "!! !",
    count: 5,
  })
  assert.ok(!result.ok)
  assert.equal(result.retryable, false)
})

test("searxng: 403 terminal with settings hint; 429/5xx/network retryable; malformed terminal", async () => {
  captureFetch(jsonResponse(403, {}))
  let r = await searxngWebSearchProvider.search({ query: "q2", count: 5 })
  assert.ok(!r.ok && !r.retryable && r.error.includes("settings.yml"))

  captureFetch(jsonResponse(429, {}))
  r = await searxngWebSearchProvider.search({ query: "q3", count: 5 })
  assert.ok(!r.ok && r.retryable)

  captureFetch(jsonResponse(500, {}))
  r = await searxngWebSearchProvider.search({ query: "q4", count: 5 })
  assert.ok(!r.ok && r.retryable)

  globalThis.fetch = (async () => {
    throw new Error("boom")
  }) as typeof globalThis.fetch
  r = await searxngWebSearchProvider.search({ query: "q5", count: 5 })
  assert.ok(!r.ok && r.retryable)

  captureFetch(jsonResponse(200, { nope: true }))
  r = await searxngWebSearchProvider.search({ query: "q6", count: 5 })
  assert.ok(!r.ok && !r.retryable)
})

test("searxng: redirect responses are refused (terminal)", async () => {
  captureFetch(() => Response.redirect("https://elsewhere.example/", 302))
  const r = await searxngWebSearchProvider.search({ query: "q7", count: 5 })
  assert.ok(!r.ok)
  assert.equal(r.retryable, false)
  assert.ok(r.error.includes("redirect"))
})

test("searxng: empty results + unresponsive engines → retryable degraded failure", async () => {
  captureFetch(
    jsonResponse(200, {
      results: [],
      unresponsive_engines: [
        ["google", "CAPTCHA"],
        ["duckduckgo", "too many requests"],
      ],
    })
  )
  const r = await searxngWebSearchProvider.search({ query: "q8", count: 5 })
  assert.ok(!r.ok)
  assert.equal(r.retryable, true)
  assert.ok(r.error.includes("google (CAPTCHA)"))
  assert.ok(r.error.includes("unavailable rather than nonexistent"))
})

test("searxng: empty results with NO unresponsive engines is a success", async () => {
  captureFetch(jsonResponse(200, { results: [], unresponsive_engines: [] }))
  const r = await searxngWebSearchProvider.search({ query: "q9", count: 5 })
  assert.ok(r.ok)
  assert.equal(r.results.length, 0)
})

test("searxng: NON-empty results with some unresponsive engines stays a success", async () => {
  captureFetch(
    jsonResponse(200, {
      results: [{ url: "https://p.example/", title: "P", content: "pc" }],
      unresponsive_engines: [["google", "CAPTCHA"]],
    })
  )
  const r = await searxngWebSearchProvider.search({ query: "q10", count: 5 })
  assert.ok(r.ok)
  assert.equal(r.results.length, 1)
})

// --- zhipu adapter --------------------------------------------------------------

const ZHIPU_OK = {
  search_result: [
    {
      title: "Z A",
      content: "za",
      link: "https://z.example/a",
      media: "site-a",
      publish_date: "2026-07-02",
    },
    { title: "Z B", content: "zb", link: "https://z.example/b" },
  ],
}

test("zhipu: happy path — wire body, bearer auth, field mapping", async () => {
  const captured = captureFetch(jsonResponse(200, ZHIPU_OK))
  const r = await zhipuWebSearchProvider.search({
    query: "上海 天气",
    count: 5,
  })
  assert.ok(r.ok)
  assert.equal(r.results.length, 2)
  assert.deepEqual(r.results[0], {
    title: "Z A",
    url: "https://z.example/a",
    snippet: "za",
    publishedAt: "2026-07-02",
    siteName: "site-a",
  })
  assert.equal(captured.url.pathname, "/api/paas/v4/web_search")
  assert.equal(captured.body.search_query, "上海 天气")
  assert.equal(captured.body.search_engine, "search_std")
  assert.equal(captured.body.count, 5)
  assert.equal(captured.body.search_intent, false)
  assert.equal(captured.body.search_recency_filter, undefined)
  const headers = captured.init?.headers as Record<string, string>
  assert.equal(headers.authorization, "Bearer zhipu-test-key")
})

test("zhipu: recency maps to oneWeek", async () => {
  const captured = captureFetch(jsonResponse(200, ZHIPU_OK))
  await zhipuWebSearchProvider.search({ query: "q", count: 5, recency: "week" })
  assert.equal(captured.body.search_recency_filter, "oneWeek")
})

test("zhipu: business code 1703 (even under HTTP 400) → empty SUCCESS", async () => {
  captureFetch(
    jsonResponse(400, { error: { code: "1703", message: "no valid data" } })
  )
  const r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(r.ok)
  assert.equal(r.results.length, 0)
})

test("zhipu: 1701 retryable; other business code terminal with code in message", async () => {
  captureFetch(
    jsonResponse(429, { error: { code: "1701", message: "concurrency" } })
  )
  let r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)

  captureFetch(
    jsonResponse(400, { error: { code: "1214", message: "param invalid" } })
  )
  r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable)
  assert.ok(r.error.includes("1214"))
})

test("zhipu: platform rate codes 1302/1303/1305 retryable; quota 1304 terminal; bare code recognized", async () => {
  captureFetch(
    jsonResponse(429, { error: { code: "1302", message: "并发过高" } })
  )
  let r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)

  captureFetch(jsonResponse(429, { error: { code: "1304", message: "quota" } }))
  r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable)

  // A bare {"code":"1701"} with no error object/message still carries its
  // semantic (retryable), never falls through to ok-empty.
  captureFetch(jsonResponse(200, { code: "1701" }))
  r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)
})

test("zhipu: malformed 2xx body (no recognized envelope key) is a terminal decode error", async () => {
  captureFetch(
    () => new Response("<html>gateway error</html>", { status: 200 })
  )
  const r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable)
  assert.ok(r.error.includes("malformed"))
  // ...while a genuine zero-hit success envelope (request_id, no search_result)
  // stays an empty SUCCESS.
  captureFetch(jsonResponse(200, { request_id: "abc", created: 1 }))
  const ok = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(ok.ok)
  assert.equal(ok.results.length, 0)
})

test("zhipu: HTTP classification without business code — 429/5xx retryable, 4xx terminal", async () => {
  captureFetch(jsonResponse(429, {}))
  let r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)

  captureFetch(jsonResponse(503, {}))
  r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)

  captureFetch(jsonResponse(400, {}))
  r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable)
})

test("zhipu: over-returning vendor is sliced to req.count", async () => {
  const many = {
    search_result: Array.from({ length: 30 }, (_, i) => ({
      title: `T${i}`,
      link: `https://z.example/${i}`,
      content: "c",
    })),
  }
  captureFetch(jsonResponse(200, many))
  const r = await zhipuWebSearchProvider.search({ query: "q", count: 5 })
  assert.ok(r.ok)
  assert.equal(r.results.length, 5)
})

// --- bing-compatible family (bocha / langsearch) --------------------------------

const BING_OK = {
  code: 200,
  msg: null,
  data: {
    webPages: {
      value: [
        {
          name: "B A",
          url: "https://b.example/a",
          snippet: "short",
          summary: "long summary",
          siteName: "b-site",
          datePublished: "2026-06-30",
        },
        { name: "B B", url: "https://b.example/b", snippet: "only snippet" },
      ],
    },
  },
}

test("bocha: happy path — endpoint, body, summary preferred over snippet", async () => {
  const bocha = selectWebSearchProvider("bocha")
  const captured = captureFetch(jsonResponse(200, BING_OK))
  const r = await bocha.search({ query: "查询", count: 7, recency: "month" })
  assert.ok(r.ok)
  assert.equal(r.results.length, 2)
  assert.equal(r.results[0].snippet, "long summary")
  assert.equal(r.results[0].siteName, "b-site")
  assert.equal(r.results[1].snippet, "only snippet")
  assert.equal(captured.url.pathname, "/v1/web-search")
  assert.equal(captured.body.query, "查询")
  assert.equal(captured.body.summary, true)
  assert.equal(captured.body.count, 7)
  assert.equal(captured.body.freshness, "oneMonth")
})

test("bing family: body code !== 200 is an error (429 retryable, others terminal)", async () => {
  const bocha = selectWebSearchProvider("bocha")
  captureFetch(jsonResponse(200, { code: 403, msg: "balance exhausted" }))
  let r = await bocha.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable && r.error.includes("balance exhausted"))

  captureFetch(jsonResponse(200, { code: 429, msg: "slow down" }))
  r = await bocha.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)
})

test("bing family: HTTP 401/403 terminal with actionable text, 429 retryable", async () => {
  const bocha = selectWebSearchProvider("bocha")
  captureFetch(jsonResponse(401, {}))
  let r = await bocha.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable)

  captureFetch(jsonResponse(403, {}))
  r = await bocha.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable && r.error.includes("balance"))

  captureFetch(jsonResponse(429, {}))
  r = await bocha.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)
})

test("bing family: code 200 with missing webPages is a zero-hit success; maxCount facts", async () => {
  const langsearch = selectWebSearchProvider("langsearch")
  captureFetch(jsonResponse(200, { code: 200, data: {} }))
  const r = await langsearch.search({ query: "q", count: 5 })
  assert.ok(r.ok)
  assert.equal(r.results.length, 0)
  assert.equal(langsearch.maxCount, 10)
  assert.equal(selectWebSearchProvider("bocha").maxCount, 50)
})

test("langsearch: own instance hits api.langsearch.com with its own key", async () => {
  const langsearch = selectWebSearchProvider("langsearch")
  const captured = captureFetch(jsonResponse(200, BING_OK))
  const r = await langsearch.search({ query: "ls probe", count: 5 })
  assert.ok(r.ok)
  assert.equal(captured.url.host, "api.langsearch.com")
  assert.equal(captured.url.pathname, "/v1/web-search")
  const headers = captured.init?.headers as Record<string, string>
  assert.equal(headers.authorization, "Bearer langsearch-test-key")
  // recency unset → freshness field omitted entirely (vendor default).
  assert.equal(captured.body.freshness, undefined)
})

test("bing family: body code 5xx is transient; malformed 2xx (no code) is terminal", async () => {
  const bocha = selectWebSearchProvider("bocha")
  captureFetch(jsonResponse(200, { code: 500, msg: "internal error" }))
  let r = await bocha.search({ query: "q", count: 5 })
  assert.ok(!r.ok && r.retryable)

  captureFetch(
    () => new Response("<html>gateway error</html>", { status: 200 })
  )
  r = await bocha.search({ query: "q", count: 5 })
  assert.ok(!r.ok && !r.retryable && r.error.includes("malformed"))
})

// --- tavily adapter --------------------------------------------------------------

test("tavily: happy path body + mapping; 432/433 terminal; 429 retryable", async () => {
  const captured = captureFetch(
    jsonResponse(200, {
      results: [
        { title: "T", url: "https://t.example/", content: "tc", score: 0.9 },
      ],
    })
  )
  const r = await tavilyWebSearchProvider.search({
    query: "tavily q",
    count: 4,
    recency: "day",
  })
  assert.ok(r.ok)
  assert.equal(r.results[0].snippet, "tc")
  assert.equal(captured.url.pathname, "/search")
  assert.equal(captured.body.max_results, 4)
  assert.equal(captured.body.search_depth, "basic")
  assert.equal(captured.body.time_range, "day")
  assert.equal(captured.body.include_answer, false)
  const headers = captured.init?.headers as Record<string, string>
  assert.equal(headers.authorization, "Bearer tvly-test-key")

  captureFetch(jsonResponse(432, {}))
  let f = await tavilyWebSearchProvider.search({ query: "q", count: 4 })
  assert.ok(!f.ok && !f.retryable && f.error.includes("432"))

  captureFetch(jsonResponse(433, {}))
  f = await tavilyWebSearchProvider.search({ query: "q", count: 4 })
  assert.ok(!f.ok && !f.retryable)

  captureFetch(jsonResponse(429, {}))
  f = await tavilyWebSearchProvider.search({ query: "q", count: 4 })
  assert.ok(!f.ok && f.retryable)
})

test("tavily: recency unset omits time_range; malformed 2xx body is terminal", async () => {
  const captured = captureFetch(jsonResponse(200, { results: [] }))
  const ok = await tavilyWebSearchProvider.search({ query: "q", count: 4 })
  assert.ok(ok.ok)
  assert.equal(captured.body.time_range, undefined)

  captureFetch(
    () => new Response("<html>gateway error</html>", { status: 200 })
  )
  const bad = await tavilyWebSearchProvider.search({ query: "q", count: 4 })
  assert.ok(!bad.ok && !bad.retryable && bad.error.includes("malformed"))
})

// --- serper adapter --------------------------------------------------------------

test("serper: happy path — X-API-KEY header, q/num body, organic mapping, tbs", async () => {
  const captured = captureFetch(
    jsonResponse(200, {
      organic: [
        {
          title: "S",
          link: "https://s.example/",
          snippet: "ss",
          date: "Jul 1, 2026",
          position: 1,
        },
      ],
    })
  )
  const r = await serperWebSearchProvider.search({
    query: "serper q",
    count: 3,
    recency: "week",
  })
  assert.ok(r.ok)
  assert.deepEqual(r.results[0], {
    title: "S",
    url: "https://s.example/",
    snippet: "ss",
    publishedAt: "Jul 1, 2026",
  })
  assert.equal(captured.body.q, "serper q")
  assert.equal(captured.body.num, 3)
  assert.equal(captured.body.tbs, "qdr:w")
  assert.equal(captured.body.gl, undefined)
  assert.equal(captured.body.hl, undefined)
  const headers = captured.init?.headers as Record<string, string>
  assert.equal(headers["x-api-key"], "serper-test-key")
})

test("serper: recency unset omits tbs; malformed 2xx (no organic, no searchParameters) terminal", async () => {
  const captured = captureFetch(
    jsonResponse(200, { searchParameters: { q: "q" }, organic: [] })
  )
  const ok = await serperWebSearchProvider.search({ query: "q", count: 3 })
  assert.ok(ok.ok)
  assert.equal(ok.results.length, 0)
  assert.equal(captured.body.tbs, undefined)

  captureFetch(
    () => new Response("<html>gateway error</html>", { status: 200 })
  )
  const bad = await serperWebSearchProvider.search({ query: "q", count: 3 })
  assert.ok(!bad.ok && !bad.retryable && bad.error.includes("malformed"))
})

// --- facade ----------------------------------------------------------------------

test("facade: empty query gate is terminal with an actionable message", async () => {
  const r = await searchWeb({ query: "   " })
  assert.ok(!r.ok)
  assert.equal(r.retryable, false)
  assert.ok(r.error.includes("non-empty"))
})

test("facade: identical queries coalesce through the LRU (single fetch)", async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return jsonResponse(200, SEARXNG_OK)
  }) as typeof globalThis.fetch
  const a = await searchWeb({ query: "facade cache probe", count: 2 })
  const b = await searchWeb({ query: "facade cache probe", count: 2 })
  assert.ok(a.ok && b.ok)
  assert.equal(calls, 1)
})

test("facade: retryable failures are evicted (second call re-fetches)", async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return calls === 1 ? jsonResponse(500, {}) : jsonResponse(200, SEARXNG_OK)
  }) as typeof globalThis.fetch
  const first = await searchWeb({ query: "facade evict probe", count: 2 })
  assert.ok(!first.ok && first.retryable)
  const second = await searchWeb({ query: "facade evict probe", count: 2 })
  assert.ok(second.ok)
  assert.equal(calls, 2)
})

test("facade: out-of-enum recency is dropped, not forwarded to the provider", async () => {
  const captured = captureFetch(jsonResponse(200, SEARXNG_OK))
  const r = await searchWeb({
    query: "facade recency regate probe",
    count: 2,
    recency: "decade" as never,
  })
  assert.ok(r.ok)
  assert.equal(captured.url.searchParams.get("time_range"), null)
})

test("facade: count clamps to the 20 ceiling and floors at 1", async () => {
  const many = {
    results: Array.from({ length: 30 }, (_, i) => ({
      url: `https://m.example/${i}`,
      title: `M${i}`,
      content: "c",
    })),
    unresponsive_engines: [],
  }
  globalThis.fetch = (async () =>
    jsonResponse(200, many)) as typeof globalThis.fetch
  const big = await searchWeb({ query: "facade clamp probe hi", count: 999 })
  assert.ok(big.ok)
  assert.equal(big.results.length, 20)
  const small = await searchWeb({ query: "facade clamp probe lo", count: -4 })
  assert.ok(small.ok)
  assert.equal(small.results.length, 1)
})

// --- search_web tool ---------------------------------------------------------------

test("tool codec: coercion, clamps, enum drop, empty-query throw", () => {
  assert.deepEqual(parseSearchWebToolInput({ query: "  x  " }), { query: "x" })
  assert.deepEqual(parseSearchWebToolInput({ query: "x", count: "7" }), {
    query: "x",
    count: 7,
  })
  assert.deepEqual(parseSearchWebToolInput({ query: "x", count: 100 }), {
    query: "x",
    count: 20,
  })
  // Non-numeric garbage → no count (facade default applies)
  assert.deepEqual(
    parseSearchWebToolInput({ query: "x", count: "about five" }),
    {
      query: "x",
    }
  )
  assert.deepEqual(parseSearchWebToolInput({ query: "x", recency: "week" }), {
    query: "x",
    recency: "week",
  })
  // Out-of-enum recency dropped
  assert.deepEqual(parseSearchWebToolInput({ query: "x", recency: "decade" }), {
    query: "x",
  })
  assert.throws(
    () => parseSearchWebToolInput({}),
    (err: unknown) => isToolExecutionError(err) && /query/.test(err.message)
  )
  assert.throws(() => parseSearchWebToolInput({ query: 42 }))
})

test("tool: registration attaches presentation; resolve() active when configured", async () => {
  registerWebSearchToolPlugins()
  const plugin = getToolPlugin("search_web")
  assert.ok(plugin, "search_web should be registered")
  assert.equal(plugin!.presentation?.title.message, "搜索网页 {query}")
  assert.ok(plugin!.resolve)
  const resolved = await plugin!.resolve!({} as never)
  assert.equal(resolved.active, true)
  assert.equal(resolved.definition.name, "search_web")
})

test("tool execute: formats numbered results and carries compact metadata", async () => {
  globalThis.fetch = (async () =>
    jsonResponse(200, SEARXNG_OK)) as typeof globalThis.fetch
  const plugin = getToolPlugin("search_web")!
  const result = (await plugin.execute({
    query: "tool happy probe",
    count: 2,
  })) as { content: Array<{ type: string; text?: string }>; metadata?: any }
  const text = result.content[0]?.text ?? ""
  assert.ok(text.includes("[1] Result A"))
  assert.ok(text.includes("URL: https://example.com/a"))
  assert.ok(text.includes("[2] Result B"))
  assert.equal(result.metadata?.webSearch?.resultCount, 2)
  assert.equal(result.metadata?.webSearch?.provider, "searxng")
})

test("tool execute: empty results → explicit no-results text (not an error)", async () => {
  globalThis.fetch = (async () =>
    jsonResponse(200, {
      results: [],
      unresponsive_engines: [],
    })) as typeof globalThis.fetch
  const plugin = getToolPlugin("search_web")!
  const result = (await plugin.execute({ query: "tool empty probe" })) as {
    content: Array<{ type: string; text?: string }>
  }
  assert.ok(result.content[0]?.text?.includes("No results found"))
})

test("tool execute: retryable failure throws model_actionable; terminal throws internal", async () => {
  const plugin = getToolPlugin("search_web")!

  globalThis.fetch = (async () =>
    jsonResponse(500, {})) as typeof globalThis.fetch
  await assert.rejects(
    plugin.execute({ query: "tool retryable probe" }),
    (err: unknown) =>
      isToolExecutionError(err) &&
      err.kind === "model_actionable" &&
      err.retryable === true &&
      err.code === "web_search_failed"
  )

  globalThis.fetch = (async () =>
    jsonResponse(403, {})) as typeof globalThis.fetch
  await assert.rejects(
    plugin.execute({ query: "tool terminal probe" }),
    (err: unknown) =>
      isToolExecutionError(err) &&
      err.kind === "internal" &&
      err.retryable === false
  )
})
