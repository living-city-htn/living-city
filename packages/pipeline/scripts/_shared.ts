import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { communityGeo, type CommunityGeo } from '@living-city/contracts'
import { communities, seedPosts } from '@living-city/fixtures'

/**
 * Shared plumbing for the CLI runners.
 *
 * The runners exist because a prompt you cannot run on the whole seed set in
 * one command is a prompt nobody tunes. docs/roles/pipeline.md Stage 1: "run
 * Call A on the full seed set, incidents present on the 3 seeded incident
 * posts, absent on the near-misses. Log rejection rate and corrections."
 */

/**
 * Repo-anchored paths, derived from this file rather than from the cwd. The
 * package scripts run with the package as the cwd and a person typing the
 * command runs it from the repo root; both have to find the same fixtures and
 * write to the same `out/`.
 */
export const fromRepoRoot = (...parts: string[]): string =>
  resolve(fileURLToPath(new URL('../../..', import.meta.url)), ...parts)

export const OUT_DIR = fromRepoRoot('packages/pipeline/out')

export const writeJson = (relativePath: string, value: unknown): string => {
  const path = resolve(OUT_DIR, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return path
}

/**
 * The city. `city.fallback.json` is Product's placeholder for Map's real
 * `city.json`; the Pipeline contract says to run on any blocks in the right
 * shape and swap when the real thing lands, so this parses against the
 * contract and refuses anything that is not a `CommunityGeo`.
 */
export const loadCity = (): CommunityGeo[] => {
  const parsed: CommunityGeo[] = []
  for (const raw of communities) {
    const result = communityGeo.safeParse(raw)
    if (!result.success) {
      const id = (raw as { community_id?: string }).community_id ?? '(unknown)'
      throw new Error(
        `community ${id} does not match the contract: ${result.error.issues
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`,
      )
    }
    parsed.push(result.data)
  }
  return parsed
}

export type SeedPost = (typeof seedPosts)[number]

export const loadPosts = (communityId?: string): SeedPost[] =>
  seedPosts.filter((p) => !communityId || p.community_id === communityId)

export const arg = (name: string): string | undefined => {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  if (hit) return hit.slice(prefix.length)
  return process.argv.includes(`--${name}`) ? '' : undefined
}

export const has = (name: string): boolean => arg(name) !== undefined

export const die = (message: string): never => {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}
