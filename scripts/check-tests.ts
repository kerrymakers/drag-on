// Keeps the e2e suite small. Run by `npm test`, after the unit tests.
//
// Reads tests/budget.json (a ratchet: raising a number means editing that file on
// purpose, and the reviewer flags it) and fails if:
// - waitForTimeout, or a hand-rolled setTimeout sleep, appears in tests/e2e/*.spec.ts
//   (use settle(), a real expect, or the page clock; fixtures.ts is exempt: shot()'s
//   `delay` option and settle() live there). Comments don't count;
// - there are more e2e tests than the budget;
// - a spec file is longer than maxSpecLines;
// - anything under tests/phone/ is tracked by git (those are scratch);
// - a spec is missing from the map in tests/e2e/README.md (agents pick related specs from it).
//
// Fast on purpose: no Playwright. Tests are counted as `test(` calls in the spec files
// (test.describe, test.skip, test.use and the rest don't count). The count is of test
// declarations, not runs: a `test(` inside a loop counts once, however many times the
// loop makes it, and a narrow360 rerun of a @layout test isn't counted either.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const E2E = join(ROOT, 'tests/e2e')

interface Budget {
  /** Most `test(` declarations allowed across tests/e2e/*.spec.ts. */
  e2eTests: number
  /** What a full local e2e run should take, in seconds (playwright.config.ts sets globalTimeout from it). */
  targetSeconds: number
  /** Longest a single spec file may be. */
  maxSpecLines: number
}

const budget = JSON.parse(readFileSync(join(ROOT, 'tests/budget.json'), 'utf8')) as Budget
const problems: string[] = []

/**
 * Drops comments (block comments, and // ones at the start of a line or after
 * whitespace, which leaves URLs like http://… alone), so a comment that mentions
 * waitForTimeout, or commented-out code, doesn't count.
 */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

let tests = 0
const specs = readdirSync(E2E).filter((f) => f.endsWith('.spec.ts')).sort()
for (const f of specs) {
  const src = readFileSync(join(E2E, f), 'utf8')
  const lines = src.split('\n').length - (src.endsWith('\n') ? 1 : 0)
  if (lines > budget.maxSpecLines) problems.push(`${f} is ${lines} lines, over the ${budget.maxSpecLines}-line cap. Split it, or move checks down to unit tests.`)
  const body = code(src)
  if (/\bwaitForTimeout\b/.test(body)) problems.push(`${f} uses waitForTimeout. Use settle(page), a real expect condition, or the page clock.`)
  // test.setTimeout (a test's time limit) is fine; any other setTimeout( is a sleep.
  if (/(?<!test\.)\bsetTimeout\(/.test(body)) problems.push(`${f} sleeps with setTimeout. Use settle(page), a real expect condition, or the page clock.`)
  tests += (body.match(/(?<![.\w])test\(/g) ?? []).length
}
if (tests > budget.e2eTests)
  problems.push(`${tests} e2e tests, over the budget of ${budget.e2eTests}. Move checks to unit tests or merge e2e tests; raise e2eTests in tests/budget.json only on purpose.`)

const readme = readFileSync(join(E2E, 'README.md'), 'utf8')
const unmapped = specs.filter((f) => !readme.includes(`\`${f}\``))
if (unmapped.length) problems.push(`tests/e2e/README.md has no row for ${unmapped.join(', ')}. Add one saying which screens and features it covers.`)

const tracked = execFileSync('git', ['ls-files', 'tests/phone'], { cwd: ROOT, encoding: 'utf8' }).trim()
if (tracked) problems.push(`tests/phone/ is scratch, but git tracks:\n    ${tracked.split('\n').join('\n    ')}\n  Run: git rm --cached -r tests/phone`)

if (problems.length) {
  console.error(`check-tests failed:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`check-tests OK: ${tests}/${budget.e2eTests} e2e tests, ${specs.length} specs within ${budget.maxSpecLines} lines, no waitForTimeout or setTimeout sleeps, tests/phone untracked, every spec in the README map`)
