// Global setup for the phone sweep (`npm run phone:sweep`, see playwright.config.ts).
// Clears the last run's per-test results, then returns the teardown, which gathers this
// run's results into tests/screenshots/sweep/summary.txt: one line per check, then the
// screenshots. Agents read that file first and open only the screenshots they need.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SWEEP_DIR = 'tests/screenshots/sweep'
export const RESULTS_DIR = join(SWEEP_DIR, '.results')

/** What each sweep test writes to RESULTS_DIR. */
export interface SweepResult {
  name: string
  problems: string[]
  notes: string[]
  shots: string[]
}

export default function setup() {
  rmSync(RESULTS_DIR, { recursive: true, force: true })
  mkdirSync(RESULTS_DIR, { recursive: true })
  const started = Date.now()

  return () => {
    const results = readdirSync(RESULTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), 'utf8')) as SweepResult)
      .sort((a, b) => a.name.localeCompare(b.name))
    const failed = results.filter((r) => r.problems.length)
    const secs = Math.round((Date.now() - started) / 1000)
    const lines = [
      `Phone sweep: ${results.length} checks, ${failed.length} with problems, ${secs}s (tests only, build excluded).`,
      'Screenshots are at DPR 1, in tests/screenshots/sweep/. Tap-target sizes are CSS px.',
      '',
      ...results.map((r) => {
        const head = `${r.name}: ${r.problems.length ? 'FAIL' : 'PASS'}`
        const notes = r.notes.length ? ` (${r.notes.join('; ')})` : ''
        return r.problems.length ? `${head}${notes}\n  - ${r.problems.join('\n  - ')}` : `${head}${notes}`
      }),
      '',
      'Screenshots:',
      ...results.flatMap((r) => r.shots).sort().map((s) => `  ${s}`),
      '',
    ]
    writeFileSync(join(SWEEP_DIR, 'summary.txt'), lines.join('\n'))
    rmSync(RESULTS_DIR, { recursive: true, force: true })
    console.log(`\nPhone sweep summary: ${join(SWEEP_DIR, 'summary.txt')} (${failed.length} of ${results.length} with problems)`)
  }
}
