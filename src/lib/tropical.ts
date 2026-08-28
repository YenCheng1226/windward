/**
 * Tropical cyclone tracking.
 *
 * ## Why not 中央氣象署
 * CWA is the authority for Taiwan, but neither of its feeds can be read by a static
 * page: the open-data API requires a key (embedding one in a public site exposes it),
 * and the public RSS serves no `Access-Control-Allow-Origin` header, so the browser
 * blocks it. Both sources below were verified to send `Access-Control-Allow-Origin: *`.
 *
 * ## What each source is for
 * - **JMA (RSMC Tokyo)** is the WMO-designated centre for the Western North Pacific —
 *   the official position, intensity and forecast track every other agency, CWA
 *   included, works from. Used for systems that already exist.
 * - **JTWC ABPW** is the Significant Tropical Weather Advisory: it lists *disturbances*
 *   and invest areas before anything is named. This is the "is something brewing"
 *   half, and the reason a tracker beats reading a typhoon warning after the fact.
 *
 * Intensities from the two disagree by design: JMA reports a 10-minute mean wind
 * (the same convention CWA uses), JTWC a 1-minute mean, which runs roughly 12 % higher
 * for the same storm. They are not errors in each other.
 */

const JMA = 'https://www.jma.go.jp/bosai/typhoon/data'
const JTWC_ABPW = 'https://www.metoc.navy.mil/jtwc/products/abpwweb.txt'

export interface TrackPoint {
  /** Hours ahead of analysis time; 0 is the current position. */
  hours: number
  lat: number
  lon: number
  validTime: number
  /** Radius of the 70 % probability circle, km. Absent for the analysis point. */
  circleKm: number | null
  /** Distance from the point of interest, km. */
  distanceKm: number
  /** True bearing from the point of interest, degrees clockwise from north. */
  bearingDeg: number
}

export interface Cyclone {
  id: string
  /** JMA storm number, e.g. "2623" — the 台風18號 style number. */
  number: string
  nameEn: string
  nameJp: string
  /** JMA category code: TD / TS / STS / TY. */
  category: string
  /** Taiwan's own scale, derived from the 10-minute sustained wind. */
  cwaScale: string
  sustainedMs: number | null
  gustMs: number | null
  pressureHpa: number | null
  lat: number
  lon: number
  location: string
  course: string
  speedKmh: number | null
  /** Radius of the gale (≥15 m/s) area, km — the largest sector reported. */
  galeRadiusKm: number | null
  issued: number
  validTime: number
  track: TrackPoint[]
  /** Past positions, for drawing where it came from. */
  history: [number, number][]
  distanceKm: number
  bearing: string
  /** True bearing from the point of interest, degrees clockwise from north. */
  bearingDeg: number
  /** Closest approach across the forecast track. */
  closest: { km: number; at: number; hours: number } | null
}

const R = 6371

/** Great-circle distance in km. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const COMPASS16 = ['北', '北北東', '東北', '東北偏東', '東', '東南偏東', '東南', '南南東', '南', '南南西', '西南', '西南偏西', '西', '西北偏西', '西北', '北北西']

/** True bearing in degrees, clockwise from north. */
export function bearingDegOf(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad)
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad)
  return (Math.atan2(y, x) / rad + 360) % 360
}

export function bearingOf(lat1: number, lon1: number, lat2: number, lon2: number): string {
  return COMPASS16[Math.round(bearingDegOf(lat1, lon1, lat2, lon2) / 22.5) % 16]
}

/**
 * Taiwan's typhoon scale, from the 10-minute sustained wind in m/s.
 * CWA: 熱帶性低氣壓 <17.2, 輕度 17.2–32.6, 中度 32.7–50.9, 強烈 ≥51.0.
 * JMA publishes the same 10-minute convention, so the wind converts directly —
 * which is why this maps the wind rather than translating JMA's own category names.
 */
export function cwaScale(sustainedMs: number | null): string {
  if (sustainedMs == null) return '不明'
  if (sustainedMs < 17.2) return '熱帶性低氣壓'
  if (sustainedMs < 32.7) return '輕度颱風'
  if (sustainedMs < 51.0) return '中度颱風'
  return '強烈颱風'
}

/** JMA writes courses in Japanese compass words; render them the Taiwanese way. */
const COURSE_JP: Record<string, string> = {
  北: '北', 北北東: '北北東', 北東: '東北', 東北東: '東北偏東', 東: '東', 東南東: '東南偏東',
  南東: '東南', 南南東: '南南東', 南: '南', 南南西: '南南西', 南西: '西南', 西南西: '西南偏西',
  西: '西', 西北西: '西北偏西', 北西: '西北', 北北西: '北北西', ほとんど停滞: '幾乎滯留', 停滞: '滯留',
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Active cyclones with their forecast tracks, measured against `lat`/`lon`.
 * Returns an empty list when nothing is active — which is a real answer, not a failure.
 */
export async function fetchCyclones(lat: number, lon: number, signal?: AbortSignal): Promise<Cyclone[]> {
  const list = (await getJson(`${JMA}/targetTc.json`, signal)) as { tropicalCyclone: string }[]
  if (!Array.isArray(list) || !list.length) return []

  const out = await Promise.all(
    list.map(async (item) => {
      const id = item.tropicalCyclone
      const [spec, fc] = await Promise.all([
        getJson(`${JMA}/${id}/specifications.json`, signal).catch(() => null),
        getJson(`${JMA}/${id}/forecast.json`, signal).catch(() => null),
      ])
      if (!spec) return null

      const title = spec.find((p: any) => p.part === 'title')
      const analysis = spec.find((p: any) => p.advancedHours === 0)
      if (!analysis?.position?.deg) return null

      const [aLat, aLon] = analysis.position.deg as [number, number]
      const sustained = num(analysis.maximumWind?.sustained?.['m/s'])

      const track: TrackPoint[] = []
      for (const part of (fc ?? []) as any[]) {
        if (!part.center || part.advancedHours == null) continue
        const [pLat, pLon] = part.center as [number, number]
        track.push({
          hours: part.advancedHours,
          lat: pLat,
          lon: pLon,
          validTime: part.validtime?.UTC ? Date.parse(part.validtime.UTC) : 0,
          circleKm: part.probabilityCircle?.radius != null ? part.probabilityCircle.radius / 1000 : null,
          distanceKm: haversine(lat, lon, pLat, pLon),
          bearingDeg: bearingDegOf(lat, lon, pLat, pLon),
        })
      }
      track.sort((a, b) => a.hours - b.hours)

      const closest = track.length
        ? track.reduce((a, b) => (b.distanceKm < a.distanceKm ? b : a))
        : null

      const gale = Array.isArray(analysis.galeWarning)
        ? Math.max(...analysis.galeWarning.map((g: any) => num(g.range?.km) ?? 0))
        : null

      const history = (fc?.find((p: any) => p.advancedHours === 0)?.track?.typhoon ?? []) as [number, number][]

      return {
        id,
        number: title?.typhoonNumber ?? '',
        nameEn: title?.name?.en ?? id,
        nameJp: title?.name?.jp ?? '',
        category: analysis.category?.en ?? '',
        cwaScale: cwaScale(sustained),
        sustainedMs: sustained,
        gustMs: num(analysis.maximumWind?.gust?.['m/s']),
        pressureHpa: num(analysis.pressure),
        lat: aLat,
        lon: aLon,
        location: analysis.location ?? '',
        course: COURSE_JP[analysis.course] ?? analysis.course ?? '',
        speedKmh: num(analysis.speed?.['km/h']),
        galeRadiusKm: gale && gale > 0 ? gale : null,
        issued: title?.issue?.UTC ? Date.parse(title.issue.UTC) : Date.now(),
        validTime: analysis.validtime?.UTC ? Date.parse(analysis.validtime.UTC) : Date.now(),
        track,
        history,
        distanceKm: haversine(lat, lon, aLat, aLon),
        bearing: bearingOf(lat, lon, aLat, aLon),
        bearingDeg: bearingDegOf(lat, lon, aLat, aLon),
        closest: closest ? { km: closest.distanceKm, at: closest.validTime, hours: closest.hours } : null,
      } as Cyclone
    }),
  )

  return out.filter((c): c is Cyclone => c != null).sort((a, b) => a.distanceKm - b.distanceKm)
}

export interface Disturbances {
  /** Raw advisory text, kept verbatim — this is an official product, not our words. */
  raw: string
  issued: string
  /** The Western North Pacific disturbance paragraph. */
  summary: string
  /** True when the advisory explicitly reports nothing brewing. */
  none: boolean
}

/**
 * JTWC's disturbance summary for the Western North Pacific.
 *
 * The advisory is a fixed-format military bulletin; the parse takes section 1B and
 * falls back to the whole text if the format ever shifts, so a layout change degrades
 * to "show the original" rather than to a confidently wrong extract.
 */
export async function fetchDisturbances(signal?: AbortSignal): Promise<Disturbances> {
  const res = await fetch(JTWC_ABPW, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = (await res.text()).trim()

  const issued = raw.match(/(\d{6}Z?-?\d{0,6}Z?[A-Z]{3}\d{4})/)?.[1] ?? raw.split('\n')[0] ?? ''
  const wnp = raw.split(/2\.\s*SOUTH PACIFIC AREA/)[0]
  const m = wnp.match(/B\.\s*TROPICAL DISTURBANCE SUMMARY:([\s\S]*?)(?=\n\s*C\.|$)/i)
  const summary = (m?.[1] ?? raw).replace(/\s+/g, ' ').trim()

  return { raw, issued, summary, none: /^none\.?$/i.test(summary) }
}
