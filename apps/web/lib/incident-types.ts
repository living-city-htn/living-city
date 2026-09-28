/**
 * The incident types a resident can report, with the labels every surface
 * uses. Client-safe: no store import, so the composer can use it without
 * pulling the database client into the browser bundle.
 *
 * The list must equal `REPORTABLE_INCIDENT_TYPES` in the fixtures store and the
 * contract's INCIDENT_TYPE minus `none`; incident-types.test.ts checks both.
 */
export const INCIDENT_TYPES = [
  'flooding', 'fallen_tree', 'road_blocked', 'power_outage', 'fire', 'accident',
  'infrastructure_damage', 'snow_ice', 'sanitation', 'safety_concern', 'noise', 'other',
] as const

export type IncidentType = (typeof INCIDENT_TYPES)[number]

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  flooding: 'Flooding',
  fallen_tree: 'Fallen tree',
  road_blocked: 'Road blocked',
  power_outage: 'Power outage',
  fire: 'Fire',
  accident: 'Accident',
  infrastructure_damage: 'Damaged infrastructure',
  snow_ice: 'Snow or ice',
  sanitation: 'Sanitation',
  safety_concern: 'Safety concern',
  noise: 'Noise',
  other: 'Other',
}

export const incidentLabel = (type: string): string =>
  (INCIDENT_LABELS as Record<string, string>)[type] ?? 'Other'

export type IncidentStatus = 'reported' | 'verified' | 'resolved'

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  reported: 'Unverified',
  verified: 'Verified',
  resolved: 'Resolved',
}

/** Marker colours on the map, by status. Resolved incidents are not drawn. */
export const STATUS_COLORS: Record<Exclude<IncidentStatus, 'resolved'>, string> = {
  reported: '#f2a900',
  verified: '#e5484d',
}
