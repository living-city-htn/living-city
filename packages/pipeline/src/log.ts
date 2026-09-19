/**
 * Structured pipeline logging.
 *
 * Two audiences. `log.*` goes to the server console for the operator. The
 * `CorrectionLog` is the one the spec cares about: docs/03 section 9 says every
 * validator correction is recorded, because a rising correction rate is the
 * earliest signal that a prompt edit went wrong. It is stored with the plan as
 * `validator_log` (docs/02 section 7).
 */

export type CorrectionLog = string[]

export const correction = (log: CorrectionLog, message: string): void => {
  log.push(message)
}

const stamp = () => new Date().toISOString()

export const log = {
  info: (event: string, data?: Record<string, unknown>) =>
    console.log(`[pipeline] ${stamp()} ${event}`, data ? JSON.stringify(data) : ''),
  warn: (event: string, data?: Record<string, unknown>) =>
    console.warn(`[pipeline] ${stamp()} ${event}`, data ? JSON.stringify(data) : ''),
  error: (event: string, data?: Record<string, unknown>) =>
    console.error(`[pipeline] ${stamp()} ${event}`, data ? JSON.stringify(data) : ''),
}
