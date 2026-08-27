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
  /** Significant wave height, m. */
  waveHeight: number | null
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
      { key: 'waveHeight', label: '浪高', unit: 'm', kind: 'max', ideal: 0.7, ok: 1.2, veto: 1.8, weight: 0.4, why: '水面湧浪讓平靜呼吸與繩索定位變困難' },
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
      { key: 'waveHeight', label: '浪高', unit: 'm', kind: 'max', ideal: 1.0, ok: 1.5, veto: 2.2, weight: 0.4, why: '上下船與水面集合的風險隨浪高快速上升' },
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
      { key: 'waveHeight', label: '浪高', unit: 'm', kind: 'max', ideal: 0.6, ok: 1.1, veto: 1.6, weight: 0.4, why: '岸邊礁石區的湧浪會讓入水與回岸變危險' },
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
      { key: 'waveHeight', label: '浪高', unit: 'm', kind: 'max', ideal: 0.4, ok: 0.8, veto: 1.3, weight: 0.3, why: '板身短時湧浪會讓站立平衡難以維持' },
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

export function scoreActivity(activity: ActivityDef, c: Conditions): ActivityScore {
  const parts: Part[] = []
  let missing = 0
  for (const cr of activity.criteria) {
    const v = c[cr.key]
    if (v == null || !Number.isFinite(v)) {
      missing++
      parts.push({ label: cr.label, unit: cr.unit, value: null, score: NaN, why: cr.why })
      continue
    }
    const s = cr.kind === 'range' ? scoreRange(v, cr.band!) : scoreMax(v, cr.ideal!, cr.ok!, cr.veto!)
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
  if (w >= 3.2 || g >= 20.8) return { level: '極高', tone: 'critical', reason: `浪高 ${w.toFixed(1)} m、陣風 ${g.toFixed(0)} m/s，此海況下航班通常停駛` }
  if (w >= 2.5 || g >= 17.2) return { level: '高', tone: 'critical', reason: `浪高 ${w.toFixed(1)} m、陣風 ${g.toFixed(0)} m/s，接近停航門檻，暈船機率也高` }
  if (w >= 1.8 || g >= 13.9) return { level: '中', tone: 'warning', reason: `浪高 ${w.toFixed(1)} m，船會晃，容易暈船但通常照開` }
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
export function comfort(c: Conditions): Comfort {
  const notes: string[] = []
  const parts: number[] = []

  if (c.precip != null) {
    const s = scoreMax(c.precip, 0.5, 5, 25)
    parts.push(s)
    if (c.precip >= 10) notes.push(`日雨量 ${c.precip.toFixed(0)} mm，戶外行程會受影響`)
    else if (c.precip >= 2) notes.push('有零星降雨，帶件薄雨衣')
  }
  if (c.cloud != null) {
    // Neither overcast nor cloudless is ideal — some cloud keeps the heat down.
    parts.push(scoreRange(c.cloud, [-1, 0, 10, 55, 85, 101]))
    if (c.cloud >= 85) notes.push('整天陰天，水下光線會偏暗')
    else if (c.cloud <= 15) notes.push('少雲、日照強，注意曬傷與中暑')
  }
  if (c.apparentTemp != null) {
    parts.push(scoreRange(c.apparentTemp, [18, 22, 25, 31, 34, 38]))
    if (c.apparentTemp >= 34) notes.push(`體感 ${c.apparentTemp.toFixed(0)} °C，岸上等待時容易熱衰竭`)
  }
  if (c.uv != null && c.uv >= 8) notes.push(`UV 指數 ${c.uv.toFixed(0)}，屬過量級`)
  if (c.sst != null) {
    if (c.sst >= 27) notes.push(`海溫 ${c.sst.toFixed(0)} °C，3 mm 防寒衣即可`)
    else if (c.sst >= 24) notes.push(`海溫 ${c.sst.toFixed(0)} °C，長時間浸泡建議 5 mm`)
  }

  if (!parts.length) return { score: null, notes }
  return { score: Math.round(100 * (parts.reduce((a, b) => a + b, 0) / parts.length)), notes }
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
