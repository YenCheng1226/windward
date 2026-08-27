import { useMemo, useState } from 'react'
import type { Forecast } from '../lib/openmeteo'
import { modelById } from '../lib/models'
import { alpha, type Palette } from '../lib/palette'
import { VAR_LABELS } from '../lib/weather'
import TimeChart, { type ChartSeries } from './TimeChart'
import { Card, Legend, Segmented } from './ui'

/**
 * Stacked hourly panels for one model. Variables are grouped so that every chart
 * has exactly one y-scale — temperature, rainfall, percentages, wind and pressure
 * never share an axis.
 */
const GROUPS: { title: string; unitKey: string; vars: string[]; slots: number[]; bars?: boolean; yMin?: number; yMax?: number }[] = [
  { title: '氣溫 / 體感 / 露點', unitKey: 'temperature_2m', vars: ['temperature_2m', 'apparent_temperature', 'dew_point_2m'], slots: [1, 7, 2] },
  { title: '降水量', unitKey: 'precipitation', vars: ['precipitation'], slots: [0], bars: true, yMin: 0 },
  { title: '降水機率 / 雲量 / 相對濕度', unitKey: 'cloud_cover', vars: ['precipitation_probability', 'cloud_cover', 'relative_humidity_2m'], slots: [0, 4, 2], yMin: 0, yMax: 100 },
  { title: '風速 / 陣風', unitKey: 'wind_speed_10m', vars: ['wind_speed_10m', 'wind_gusts_10m'], slots: [6, 3], yMin: 0 },
  { title: '海平面氣壓', unitKey: 'pressure_msl', vars: ['pressure_msl'], slots: [5] },
]

export default function MeteogramPanel({ forecast, palette, nowMs }: { forecast: Forecast; palette: Palette; nowMs: number }) {
  const available = forecast.models.filter((m) => forecast.hourly.vars.temperature_2m?.[m]?.some((v) => v != null))
  const [model, setModel] = useState(available[0] ?? forecast.models[0])
  const active = available.includes(model) ? model : available[0]

  const charts = useMemo(() => {
    return GROUPS.map((g) => {
      const series: ChartSeries[] = []
      g.vars.forEach((v, i) => {
        const values = forecast.hourly.vars[v]?.[active]
        if (!values || !values.some((x) => x != null)) return
        const color = palette.series[g.slots[i] % palette.series.length]
        series.push({
          label: VAR_LABELS[v] ?? v,
          values,
          color,
          width: 2,
          bars: g.bars,
          fill: g.bars ? alpha(color, 0.75) : undefined,
          unit: forecast.hourly.units[v] ?? '',
        })
      })
      return { ...g, series, unit: forecast.hourly.units[g.unitKey] ?? '' }
    }).filter((g) => g.series.length > 0)
  }, [forecast, active, palette])

  const horizonDays = useMemo(() => {
    const t = forecast.hourly.vars.temperature_2m?.[active] ?? []
    let last = -1
    t.forEach((v, i) => {
      if (v != null) last = i
    })
    return last >= 0 ? ((forecast.hourly.time[last] - forecast.hourly.time[0]) / 86400000).toFixed(1) : '0'
  }, [forecast, active])

  return (
    <>
      <Card
        title="逐時氣象圖"
        subtitle={<>單一模式的逐時細節・此模式在本地點可預報 {horizonDays} 天・在圖上拖曳可放大，雙擊還原</>}
        actions={
          <Segmented
            ariaLabel="選擇模式"
            value={active}
            onChange={setModel}
            options={available.map((m) => ({ value: m, label: modelById(m)?.name ?? m, title: modelById(m)?.centre }))}
          />
        }
      />
      {charts.map((g) => (
        <Card key={g.title} title={g.title} subtitle={`單位 ${g.unit || '—'}`}>
          {g.series.length > 1 && <Legend items={g.series.map((s) => ({ label: s.label, color: s.color, swatch: s.bars ? 'band' : undefined }))} />}
          <TimeChart
            time={forecast.hourly.time}
            series={g.series}
            palette={palette}
            unit={g.unit}
            height={g.series.length > 1 ? 220 : 180}
            markerAt={nowMs}
            yMin={g.yMin}
            yMax={g.yMax}
          />
        </Card>
      ))}
    </>
  )
}
