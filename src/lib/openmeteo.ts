/**
 * Open-Meteo client.
 *
 * Two endpoints are used: `/v1/forecast` for deterministic multi-model runs and
 * `/v1/ensemble` for member-level data. Both are free and key-less for
 * non-commercial use.
 *
 * ## Time handling
 * With `timezone=` set, the API returns naive local ISO strings ("2026-08-26T09:00").
 * We convert them with `Date.parse(t + 'Z')`, producing a *shifted* timestamp whose
 * UTC fields equal the location's local wall-clock. Charts and formatters then read
 * those fields in UTC, so every label shows local time at the forecast point without
 * dragging a timezone library in. Never treat these values as real epochs.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'

export const HOURLY_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'precipitation',
  'precipitation_probability',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'pressure_msl',
  'cape',
  'weather_code',
] as const

export const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'precipitation_hours',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
  'uv_index_max',
  'sunrise',
  'sunset',
] as const

export type HourlyVar = (typeof HOURLY_VARS)[number]
export type DailyVar = (typeof DAILY_VARS)[number]

/** values[modelId] -> aligned array over the shared time axis. */
export type ByModel = Record<string, (number | null)[]>

export interface Block {
  /** Shifted-to-local timestamps in ms (see module note). */
  time: number[]
  vars: Record<string, ByModel>
  units: Record<string, string>
}

export interface Forecast {
  lat: number
  lon: number
  elevation: number
  timezone: string
  models: string[]
  hourly: Block
  daily: Block
  /** Model run timestamps, when the API reports them. */
  fetchedAt: number
}

export interface EnsembleData {
  model: string
  lat: number
  lon: number
  elevation: number
  time: number[]
  unit: string
  /** members[i] is one perturbed member; index 0 is the control run. */
  members: (number | null)[][]
  variable: string
}

class ApiError extends Error {}

const localMs = (iso: string) => Date.parse(iso + 'Z')

async function getJson(url: string, signal?: AbortSignal, attempt = 0): Promise<Record<string, any>> {
  const res = await fetch(url, { signal })
  const json = await res.json().catch(() => ({ error: true, reason: `HTTP ${res.status}` }))
  if (json.error) {
    // The public API sheds load under bursts; that failure is transient and worth retrying.
    const transient = typeof json.reason === 'string' && /overload|timeout|try again/i.test(json.reason)
    if (transient && attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
      return getJson(url, signal, attempt + 1)
    }
    throw new ApiError(json.reason ?? '未知的 API 錯誤')
  }
  return json
}

/**
 * Split "temperature_2m_ecmwf_ifs025" into variable + model. Open-Meteo omits the
 * suffix when a single model is requested, so fall back to the sole requested id.
 */
function splitKey(key: string, models: string[]): { variable: string; model: string } | null {
  for (const m of models) {
    if (key.endsWith('_' + m)) return { variable: key.slice(0, -(m.length + 1)), model: m }
  }
  return models.length === 1 ? { variable: key, model: models[0] } : null
}

function parseBlock(raw: Record<string, any> | undefined, units: Record<string, string> | undefined, models: string[]): Block {
  const block: Block = { time: [], vars: {}, units: {} }
  if (!raw?.time) return block
  block.time = (raw.time as string[]).map(localMs)
  for (const key of Object.keys(raw)) {
    if (key === 'time') continue
    const split = splitKey(key, models)
    if (!split) continue
    const { variable, model } = split
    // sunrise/sunset come back as ISO strings; keep them as local-ms numbers.
    const col = raw[key] as (number | string | null)[]
    const values = col.map((v) => (typeof v === 'string' ? localMs(v) : v))
    ;(block.vars[variable] ??= {})[model] = values
    const u = units?.[key]
    if (u) block.units[variable] = u
  }
  return block
}

export interface ForecastQuery {
  lat: number
  lon: number
  models: string[]
  days: number
  timezone?: string
  windUnit?: 'kmh' | 'ms' | 'kn'
}

export async function fetchForecast(q: ForecastQuery, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: q.lat.toFixed(4),
    longitude: q.lon.toFixed(4),
    hourly: HOURLY_VARS.join(','),
    daily: DAILY_VARS.join(','),
    models: q.models.join(','),
    forecast_days: String(q.days),
    timezone: q.timezone ?? 'Asia/Taipei',
    wind_speed_unit: q.windUnit ?? 'ms',
  })
  const json = await getJson(`${FORECAST_URL}?${params}`, signal)
  return {
    lat: json.latitude,
    lon: json.longitude,
    elevation: json.elevation,
    timezone: json.timezone,
    models: q.models,
    hourly: parseBlock(json.hourly, json.hourly_units, q.models),
    daily: parseBlock(json.daily, json.daily_units, q.models),
    fetchedAt: Date.now(),
  }
}

export interface EnsembleQuery {
  lat: number
  lon: number
  model: string
  variable: string
  days: number
  timezone?: string
  windUnit?: 'kmh' | 'ms' | 'kn'
}

export async function fetchEnsemble(q: EnsembleQuery, signal?: AbortSignal): Promise<EnsembleData> {
  const params = new URLSearchParams({
    latitude: q.lat.toFixed(4),
    longitude: q.lon.toFixed(4),
    hourly: q.variable,
    models: q.model,
    forecast_days: String(q.days),
    timezone: q.timezone ?? 'Asia/Taipei',
    wind_speed_unit: q.windUnit ?? 'ms',
  })
  const json = await getJson(`${ENSEMBLE_URL}?${params}`, signal)
  const h = json.hourly as Record<string, any>
  // Keys are `<var>` (control) then `<var>_memberNN`; sort so control stays index 0.
  const keys = Object.keys(h)
    .filter((k) => k !== 'time')
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
  return {
    model: q.model,
    variable: q.variable,
    lat: json.latitude,
    lon: json.longitude,
    elevation: json.elevation,
    time: (h.time as string[]).map(localMs),
    unit: (json.hourly_units as Record<string, string>)[keys[0]] ?? '',
    members: keys.map((k) => h[k] as (number | null)[]),
  }
}

/** Drop the all-null tail a model leaves behind when its horizon is shorter than the request. */
export function trimNullTail(time: number[], series: (number | null)[][]): number {
  let last = -1
  for (let i = 0; i < time.length; i++) {
    if (series.some((s) => s[i] != null)) last = i
  }
  return last + 1
}

// ------------------------------------------------------------- climatology

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

export interface Climatology {
  /** Indexed 1..366 by day-of-year; null where the window had no data. */
  tmean: (number | null)[]
  tmax: (number | null)[]
  tmin: (number | null)[]
  /** Mean daily precipitation for that day-of-year, in mm. */
  precip: (number | null)[]
  years: number
}

const doy = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000)
}

/**
 * Day-of-year climate normals from ERA5 reanalysis, smoothed with a ±7-day window
 * so a single stormy year can't spike one calendar day. One request covers the whole
 * baseline period; it takes ~10 s, so callers should fetch it lazily and cache it.
 */
export async function fetchClimatology(lat: number, lon: number, years = 10, signal?: AbortSignal): Promise<Climatology> {
  const end = new Date(Date.now() - 8 * 86400000) // ERA5 lags real time by about a week
  const endYear = end.getUTCFullYear() - 1
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: `${endYear - years + 1}-01-01`,
    end_date: `${endYear}-12-31`,
    daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'Asia/Taipei',
  })
  const json = await getJson(`${ARCHIVE_URL}?${params}`, signal)
  const t = json.daily.time as string[]

  const buckets: Record<string, number[][]> = {
    tmean: Array.from({ length: 367 }, () => []),
    tmax: Array.from({ length: 367 }, () => []),
    tmin: Array.from({ length: 367 }, () => []),
    precip: Array.from({ length: 367 }, () => []),
  }
  const cols: Record<string, (number | null)[]> = {
    tmean: json.daily.temperature_2m_mean,
    tmax: json.daily.temperature_2m_max,
    tmin: json.daily.temperature_2m_min,
    precip: json.daily.precipitation_sum,
  }
  t.forEach((iso, i) => {
    const day = doy(iso)
    for (const k of Object.keys(buckets)) {
      const v = cols[k][i]
      if (v != null) buckets[k][day].push(v)
    }
  })

  const smooth = (b: number[][]): (number | null)[] =>
    Array.from({ length: 367 }, (_, day) => {
      if (day === 0) return null
      const pool: number[] = []
      for (let o = -7; o <= 7; o++) {
        const d = ((day - 1 + o + 366) % 366) + 1
        pool.push(...b[d])
      }
      return pool.length ? pool.reduce((a, x) => a + x, 0) / pool.length : null
    })

  return { tmean: smooth(buckets.tmean), tmax: smooth(buckets.tmax), tmin: smooth(buckets.tmin), precip: smooth(buckets.precip), years }
}

/** Day-of-year for a shifted-to-local timestamp (see the time note above). */
export function dayOfYear(ms: number): number {
  const d = new Date(ms)
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000)
}
