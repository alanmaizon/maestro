#!/usr/bin/env node

/**
 * Scan staged files for leaked secrets before push.
 * Runs as part of the pre-push hook.
 */

import { execSync } from "node:child_process"

const PATTERNS = [
  // API keys
  { re: /AIza[0-9A-Za-z_-]{35}/g, label: "Google API key" },
  { re: /AKIA[0-9A-Z]{16}/g, label: "AWS access key" },
  { re: /sk-[a-zA-Z0-9]{20,}/g, label: "OpenAI / Stripe secret key" },
  { re: /ghp_[a-zA-Z0-9]{36}/g, label: "GitHub personal access token" },
  { re: /gho_[a-zA-Z0-9]{36}/g, label: "GitHub OAuth token" },
  { re: /ghs_[a-zA-Z0-9]{36}/g, label: "GitHub App token" },
  { re: /github_pat_[a-zA-Z0-9_]{82}/g, label: "GitHub fine-grained PAT" },
  { re: /xox[bpras]-[a-zA-Z0-9-]+/g, label: "Slack token" },
  { re: /sk-ant-[a-zA-Z0-9-]{80,}/g, label: "Anthropic API key" },

  // Generic secret patterns
  {
    re: /(?:password|passwd|secret|token|api_?key|apikey|auth)\s*[:=]\s*["'][^"']{8,}["']/gi,
    label: "Hardcoded secret assignment",
  },
  {
    re: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    label: "Private key",
  },
  {
    re: /-----BEGIN CERTIFICATE-----/g,
    label: "Certificate (review if private)",
  },
]

const IGNORE_PATHS = [
  /node_modules/,
  /\.next\//,
  /package-lock\.json/,
  /\.venv\//,
  /check-secrets\.mjs/, // don't flag ourselves
]

function getTrackedFiles() {
  // Files that would be pushed: everything tracked on the current branch
  const output = execSync("git diff --name-only --cached HEAD 2>/dev/null || git diff --name-only origin/main...HEAD 2>/dev/null || echo ''", {
    encoding: "utf-8",
  }).trim()
  if (!output) return []
  return output.split("\n").filter(Boolean)
}

function checkFile(filePath) {
  if (IGNORE_PATHS.some((re) => re.test(filePath))) return []

  let content
  try {
    content = execSync(`git show HEAD:${filePath} 2>/dev/null || cat "${filePath}" 2>/dev/null`, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    })
  } catch {
    return []
  }

  const findings = []
  for (const { re, label } of PATTERNS) {
    re.lastIndex = 0
    const matches = content.match(re)
    if (matches) {
      findings.push({ file: filePath, label, count: matches.length })
    }
  }
  return findings
}

// ── main ──────────────────────────────────────────────────────────

const files = getTrackedFiles()
const allFindings = []

for (const f of files) {
  allFindings.push(...checkFile(f))
}

if (allFindings.length > 0) {
  console.error("\n\x1b[31m✗ Potential secrets detected — push blocked\x1b[0m\n")
  for (const { file, label, count } of allFindings) {
    console.error(`  \x1b[33m${file}\x1b[0m — ${label} (${count} match${count > 1 ? "es" : ""})`)
  }
  console.error("\nIf these are false positives, use git push --no-verify (with caution).\n")
  process.exit(1)
}

console.log("✓ No secrets detected")
