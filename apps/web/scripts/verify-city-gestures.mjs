import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.ASSET_TEST_URL ?? 'http://localhost:3100'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use localhost.')
const output = process.env.ASSET_TEST_OUTPUT ?? '/tmp/living-city-asset-verification'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base)
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForFunction(() => document.body.innerText.includes('pts') && !document.body.innerText.includes('— pts'))
  // Let pending model loads and shader compilation finish before comparing views.
  await page.waitForTimeout(1500)
  const canvas = page.locator('canvas')
  const before = await canvas.screenshot()
  const box = await canvas.boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  const cdp = await context.newCDPSession(page)
  const points = spread => [{ x: x - spread, y, id: 0 }, { x: x + spread, y, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) })
  for (const spread of [40, 50, 65, 80, 95]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(spread) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(500)
  const after = await canvas.screenshot()
  expect(after.equals(before)).toBe(false)
  await page.screenshot({ path: `${output}/city-pinched-390.png` })
  expect(errors).toEqual([])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const sample = await page.evaluate(() => new Promise(resolve => {
    const times = []; const started = performance.now()
    const frame = now => { times.push(now); if (now - started < 2500) requestAnimationFrame(frame); else resolve({ frames: times.length, elapsed: now - started, fps: (times.length - 1) * 1000 / (now - times[0]) }) }
    requestAnimationFrame(frame)
  }))
  const report = { pinch: 'passed: two-touch gesture changed the rendered view', errors, desktopFrameSample: sample, limitation: 'Headless desktop animation-frame sample only; not a physical-phone GPU benchmark.' }
  await writeFile(`${output}/gestures.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close() }
