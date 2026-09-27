#!/usr/bin/env node
/**
 * brand-lint — CI gate implementing INV-S3 (SYNAPSE-HANDOUT §2).
 *
 * The rebrand manifest (product/identity/brand.yaml) is the single source of
 * brand strings. This gate fails when a forbidden upstream/vendor mark appears
 * inside the product overlay (product/**), because overlay code is the branded
 * product; upstream files keep their own name legitimately and are exempt.
 * NOTICE/THIRD-PARTY/LICENSE files inside the overlay are exempt too —
 * Apache-2.0 attribution is supposed to name upstream.
 *
 * No YAML dependency is pulled in on purpose: the manifest is tiny and stable,
 * so it is parsed with narrow line regexes. If the manifest grows real
 * structure, swap this for a proper parser — do not grow the regexes.
 *
 * Exit codes: 0 = clean, 1 = findings, 2 = configuration error.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const repoRoot = join(import.meta.dirname, "..")
const manifestPath = join(repoRoot, "product", "identity", "brand.yaml")

function fail(msg) {
  console.error(`[brand-lint] CONFIG ERROR: ${msg}`)
  process.exit(2)
}

if (!statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) {
  fail(`manifest not found at ${relative(repoRoot, manifestPath)}`)
}

const manifest = readFileSync(manifestPath, "utf8")
const scalar = (key) => {
  const m = manifest.match(
    new RegExp(`^\\s*${key}:\\s*([^#\\n]+?)(?:\\s*#.*)?$`, "m")
  )
  return m ? m[1].trim() : undefined
}
const listUnder = (key) => {
  const m = manifest.match(
    new RegExp(`^\\s*${key}:\\s*(?:#.*)?\\n((?:\\s+-\\s[^\\n]+\\n?)+)`, "m")
  )
  return m
    ? m[1].match(/-\s([^\n]+)/g).map((l) => l.replace(/^-\s/, "").trim())
    : []
}

const overlayPaths = listUnder("overlay_paths").map((p) =>
  p.replace(/\/\*$/, "")
)
const forbidden = listUnder("forbidden_marks_in_overlay")
const exemptGlobs = listUnder("notice_exempt_globs").map((g) =>
  g.replace(/^\*\*\//, "").replace(/\*$/, "")
)

if (overlayPaths.length === 0 || forbidden.length === 0) {
  fail("manifest must define overlay_paths and forbidden_marks_in_overlay")
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

const findings = []
let scanned = 0
for (const overlay of overlayPaths) {
  const overlayDir = join(repoRoot, overlay)
  if (!statSync(overlayDir, { throwIfNoEntry: false })?.isDirectory()) continue
  for (const file of walk(overlayDir)) {
    const rel = relative(repoRoot, file)
    // The manifest DECLARES the forbidden marks; scanning it would self-flag.
    if (rel === relative(repoRoot, manifestPath)) continue
    if (exemptGlobs.some((frag) => rel.includes(frag.replace(/\*/g, ""))))
      continue
    scanned++
    const text = readFileSync(file, "utf8")
    for (const mark of forbidden) {
      const re = new RegExp(mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
      let m
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split("\n").length
        findings.push(`${rel}:${line}: forbidden mark "${mark}"`)
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`[brand-lint] FAIL — ${findings.length} finding(s) in overlay:`)
  for (const f of findings) console.error(`  ${f}`)
  console.error(
    "[brand-lint] brand strings live only in product/identity/brand.yaml (INV-S3)."
  )
  process.exit(1)
}

console.log(
  `[brand-lint] OK — ${scanned} overlay file(s) clean of ${forbidden.join(", ")}`
)
