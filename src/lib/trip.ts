/**
 * Assembles the hourly inputs the activity model needs, from three separate feeds
 * (atmospheric forecast, wave models, wind ensemble) onto one time axis.
 *
 * Kept apart from the React layer so the same assembly can be reused to generate a
 * static snapshot report.
 */
import type { Conditions } from './activities'
import { ACTIVITIES, comfort, ferryRisk, scoreActivity, type ActivityScore, type Comfort, type FerryRisk } from './activities'
import type { Block, EnsembleData, Marine } from './openmeteo'

/** Daylight windows people actually book activities in. */
export const DAYPARTS = [
  { id: 'am', label: '上午', from: 6, to: 11 },
  { id: 'pm', label: '下午', from: 12, to: 17 },
] as const

export type DaypartId = (typeof DAYPARTS)[number]['id']

const hourOf = (ms: number) => new Date(ms).getUTCHours()
const dayOf = (ms: number) => Math.floor(ms / 86400000) * 86400000

/** First model in `order` with a value at index `i`. */
function firstOf(byModel: Record<string, (number | null)[]> | undefined, order: string[], i: number): number | null {
  if (!byModel) return null
  for (const m of order) {
    const v = byModel[m]?.[i]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}

/** Rolling 48-hour precipitation total ending at each index — the turbidity proxy. */
function rolling48(precip: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < precip.length; i++) {
    let sum = 0
    let seen = 0
    for (let j = Math.max(0, i - 47); j <= i; j++) {
      const v = precip[j]
      if (v != null) {
        sum += v
        seen++
      }
    }
    out.push(seen ? sum : null)
  }
  return out
}

export interface HourRow {
  time: number
  conditions: Conditions
  /** Absolute spread between the two wave models at this hour, m. */
  waveSpread: number | null
}

export interface BuildInput {
  hourly: Block
  models: string[]
  marine: Marine | null
  waveModels: string[]
  daily: Block
}

/** Merge every feed onto the atmospheric hourly axis. */
export function buildHours({ hourly, models, marine, waveModels, daily }: BuildInput): HourRow[] {
  const precip = models.map((m) => hourly.vars.precipitation?.[m]).find((v) => v?.some((x) => x != null)) ?? []
  const rain48 = rolling48(precip)

  // The marine feed has its own axis; index it by timestamp rather than assuming alignment.
  const marineIdx = new Map<number, number>()
  marine?.hourly.time.forEach((t, i) => marineIdx.set(t, i))
  const sstIdx = new Map<number, number>()
  marine?.sstTime.forEach((t, i) => sstIdx.set(t, i))

  const uvByDay = new Map<number, number | null>()
  daily.time.forEach((t, i) => uvByDay.set(dayOf(t), firstOf(daily.vars.uv_index_max, models, i)))

  // SST reaches only ~9 days; carry the last known value forward rather than dropping
  // the criterion entirely — it changes by a fraction of a degree per day.
  let lastSst: number | null = null

  return hourly.time.map((t, i) => {
    const mi = marineIdx.get(t)
    const wave = mi != null ? firstOf(marine!.hourly.vars.wave_height, waveModels, mi) : null
    const period = mi != null ? firstOf(marine!.hourly.vars.wave_period, waveModels, mi) : null

    let spread: number | null = null
    if (mi != null && waveModels.length > 1) {
      const vals = waveModels.map((m) => marine!.hourly.vars.wave_height?.[m]?.[mi]).filter((v): v is number => v != null && Number.isFinite(v))
      if (vals.length > 1) spread = Math.max(...vals) - Math.min(...vals)
    }

    const si = sstIdx.get(t)
    const sstNow = si != null ? marine!.sst[si] ?? null : null
    if (sstNow != null) lastSst = sstNow

    return {
      time: t,
      waveSpread: spread,
      conditions: {
        waveHeight: wave,
        wavePeriod: period,
        windSpeed: firstOf(hourly.vars.wind_speed_10m, models, i),
        windGust: firstOf(hourly.vars.wind_gusts_10m, models, i),
        rain48: rain48[i] ?? null,
        sst: sstNow ?? lastSst,
        apparentTemp: firstOf(hourly.vars.apparent_temperature, models, i),
        cloud: firstOf(hourly.vars.cloud_cover, models, i),
        precip: firstOf(hourly.vars.precipitation, models, i),
        uv: uvByDay.get(dayOf(t)) ?? null,
      },
    }
  })
}

/** Median of the finite values, or null. */
function median(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const worst = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? Math.max(...v) : null
}

/** Representative conditions for one daypart: medians, but the sea state at its worst. */
export function aggregate(rows: HourRow[]): { conditions: Conditions; waveSpread: number | null } {
  const col = (f: (c: Conditions) => number | null) => rows.map((r) => f(r.conditions))
  return {
    // Wave and gust use the worst hour in the window: an afternoon that turns at 15:00
    // is not an afternoon you book. Everything else is representative.
    conditions: {
      waveHeight: worst(col((c) => c.waveHeight)),
      wavePeriod: median(col((c) => c.wavePeriod)),
      windSpeed: worst(col((c) => c.windSpeed)),
      windGust: worst(col((c) => c.windGust)),
      rain48: median(col((c) => c.rain48)),
      sst: median(col((c) => c.sst)),
      apparentTemp: median(col((c) => c.apparentTemp)),
      cloud: median(col((c) => c.cloud)),
      precip: median(col((c) => c.precip)),
      uv: median(col((c) => c.uv)),
    },
    waveSpread: worst(rows.map((r) => r.waveSpread)),
  }
}

export interface DaypartCell {
  day: number
  part: (typeof DAYPARTS)[number]
  conditions: Conditions
  waveSpread: number | null
  scores: Record<string, ActivityScore>
  comfort: Comfort
  /** Share of ensemble members whose wind stays under each activity's workable limit. */
  windProb: Record<string, number | null>
}

export interface DaySummary {
  day: number
  cells: DaypartCell[]
  ferry: FerryRisk
  /** Daily maxima that drive the ferry call. */
  waveMax: number | null
  gustMax: number | null
  comfort: Comfort
}

/**
 * Fraction of ensemble members whose worst wind in the window stays under `limit`.
 * Only wind is ensemble-driven here — there is no public wave ensemble for this
 * region — so this answers "how sure are we about the wind", not the whole verdict.
 */
function windProbability(ens: EnsembleData | null, from: number, to: number, limit: number): number | null {
  if (!ens) return null
  const idx: number[] = []
  ens.time.forEach((t, i) => {
    if (t >= from && t <= to) idx.push(i)
  })
  if (!idx.length) return null
  let ok = 0
  let total = 0
  for (const member of ens.members) {
    const vals = idx.map((i) => member[i]).filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) continue
    total++
    if (Math.max(...vals) <= limit) ok++
  }
  return total ? (ok / total) * 100 : null
}

/** The `ok` threshold on an activity's wind criterion — its workable limit. */
export function windLimit(activityId: string): number {
  const a = ACTIVITIES.find((x) => x.id === activityId)
  const c = a?.criteria.find((cr) => cr.key === 'windSpeed')
  return c?.ok ?? 8
}

export function summarise(rows: HourRow[], days: number[], ens: EnsembleData | null): DaySummary[] {
  const byDay = new Map<number, HourRow[]>()
  for (const r of rows) {
    const d = dayOf(r.time)
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(r)
  }

  return days.map((day) => {
    const dayRows = byDay.get(day) ?? []
    const cells: DaypartCell[] = DAYPARTS.map((part) => {
      const slice = dayRows.filter((r) => hourOf(r.time) >= part.from && hourOf(r.time) <= part.to)
      const { conditions, waveSpread } = aggregate(slice)
      const from = day + part.from * 3600000
      const to = day + part.to * 3600000
      const scores: Record<string, ActivityScore> = {}
      const windProb: Record<string, number | null> = {}
      for (const a of ACTIVITIES) {
        scores[a.id] = scoreActivity(a, conditions)
        windProb[a.id] = windProbability(ens, from, to, windLimit(a.id))
      }
      return { day, part, conditions, waveSpread, scores, comfort: comfort(conditions), windProb }
    })

    const waveMax = worst(dayRows.map((r) => r.conditions.waveHeight))
    const gustMax = worst(dayRows.map((r) => r.conditions.windGust))
    const { conditions: dayCond } = aggregate(dayRows)
    return { day, cells, ferry: ferryRisk(waveMax, gustMax), waveMax, gustMax, comfort: comfort(dayCond) }
  })
}
