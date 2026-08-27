import { useMemo, useState } from 'react'
import type { Forecast } from '../lib/openmeteo'
import { modelById } from '../lib/models'
import type { Palette } from '../lib/palette'
import { modelColor } from './ModelPanel'
import { VAR_LABELS, compass, dayLabel, fmt, hourLabel, weekdayLabel, wmo } from '../lib/weather'
import { Card, Segmented } from './ui'

const HOURLY_COLS = ['temperature_2m', 'apparent_temperature', 'precipitation', 'precipitation_probability', 'relative_humidity_2m', 'cloud_cover', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'pressure_msl']
const DAILY_COLS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant', 'uv_index_max']

const DAILY_LABELS: Record<string, string> = {
  temperature_2m_max: '最高溫',
  temperature_2m_min: '最低溫',
  precipitation_sum: '雨量',
  precipitation_probability_max: '降水機率',
  wind_speed_10m_max: '最大風速',
  wind_gusts_10m_max: '最大陣風',
  wind_direction_10m_dominant: '主風向',
  uv_index_max: 'UV 指數',
}

/**
 * The numbers behind every chart. Required as an accessibility fallback — colour and
 * position are never the only way to read this dashboard — and doubles as the export.
 */
export default function TablePanel({ forecast, palette, placeName }: { forecast: Forecast; palette: Palette; placeName: string }) {
  const [grain, setGrain] = useState<'hourly' | 'daily'>('daily')
  const [model, setModel] = useState(forecast.models[0])

  const block = grain === 'hourly' ? forecast.hourly : forecast.daily
  const cols = grain === 'hourly' ? HOURLY_COLS : DAILY_COLS
  const label = (v: string) => (grain === 'hourly' ? VAR_LABELS[v] ?? v : DAILY_LABELS[v] ?? v)

  const available = forecast.models.filter((m) => block.vars[cols[0]]?.[m]?.some((v) => v != null))
  const active = available.includes(model) ? model : available[0]

  const rows = useMemo(() => {
    const present = cols.filter((c) => block.vars[c]?.[active])
    return { present, n: block.time.length }
  }, [block, cols, active])

  const csv = useMemo(() => {
    const head = ['time', ...rows.present]
    const lines = [head.join(',')]
    for (let i = 0; i < rows.n; i++) {
      const t = new Date(block.time[i])
      const iso = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}${grain === 'hourly' ? ' ' + hourLabel(block.time[i]) : ''}`
      lines.push([iso, ...rows.present.map((c) => block.vars[c][active][i] ?? '')].join(','))
    }
    return lines.join('\n')
  }, [rows, block, active, grain])

  const download = () => {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${placeName}-${modelById(active)?.name ?? active}-${grain}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const codes = block.vars.weather_code?.[active]

  return (
    <Card
      title="資料表"
      subtitle={<>圖表背後的原始數值・{placeName}・{modelById(active)?.name ?? active}</>}
      actions={
        <div className="toolbar">
          <Segmented
            ariaLabel="時間解析度"
            value={grain}
            onChange={setGrain}
            options={[
              { value: 'daily' as const, label: '逐日' },
              { value: 'hourly' as const, label: '逐時' },
            ]}
          />
          <Segmented ariaLabel="選擇模式" value={active} onChange={setModel} options={available.map((m) => ({ value: m, label: modelById(m)?.name ?? m }))} />
          <button className="btn" onClick={download}>
            下載 CSV
          </button>
        </div>
      }
      wide
    >
      <div className="model-table-wrap tall">
        <table className="data-table">
          <thead>
            <tr>
              <th>時間</th>
              {codes && <th>天氣</th>}
              {rows.present.map((c) => (
                <th key={c} className="num">
                  {label(c)}
                  <em className="unit">{block.units[c] ?? ''}</em>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows.n }, (_, i) => {
              const t = block.time[i]
              const info = codes ? wmo(codes[i]) : null
              return (
                <tr key={t}>
                  <td className="nowrap">
                    {dayLabel(t)}（{weekdayLabel(t)}）{grain === 'hourly' && ' ' + hourLabel(t)}
                  </td>
                  {info && (
                    <td className="nowrap">
                      {info.icon} {info.label}
                    </td>
                  )}
                  {rows.present.map((c) => {
                    const v = block.vars[c][active][i]
                    const isDir = c.startsWith('wind_direction')
                    return (
                      <td key={c} className="num">
                        {isDir && v != null ? `${compass(v)} ${v.toFixed(0)}°` : fmt(v, c.replace(/_max$|_min$|_sum$|_dominant$/, ''))}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        <span className="legend-swatch" style={{ background: modelColor(active, palette) }} /> 此模式在其他圖表中的代表色
      </p>
    </Card>
  )
}
