/**
 * Design tokens for the whole dashboard.
 *
 * Single source of truth: charts draw to <canvas> and need real colour strings,
 * so the tokens live in TS and are mirrored into CSS custom properties by
 * `cssVars()` (applied on the root element in App). Both modes are *selected*
 * — the dark column is the same eight hues re-stepped for the dark surface,
 * not an automatic flip.
 */
export interface Palette {
  mode: 'light' | 'dark'
  surface1: string
  surface2: string
  page: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  grid: string
  axis: string
  border: string
  series: string[]
  /** Sequential blue ramp, light -> dark (100..700). */
  seq: string[]
  good: string
  warning: string
  serious: string
  critical: string
}

const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

const SEQ_LIGHT = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
const SEQ_DARK = [...SEQ_LIGHT]

export const LIGHT: Palette = {
  mode: 'light',
  surface1: '#fcfcfb',
  surface2: '#f4f4f1',
  page: '#f9f9f7',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  border: 'rgba(11,11,11,0.10)',
  series: SERIES_LIGHT,
  seq: SEQ_LIGHT,
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

export const DARK: Palette = {
  mode: 'dark',
  surface1: '#1a1a19',
  surface2: '#232322',
  page: '#0d0d0d',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  border: 'rgba(255,255,255,0.10)',
  series: SERIES_DARK,
  seq: SEQ_DARK,
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

/** Mirror the active palette into CSS custom properties for the plain-CSS layer. */
export function cssVars(p: Palette): Record<string, string> {
  const vars: Record<string, string> = {
    colorScheme: p.mode,
    '--surface-1': p.surface1,
    '--surface-2': p.surface2,
    '--page': p.page,
    '--text-primary': p.textPrimary,
    '--text-secondary': p.textSecondary,
    '--text-muted': p.textMuted,
    '--grid': p.grid,
    '--axis': p.axis,
    '--border': p.border,
    '--good': p.good,
    '--warning': p.warning,
    '--serious': p.serious,
    '--critical': p.critical,
  }
  p.series.forEach((c, i) => { vars[`--series-${i + 1}`] = c })
  return vars
}

/** Translate a hex colour to rgba() at the given alpha — used for spread bands. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
