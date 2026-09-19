'use client'

import { useState } from 'react'
import { CITY_ASSETS } from '@living-city/modeling'
import AssetPreview from '@/components/AssetPreview'
import './assets.css'

function Thumbnail({ id }: { id: string }) {
  const [failed, setFailed] = useState(false)
  return <span className="asset-gallery-thumbnail" aria-hidden="true">{!failed ? <img src={`/assets/previews/${id}.png`} alt="" width={52} height={52} loading="lazy" onError={() => setFailed(true)} /> : <span>◇</span>}</span>
}

export default function AssetGallery() {
  const [selectedId, setSelectedId] = useState(CITY_ASSETS[0]?.id)
  const [category, setCategory] = useState('all')
  const selected = CITY_ASSETS.find(asset => asset.id === selectedId)
  const categories = [...new Set(CITY_ASSETS.map(asset => asset.category))]
  const visible = CITY_ASSETS.filter(asset => category === 'all' || asset.category === category)
  return <main className="asset-gallery">
    <header className="asset-gallery-heading"><div><a href="/">← Living City</a><h1>City objects</h1><p>A shared collection for the city and your decorations.</p></div><span>{CITY_ASSETS.length} assets</span></header>
    <div className="asset-gallery-layout">
      <section className="asset-gallery-selection" aria-label="Choose a city asset">
        <label htmlFor="asset-category">Collection</label><select id="asset-category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All objects</option>{categories.map(name => <option value={name} key={name}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>)}</select>
        <ul className="asset-gallery-list">{visible.map(asset => <li key={asset.id}><button type="button" aria-pressed={selected?.id === asset.id} onClick={() => setSelectedId(asset.id)}><Thumbnail id={asset.id} /><span className="asset-gallery-item-label"><strong>{asset.label}</strong><span>{asset.category}</span></span></button></li>)}</ul>
      </section>
      {selected && <section className="asset-gallery-detail" aria-label={`${selected.label} details`}>
        <h2>{selected.label}</h2><AssetPreview asset={selected} />
        <p className="asset-gallery-help">Drag to rotate. Pinch or scroll to zoom. Focus the preview and use arrow keys to rotate, + / − to zoom, 0 to reset. Grid spacing: 0.5 city units.</p>
        <dl className="asset-gallery-facts"><div><dt>Footprint</dt><dd>{selected.footprint.map(value => value.toFixed(2)).join(' × ')} units</dd></div><div><dt>Height</dt><dd>{selected.height.toFixed(2)} units</dd></div><div><dt>Ground alignment</dt><dd>Centered base, elevation 0</dd></div><div><dt>Materials</dt><dd>{selected.paletteSlots.length ? selected.paletteSlots.join(', ') : 'Original palette'}</dd></div></dl>
        <p className="asset-gallery-source">{selected.source.license === 'original' ? 'Created for Living City.' : <><a href={selected.source.url} target="_blank" rel="noreferrer">{selected.source.name}</a> · CC0 1.0</>}</p>
        <a className="asset-gallery-download" href={selected.url} download>Download model (.glb)</a>
      </section>}
    </div>
  </main>
}
