import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.ASSET_TEST_URL ?? 'http://localhost:3100'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use a local server for asset captures.')
const destination = fileURLToPath(new URL('../public/assets/previews/', import.meta.url))
await mkdir(destination, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(`${base}/assets`)
  await page.waitForFunction(() => typeof window.__captureAssetThumbnail === 'function')
  const response = await page.request.get(`${base}/assets/city/manifest.json`)
  if (!response.ok()) throw new Error('Asset manifest failed to load')
  const manifest = await response.json()
  const assets = Array.isArray(manifest) ? manifest : manifest.assets
  for (const asset of assets) {
    if (!/^[a-z0-9-]+$/.test(asset.id)) throw new Error(`Unsafe asset id: ${asset.id}`)
    const data = await page.evaluate(id => window.__captureAssetThumbnail(id), asset.id)
    if (!data.startsWith('data:image/png;base64,')) throw new Error(`No rendered preview for ${asset.id}`)
    await writeFile(`${destination}${asset.id}.png`, Buffer.from(data.split(',')[1], 'base64'))
    console.log(`Captured ${asset.id}`)
  }
  console.log(`Rendered ${assets.length} previews from the shipped GLBs.`)
} finally { await browser.close() }
