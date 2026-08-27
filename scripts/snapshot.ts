/**
 * Generates a self-contained trip report from live data.
 *
 * The published report has to work with no network at all (the artifact host blocks
 * external requests), so every number is computed here and baked into the page. This
 * script reuses the app's own scoring modules rather than restating the thresholds —
 * the report and the dashboard can never disagree about what "不建議" means.
 *
 *   npm run snapshot -- --name 綠島 --lat 22.66 --lon 121.489 --from 2026-09-09 --to 2026-09-12
 */
import { writeFileSync } from 'node:fs'
import { ACTIVITIES, verdict, waveConfidence, type ActivityScore } from '../src/lib/activities'
import { DETERMINISTIC, ENSEMBLES, WAVE_MODELS } from '../src/lib/models'
import { fetchEnsemble, fetchForecast, fetchMarine } from '../src/lib/openmeteo'
import { buildHours, summarise, windLimit, DAYPARTS } from '../src/lib/trip'

const DAY_MS = 86400000
const dayOf = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS
const parseDate = (s: string) => Date.parse(s + 'T00:00:00Z')

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf('--' + name)
  const v = i >= 0 ? process.argv[i + 1] : undefined
  if (v == null && fallback == null) throw new Error(`缺少參數 --${name}`)
  return v ?? fallback!
}

export interface ReportCell {
  part: string
  hours: string
  scores: Record<string, { score: number | null; limiting: string | null; limitValue: string | null; why: string | null; parts: { label: string; value: number | null; unit: string; score: number }[] }>
  windProb: Record<string, number | null>
  wave: number | null
  wind: number | null
  comfortScore: number | null
  comfortNotes: string[]
}

export interface ReportDay {
  date: string
  weekday: string
  outOfRange: boolean
  entersRange: string | null
  ferry: { level: string; tone: string; reason: string }
  waveMax: number | null
  gustMax: number | null
  cells: ReportCell[]
}

export interface Report {
  place: string
  lat: number
  lon: number
  marineLat: number
  marineLon: number
  generatedAt: string
  leadDays: number
  from: string
  to: string
  days: ReportDay[]
  activities: { id: string; name: string; icon: string; blurb: string; windLimit: number }[]
  waveSpreadMax: number | null
  waveConfidence: string
  recheck: string
  ensembleName: string
  ensembleMembers: number
  models: string[]
  waveSeries: { name: string; points: [number, number | null][] }[]
  windFan: { time: number; p10: number | null; p50: number | null; p90: number | null }[]
}

const fmtDate = (ms: number) => `${new Date(ms).getUTCMonth() + 1}/${new Date(ms).getUTCDate()}`
const fmtWeekday = (ms: number) => '日一二三四五六'[new Date(ms).getUTCDay()]

async function main() {
  const name = arg('name', '綠島')
  const lat = Number(arg('lat', '22.66'))
  const lon = Number(arg('lon', '121.489'))
  const from = parseDate(arg('from'))
  const to = parseDate(arg('to'))
  const out = arg('out', 'report/data.json')

  const now = Date.now() + new Date().getTimezoneOffset() * -60000
  const models = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'jma_seamless']
  const waveIds = WAVE_MODELS.map((m) => m.id)

  const spanEnd = dayOf(to) + DAY_MS
  const ensModel = spanEnd > now + 14.5 * DAY_MS ? 'gfs05' : 'ecmwf_ifs025'
  const ensDef = ENSEMBLES.find((e) => e.id === ensModel)!

  console.error(`抓取 ${name} (${lat}, ${lon})…`)
  const [forecast, marine, ens] = await Promise.all([
    fetchForecast({ lat, lon, models, days: 16, windUnit: 'ms' }),
    fetchMarine(lat, lon, waveIds, 16),
    fetchEnsemble({ lat, lon, model: ensModel, variable: 'wind_speed_10m', days: ensModel === 'gfs05' ? 35 : 15, windUnit: 'ms' }),
  ])

  const days: number[] = []
  for (let d = dayOf(from); d <= dayOf(to); d += DAY_MS) days.push(d)

  const rows = buildHours({ hourly: forecast.hourly, models, marine, waveModels: waveIds, daily: forecast.daily })
  const summary = summarise(rows, days, ens)

  let horizon = -1
  for (const m of models) forecast.hourly.vars.wind_speed_10m?.[m]?.forEach((v, i) => { if (v != null) horizon = Math.max(horizon, i) })
  const horizonMs = horizon >= 0 ? forecast.hourly.time[horizon] : null

  const packScore = (s: ActivityScore) => ({
    score: s.score,
    limiting: s.limiting?.label ?? null,
    limitValue: s.limiting?.value != null ? `${s.limiting.value.toFixed(1)} ${s.limiting.unit}` : null,
    why: s.limiting?.why ?? null,
    parts: s.parts.map((p) => ({ label: p.label, value: p.value, unit: p.unit, score: Number.isFinite(p.score) ? p.score : -1 })),
  })

  const reportDays: ReportDay[] = summary.map((d) => {
    const oor = horizonMs != null && d.day > horizonMs
    return {
      date: fmtDate(d.day),
      weekday: fmtWeekday(d.day),
      outOfRange: oor,
      entersRange: oor ? fmtDate(d.day - 15 * DAY_MS) : null,
      ferry: { level: d.ferry.level, tone: d.ferry.tone, reason: d.ferry.reason },
      waveMax: d.waveMax,
      gustMax: d.gustMax,
      cells: d.cells.map((c) => ({
        part: c.part.label,
        hours: `${c.part.from}:00–${c.part.to}:00`,
        scores: Object.fromEntries(ACTIVITIES.map((a) => [a.id, packScore(c.scores[a.id])])),
        windProb: c.windProb,
        wave: c.conditions.waveHeight,
        wind: c.conditions.windSpeed,
        comfortScore: c.comfort.score,
        comfortNotes: c.comfort.notes,
      })),
    }
  })

  const spreads = summary.flatMap((d) => d.cells.map((c) => c.waveSpread)).filter((x): x is number => x != null)
  const waveSpreadMax = spreads.length ? Math.max(...spreads) : null

  const inWindow = marine.hourly.time.map((t, i) => [t, i] as const).filter(([t]) => t >= dayOf(from) && t < spanEnd)
  const waveSeries = WAVE_MODELS.map((m) => ({
    name: m.name,
    points: inWindow.map(([t, i]) => [t, marine.hourly.vars.wave_height?.[m.id]?.[i] ?? null] as [number, number | null]),
  })).filter((s) => s.points.some(([, v]) => v != null))

  const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : null)
  const windFan = ens.time
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t >= dayOf(from) && t < spanEnd)
    .map(({ t, i }) => {
      const col = ens.members.map((m) => m[i]).filter((v): v is number => v != null && Number.isFinite(v))
      return { time: t, p10: q(col, 0.1), p50: q(col, 0.5), p90: q(col, 0.9) }
    })

  const report: Report = {
    place: name,
    lat,
    lon,
    marineLat: marine.lat,
    marineLon: marine.lon,
    generatedAt: new Date().toISOString(),
    leadDays: Math.round((dayOf(from) - dayOf(now)) / DAY_MS),
    from: fmtDate(from),
    to: fmtDate(to),
    days: reportDays,
    activities: ACTIVITIES.map((a) => ({ id: a.id, name: a.name, icon: a.icon, blurb: a.blurb, windLimit: windLimit(a.id) })),
    waveSpreadMax,
    waveConfidence: waveConfidence(waveSpreadMax).level,
    recheck: fmtDate(dayOf(from) - 4 * DAY_MS),
    ensembleName: ensDef.name,
    ensembleMembers: ensDef.members,
    models: models.map((m) => DETERMINISTIC.find((d) => d.id === m)?.name ?? m),
    waveSeries,
    windFan,
  }

  writeFileSync(out, JSON.stringify(report, null, 2))
  console.error(`已寫入 ${out}（${days.length} 天，${DAYPARTS.length} 時段/天，${verdict(80).label} 等級定義來自 activities.ts）`)
}

main().catch((e) => {
  console.error('失敗：', e.message)
  process.exit(1)
})
