/** Redrob Design System 2026 launch splash (generated; see redrob-splash.js). */
export interface RedrobSplashOptions {
  /** redrob-logo-primary.png, for a light ground */
  logoLight: string
  /** redrob-logo-primary-white.png, for a dark ground */
  logoDark: string
  /** settles when the app can be used */
  ready?: Promise<unknown>
  /** default: <html data-theme>, then the system */
  theme?: 'light' | 'dark' | 'system'
  /** default: document.body */
  parent?: HTMLElement
  /** once per session via sessionStorage, default true */
  once?: boolean
  /** default: the system setting */
  reducedMotion?: boolean
  /** give up waiting for `ready` after this, default 20000 */
  maxMs?: number
}

export function showRedrobSplash(opts: RedrobSplashOptions): Promise<void>
export default showRedrobSplash
