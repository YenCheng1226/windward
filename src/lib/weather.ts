/** WMO codes, unit formatting, and the statistics the ensemble/model panels display. */

export interface WmoInfo {
  label: string
  icon: string
  /** Rough severity, used only to decide whether a day earns a status chip. */
  severe: boolean
}

const WMO: Record<number, WmoInfo> = {
  0: { label: '晴朗', icon: '☀️', severe: false },
  1: { label: '大致晴朗', icon: '🌤️', severe: false },
  2: { label: '局部多雲', icon: '⛅', severe: false },
  3: { label: '陰天', icon: '☁️', severe: false },
  45: { label: '有霧', icon: '🌫️', severe: false },
  48: { label: '凍霧', icon: '🌫️', severe: false },
  51: { label: '毛毛雨', icon: '🌦️', severe: false },
  53: { label: '毛毛雨', icon: '🌦️', severe: false },
  55: { label: '強毛毛雨', icon: '🌦️', severe: false },
  56: { label: '凍毛雨', icon: '🌧️', severe: false },
  57: { label: '強凍毛雨', icon: '🌧️', severe: false },
  61: { label: '小雨', icon: '🌦️', severe: false },
  63: { label: '中雨', icon: '🌧️', severe: false },
  65: { label: '大雨', icon: '🌧️', severe: true },
  66: { label: '凍雨', icon: '🌧️', severe: true },
  67: { label: '強凍雨', icon: '🌧️', severe: true },
  71: { label: '小雪', icon: '🌨️', severe: false },
  73: { label: '中雪', icon: '🌨️', severe: false },
  75: { label: '大雪', icon: '❄️', severe: true },
  77: { label: '雪珠', icon: '🌨️', severe: false },
  80: { label: '陣雨', icon: '🌦️', severe: false },
  81: { label: '強陣雨', icon: '🌧️', severe: false },
  82: { label: '劇烈陣雨', icon: '⛈️', severe: true },
  85: { label: '陣雪', icon: '🌨️', severe: false },
  86: { label: '強陣雪', icon: '❄️', severe: true },
  95: { label: '雷雨', icon: '⛈️', severe: true },
  96: { label: '雷雨伴冰雹', icon: '⛈️', severe: true },
  99: { label: '強雷雨伴冰雹', icon: '⛈️', severe: true },
}

const UNKNOWN: WmoInfo = { label: '—', icon: '·', severe: false }
export const wmo = (code: number | null | undefined): WmoInfo => (code == null ? UNKNOWN : WMO[code] ?? UNKNOWN)

/** Beaufort-style descriptor for m/s, matching the CWA wording Taiwanese users expect. */
export function windLevel(ms: number | null): { bft: number; label: string } {
  if (ms == null) return { bft: 0, label: '—' }
  const limits = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]
  const labels = ['無風', '軟風', '輕風', '微風', '和風', '清風', '強風', '疾風', '大風', '烈風', '狂風', '暴風', '颶風']
  let bft = limits.findIndex((l) => ms < l)
  if (bft === -1) bft = 12
  return { bft, label: labels[bft] }
}

export const COMPASS = ['北', '東北偏北', '東北', '東北偏東', '東', '東南偏東', '東南', '東南偏南', '南', '西南偏南', '西南', '西南偏西', '西', '西北偏西', '西北', '西北偏北']
export const compass = (deg: number | null): string => (deg == null ? '—' : COMPASS[Math.round((deg % 360) / 22.5) % 16])

export const VAR_LABELS: Record<string, string> = {
  temperature_2m: '氣溫',
  apparent_temperature: '體感溫度',
  relative_humidity_2m: '相對濕度',
  dew_point_2m: '露點',
  precipitation: '降水量',
  precipitation_probability: '降水機率',
  cloud_cover: '雲量',
  wind_speed_10m: '風速',
  wind_gusts_10m: '陣風',
  wind_direction_10m: '風向',
  pressure_msl: '海平面氣壓',
  cape: '對流可用位能',
  weather_code: '天氣現象',
}

/** Decimal places that make sense per variable — keeps tables from screaming precision. */
const PRECISION: Record<string, number> = {
  temperature_2m: 1,
  apparent_temperature: 1,
  dew_point_2m: 1,
  precipitation: 1,
  wind_speed_10m: 1,
  wind_gusts_10m: 1,
  pressure_msl: 0,
  relative_humidity_2m: 0,
  precipitation_probability: 0,
  cloud_cover: 0,
  wind_direction_10m: 0,
  cape: 0,
}

export function fmt(value: number | null | undefined, variable: string): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(PRECISION[variable] ?? 1)
}

// ---------------------------------------------------------------- statistics

/** Linear-interpolated quantile over the finite values of `xs`. Returns null if empty. */
export function quantile(xs: (number | null)[], q: number): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const pos = (v.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo)
}

export interface Spread {
  min: (number | null)[]
  p10: (number | null)[]
  p25: (number | null)[]
  median: (number | null)[]
  p75: (number | null)[]
  p90: (number | null)[]
  max: (number | null)[]
  /** p90 − p10 at each step: the headline "how uncertain is this?" number. */
  iqr90: (number | null)[]
}

/** Collapse per-member series into per-timestep quantiles. */
export function spreadOf(members: (number | null)[][], length: number): Spread {
  const out: Spread = { min: [], p10: [], p25: [], median: [], p75: [], p90: [], max: [], iqr90: [] }
  for (let i = 0; i < length; i++) {
    const col = members.map((m) => m[i])
    const finite = col.filter((x): x is number => x != null && Number.isFinite(x))
    if (!finite.length) {
      for (const k of Object.keys(out) as (keyof Spread)[]) out[k].push(null)
      continue
    }
    const p10 = quantile(col, 0.1)!
    const p90 = quantile(col, 0.9)!
    out.min.push(Math.min(...finite))
    out.p10.push(p10)
    out.p25.push(quantile(col, 0.25))
    out.median.push(quantile(col, 0.5))
    out.p75.push(quantile(col, 0.75))
    out.p90.push(p90)
    out.max.push(Math.max(...finite))
    out.iqr90.push(p90 - p10)
  }
  return out
}

/** Fraction of members at or above `threshold` — e.g. P(rain ≥ 1 mm). */
export function exceedance(members: (number | null)[][], length: number, threshold: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < length; i++) {
    const col = members.map((m) => m[i]).filter((x): x is number => x != null && Number.isFinite(x))
    out.push(col.length ? (col.filter((x) => x >= threshold).length / col.length) * 100 : null)
  }
  return out
}

/**
 * Confidence label from ensemble spread. The thresholds are per-variable because a
 * 3 °C temperature spread and a 3 mm rainfall spread mean very different things.
 */
export function confidence(iqr90: number | null, variable: string): { level: '高' | '中' | '低' | '—'; tone: 'good' | 'warning' | 'critical' | 'muted' } {
  if (iqr90 == null) return { level: '—', tone: 'muted' }
  const bands: Record<string, [number, number]> = {
    temperature_2m: [2.5, 5],
    apparent_temperature: [3, 6],
    precipitation: [1, 5],
    wind_speed_10m: [2, 5],
    pressure_msl: [4, 9],
    cloud_cover: [30, 60],
    relative_humidity_2m: [15, 30],
  }
  const [hi, lo] = bands[variable] ?? [2.5, 5]
  if (iqr90 <= hi) return { level: '高', tone: 'good' }
  if (iqr90 <= lo) return { level: '中', tone: 'warning' }
  return { level: '低', tone: 'critical' }
}

/** Max−min across deterministic models at each step: the model-disagreement trace. */
export function modelSpread(byModel: Record<string, (number | null)[]>, length: number): (number | null)[] {
  const cols = Object.values(byModel)
  const out: (number | null)[] = []
  for (let i = 0; i < length; i++) {
    const v = cols.map((c) => c[i]).filter((x): x is number => x != null && Number.isFinite(x))
    out.push(v.length > 1 ? Math.max(...v) - Math.min(...v) : null)
  }
  return out
}

// ---------------------------------------------------------------- formatting

const pad = (n: number) => String(n).padStart(2, '0')

const ok = (ms: number) => Number.isFinite(ms)

/**
 * These read UTC fields on purpose — see the time note in openmeteo.ts.
 * An unparseable timestamp degrades to an em dash; printing "NaN/NaN" into a date
 * cell is worse than admitting the value is missing.
 */
export const hourLabel = (ms: number) => (ok(ms) ? `${pad(new Date(ms).getUTCHours())}:00` : '—')
export const dayLabel = (ms: number) => (ok(ms) ? `${new Date(ms).getUTCMonth() + 1}/${new Date(ms).getUTCDate()}` : '—')
export const weekdayLabel = (ms: number) => (ok(ms) ? '日一二三四五六'[new Date(ms).getUTCDay()] : '—')
export const dateTimeLabel = (ms: number) => (ok(ms) ? `${dayLabel(ms)}（${weekdayLabel(ms)}）${hourLabel(ms)}` : '—')

export function relativeDay(ms: number, nowMs: number): string {
  if (!Number.isFinite(ms)) return '—'
  // Calendar-day difference: a 16:00 "now" must still call today's 00:00 row 今天.
  const day = (t: number) => Math.floor(t / 86400000)
  const d = day(ms) - day(nowMs)
  if (d === 0) return '今天'
  if (d === 1) return '明天'
  if (d === 2) return '後天'
  return d > 0 ? `+${d} 天` : `${d} 天`
}
