/**
 * Shared trip data assembly.
 *
 * The risk page and the detail page must never disagree about the numbers, so both
 * read from here rather than each wiring up the three feeds themselves.
 */
import { useMemo } from 'react'
import { useCyclones, useEnsemble, useMarine } from './hooks'
import type { Place } from './locations'
import { WAVE_MODELS, ensembleById } from './models'
import type { Forecast } from './openmeteo'
import { buildHours, summarise, sunByDay, type DaySummary } from './trip'

const DAY_MS = 86400000
export const dayOf = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS
export const WAVE_IDS = WAVE_MODELS.map((m) => m.id)

export interface TripWindow {
  from: number
  to: number
  activity: string
}

export function useTripData(place: Place, forecast: Forecast, windUnit: 'ms' | 'kmh' | 'kn', range: TripWindow, nowMs: number) {
  const days = useMemo(() => {
    const out: number[] = []
    for (let d = dayOf(range.from); d <= dayOf(range.to); d += DAY_MS) out.push(d)
    return out.slice(0, 10)
  }, [range.from, range.to])

  const spanEnd = dayOf(range.to) + DAY_MS
  const leadDays = Math.round((dayOf(range.from) - dayOf(nowMs)) / DAY_MS)

  // ECMWF ENS is the better ensemble but stops around 15 days; fall back to GEFS 0.5°
  // (35 days) when the window reaches past it rather than showing no probability.
  const ensModel = spanEnd > nowMs + 14.5 * DAY_MS ? 'gfs05' : 'ecmwf_ifs025'
  const ensDef = ensembleById(ensModel)!

  const marine = useMarine(place.lat, place.lon, WAVE_IDS, 16)
  const ens = useEnsemble({ lat: place.lat, lon: place.lon, model: ensModel, variable: 'wind_speed_10m', days: ensModel === 'gfs05' ? 35 : 15, windUnit })
  const cyclones = useCyclones(place.lat, place.lon)

  const summary: DaySummary[] = useMemo(() => {
    const rows = buildHours({ hourly: forecast.hourly, models: forecast.models, marine: marine.data, waveModels: WAVE_IDS, daily: forecast.daily })
    return summarise(rows, days, ens.data, sunByDay(forecast.daily, forecast.models))
  }, [forecast, marine.data, ens.data, days])

  /** Last hour the atmospheric models cover; days past it have no forecast at all. */
  const forecastHorizon = useMemo(() => {
    const t = forecast.hourly.vars.wind_speed_10m
    let last = -1
    if (t) for (const m of forecast.models) t[m]?.forEach((v, i) => { if (v != null) last = Math.max(last, i) })
    return last >= 0 ? forecast.hourly.time[last] : null
  }, [forecast])

  const outOfRange = useMemo(() => (day: number) => forecastHorizon != null && day > forecastHorizon, [forecastHorizon])
  /** A day enters the 16-day window 15 days before it happens. */
  const entersRange = (day: number) => new Date(day - 15 * DAY_MS)

  const recheckMs = dayOf(range.from) - 4 * DAY_MS
  const recheck = `${new Date(recheckMs).getUTCMonth() + 1}/${new Date(recheckMs).getUTCDate()}`

  const waveSpreadMax = useMemo(() => {
    const v = summary.flatMap((d) => d.cells.map((c) => c.waveSpread)).filter((x): x is number => x != null)
    return v.length ? Math.max(...v) : null
  }, [summary])

  const marineHorizon = useMemo(() => {
    const wh = marine.data?.hourly.vars.wave_height
    if (!wh) return null
    let last = -1
    WAVE_IDS.forEach((m) => wh[m]?.forEach((v, i) => { if (v != null) last = Math.max(last, i) }))
    return last >= 0 ? marine.data!.hourly.time[last] : null
  }, [marine.data])

  return {
    days,
    spanEnd,
    leadDays,
    summary,
    marine,
    ens,
    ensDef,
    cyclones,
    outOfRange,
    entersRange,
    recheck,
    waveSpreadMax,
    marineHorizon,
    beyondMarine: marineHorizon != null && spanEnd > marineHorizon,
  }
}
