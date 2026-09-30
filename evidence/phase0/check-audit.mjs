#!/usr/bin/env node
// Post-remediation audit checker: prints severity tally + remaining critical/high
// findings and key installed versions. Usage: node evidence/phase0/check-audit.mjs [audit.json]
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const raw = process.argv[2]
  ? readFileSync(process.argv[2], "utf8")
  : spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8" })
      .stdout

const a = JSON.parse(raw)
console.log("tally:", JSON.stringify(a.metadata?.vulnerabilities))
let rem = 0
for (const [name, v] of Object.entries(a.vulnerabilities ?? {})) {
  if (v.severity === "critical" || v.severity === "high") {
    rem++
    const fix = v.fixAvailable
    console.log(
      `REMAIN: ${name} ${v.severity} fix=${fix === true ? "in-range" : fix ? `${fix.name}@${fix.version}` : "none"}`
    )
  }
}
if (rem === 0)
  console.log("REMAIN: none — zero known criticals/highs (production tree)")
