import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.ASSET_TEST_URL ?? 'http://localhost:3100'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('This rehearsal writes fixture data; use localhost only.')
const output = process.env.ASSET_TEST_OUTPUT ?? '/tmp/living-city-asset-verification'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { widths: [], journey: [], failures: [], screenshots: [] }
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', hasTouch: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const nav = name => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true })
const screenshot = async name => { await page.screenshot({ path: `${output}/${name}.png` }); report.screenshots.push(name) }
const json = async response => { if (!response.ok()) throw new Error(`${response.status()} ${await response.text()}`); return response.json() }
try {
  // Guard against accidentally running this fixture rehearsal against a real provider.
  if (process.env.ASSET_TEST_FIXTURES !== '1') throw new Error('Set ASSET_TEST_FIXTURES=1 only after starting a local server with USE_FIXTURES=1 and empty DATABASE_URL/POSTGRES_URL.')
  await json(await page.request.post(`${base}/api/operator/reset`))
  const city = await json(await page.request.get(`${base}/api/city`))
  const shop = await json(await page.request.get(`${base}/api/shop`))
  const community = city.communities[0]
  await page.goto(base)
  await expect(nav('Shop')).toBeVisible()
  await page.waitForFunction(() => !document.querySelector('[data-nextjs-dialog]'))
  await nav('Shop').click()
  await expect(page.getByRole('heading', { name: 'Decorations', exact: true })).toBeVisible()
  await expect(page.locator('.shop-item')).toHaveCount(6)
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const screen of ['City', 'Shop', 'My City']) {
      await nav(screen).click()
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width)
      expect(await page.evaluate(() => !document.activeElement?.closest('[inert]'))).toBe(true)
      expect(await page.evaluate(() => [...document.querySelectorAll('[data-shown="false"]')].every(element => element.hasAttribute('inert')))).toBe(true)
      if (width === 390 || width === 1440) await screenshot(`${screen.toLowerCase().replaceAll(' ', '-')}-${width}`)
    }
    report.widths.push(width)
  }
  // Every shop product completes the real local purchase/placement route and UI transition.
  for (const item of shop.items) {
    let me = await json(await page.request.get(`${base}/api/me`))
    while (me.balance < item.price) {
      const posted = await json(await page.request.post(`${base}/api/posts`, { data: { text: `Local asset rehearsal for ${item.label}`, community_id: community.community_id } }))
      expect(posted.points_earned).toBeGreaterThan(0)
      me = await json(await page.request.get(`${base}/api/me`))
    }
    await nav('City').click()
    await nav('Shop').click()
    const buy = page.getByRole('button', { name: `Buy ${item.label} for ${item.price} points`, exact: true })
    await expect(buy).toBeEnabled()
    await buy.click()
    await expect(page.getByText(`${item.label} added to your collection.`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Decorate My City', exact: false }).click()
    await page.getByRole('combobox', { name: 'Explore a community' }).selectOption(community.community_id)
    const place = page.getByRole('button', { name: `Place ${item.label} in slot 1`, exact: true })
    await expect(place).toBeEnabled()
    await place.click()
    const takeBack = page.getByRole('button', { name: `Take back ${item.label} from slot 1`, exact: true })
    await expect(takeBack).toBeEnabled()
    const placements = await json(await page.request.get(`${base}/api/me/placements`))
    expect(placements.placements.some(p => p.item_tag === item.item_tag)).toBe(true)
    await screenshot(`placed-${item.item_tag}`)
    await takeBack.click()
    await expect(takeBack).toHaveCount(0)
    report.journey.push(item.item_tag)
  }
  for (let i = 0; i < 2; i++) await json(await page.request.post(`${base}/api/posts`, { data: { text: 'Local purchase failure rehearsal', community_id: community.community_id } }))
  await nav('City').click()
  await nav('Shop').click()
  await page.route('**/api/shop/buy', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Purchase unavailable for local failure test' }) }))
  await page.getByRole('button', { name: 'Buy Park bench for 20 points', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh shop' })).toBeVisible()
  report.failures.push('purchase failure shows recovery')
  await page.unroute('**/api/shop/buy')
  await page.goto(`${base}/assets`)
  await expect(page.getByRole('heading', { name: 'City objects' })).toBeVisible()
  await expect(page.locator('.asset-preview-status')).toHaveCount(0)
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.locator('.asset-preview canvas').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Home')
  await screenshot('gallery-1440')
  await page.route('**/assets/city/models/**', route => route.abort())
  await page.getByRole('button', { name: /Garden house/i }).click()
  await expect(page.getByText('This model could not load.', { exact: false })).toBeVisible()
  report.failures.push('gallery model failure shows recovery')
  await page.goto(base)
  await expect(nav('City')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await screenshot('procedural-fallback')
  report.failures.push('city survives failed model requests')
  expect(errors).toEqual([])
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await screenshot('failure-state').catch(() => {})
  await writeFile(`${output}/failure.txt`, `${error.stack}\n\n${await page.locator('body').innerText().catch(() => '')}`)
  throw error
} finally { await browser.close() }
