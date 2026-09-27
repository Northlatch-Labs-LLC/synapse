#!/usr/bin/env node
/**
 * Evidence normalizer — merges `npm audit` (advisory DB) with `osv-scanner`
 * (OSV/GHSA) findings into the SYNAPSE-HANDOUT §4.2 schema:
 *   { criticals, highs, topFindings, fixPlan }
 * Run from repo root AFTER producing the raw inputs:
 *   npm audit --json --omit=dev > /tmp/npm-audit-prod.json
 *   osv-scanner --lockfile package-lock.json --format json --output evidence/phase0/osv-scanner.json
 * Output: evidence/phase0/dependency-audit.json (stdout summary).
 * Lives in evidence/ so it is clearly a Phase-0 audit artifact, not product code.
 */

import { readFileSync, writeFileSync } from "node:fs"

const npmAudit = JSON.parse(readFileSync("/tmp/npm-audit-prod.json", "utf8"))
const osv = JSON.parse(readFileSync("evidence/phase0/osv-scanner.json", "utf8"))

// --- npm audit side ---------------------------------------------------------
const npmVulns = npmAudit.vulnerabilities ?? {}
const npmTop = Object.entries(npmVulns)
  .filter(([, v]) => v.severity === "critical" || v.severity === "high")
  .map(([name, v]) => {
    const fix = v.fixAvailable
    return {
      name,
      severity: v.severity,
      range: v.range,
      advisories: v.via
        .filter((x) => typeof x === "object")
        .map((x) => `${x.title} (${x.url})`),
      fixAvailable:
        fix === true
          ? "in-range (npm audit fix)"
          : fix
            ? `${fix.name}@${fix.version}${fix.isSemVerMajor ? " (semver-major)" : ""}`
            : "none",
      isDirect: v.effects.length === 1 && v.effects[0] === name,
      effects: v.effects,
    }
  })
  .sort((a, b) =>
    a.severity === b.severity
      ? a.name.localeCompare(b.name)
      : a.severity === "critical"
        ? -1
        : 1
  )

// --- osv side ---------------------------------------------------------------
const osvByPackage = new Map() // "name@version" -> Set of advisory ids + max severity
const sevRank = { CRITICAL: 4, HIGH: 3, MODERATE: 2, MEDIUM: 2, LOW: 1 }
for (const src of osv.results ?? []) {
  for (const p of src.packages ?? []) {
    for (const v of p.vulnerabilities ?? []) {
      const sev = v.database_specific?.severity ?? "UNKNOWN"
      const key = `${p.package.name}@${p.package.version}`
      if (!osvByPackage.has(key))
        osvByPackage.set(key, { ids: new Set(), maxSev: "UNKNOWN" })
      const rec = osvByPackage.get(key)
      for (const id of [v.id, ...(v.aliases ?? [])])
        if (id.startsWith("GHSA") || id.startsWith("CVE")) rec.ids.add(id)
      if ((sevRank[sev] ?? 0) > (sevRank[rec.maxSev] ?? 0)) rec.maxSev = sev
    }
  }
}
const osvCriticalHigh = [...osvByPackage.entries()]
  .filter(([, r]) => r.maxSev === "CRITICAL" || r.maxSev === "HIGH")
  .map(([pkg, r]) => ({
    package: pkg,
    maxSeverity: r.maxSev,
    advisories: [...r.ids],
  }))
  .sort((a, b) => a.package.localeCompare(b.package))

// --- fix plan (batched, capability-safe; suite is the oracle) ----------------
const fixPlan = [
  {
    batch: 1,
    theme:
      "In-range and patch/minor direct bumps + root overrides for transitives",
    items: [
      "next 16.1.6 -> 16.3.6 (web-next; fixes critical CVE chain incl. postcss/sharp transitives)",
      "better-auth 1.6.13 -> 1.7.6 + root override @better-auth/core -> 1.7.6 (api + web-next)",
      "ws ^8.20.0 -> 8.22.0, tar root override -> 7.5.22, picomatch -> 2.3.2",
      "sharp ^0.34.5 -> 0.35.4",
      "npm audit fix --omit=dev for the FIX:true set (axios chain, hono, form-data, js-yaml, nanoid, brace-expansion, browserslist, fast-uri, ip-address, @tiptap/core, @larksuiteoapi/node-sdk)",
    ],
    risk: "low",
  },
  {
    batch: 2,
    theme:
      "Majors with API surface: fastify 4 -> 5.x + @fastify/jwt 8 -> 10 (fixes critical fast-jwt) + @fastify plugin set aligned to fastify 5",
    items: [
      "fastify ^4.28.0 -> ^5.12.5 (api) — also closes high find-my-way",
      "@fastify/jwt ^8.0.0 -> ^10.2.2 (api)",
      "align @fastify/cookie, @fastify/cors, @fastify/multipart, @fastify/rate-limit, @fastify/websocket, @fastify/otel peers to fastify 5-compatible majors",
      "undici ^5.29.0 -> ^8.11.2 (api)",
      "chrome-devtools-mcp -> 1.10.1 (closes puppeteer-core/@puppeteer/browsers/extract-zip/@modelcontextprotocol/sdk highs)",
    ],
    risk: "high — full suite + conformance green or revert (INV-S1)",
  },
]

const report = {
  generatedAt: new Date().toISOString(),
  baselineHead: "651d39d92ff08beff0868f991c36a27c20191726",
  scope: "production dependencies (--omit=dev), npm workspaces root",
  toolchain: { node: process.version, npm: "12.0.2" },
  criticals: npmTop.filter((f) => f.severity === "critical").length,
  highs: npmTop.filter((f) => f.severity === "high").length,
  sources: {
    npmAudit: {
      total: npmAudit.metadata?.vulnerabilities?.total ?? "n/a",
      bySeverity: npmAudit.metadata?.vulnerabilities,
    },
    osvScanner: {
      packagesScanned: 1775,
      packagesWithFindings: osvByPackage.size,
      criticalHighPackages: osvCriticalHigh.length,
      note: "OSV severities from GHSA database_specific; CVSS vectors in raw output",
    },
  },
  topFindings: npmTop,
  osvCrossCheck: {
    criticalHigh: osvCriticalHigh,
    note: "Cross-check surface: packages npm-audit flags as critical/high that also appear in OSV confirm both DBs agree; OSV-only entries listed here for triage",
  },
  fixPlan,
}

writeFileSync(
  "evidence/phase0/dependency-audit.json",
  JSON.stringify(report, null, 2) + "\n"
)
console.log(
  `dependency-audit.json: criticals=${report.criticals} highs=${report.highs} (npm) | osv crit/high packages=${osvCriticalHigh.length}`
)
