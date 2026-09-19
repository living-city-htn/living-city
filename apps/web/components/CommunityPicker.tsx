'use client'

import type { CityPayload } from './city'

/** HTML alternative to scene picking; remains usable with either scene renderer. */
export default function CommunityPicker({ communities, selectedId, onSelect, picking }: {
  communities: CityPayload['communities']
  selectedId: string | null
  onSelect: (id: string | null) => void
  picking: boolean
}) {
  return <div className="community-picker">
    <label htmlFor="scene-community">{picking ? 'Choose your post location' : 'Explore a community'}</label>
    <select id="scene-community" value={picking ? '' : selectedId ?? ''} onChange={event => onSelect(event.target.value || null)}>
      <option value="">{picking ? 'Choose a community' : 'All communities'}</option>
      {communities.map(community => <option key={community.community_id} value={community.community_id}>{community.name}</option>)}
    </select>
  </div>
}
