/**
 * Water-activity suitability model.
 *
 * ## What this is, and what it is not
 * The thresholds below are **operational rules of thumb** drawn from how dive
 * operators, SUP schools and surf forecasts talk about conditions — not an official
 * standard, and not calibrated against any local record for a specific site. They are
 * deliberately written as data so they can be argued with and adjusted; every number
 * that drives a verdict is visible in `ACTIVITIES` rather than buried in a formula.
 *
 * Two design decisions matter more than the exact numbers:
 *
 * 1. **The worst factor governs.** Water sports are limited, not averaged: a glassy
 *    sea with 12 m/s wind is not a "70 % day" for SUP, it is off. Any criterion that
 *    reaches its veto threshold zeroes the whole score, and the remaining criteria
 *    combine as a weighted *geometric* mean so one weak factor still drags hard.
 * 2. **The limiting factor is the output.** A single 0–100 number is nearly useless
 *    for planning; knowing that Thursday is limited by swell and Friday by wind tells
 *    you which forecast to re-check and what the fallback is.
 */

export interface Conditions {
  /**
   * Offshore significant wave height from the ~25 km ocean grid cell, m.
   * This is the open-water crossing condition — use it for the ferry, not for a
   * dive site that sits in the island's lee.
   */
  waveHeight: number | null
  /**
   * Estimated wave height on the sheltered side of the island, m.
   * Dive and snorkel operators choose the lee shore, so this is what their own
   * go/no-go thresholds are really about. See `shelterFactor` for the assumption.
   */
  waveLee: number | null
  /** Dominant wave direction, degrees the waves come from. */
  waveFrom: number | null
  /** Peak wave period, s — separates groundswell from wind chop. */
  wavePeriod: number | null
  windSpeed: number | null
  windGust: number | null
  /** Rain accumulated over the preceding 48 h, mm — the underwater-visibility proxy. */
  rain48: number | null
  sst: number | null
  apparentTemp: number | null
  cloud: number | null
  precip: number | null
  uv: number | null
  /** Chance of precipitation in this hour, %. Not every model provides it. */
  rainProb: number | null
}

/**
 * Quantities that only mean something over a window, never for a single hour:
 * rain accumulates, sunshine accumulates, and a probability is taken at its worst.
 * Kept apart from `Conditions` so the activity criteria can never accidentally
 * score a sum as if it were an instantaneous value.
 */
export interface WindowStats {
  /** Total rainfall over the window, mm. */
  rainSum: number | null
  /** Highest hourly chance of precipitation in the window, %. */
  rainProbMax: number | null
  /** Hours with meaningful rain (≥0.2 mm). The models emit a 0.1 mm/h drizzle floor
   *  that would otherwise report "6 小時有雨" for a total of 0.6 mm. */
  rainHours: number | null
  /** Mean cloud cover over the window, %. */
  cloudMean: number | null
}

/**
 * Whole-day sunshine, taken from the API's own daily aggregate.
 *
 * The *hourly* `sunshine_duration` field cannot be used for this: it follows the WMO
 * definition (direct irradiance above 120 W/m²) and is effectively binary, reporting a
 * full 3600 s for an hour under 45 % cloud. Summing it produced "100 % 日照" on a day
 * the daily aggregate scores at 74 %. The daily value is the finer calculation, so the
 * day is the smallest honest unit for sunshine — cloud cover carries the within-day shape.
 */
export interface SunDay {
  /** Median across models. */
  hours: number | null
  /** Share of the day's daylight that is sunshine, 0–1. */
  frac: number | null
  /** Range across models, in hours — sunshine is the least agreed-on field there is. */
  min: number | null
  max: number | null
  /** How many models produced a value. */
  models: number
}

type Key = keyof Conditions

interface Criterion {
  key: Key
  label: string
  unit: string
  weight: number
  /** 'max': lower is better. 'range': a band, used for surf-able swell. */
  kind: 'max' | 'range'
  /** kind 'max': perfect at or below `ideal`, 0.6 at `ok`, vetoed at `veto`. */
  ideal?: number
  ok?: number
  veto?: number
  /** kind 'range': [vetoLow, okLow, idealLow, idealHigh, okHigh, vetoHigh]. */
  band?: [number, number, number, number, number, number]
  /** Shown when this criterion is the limiting one. */
  why: string
}

export interface ActivityDef {
  id: string
  name: string
  icon: string
  blurb: string
  criteria: Criterion[]
}

/**
 * How much a small island knocks down wave height on its lee shore.
 *
 * Strongly period-dependent, and that dependence is the whole point: short wind waves
 * are blocked cleanly, while long-period groundswell refracts and diffracts around a
 * 4 km island and arrives on the "sheltered" side with much of its height intact. A
 * flat 50 % rule would call an 18-second typhoon swell as harmless as an 8-second
 * chop, which is exactly backwards.
 *
 * These are order-of-magnitude figures for a small island, not a wave model. The
 * offshore value is always shown alongside so the estimate can be second-guessed.
 */
export function shelterFactor(periodS: number | null): number {
  if (periodS == null) return 0.6
  if (periodS <= 8) return 0.35
  if (periodS >= 16) return 0.8
  // Linear between the two anchors.
  return 0.35 + ((periodS - 8) / 8) * 0.45
}

/** Compass sector, from the direction waves arrive from. */
const SECTORS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北']
export function exposedShore(waveFromDeg: number | null): { exposed: string; lee: string } | null {
  if (waveFromDeg == null) return null
  const i = Math.round(waveFromDeg / 45) % 8
  return { exposed: SECTORS[i], lee: SECTORS[(i + 4) % 8] }
}

/**
 * How much slack to allow against every threshold.
 *
 * The defaults describe a cautious recreational diver. Someone experienced, or a
 * group willing to accept a rougher entry, is not wrong to want more room — so the
 * tolerance is a setting rather than a judgement baked into the numbers.
 */
export type Tolerance = 'cautious' | 'standard' | 'bold'

export const TOLERANCE_SCALE: Record<Tolerance, number> = {
  cautious: 0.8,
  standard: 1,
  bold: 1.3,
}

export const TOLERANCE_LABEL: Record<Tolerance, { name: string; blurb: string }> = {
  cautious: { name: '保守', blurb: '新手、帶小孩、或不想勉強：門檻收緊兩成' },
  standard: { name: '標準', blurb: '一般休閒潛水與水上活動的通用界線' },
  bold: { name: '進階', blurb: '有經驗、能接受較差的入水條件：門檻放寬三成' },
}

const VIS: Omit<Criterion, 'weight'> = {
  key: 'rain48',
  label: '水下能見度',
  unit: 'mm/48h',
  kind: 'max',
  ideal: 8,
  ok: 35,
  veto: 90,
  why: '前兩天累積雨量大，陸源濁流與懸浮物會壓低透明度',
}

export const ACTIVITIES: ActivityDef[] = [
  {
    id: 'freedive',
    name: '自由潛水',
    icon: '🤿',
    blurb: '對水面狀況最敏感——沒有氣瓶浮力輔助，湧浪會直接影響下潛與水面休息的安全。',
    criteria: [
      { key: 'waveLee', label: '潛點浪高', unit: 'm', kind: 'max', ideal: 0.7, ok: 1.3, veto: 2.0, weight: 0.4, why: '水面湧浪讓平靜呼吸與繩索定位變困難' },
      { key: 'windSpeed', label: '風速', unit: 'm/s', kind: 'max', ideal: 4, ok: 6.5, veto: 9, weight: 0.3, why: '風生浪打亂水面，也讓船隻定位不穩' },
      { ...VIS, weight: 0.3 },
    ],
  },
  {
    id: 'scuba',
    name: '水肺潛水',
    icon: '🛟',
    blurb: '比自由潛水耐受度高一些，主要卡在船潛的上下船安全與水下能見度。',
    criteria: [
      { key: 'waveLee', label: '潛點浪高', unit: 'm', kind: 'max', ideal: 1.0, ok: 1.7, veto: 2.5, weight: 0.4, why: '上下船與水面集合的風險隨浪高快速上升' },
      { key: 'windSpeed', label: '風速', unit: 'm/s', kind: 'max', ideal: 5, ok: 8, veto: 11, weight: 0.3, why: '風大時船隻難以在潛點上方保持位置' },
      { ...VIS, weight: 0.3 },
    ],
  },
  {
    id: 'snorkel',
    name: '浮潛',
    icon: '🥽',
    blurb: '綠島最普及的活動。門檻比潛水低，但同樣被湧浪和濁度決定體驗好壞。',
    criteria: [
      { key: 'waveLee', label: '潛點浪高', unit: 'm', kind: 'max', ideal: 0.6, ok: 1.2, veto: 1.8, weight: 0.4, why: '岸邊礁石區的湧浪會讓入水與回岸變危險' },
      { key: 'windSpeed', label: '風速', unit: 'm/s', kind: 'max', ideal: 4, ok: 7, veto: 10, weight: 0.25, why: '風浪讓呼吸管容易嗆水' },
      { ...VIS, weight: 0.35 },
    ],
  },
  {
    id: 'sup',
    name: 'SUP 立槳',
    icon: '🏄',
    blurb: '所有活動中最怕風的一項——站立姿勢等於一面帆，風速比浪高更能決定成敗。',
    criteria: [
      { key: 'windSpeed', label: '風速', unit: 'm/s', kind: 'max', ideal: 3, ok: 5, veto: 7, weight: 0.55, why: '站姿受風面積大，離岸風會把人吹向外海' },
      { key: 'waveLee', label: '水域浪高', unit: 'm', kind: 'max', ideal: 0.4, ok: 0.9, veto: 1.5, weight: 0.3, why: '板身短時湧浪會讓站立平衡難以維持' },
      { key: 'windGust', label: '陣風', unit: 'm/s', kind: 'max', ideal: 5, ok: 8, veto: 12, weight: 0.15, why: '突發陣風是落水與失控漂流的主因' },
    ],
  },
  {
    id: 'surf',
    name: '衝浪',
    icon: '🌊',
    blurb: '唯一「要有浪才成立」的活動，評分邏輯與其他項目相反：沒浪等於不能玩。',
    criteria: [
      { key: 'waveHeight', label: '浪高', unit: 'm', kind: 'range', band: [0.5, 0.8, 1.2, 2.5, 3.2, 3.8], weight: 0.45, why: '浪太小推不動板，太大超出一般旅遊等級' },
      { key: 'wavePeriod', label: '週期', unit: 's', kind: 'range', band: [4, 6, 8, 16, 18, 20], weight: 0.3, why: '週期短代表是雜亂風浪而非成形湧浪，浪型會爛' },
      { key: 'windSpeed', label: '風速', unit: 'm/s', kind: 'max', ideal: 4, ok: 7, veto: 11, weight: 0.25, why: '強風把浪面吹亂，離岸風以外都會破壞浪型' },
    ],
  },
]

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id)

// ------------------------------------------------------------------ scoring

/** Lower is better: 1 at `ideal`, 0.6 at `ok`, 0 at `veto`, linear between. */
function scoreMax(v: number, ideal: number, ok: number, veto: number): number {
  if (v <= ideal) return 1
  if (v >= veto) return 0
  if (v <= ok) return 1 - 0.4 * ((v - ideal) / (ok - ideal))
  return 0.6 * (1 - (v - ok) / (veto - ok))
}

/** A band: 1 inside [idealLo, idealHi], tapering to 0 outside [vetoLo, vetoHi]. */
function scoreRange(v: number, b: [number, number, number, number, number, number]): number {
  const [vLo, oLo, iLo, iHi, oHi, vHi] = b
  if (v >= iLo && v <= iHi) return 1
  if (v <= vLo || v >= vHi) return 0
  if (v < iLo) return v <= oLo ? 0.6 * ((v - vLo) / (oLo - vLo)) : 0.6 + 0.4 * ((v - oLo) / (iLo - oLo))
  return v >= oHi ? 0.6 * ((vHi - v) / (vHi - oHi)) : 0.6 + 0.4 * ((oHi - v) / (oHi - iHi))
}

export interface Part {
  label: string
  unit: string
  value: number | null
  /** 0–1. */
  score: number
  why: string
}

export interface ActivityScore {
  /** 0–100, or null when a required input is missing. */
  score: number | null
  parts: Part[]
  /** The criterion holding the score down — the thing to actually watch. */
  limiting: Part | null
  /** True when some criterion hit its veto threshold. */
  vetoed: boolean
  /** How many criteria had no data — a score built on gaps deserves less trust. */
  missing: number
}

export function scoreActivity(activity: ActivityDef, c: Conditions, tolerance: Tolerance = 'standard'): ActivityScore {
  // Wider tolerance moves every "lower is better" limit outward; a band criterion
  // (surf) widens on both sides instead, since more slack there means accepting both
  // smaller and larger surf.
  const k = TOLERANCE_SCALE[tolerance]
  const parts: Part[] = []
  let missing = 0
  for (const cr of activity.criteria) {
    const v = c[cr.key]
    if (v == null || !Number.isFinite(v)) {
      missing++
      parts.push({ label: cr.label, unit: cr.unit, value: null, score: NaN, why: cr.why })
      continue
    }
    const s =
      cr.kind === 'range'
        ? scoreRange(v, cr.band!.map((b, i) => (i < 3 ? b / k : b * k)) as [number, number, number, number, number, number])
        : scoreMax(v, cr.ideal! * k, cr.ok! * k, cr.veto! * k)
    parts.push({ label: cr.label, unit: cr.unit, value: v, score: s, why: cr.why })
  }

  const scored = parts.filter((p) => Number.isFinite(p.score))
  if (!scored.length) return { score: null, parts, limiting: null, vetoed: false, missing }

  const limiting = scored.reduce((a, b) => (b.score < a.score ? b : a))
  if (limiting.score === 0) return { score: 0, parts, limiting, vetoed: true, missing }

  // Weighted geometric mean over the criteria that had data, re-normalising the
  // weights so a missing input doesn't silently deflate the result.
  const weights = activity.criteria.map((cr) => cr.weight)
  let wSum = 0
  let logSum = 0
  parts.forEach((p, i) => {
    if (!Number.isFinite(p.score)) return
    wSum += weights[i]
    logSum += weights[i] * Math.log(Math.max(p.score, 1e-6))
  })
  return { score: Math.round(100 * Math.exp(logSum / wSum)), parts, limiting, vetoed: false, missing }
}

export interface Verdict {
  label: string
  tone: 'good' | 'warning' | 'critical' | 'muted'
}

export function verdict(score: number | null): Verdict {
  if (score == null) return { label: '無資料', tone: 'muted' }
  if (score >= 75) return { label: '很適合', tone: 'good' }
  if (score >= 55) return { label: '可以玩', tone: 'good' }
  if (score >= 35) return { label: '勉強', tone: 'warning' }
  if (score > 0) return { label: '不建議', tone: 'critical' }
  return { label: '不能玩', tone: 'critical' }
}

// ------------------------------------------------------------- ferry & comfort

export interface FerryRisk {
  level: '低' | '中' | '高' | '極高' | '無預報'
  tone: 'good' | 'warning' | 'critical' | 'muted'
  reason: string
}

/**
 * Ferry-cancellation risk for the 台東富岡 ↔ 綠島 crossing.
 *
 * This is the practical make-or-break for an offshore-island trip: the activities can
 * be perfect and the trip still fails because the boat doesn't sail. The bands below
 * follow the sea states at which the route is commonly suspended — they are a rule of
 * thumb, **not** an operator or harbour-authority standard, and the real decision is
 * made on the morning of sailing.
 */
export function ferryRisk(waveMax: number | null, gustMax: number | null): FerryRisk {
  // No data is not a risk level. Saying "中" here would invent a forecast that
  // doesn't exist yet, which is exactly the failure this dashboard is meant to avoid.
  if (waveMax == null && gustMax == null) return { level: '無預報', tone: 'muted', reason: '此日期尚未進入預報範圍' }
  const w = waveMax ?? 0
  const g = gustMax ?? 0
  // Recalibrated upward: the earlier bands were strict for this crossing. The
  // 富岡–綠島 route runs through the Kuroshio and is habitually rough; boats sail in
  // seas that would stop a sheltered-water ferry, and the summer cancellations that
  // matter are typhoon swell rather than an ordinary 2 m sea.
  if (w >= 4.0 || g >= 20.8) return { level: '極高', tone: 'critical', reason: `浪高 ${w.toFixed(1)} m、陣風 ${g.toFixed(0)} m/s，此海況下航班幾乎確定停駛` }
  if (w >= 3.0 || g >= 17.2) return { level: '高', tone: 'critical', reason: `浪高 ${w.toFixed(1)} m、陣風 ${g.toFixed(0)} m/s，接近停航門檻，暈船機率也高` }
  if (w >= 2.0 || g >= 13.9) return { level: '中', tone: 'warning', reason: `浪高 ${w.toFixed(1)} m，船會明顯搖晃，容易暈船但通常照開` }
  return { level: '低', tone: 'good', reason: `浪高 ${w.toFixed(1)} m，海況平穩` }
}

export interface Comfort {
  score: number | null
  notes: string[]
}

/**
 * Non-water trip quality: rain, sun, heat and UV. Kept separate from the activity
 * score because they trade off differently — an overcast day is pleasant for diving
 * and poor for a beach afternoon.
 */
/**
 * How good the day is *out of the water*: rain, sun, heat and UV.
 *
 * Kept separate from the activity score because these trade off in the opposite
 * direction — an overcast afternoon is pleasant for a dive surface interval and
 * disappointing for lying on the beach, and one number can't say both.
 */
export function comfort(c: Conditions, w?: WindowStats, sun?: SunDay): Comfort {
  const notes: string[] = []
  const parts: number[] = []

  const rain = w?.rainSum ?? c.precip
  if (rain != null) {
    parts.push(scoreMax(rain, 0.5, 5, 25))
    if (rain >= 15) notes.push(`累積雨量 ${rain.toFixed(0)} mm，戶外行程會被打斷`)
    else if (rain >= 3) notes.push(`累積雨量 ${rain.toFixed(1)} mm，有明顯降雨`)
    else if (rain >= 0.5) notes.push('零星短暫降雨，帶件薄雨衣')
    else if (rain >= 0.2) notes.push('僅微量降雨，影響不大')
  }
  if (w?.rainProbMax != null && w.rainProbMax >= 50 && (rain ?? 0) < 3) {
    notes.push(`降水機率一度達 ${w.rainProbMax.toFixed(0)}%，雨下不下得成還不確定`)
  }

  if (sun?.frac != null) {
    // Sunshine is what people mean by "會不會出太陽" — score the day's own figure.
    parts.push(scoreRange(sun.frac * 100, [-1, 5, 35, 90, 101, 102]))
    const spread = sun.min != null && sun.max != null ? sun.max - sun.min : null
    notes.push(
      spread != null && spread >= 4
        ? `日照時數模式分歧極大：${sun.min!.toFixed(1)}–${sun.max!.toFixed(1)} 小時（中位數 ${sun.hours!.toFixed(1)}），這天有沒有太陽現在說不準`
        : `全日 ${sun.hours!.toFixed(1)} 小時日照，佔白天 ${(sun.frac * 100).toFixed(0)}%——${sunVerdict(sun.frac, spread).label}`,
    )
  }
  // Cloud and sunshine routinely look contradictory because they measure different
  // things; say so rather than leaving the reader to assume one of them is broken.
  if (sun?.frac != null && sun.frac >= 0.5 && (w?.cloudMean ?? 0) >= 80) {
    notes.push('雲量高但日照仍多，代表以薄雲為主——直射陽光穿得過，但天空看起來是白的')
  }
  const cloud = w?.cloudMean ?? c.cloud
  if (cloud != null) {
    parts.push(scoreRange(cloud, [-1, 0, 10, 55, 85, 101]))
    if (cloud >= 85) notes.push(`此時段平均雲量 ${cloud.toFixed(0)}%，幾乎全陰，水下光線會偏暗`)
    else if (cloud <= 20) notes.push(`此時段平均雲量僅 ${cloud.toFixed(0)}%，曬得很徹底`)
  }

  if (c.apparentTemp != null) {
    parts.push(scoreRange(c.apparentTemp, [18, 22, 25, 31, 34, 38]))
    if (c.apparentTemp >= 34) notes.push(`體感 ${c.apparentTemp.toFixed(0)} °C，岸上等待時容易熱衰竭`)
  }
  if (c.uv != null && c.uv >= 8 && (sun?.frac ?? 1) >= 0.25) notes.push(`UV 指數 ${c.uv.toFixed(0)}，屬過量級，防曬要補`)
  if (c.sst != null) {
    if (c.sst >= 27) notes.push(`海溫 ${c.sst.toFixed(0)} °C，3 mm 防寒衣即可`)
    else if (c.sst >= 24) notes.push(`海溫 ${c.sst.toFixed(0)} °C，長時間浸泡建議 5 mm`)
  }

  if (!parts.length) return { score: null, notes }
  return { score: Math.round(100 * (parts.reduce((a, b) => a + b, 0) / parts.length)), notes }
}

export interface SunVerdict {
  label: string
  tone: 'good' | 'warning' | 'critical' | 'muted'
}

/**
 * Plain-language answer to "會不會出太陽".
 *
 * Bands are on the share of daylight that is direct sun, not on cloud cover — 70 %
 * thin high cloud still tans you, 40 % of thick cumulus at the wrong moment does not.
 *
 * `spreadHours` overrides everything when the models disagree badly, because they do:
 * for 綠島 on 2026-09-09 the three models gave 0.0 h, 9.0 h and 12.0 h for the same
 * day. A median of 9 h presented as 「陽光充足」 would be a confident answer to a
 * question the models have not agreed on, which is worse than admitting the split.
 */
export function sunVerdict(sunFrac: number | null, spreadHours?: number | null): SunVerdict {
  if (sunFrac == null) return { label: '無資料', tone: 'muted' }
  if (spreadHours != null && spreadHours >= 4) return { label: '模式分歧極大', tone: 'warning' }
  const pct = sunFrac * 100
  if (pct >= 60) return { label: '陽光充足', tone: 'good' }
  if (pct >= 35) return { label: '陽光普通', tone: 'good' }
  if (pct >= 15) return { label: '偶爾露臉', tone: 'warning' }
  return { label: '幾乎沒太陽', tone: 'critical' }
}


/**
 * Confidence in the wave forecast, from the disagreement between the two wave models.
 * Wave-specific bands: the sea state that separates "fine" from "off" for most of
 * these activities is only a few tenths of a metre wide, so the thresholds are tight.
 */
export function waveConfidence(spreadM: number | null): { level: '高' | '中' | '低' | '—'; tone: 'good' | 'warning' | 'critical' | 'muted' } {
  if (spreadM == null) return { level: '—', tone: 'muted' }
  if (spreadM <= 0.3) return { level: '高', tone: 'good' }
  if (spreadM <= 0.6) return { level: '中', tone: 'warning' }
  return { level: '低', tone: 'critical' }
}
