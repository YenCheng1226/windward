import { useEffect, useRef, useState } from 'react'
import { fetchClimatology, fetchEnsemble, fetchForecast, fetchMarine, type Climatology, type EnsembleData, type EnsembleQuery, type Forecast, type ForecastQuery, type Marine } from './openmeteo'
import { DARK, LIGHT, type Palette } from './palette'
import { fetchCyclones, fetchDisturbances, type Cyclone, type Disturbances } from './tropical'

export interface Async<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** Shared in-memory response cache — switching tabs must not re-hit the API. */
const cache = new Map<string, unknown>()

function useAsync<Q, T>(key: string | null, query: Q, run: (q: Q, signal: AbortSignal) => Promise<T>): Async<T> {
  const [data, setData] = useState<T | null>(() => (key ? ((cache.get(key) as T) ?? null) : null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    if (!key) return
    const hit = cache.get(key) as T | undefined
    if (hit && nonce === 0) {
      setData(hit)
      setError(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    runRef
      .current(query, ac.signal)
      .then((res) => {
        cache.set(key, res)
        setData(res)
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setError((e as Error).message || '無法連線到 Open-Meteo')
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
    // `query` is rebuilt every render; `key` is its stable serialisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  return {
    data,
    loading,
    error,
    reload: () => {
      if (key) cache.delete(key)
      setNonce((n) => n + 1)
    },
  }
}

export function useForecast(q: ForecastQuery | null): Async<Forecast> {
  const key = q ? `f|${q.lat.toFixed(3)}|${q.lon.toFixed(3)}|${[...q.models].sort().join(',')}|${q.days}|${q.windUnit}` : null
  return useAsync(key, q as ForecastQuery, fetchForecast)
}

export function useEnsemble(q: EnsembleQuery | null): Async<EnsembleData> {
  const key = q ? `e|${q.lat.toFixed(3)}|${q.lon.toFixed(3)}|${q.model}|${q.variable}|${q.days}|${q.windUnit}` : null
  return useAsync(key, q as EnsembleQuery, fetchEnsemble)
}

export type ThemeChoice = 'system' | 'light' | 'dark'

/** Resolve the active palette, following the OS when the user hasn't chosen. */
export function useTheme(): [Palette, ThemeChoice, (t: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try {
      return (localStorage.getItem('theme') as ThemeChoice) ?? 'system'
    } catch {
      return 'system'
    }
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('theme', choice)
    } catch {
      /* private browsing — the choice just doesn't persist */
    }
  }, [choice])

  const dark = choice === 'dark' || (choice === 'system' && systemDark)
  return [dark ? DARK : LIGHT, choice, setChoice]
}

export function useClimatology(lat: number | null, lon: number | null): Async<Climatology> {
  const key = lat != null && lon != null ? `c|${lat.toFixed(2)}|${lon.toFixed(2)}` : null
  return useAsync(key, { lat: lat ?? 0, lon: lon ?? 0 }, (q, signal) => fetchClimatology(q.lat, q.lon, 10, signal))
}

export function useMarine(lat: number | null, lon: number | null, models: string[], days: number): Async<Marine> {
  const key = lat != null && lon != null ? `m|${lat.toFixed(3)}|${lon.toFixed(3)}|${models.join(',')}|${days}` : null
  return useAsync(key, { lat: lat ?? 0, lon: lon ?? 0, models, days }, (q, signal) => fetchMarine(q.lat, q.lon, q.models, q.days, signal))
}

export function useCyclones(lat: number | null, lon: number | null): Async<Cyclone[]> {
  const key = lat != null && lon != null ? `tc|${lat.toFixed(2)}|${lon.toFixed(2)}` : null
  return useAsync(key, { lat: lat ?? 0, lon: lon ?? 0 }, (q, signal) => fetchCyclones(q.lat, q.lon, signal))
}

export function useDisturbances(): Async<Disturbances> {
  return useAsync('jtwc-abpw', null, (_q, signal) => fetchDisturbances(signal))
}
