// Dynamic Expo config. `app.json` stays the source of truth for everything
// static; this file only layers on the parts that depend on BUILD-TIME env —
// namely the native cleartext posture, which follows the scheme of
// EXPO_PUBLIC_API_URL and so cannot be expressed in a static file.
//
// Both platforms refuse cleartext by default (Android targetSdk >= 28 sets
// android:usesCleartextTraffic=false; iOS App Transport Security blocks http to
// DNS names), and both decisions are baked into the native binary. A build made
// against an https:// deploy therefore can NEVER reach an http:// one — Synapse's
// ip+port deploy mode — it has to be rebuilt with the right EXPO_PUBLIC_API_URL.
//
// Inert for the web export: config plugins only ever touch native projects, and
// the browser applies its own mixed-content rules regardless.

const DEFAULT_SCHEME = "https"

/**
 * Reads an env-configured endpoint and reports its host plus whether it is
 * cleartext. Scheme-less values are assumed to be DEFAULT_SCHEME, matching
 * `ensureScheme` in src/lib/config.ts — but unlike the runtime path this says so
 * out loud, because silently assuming https is exactly how an ip+port deploy
 * ends up with an app that cannot connect and gives no clue why. Warn rather
 * than throw: the config is evaluated during `expo export`, which must keep
 * working (see infrastructure/Dockerfile.mobile-web).
 */
function readEndpoint(name) {
  const raw = process.env[name]?.trim()
  if (!raw) return undefined

  const hasScheme = /^https?:\/\//i.test(raw)
  if (!hasScheme) {
    console.warn(
      `[app.config] ${name}="${raw}" has no scheme — assuming ${DEFAULT_SCHEME}://. ` +
        `Write the scheme explicitly: a cleartext deploy needs "http://${raw}", ` +
        `otherwise the native build blocks every request to it.`
    )
  }

  try {
    const url = new URL(hasScheme ? raw : `${DEFAULT_SCHEME}://${raw}`)
    return { hostname: url.hostname, isCleartext: url.protocol === "http:" }
  } catch {
    console.warn(
      `[app.config] ${name}="${raw}" is not a valid URL — ignoring it when deciding ` +
        `the native cleartext posture. Expect connection failures at runtime.`
    )
    return undefined
  }
}

// ATS only governs connections made to a DNS name, so raw-IP hosts (the common
// ip+port case) need no exception — and could not get one anyway, since
// NSExceptionDomains keys may not be IP literals. URL.hostname brackets IPv6.
function isIpLiteral(hostname) {
  return hostname.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
}

module.exports = ({ config }) => {
  const cleartextHosts = [
    ...new Set(
      [
        readEndpoint("EXPO_PUBLIC_API_URL"),
        readEndpoint("EXPO_PUBLIC_AUTH_ORIGIN"),
      ]
        .filter((endpoint) => endpoint?.isCleartext)
        .map((endpoint) => endpoint.hostname)
    ),
  ]

  if (cleartextHosts.length === 0) return config

  // Per-host exception only — NSAllowsArbitraryLoads would also unblock these
  // but disables ATS app-wide and needs a written justification at App Store
  // review.
  const atsDomains = cleartextHosts
    .filter((hostname) => !isIpLiteral(hostname))
    .map((hostname) => hostname.toLowerCase())

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: true } }],
      ["./plugins/with-ats-exception-domains", { domains: atsDomains }],
    ],
  }
}
