/**
 * Structured signal-layer logging, same shape as `packages/pipeline/src/log.ts`
 * so one console reads as one system.
 */
const stamp = () => new Date().toISOString()

export const log = {
  info: (event: string, data?: Record<string, unknown>) =>
    console.log(`[signal] ${stamp()} ${event}`, data ? JSON.stringify(data) : ''),
  warn: (event: string, data?: Record<string, unknown>) =>
    console.warn(`[signal] ${stamp()} ${event}`, data ? JSON.stringify(data) : ''),
  error: (event: string, data?: Record<string, unknown>) =>
    console.error(`[signal] ${stamp()} ${event}`, data ? JSON.stringify(data) : ''),
}
