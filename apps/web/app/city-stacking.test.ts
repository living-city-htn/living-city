import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

/**
 * A stacking rule the demo depends on and nothing else would catch.
 *
 * drei's <Html> overlays live in the DOM beside the canvas carrying z-indexes
 * near 16 million. Without a stacking context on the city layer those compete
 * with the shell's own numbers, and the City Hall control's full-screen wrapper
 * silently covers the post receipt: the card renders, the buttons look fine,
 * and every click lands on the overlay instead. Nobody finds that until they
 * press "Dismiss" on stage and nothing happens.
 *
 * This asserts the fence rather than the symptom, because the symptom only
 * exists in a real browser and the fence is one word.
 */
const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8')

it('isolates the city layer, so the scene cannot paint over the shell', () => {
  const rule = css.match(/^\.city-layer\s*\{[^}]*\}/m)?.[0]
  expect(rule, '.city-layer rule missing from globals.css').toBeDefined()
  expect(rule).toMatch(/isolation:\s*isolate/)
})
