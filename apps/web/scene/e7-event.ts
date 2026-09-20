/**
 * E7 is inside the northwest campus visual block. The scene only exposes the
 * event signal when the accepted public plan calls the block festive; a photo
 * or a private placement must not change public geometry by itself.
 */
export const E7_COMMUNITY_ID = 'kw:uw-northwest-campus'

export function isE7FestivalLive(communityId: string, mood: string | undefined) {
  return communityId === E7_COMMUNITY_ID && mood === 'festive'
}

export function e7EventLabel(effects: readonly string[]) {
  return effects.includes('fireworks') ? 'E7 · fireworks live' : 'E7 · festival live'
}
