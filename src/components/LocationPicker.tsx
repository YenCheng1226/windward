import { useEffect, useMemo, useRef, useState } from 'react'
import { TAIWAN_PLACES, geocode, type GeoResult, type Place } from '../lib/locations'

/**
 * Location search. The built-in Taiwan list is matched first and always wins;
 * the Open-Meteo geocoder is queried only as a fallback, because its Chinese
 * matching ranks mainland-China towns above Taiwanese cities of the same name.
 */
export default function LocationPicker({ place, onPick }: { place: Place; onPick: (p: Place) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<GeoResult[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  const local = useMemo(() => {
    const q = query.trim()
    if (!q) return TAIWAN_PLACES
    return TAIWAN_PLACES.filter((p) => p.name.includes(q))
  }, [query])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || local.length > 0) {
      setRemote([])
      return
    }
    const ac = new AbortController()
    const t = setTimeout(() => {
      geocode(q, ac.signal).then(setRemote).catch(() => {})
    }, 300)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [query, local.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const grouped = useMemo(() => {
    const map = new Map<string, Place[]>()
    for (const p of local) {
      const arr = map.get(p.group) ?? []
      arr.push(p)
      map.set(p.group, arr)
    }
    return [...map.entries()]
  }, [local])

  const pick = (p: Place) => {
    onPick(p)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="picker" ref={boxRef}>
      <button className="picker-trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="picker-pin">◎</span>
        <span className="picker-name">{place.name}</span>
        <span className="picker-coord">
          {place.lat.toFixed(2)}°N {place.lon.toFixed(2)}°E
        </span>
        <span className="picker-caret">▾</span>
      </button>
      {open && (
        <div className="picker-panel">
          <input
            autoFocus
            className="picker-input"
            placeholder="搜尋台灣縣市、山區、離島，或世界城市…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker-list">
            {grouped.map(([group, places]) => (
              <div key={group}>
                <div className="picker-group">{group}</div>
                {places.map((p) => (
                  <button key={p.name} className="picker-item" onClick={() => pick(p)}>
                    <span>{p.name}</span>
                    {p.elevation && <em>{p.elevation} m</em>}
                  </button>
                ))}
              </div>
            ))}
            {remote.length > 0 && (
              <div>
                <div className="picker-group">世界地點</div>
                {remote.map((r) => (
                  <button
                    key={`${r.name}-${r.lat}-${r.lon}`}
                    className="picker-item"
                    onClick={() => pick({ name: r.name, lat: r.lat, lon: r.lon, group: '景點 / 海域' })}
                  >
                    <span>{r.name}</span>
                    <em>
                      {r.admin ? r.admin + '・' : ''}
                      {r.country}
                    </em>
                  </button>
                ))}
              </div>
            )}
            {!local.length && !remote.length && query.trim().length >= 2 && <div className="picker-empty">找不到「{query}」</div>}
          </div>
        </div>
      )}
    </div>
  )
}
