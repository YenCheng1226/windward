import { useMemo } from 'react'
import type { Forecast } from '../lib/openmeteo'
import { modelById } from '../lib/models'
import type { Palette } from '../lib/palette'
import { alpha } from '../lib/palette'
import { compass, dayLabel, fmt, hourLabel, relativeDay, weekdayLabel, windLevel, wmo } from '../lib/weather'
import TimeChart, { type ChartSeries } from './TimeChart'
import { Card, Legend, StatTile } from './ui'

/**
 * First model that actually returned data for `variable` — models have different
 * horizons, so the leading model in the selection may have no values at all.
 * The block is explicit because several names (weather_code) exist in both.
 */
function pick(forecast: Forecast, block: 'daily' | 'hourly', variable: string): { model: string; values: (number | null)[] } | null {
  const byModel = forecast[block].vars[variable]
  if (!byModel) return null
  for (const m of forecast.models) {
    const v = byModel[m]
    if (v?.some((x) => x != null)) return { model: m, values: v }
  }
  return null
}

const daily = (f: Forecast, v: string) => pick(f, 'daily', v)
const hour = (f: Forecast, v: string) => pick(f, 'hourly', v)

export default function OverviewPanel({ forecast, palette, nowMs }: { forecast: Forecast; palette: Palette; nowMs: number }) {
  const d = forecast.daily
  const codes = daily(forecast, 'weather_code')
  const tmax = daily(forecast, 'temperature_2m_max')
  const tmin = daily(forecast, 'temperature_2m_min')
  const psum = daily(forecast, 'precipitation_sum')
  const pprob = daily(forecast, 'precipitation_probability_max')
  const wmax = daily(forecast, 'wind_speed_10m_max')
  const wgust = daily(forecast, 'wind_gusts_10m_max')
  const wdir = daily(forecast, 'wind_direction_10m_dominant')
  const uv = daily(forecast, 'uv_index_max')

  const sourceModel = tmax ? modelById(tmax.model)?.name ?? tmax.model : '—'

  const hourly = forecast.hourly
  const nowIdx = useMemo(() => {
    let best = 0
    for (let i = 0; i < hourly.time.length; i++) if (hourly.time[i] <= nowMs) best = i
    return best
  }, [hourly.time, nowMs])

  const nowTemp = hour(forecast, 'temperature_2m')?.values[nowIdx]
  const nowFeels = hour(forecast, 'apparent_temperature')?.values[nowIdx]
  const nowWind = hour(forecast, 'wind_speed_10m')?.values[nowIdx]
  const nowDir = hour(forecast, 'wind_direction_10m')?.values[nowIdx]
  const nowRh = hour(forecast, 'relative_humidity_2m')?.values[nowIdx]
  const nowCode = hour(forecast, 'weather_code')?.values[nowIdx]

  // Rain accumulating over the whole window is the number people actually plan around.
  const totalRain = psum ? psum.values.reduce<number>((a, v) => a + (v ?? 0), 0) : 0
  const wetDays = psum ? psum.values.filter((v) => (v ?? 0) >= 1).length : 0
  const hottest = tmax ? Math.max(...tmax.values.filter((v): v is number => v != null)) : null
  const coldest = tmin ? Math.min(...tmin.values.filter((v): v is number => v != null)) : null

  const tempSeries: ChartSeries[] = useMemo(() => {
    if (!tmax || !tmin) return []
    return [
      { label: '每日最高', values: tmax.values, color: palette.series[1], width: 2, unit: '°C' },
      { label: '每日最低', values: tmin.values, color: palette.series[0], width: 2, unit: '°C' },
    ]
  }, [tmax, tmin, palette])

  const rainSeries: ChartSeries[] = useMemo(() => {
    if (!psum) return []
    return [{ label: '日累積雨量', values: psum.values, color: palette.series[0], bars: true, fill: alpha(palette.series[0], 0.75), unit: 'mm' }]
  }, [psum, palette])

  const nowInfo = wmo(nowCode ?? null)
  const nowWindLv = windLevel(nowWind ?? null)

  return (
    <>
      <Card title="目前概況" subtitle={<>依據 {sourceModel}・{forecast.timezone}・模式地形高度 {Math.round(forecast.elevation)} m</>}>
        <div className="now-row">
          <div className="now-hero">
            <span className="now-icon">{nowInfo.icon}</span>
            <div>
              <div className="now-temp">
                {fmt(nowTemp, 'temperature_2m')}
                <span className="now-unit">°C</span>
              </div>
              <div className="now-desc">
                {nowInfo.label}・體感 {fmt(nowFeels, 'apparent_temperature')}°C
              </div>
              <div className="now-time">資料時間 {dayLabel(hourly.time[nowIdx])}（{weekdayLabel(hourly.time[nowIdx])}）{hourLabel(hourly.time[nowIdx])}</div>
            </div>
          </div>
          <div className="stat-grid">
            <StatTile label="風速" value={fmt(nowWind, 'wind_speed_10m')} unit=" m/s" note={`${compass(nowDir ?? null)}風・${nowWindLv.bft} 級 ${nowWindLv.label}`} />
            <StatTile label="相對濕度" value={fmt(nowRh, 'relative_humidity_2m')} unit=" %" />
            <StatTile label={`未來 ${d.time.length} 天雨量`} value={totalRain.toFixed(1)} unit=" mm" note={`${wetDays} 天達 1 mm 以上`} />
            <StatTile label="溫度區間" value={coldest != null && hottest != null ? `${coldest.toFixed(0)}–${hottest.toFixed(0)}` : '—'} unit=" °C" note="全期間最低／最高" />
          </div>
        </div>
      </Card>

      <Card title={`${d.time.length} 天逐日預報`} subtitle={`資料來源 ${sourceModel}・可橫向捲動`} wide>
        <div className="daystrip">
          {d.time.map((t, i) => {
            const info = wmo(codes?.values[i] ?? null)
            const rain = psum?.values[i] ?? null
            const prob = pprob?.values[i] ?? null
            const gust = wgust?.values[i] ?? null
            return (
              <div key={t} className={`daycard${i === 0 ? ' today' : ''}`}>
                <div className="daycard-date">
                  <strong>{dayLabel(t)}</strong>
                  <span>週{weekdayLabel(t)}</span>
                  <em>{relativeDay(t, nowMs)}</em>
                </div>
                <div className="daycard-icon" title={info.label}>
                  {info.icon}
                </div>
                <div className="daycard-desc">{info.label}</div>
                <div className="daycard-temp">
                  <span className="t-max">{fmt(tmax?.values[i], 'temperature_2m_max')}°</span>
                  <span className="t-sep">/</span>
                  <span className="t-min">{fmt(tmin?.values[i], 'temperature_2m_min')}°</span>
                </div>
                <div className="daycard-rain">
                  {(rain ?? 0) > 0 && <span className="rain-bar" style={{ width: `${Math.min(100, Math.max(4, (rain! / 40) * 100))}%`, background: palette.series[0] }} />}
                  <span className="rain-txt">
                    {rain != null ? `${rain.toFixed(1)} mm` : '—'}
                    {prob != null && <em> · {prob.toFixed(0)}%</em>}
                  </span>
                </div>
                <div className="daycard-wind">
                  {compass(wdir?.values[i] ?? null)} {fmt(wmax?.values[i], 'wind_speed_10m')}
                  {gust != null && <em> 陣 {gust.toFixed(0)}</em>} m/s
                </div>
                {uv?.values[i] != null && <div className="daycard-uv">UV {uv.values[i]!.toFixed(0)}</div>}
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="每日最高／最低氣溫" subtitle={`${sourceModel}・單位 °C`}>
          <Legend
            items={[
              { label: '每日最高', color: palette.series[1] },
              { label: '每日最低', color: palette.series[0] },
            ]}
          />
          <TimeChart time={d.time} series={tempSeries} palette={palette} unit="°C" height={230} markerAt={nowMs} />
        </Card>
        <Card title="每日累積雨量" subtitle={`${sourceModel}・單位 mm`}>
          <Legend items={[{ label: '日累積雨量', color: palette.series[0], swatch: 'band' }]} />
          <TimeChart time={d.time} series={rainSeries} palette={palette} unit="mm" height={230} yMin={0} markerAt={nowMs} />
        </Card>
      </div>
    </>
  )
}
