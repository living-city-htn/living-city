/**
 * Conflict resolution and uncertainty. Deterministic, pure, and unit-tested -
 * no model is involved in deciding who is right.
 *
 * The problem this solves: two residents post about the same block in the same
 * window and say incompatible things. One says the road is flooded, one says it
 * is clear. A system that picks the louder one and deletes the other is worse
 * than useless to a staff member, because they lose the very thing that would
 * tell them to go and look: that the reports disagree.
 *
 * So `resolveConflict` does not discard. It produces a winning assertion, the
 * evidence behind it, **and the dissent**, with a weight on each side, and a
 * confidence that falls as disagreement rises. A verdict where two sides are
 * close is a low-confidence verdict by construction, and low confidence means
 * the agent may only suggest.
 *
 * Three inputs decide a claim's weight, and the reasoning for each:
 *
 *   authenticity   how much this single report is worth on its own, before
 *                  anyone agrees with it (`doc.ts`). Linear: a report at 80 is
 *                  worth twice one at 40.
 *   recency        exponential decay with a half-life, because a report from
 *                  five minutes ago describes the street better than one from
 *                  an hour ago, and on a flooding call that difference is the
 *                  whole answer.
 *   corroboration  distinct authors, not posts, on a log scale. Two people
 *                  agreeing is far more than twice one person; ten people
 *                  agreeing is not five times two. One author posting six
 *                  times is one author.
 */

/** Half-life for recency decay, in minutes. Short, matching the aggregator's
 *  reasoning in docs/04 moment 4: on a demo timescale a fresh report has to be
 *  able to outweigh an older one within the same hour. */
export const RECENCY_HALF_LIFE_MIN = 30

/** How much a doubling of distinct authors multiplies a group's weight. */
export const CORROBORATION_GAIN = 0.35

/** Cap on the corroboration multiplier, so a brigade cannot manufacture truth. */
export const CORROBORATION_CAP = 1.7

/** Below this, weights are treated as equal and the tie-break runs. */
export const TIE_EPSILON = 0.001

export type Claim = {
  post_id: string
  user_id: string
  created_at: string
  /** What the post asserts about the block, normalised. Usually an incident
   *  type, with `none` meaning "nothing is wrong here". */
  assertion: string
  /** 0-100, from `authenticityOf`. */
  authenticity: number
  /** 0-100, Call A's own certainty. */
  confidence: number
}

export type DissentEntry = {
  post_id: string
  assertion: string
  weight: number
  note: string
}

export type TieBreak = 'none' | 'authors' | 'recency' | 'post_id'

export type Verdict = {
  /** The assertion with the most weight behind it. */
  assertion: string
  /** Weight behind the winner. */
  weight: number
  /** Weight behind everything else. */
  opposing_weight: number
  /** `weight / (weight + opposing_weight)`, 0.5 to 1. */
  agreement: number
  /** Post ids supporting the winner. */
  support: string[]
  /** Distinct authors supporting the winner. */
  authors: number
  /** Everything that disagreed, kept rather than dropped. */
  dissent: DissentEntry[]
  /** Which rule decided it, when weight alone did not. */
  tie_break: TieBreak
  /** 0-100. See `incidentConfidence`. */
  confidence: number
  /** What the agent is permitted to do with this. */
  action: 'act' | 'suggest'
}

const round = (n: number, places = 3) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

/** Exponential decay to the half-life. 1.0 at age zero, 0.5 at one half-life. */
export const recencyWeight = (createdAt: string, now: number): number => {
  const ageMin = Math.max(0, (now - Date.parse(createdAt)) / 60_000)
  return 2 ** (-ageMin / RECENCY_HALF_LIFE_MIN)
}

/** A single claim's weight: authenticity scaled to 0-1, decayed by age. */
export const claimWeight = (claim: Claim, now: number): number =>
  (clamp(claim.authenticity) / 100) * recencyWeight(claim.created_at, now)

/** Distinct authors on a log scale, capped. n=1 -> 1.0, n=2 -> 1.35, n=4 -> 1.7. */
export const corroborationFactor = (authors: number): number =>
  Math.min(CORROBORATION_CAP, 1 + CORROBORATION_GAIN * Math.log2(Math.max(1, authors)))

/**
 * Incident confidence, 0-100, from per-post confidence plus corroboration.
 *
 *   base         the weighted mean of Call A's confidence across the supporting
 *                posts, weighted by each post's own claim weight - so a
 *                confident but stale report contributes less than a confident
 *                fresh one.
 *   agreement    0.5 when the evidence is evenly split, 1.0 when it is
 *                unanimous. Applied as `(0.5 + 0.5 * agreement)`, so an even
 *                split costs a quarter of the score rather than all of it:
 *                a contested report is still a report.
 *   corroborate  the same log-scale factor, so independent agreement raises
 *                confidence and one person posting six times does not.
 */
export const incidentConfidence = (
  base: number, agreement: number, authors: number,
): number => round(clamp(base * (0.5 + 0.5 * agreement) * corroborationFactor(authors)), 1)

export type ResolveOptions = {
  /** Defaults to now. Injected by the tests so results are deterministic. */
  now?: number
  /** Below this confidence the agent may only suggest. Defaults to the env floor. */
  floor?: number
}

/**
 * Resolve contradictory claims about one block in one window.
 *
 * The tie-breaking rule, in order, and it is total - two runs over the same
 * input always produce the same verdict:
 *
 *   1. Highest total weight wins.
 *   2. Within TIE_EPSILON, more distinct authors wins. Breadth of independent
 *      testimony beats a single loud recent one.
 *   3. Still tied, the group with the most recent claim wins. On a live street
 *      the newer description is the better one.
 *   4. Still tied, the lexicographically smallest supporting post id wins.
 *      Arbitrary on purpose: it is a rule, not a judgement, and it exists so
 *      the outcome is reproducible rather than dependent on map ordering.
 *
 * An empty input is not an error: it returns a `none` verdict at zero
 * confidence, which the agent reads as "do nothing".
 */
export const resolveConflict = (claims: Claim[], options: ResolveOptions = {}): Verdict => {
  const now = options.now ?? Date.now()
  const floor = options.floor ?? 55

  if (claims.length === 0) {
    return {
      assertion: 'none', weight: 0, opposing_weight: 0, agreement: 1, support: [],
      authors: 0, dissent: [], tie_break: 'none', confidence: 0, action: 'suggest',
    }
  }

  type Group = {
    assertion: string
    weight: number
    claims: Claim[]
    authors: Set<string>
    newest: number
    smallestPostId: string
  }

  const groups = new Map<string, Group>()
  for (const claim of claims) {
    const weight = claimWeight(claim, now)
    const group = groups.get(claim.assertion) ?? {
      assertion: claim.assertion,
      weight: 0,
      claims: [],
      authors: new Set<string>(),
      newest: -Infinity,
      smallestPostId: claim.post_id,
    }
    group.weight += weight
    group.claims.push(claim)
    group.authors.add(claim.user_id)
    group.newest = Math.max(group.newest, Date.parse(claim.created_at))
    if (claim.post_id < group.smallestPostId) group.smallestPostId = claim.post_id
    groups.set(claim.assertion, group)
  }

  // Corroboration is applied to the group, not the claim: it is a property of
  // how many independent people said it, which no single claim knows.
  const scored = [...groups.values()].map((group) => ({
    ...group,
    total: group.weight * corroborationFactor(group.authors.size),
  }))

  let tieBreak: TieBreak = 'none'
  scored.sort((a, b) => {
    if (Math.abs(a.total - b.total) > TIE_EPSILON) return b.total - a.total
    if (a.authors.size !== b.authors.size) { tieBreak = 'authors'; return b.authors.size - a.authors.size }
    if (a.newest !== b.newest) { tieBreak = 'recency'; return b.newest - a.newest }
    tieBreak = 'post_id'
    return a.smallestPostId < b.smallestPostId ? -1 : 1
  })

  const winner = scored[0]
  if (!winner) {
    return {
      assertion: 'none', weight: 0, opposing_weight: 0, agreement: 1, support: [],
      authors: 0, dissent: [], tie_break: 'none', confidence: 0, action: 'suggest',
    }
  }

  const losers = scored.slice(1)
  const opposing = losers.reduce((sum, group) => sum + group.total, 0)
  const agreement = winner.total + opposing > 0 ? winner.total / (winner.total + opposing) : 1

  // The weighted mean of per-post confidence across the winning group.
  const supportWeight = winner.claims.reduce((sum, c) => sum + claimWeight(c, now), 0)
  const base = supportWeight > 0
    ? winner.claims.reduce((sum, c) => sum + c.confidence * claimWeight(c, now), 0) / supportWeight
    : 0

  const confidence = incidentConfidence(base, agreement, winner.authors.size)

  // Dissent is recorded per post, not per group, so a staff member sees the
  // actual contradicting report and can open it.
  const dissent: DissentEntry[] = losers.flatMap((group) =>
    group.claims.map((claim) => ({
      post_id: claim.post_id,
      assertion: claim.assertion,
      weight: round(claimWeight(claim, now)),
      note: `${claim.post_id} says "${claim.assertion}" against the verdict "${winner.assertion}"`,
    })),
  ).sort((a, b) => b.weight - a.weight)

  return {
    assertion: winner.assertion,
    weight: round(winner.total),
    opposing_weight: round(opposing),
    agreement: round(agreement),
    support: winner.claims.map((c) => c.post_id),
    authors: winner.authors.size,
    dissent,
    tie_break: losers.length === 0 ? 'none' : tieBreak,
    confidence,
    // The floor. Below it the agent writes a suggestion row and does not act.
    action: confidence >= floor ? 'act' : 'suggest',
  }
}

/** A one-line rendering of the dissent, for the civic page and the prompt. */
export const dissentNote = (verdict: Verdict): string => {
  if (verdict.dissent.length === 0) return 'No contradicting reports.'
  const first = verdict.dissent[0]
  const others = verdict.dissent.length - 1
  return `${verdict.dissent.length} contradicting report${verdict.dissent.length === 1 ? '' : 's'}`
    + `: ${first?.post_id} says "${first?.assertion}"`
    + (others > 0 ? ` and ${others} more` : '')
    + `. Agreement ${Math.round(verdict.agreement * 100)}%.`
}
