import { communityGeo, decorationSlot, type CommunityGeo, type DecorationSlot } from '@living-city/contracts'
import cityRaw from '../data/processed/city.json'
import slotsRaw from '../data/processed/slots.json'

export type ProcessedCity = {
  communities: readonly CommunityGeo[]
  slots: readonly DecorationSlot[]
}

/**
 * The hand-drawn visual city and its stable personal-decoration slots. Raw
 * municipal polygons are deliberately absent: they belong only to assignment.
 */
export const processedCity: ProcessedCity = {
  communities: communityGeo.array().parse(cityRaw.communities),
  slots: decorationSlot.array().parse(slotsRaw),
}
