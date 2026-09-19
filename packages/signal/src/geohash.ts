/**
 * Geohash encoding, so a document can carry the cell it falls in and ES|QL can
 * group by it.
 *
 * ES|QL's own spatial functions (`ST_DISTANCE`, `ST_GEOHASH`) arrived across
 * several 8.x minors, and a demo should not depend on which minor the cluster
 * on the day happens to be. Twenty-five lines of standard geohash here works
 * against every version, and the cell is computed once at write time rather
 * than per query.
 *
 * Precision 6 is roughly 1.2 km by 0.6 km at this latitude. That is the coarse
 * pre-filter, not the answer: `incidentClusters` refines each candidate cell to
 * an exact 500 m radius with a `geo_distance` count, server-side. The cell is a
 * cheap way to find candidates, not a claim about distance.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export const GEOHASH_PRECISION = 6

export const encodeGeohash = (lon: number, lat: number, precision = GEOHASH_PRECISION): string => {
  let lonRange: [number, number] = [-180, 180]
  let latRange: [number, number] = [-90, 90]
  let hash = ''
  let bits = 0
  let bit = 0
  let even = true

  while (hash.length < precision) {
    if (even) {
      const mid = (lonRange[0] + lonRange[1]) / 2
      if (lon >= mid) { bits = (bits << 1) + 1; lonRange = [mid, lonRange[1]] }
      else { bits <<= 1; lonRange = [lonRange[0], mid] }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2
      if (lat >= mid) { bits = (bits << 1) + 1; latRange = [mid, latRange[1]] }
      else { bits <<= 1; latRange = [latRange[0], mid] }
    }
    even = !even
    if (++bit === 5) {
      hash += BASE32[bits]
      bits = 0
      bit = 0
    }
  }
  return hash
}
