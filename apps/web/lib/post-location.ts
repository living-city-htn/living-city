type Community = { community_id: string; name: string; centroid: number[] }

/** Demo fallback shared by GPS confirmation and post assignment. Replace with
 * Map's official-boundary resolver when it lands; visual polygons are not boundaries. */
export function nearestCommunity(communities: Community[], lon: number, lat: number): Community | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null
  let nearest: Community | null = null
  let distance = Infinity
  for (const community of communities) {
    const [clon, clat] = community.centroid
    if (clon === undefined || clat === undefined || !Number.isFinite(clon) || !Number.isFinite(clat)) continue
    const candidate = Math.hypot(clon - lon, clat - lat)
    if (candidate < distance) { distance = candidate; nearest = community }
  }
  return nearest
}
