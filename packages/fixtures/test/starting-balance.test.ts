import { beforeEach, describe, expect, it } from 'vitest'
import { STARTING_BALANCE, balance, buy, credit, listShop, reset } from '../src/store'

/**
 * Moment 5 asks a judge to open the shop and buy something. Their phone is a
 * `device:` id nobody seeded, so what an unseeded account is worth is the whole
 * question of whether that moment works on a stranger's phone.
 */
const JUDGE = 'device:abcdef0123456789'

beforeEach(() => {
  reset()
})

describe('what a new account starts with', () => {
  it('gives a phone nobody has seen before enough to buy something', () => {
    expect(balance(JUDGE)).toBe(STARTING_BALANCE)
    const cheapest = Math.min(...listShop().map((i) => i.price))
    expect(STARTING_BALANCE).toBeGreaterThanOrEqual(cheapest)
  })

  it('survives a reset, because a reset is how the demo starts again', () => {
    credit(JUDGE, 40)
    expect(balance(JUDGE)).toBe(STARTING_BALANCE + 40)
    reset()
    expect(balance(JUDGE)).toBe(STARTING_BALANCE)
  })

  it('does not refill an account that spent its way down', () => {
    // The bug this guards: `?? STARTING_BALANCE` reads a stored 0 correctly,
    // `|| STARTING_BALANCE` would hand out sixty more on every read and make
    // the shop free.
    credit(JUDGE, -STARTING_BALANCE)
    expect(balance(JUDGE)).toBe(0)
    expect(balance(JUDGE)).toBe(0)
  })

  it('leaves the balances the seed authored alone', () => {
    // The feed's residents are written with their own balances on purpose.
    expect(balance('u-gov')).toBe(0)
    expect(balance('u-sarah')).not.toBe(STARTING_BALANCE)
  })
})

describe('spending it', () => {
  it('lets a new account buy without earning first, and charges it', () => {
    const item = listShop().find((i) => i.price <= STARTING_BALANCE)!
    const result = buy(JUDGE, item.item_tag)
    expect(result.ok).toBe(true)
    expect(result.balance).toBe(STARTING_BALANCE - item.price)
  })

  it('still refuses what the starting balance does not cover', () => {
    const dear = listShop().find((i) => i.price > STARTING_BALANCE)
    if (!dear) return
    expect(buy(JUDGE, dear.item_tag)).toMatchObject({ ok: false, reason: 'insufficient balance' })
  })
})
