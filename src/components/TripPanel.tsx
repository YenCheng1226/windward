import { useMemo, useState } from 'react'
import { ACTIVITIES, sunVerdict, verdict, waveConfidence } from '../lib/activities'
import { useEnsemble, useMarine } from '../lib/hooks'
import type { Place } from '../lib/locations'
import { WAVE_MODELS, ensembleById } from '../lib/models'
import type { Forecast } from '../lib/openmeteo'
import { alpha, type Palette } from '../lib/palette'
import { buildHours, summarise, sunByDay, windLimit, type DaySummary } from '../lib/trip'
import { dayLabel, weekdayLabel } from '../lib/weather'
import TimeChart, { type ChartBand, type ChartSeries } from './TimeChart'
import { Card, ErrorBox, Legend, Segmented, Spinner, StatTile } from './ui'

const DAY_MS = 86400000
const dayOf = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS

/** Format/parse dates in the shifted-local space (UTC fields = local wall clock). */
const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fromInput = (s: string) => Date.parse(s + 'T00:00:00Z')

const WAVE_IDS = WAVE_MODELS.map((m) => m.id)

export interface TripRange {
  from: number
  to: number
  activity: string
}

export default function TripPanel({
  place,
  forecast,
  palette,
  nowMs,
  windUnit,
  range,
  onRangeChange,
}: {
  place: Place
  forecast: Forecast
  palette: Palette
  nowMs: number
  windUnit: 'ms' | 'kmh' | 'kn'
  range: TripRange
  onRangeChange: (r: TripRange) => void
}) {
  const [openDay, setOpenDay] = useState<number | null>(null)

  const days = useMemo(() => {
    const out: number[] = []
    for (let d = dayOf(range.from); d <= dayOf(range.to); d += DAY_MS) out.push(d)
    return out.slice(0, 10)
  }, [range.from, range.to])

  const leadDays = (dayOf(range.from) - dayOf(nowMs)) / DAY_MS
  const spanEnd = dayOf(range.to) + DAY_MS

  // ECMWF ENS is the better ensemble but stops at ~15 days; fall back to GEFS 0.5°
  // (35 days) when the window reaches past it rather than showing no probability.
  const ensModel = spanEnd > nowMs + 14.5 * DAY_MS ? 'gfs05' : 'ecmwf_ifs025'
  const ensDef = ensembleById(ensModel)!

  const marine = useMarine(place.lat, place.lon, WAVE_IDS, 16)
  const ens = useEnsemble({ lat: place.lat, lon: place.lon, model: ensModel, variable: 'wind_speed_10m', days: ensModel === 'gfs05' ? 35 : 15, windUnit })

  const summary: DaySummary[] = useMemo(() => {
    const rows = buildHours({ hourly: forecast.hourly, models: forecast.models, marine: marine.data, waveModels: WAVE_IDS, daily: forecast.daily })
    return summarise(rows, days, ens.data, sunByDay(forecast.daily, forecast.models))
  }, [forecast, marine.data, ens.data, days])

  const activity = ACTIVITIES.find((a) => a.id === range.activity) ?? ACTIVITIES[0]

  /** Wave traces from both models plus the ensemble wind band, over the trip window. */
  const charts = useMemo(() => {
    if (!marine.data) return null
    const t = marine.data.hourly.time
    const inWindow: number[] = []
    t.forEach((ms, i) => {
      if (ms >= dayOf(range.from) && ms < spanEnd) inWindow.push(i)
    })
    if (!inWindow.length) return null
    const slice = <T,>(arr: (T | null)[] | undefined) => (arr ? inWindow.map((i) => arr[i] ?? null) : [])
    const waveSeries: ChartSeries[] = WAVE_MODELS.map((m, i) => ({
      label: m.name,
      values: slice(marine.data!.hourly.vars.wave_height?.[m.id]),
      color: palette.series[i],
      width: 2,
      unit: 'm',
    })).filter((s) => s.values.some((v) => v != null))
    return { time: inWindow.map((i) => t[i]), waveSeries }
  }, [marine.data, range.from, spanEnd, palette])

  /** Ensemble wind fan across the window, for the uncertainty card. */
  const windChart = useMemo(() => {
    if (!ens.data) return null
    const idx: number[] = []
    ens.data.time.forEach((ms, i) => {
      if (ms >= dayOf(range.from) && ms < spanEnd) idx.push(i)
    })
    if (!idx.length) return null
    const cols = idx.map((i) => ens.data!.members.map((m) => m[i]).filter((v): v is number => v != null))
    const q = (p: number) => cols.map((c) => (c.length ? [...c].sort((a, b) => a - b)[Math.min(c.length - 1, Math.floor(c.length * p))] : null))
    const series: ChartSeries[] = [
      { label: 'p90', values: q(0.9), color: palette.series[2], boundary: true, hideInTooltip: true },
      { label: 'p10', values: q(0.1), color: palette.series[2], boundary: true, hideInTooltip: true },
      { label: '系集中位風速', values: q(0.5), color: palette.series[2], width: 2.5, unit: 'm/s' },
      { label: `${activity.name}可行上限`, values: idx.map(() => windLimit(activity.id)), color: palette.series[7], width: 2, dash: [5, 4], unit: 'm/s' },
    ]
    const bands: ChartBand[] = [{ upper: 0, lower: 1, fill: alpha(palette.series[2], 0.18) }]
    return { time: idx.map((i) => ens.data!.time[i]), series, bands }
  }, [ens.data, range.from, spanEnd, palette, activity])

  const waveSpreadMax = useMemo(() => {
    const v = summary.flatMap((d) => d.cells.map((c) => c.waveSpread)).filter((x): x is number => x != null)
    return v.length ? Math.max(...v) : null
  }, [summary])

  const conf = waveConfidence(waveSpreadMax)
  const recheck = new Date(dayOf(range.from) - 4 * DAY_MS)

  const marineHorizon = useMemo(() => {
    const wh = marine.data?.hourly.vars.wave_height
    if (!wh) return null
    let last = -1
    WAVE_IDS.forEach((m) => wh[m]?.forEach((v, i) => { if (v != null) last = Math.max(last, i) }))
    return last >= 0 ? marine.data!.hourly.time[last] : null
  }, [marine.data])

  const beyondMarine = marineHorizon != null && spanEnd > marineHorizon

  /**
   * Last hour the atmospheric models cover. Days past it have no forecast at all —
   * distinct from a day whose forecast merely disagrees — and the table says so
   * rather than printing a row of dashes that reads like "calm".
   */
  const forecastHorizon = useMemo(() => {
    const t = forecast.hourly.vars.wind_speed_10m
    let last = -1
    if (t) for (const m of forecast.models) t[m]?.forEach((v, i) => { if (v != null) last = Math.max(last, i) })
    return last >= 0 ? forecast.hourly.time[last] : null
  }, [forecast])

  /** A day enters the 16-day window 15 days before it happens. */
  const entersRange = (day: number) => new Date(day - 15 * DAY_MS)
  const outOfRange = (day: number) => forecastHorizon != null && day > forecastHorizon

  return (
    <>
      <Card
        title="行程評估"
        subtitle="把預報翻譯成「這幾天能不能下水」。每個活動的門檻都寫在程式的 ACTIVITIES 裡，是業界經驗法則而非官方標準——數字可以吵、可以改。"
      >
        <div className="toolbar trip-toolbar">
          <label className="field">
            <span>出發</span>
            <input type="date" value={toInput(range.from)} onChange={(e) => onRangeChange({ ...range, from: fromInput(e.target.value) })} />
          </label>
          <label className="field">
            <span>結束</span>
            <input type="date" value={toInput(range.to)} onChange={(e) => onRangeChange({ ...range, to: fromInput(e.target.value) })} />
          </label>
          <Segmented
            ariaLabel="主要活動"
            value={range.activity}
            onChange={(a) => onRangeChange({ ...range, activity: a })}
            options={ACTIVITIES.map((a) => ({ value: a.id, label: `${a.icon} ${a.name}`, title: a.blurb }))}
          />
        </div>
        <div className="stat-grid stat-grid-4">
          <StatTile label="地點" value={place.name} note={`海象格點 ${marine.data ? `${marine.data.lat.toFixed(2)}°N ${marine.data.lon.toFixed(2)}°E` : '載入中'}`} />
          <StatTile label="出發還有" value={leadDays >= 0 ? leadDays.toFixed(0) : '已開始'} unit={leadDays >= 0 ? ' 天' : ''} note={`${days.length} 天行程`} />
          <StatTile
            label="波浪模式一致性"
            value={waveSpreadMax != null ? conf.level : '—'}
            note={waveSpreadMax != null ? `兩家波浪模式最大差 ${waveSpreadMax.toFixed(2)} m` : '此區間尚無波浪資料'}
            tone={conf.tone === 'muted' ? undefined : conf.tone}
          />
          <StatTile label="建議再確認" value={`${recheck.getUTCMonth() + 1}/${recheck.getUTCDate()}`} note="出發前 4 天，海象模式才進入可信範圍" />
        </div>
        {beyondMarine && (
          <p className="hint warn">
            ⚠ 行程尾端超出波浪模式時距（最遠到 {dayLabel(marineHorizon!)}），該區段的浪高欄位會顯示無資料——這不是預報說沒浪，是還沒有預報。
          </p>
        )}
      </Card>

      {(marine.loading || ens.loading) && !marine.data && <Spinner label="載入海象與系集資料…" />}
      {marine.error && <ErrorBox message={`海象資料：${marine.error}`} onRetry={marine.reload} />}

      <Card title="適宜度總表" subtitle="每格是該時段的綜合評分（0–100）。任何一項達到否決門檻，整格即為 0——水上活動由最差的因素決定。" wide>
        <div className="model-table-wrap">
          <table className="data-table trip-matrix">
            <thead>
              <tr>
                <th>日期</th>
                <th>時段</th>
                {ACTIVITIES.map((a) => (
                  <th key={a.id} className="num" title={a.blurb}>
                    {a.icon} {a.name}
                  </th>
                ))}
                <th className="num">浪高</th>
                <th className="num">風速</th>
                <th className="num">雨量</th>
                <th className="num">雲量</th>
                <th className="num">舒適度</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((d) =>
                outOfRange(d.day) ? (
                  <tr key={d.day} className="row-daystart">
                    <td className="nowrap">
                      <strong>{dayLabel(d.day)}</strong> <span className="muted">週{weekdayLabel(d.day)}</span>
                    </td>
                    <td colSpan={ACTIVITIES.length + 6} className="out-of-range">
                      超出目前預報範圍（全球模式最長 16 天）——這天會在 {entersRange(d.day).getUTCMonth() + 1}/{entersRange(d.day).getUTCDate()} 進入預報，屆時再看
                    </td>
                  </tr>
                ) : (
                d.cells.map((c, ci) => (
                  <tr key={`${d.day}-${c.part.id}`} className={ci === 0 ? 'row-daystart' : undefined}>
                    {ci === 0 && (
                      <td rowSpan={d.cells.length} className="nowrap">
                        <strong>{dayLabel(d.day)}</strong> <span className="muted">週{weekdayLabel(d.day)}</span>
                      </td>
                    )}
                    <td className="nowrap">{c.part.label}</td>
                    {ACTIVITIES.map((a) => {
                      const s = c.scores[a.id]
                      const v = verdict(s.score)
                      return (
                        <td key={a.id} className="num">
                          <span className={`score-chip tone-${v.tone}`} title={s.limiting ? `限制因素：${s.limiting.label}` : undefined}>
                            {s.score ?? '—'}
                          </span>
                        </td>
                      )
                    })}
                    <td className="num">{c.conditions.waveHeight != null ? `${c.conditions.waveHeight.toFixed(1)} m` : '—'}</td>
                    <td className="num">
                      {c.conditions.windSpeed != null ? `${c.conditions.windSpeed.toFixed(1)} m/s` : '—'}
                      {c.windSpread != null && c.windSpread >= 3 && (
                        <em className="sub" title={`${c.windModels} 家模式的最大值與最小值相差 ${c.windSpread.toFixed(1)} m/s`}>±{(c.windSpread / 2).toFixed(0)}</em>
                      )}
                    </td>
                    <td className="num">
                      {c.stats.rainSum != null ? `${c.stats.rainSum.toFixed(1)} mm` : '—'}
                      {c.stats.rainProbMax != null && <em className="sub"> {c.stats.rainProbMax.toFixed(0)}%</em>}
                    </td>
                    <td className="num">{c.stats.cloudMean != null ? `${c.stats.cloudMean.toFixed(0)} %` : '—'}</td>
                    <td className="num muted">{c.comfort.score != null ? `${c.comfort.score}` : '—'}</td>
                  </tr>
                ))
                ),
              )}
            </tbody>
          </table>
        </div>
        <Legend
          items={[
            { label: '可以玩 55 分以上', color: palette.good, swatch: 'band', note: '75 分以上為很適合' },
            { label: '勉強 35–54', color: palette.warning, swatch: 'band' },
            { label: '不建議 34 以下', color: palette.critical, swatch: 'band', note: '0 分代表有項目觸及否決門檻' },
          ]}
        />
      </Card>

      <Card
        title="曬太陽與降雨"
        subtitle="日照時數取自模式的逐日累計值，是「直射陽光超過門檻」的實際時數，不是雲量的反面。逐時的日照欄位在這裡不可用——它是二元的，雲量 45% 也照樣記整整一小時，所以日是日照最小的誠實單位；時段內的變化改看雲量。"
      >
        <div className="sun-grid">
          {summary
            .filter((d) => !outOfRange(d.day))
            .map((d) => {
              const sv = sunVerdict(d.sun.frac)
              return (
                <div key={d.day} className="sun-day">
                  <div className="sun-date">
                    <strong>{dayLabel(d.day)}</strong>
                    <span>週{weekdayLabel(d.day)}</span>
                    <em className={`chip tone-${sv.tone}`}>{sv.label}</em>
                  </div>
                  <div className="sun-headline">
                    <span className="sun-hours">
                      {d.sun.hours != null ? d.sun.hours.toFixed(1) : '—'}
                      <em> 小時日照</em>
                    </span>
                    <span className="sun-bar" title={`日照佔白天 ${d.sun.frac != null ? (d.sun.frac * 100).toFixed(0) : '—'}%`}>
                      <span style={{ width: `${(d.sun.frac ?? 0) * 100}%`, background: palette.warning }} />
                    </span>
                    <span className="sun-frac">{d.sun.frac != null ? `${(d.sun.frac * 100).toFixed(0)}% 白天` : '—'}</span>
                  </div>
                  {d.cells.map((c) => (
                    <div key={c.part.id} className="sun-part">
                      <span className="sun-label">{c.part.label}</span>
                      <span className="sun-cloud">
                        雲量 {c.stats.cloudMean != null ? `${c.stats.cloudMean.toFixed(0)}%` : '—'}
                      </span>
                      <span className="sun-rain">
                        {c.stats.rainSum != null && c.stats.rainSum >= 1
                          ? `雨 ${c.stats.rainSum.toFixed(1)} mm`
                          : c.stats.rainSum != null && c.stats.rainSum >= 0.2
                            ? `微量降雨 ${c.stats.rainSum.toFixed(1)} mm`
                            : c.stats.rainProbMax != null && c.stats.rainProbMax >= 30
                              ? `降水機率 ${c.stats.rainProbMax.toFixed(0)}%`
                              : '無雨'}
                        {c.stats.rainHours != null && c.stats.rainHours > 0 && <em> · {c.stats.rainHours} 小時有雨</em>}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
        </div>
        <p className="hint">
          九月的綠島 UV 幾乎每天都是過量級——日照越充足，防曬與補水越關鍵。反過來說，雲多時水下光線會變暗，攝影與能見度的體感都會打折。
        </p>
      </Card>

      <Card title="船班停航風險" subtitle="離島行程真正的成敗關鍵——活動條件再好，船不開就去不了。門檻取自這條航線常見的停航海況，是經驗法則，實際以當日船公司公告為準。">
        <div className="stat-grid stat-grid-4">
          {summary.map((d) => (
            <StatTile
              key={d.day}
              label={`${dayLabel(d.day)}（週${weekdayLabel(d.day)}）`}
              value={d.ferry.level}
              note={outOfRange(d.day) ? `${entersRange(d.day).getUTCMonth() + 1}/${entersRange(d.day).getUTCDate()} 才會進入預報範圍` : d.ferry.reason}
              tone={d.ferry.tone === 'muted' ? undefined : d.ferry.tone}
            />
          ))}
        </div>
      </Card>

      <Card
        title={`${activity.icon} ${activity.name} — 逐時段詳解`}
        subtitle={activity.blurb}
        actions={
          <Segmented
            ariaLabel="展開的日期"
            value={String(openDay ?? days[0])}
            onChange={(v) => setOpenDay(Number(v))}
            options={days.map((d) => ({ value: String(d), label: `${dayLabel(d)}` }))}
          />
        }
      >
        {summary
          .filter((d) => d.day === (openDay ?? days[0]))
          .map((d) => (
            <div key={d.day} className="detail-grid">
              {d.cells.map((c) => {
                const s = c.scores[activity.id]
                const v = verdict(s.score)
                const prob = c.windProb[activity.id]
                return (
                  <div key={c.part.id} className="detail-card">
                    <div className="detail-head">
                      <span>{c.part.label} {c.part.from}:00–{c.part.to}:00</span>
                      <span className={`score-chip tone-${v.tone}`}>{s.score ?? '—'}</span>
                      <em>{v.label}</em>
                    </div>
                    {s.limiting && s.score != null && (
                      <p className="detail-limit">
                        限制因素：<strong>{s.limiting.label}</strong>
                        {s.limiting.value != null && ` ${s.limiting.value.toFixed(1)} ${s.limiting.unit}`}——{s.limiting.why}
                      </p>
                    )}
                    <ul className="detail-parts">
                      {s.parts.map((p) => (
                        <li key={p.label}>
                          <span>{p.label}</span>
                          <span className="detail-bar">
                            <span
                              style={{
                                width: `${Number.isFinite(p.score) ? Math.max(2, p.score * 100) : 0}%`,
                                background: !Number.isFinite(p.score) ? palette.grid : p.score >= 0.6 ? palette.good : p.score > 0 ? palette.warning : palette.critical,
                              }}
                            />
                          </span>
                          <span className="detail-val">{p.value != null ? `${p.value.toFixed(1)} ${p.unit}` : '無資料'}</span>
                        </li>
                      ))}
                    </ul>
                    {prob != null && (
                      <p className="detail-prob">
                        系集中有 <strong>{prob.toFixed(0)}%</strong> 的成員，這個時段風速維持在 {windLimit(activity.id)} m/s 的可行上限內
                        <em>（{ensDef.name}・{ensDef.members} 成員；僅風速為系集，浪高沒有公開系集）</em>
                      </p>
                    )}
                    {c.comfort.notes.length > 0 && (
                      <ul className="detail-notes">
                        {c.comfort.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
      </Card>

      {charts && charts.waveSeries.length > 0 && (
        <Card title="行程期間浪高" subtitle="兩家獨立波浪模式。它們分岔的幅度就是浪高預報的不確定性——沒有公開的波浪系集，模式間差異是目前最好的替代。">
          <Legend items={charts.waveSeries.map((s) => ({ label: s.label, color: s.color, note: WAVE_MODELS.find((m) => m.name === s.label)?.maxDays + ' 天' }))} />
          <TimeChart time={charts.time} series={charts.waveSeries} palette={palette} unit="m" height={240} yMin={0} markerAt={nowMs} />
        </Card>
      )}

      {windChart && (
        <Card
          title="行程期間風速系集"
          subtitle={`${ensDef.name}・${ensDef.members} 成員。虛線是 ${activity.name} 的可行上限；分位帶落在虛線下方越多，這個活動越有把握。`}
        >
          <Legend
            items={[
              { label: '系集中位風速', color: palette.series[2] },
              { label: `${activity.name}可行上限 ${windLimit(activity.id)} m/s`, color: palette.series[7], dash: true },
              { label: '10–90 百分位', color: alpha(palette.series[2], 0.4), swatch: 'band' },
            ]}
          />
          <TimeChart time={windChart.time} series={windChart.series} bands={windChart.bands} palette={palette} unit="m/s" height={240} yMin={0} markerAt={nowMs} />
        </Card>
      )}

      <Card title="這份評估的限制">
        <ul className="caveats">
          <li>
            <strong>門檻是經驗法則。</strong>各活動的浪高、風速界線來自潛店與水上活動業者的通用說法，未針對綠島任何一個特定潛點校正。實際能不能下水，當地教練的判斷永遠優先。
          </li>
          <li>
            <strong>只有風速有系集。</strong>公開資料沒有這個海域的波浪系集，所以浪高的不確定性只能用兩家模式的差異估計，會低估真實的不確定範圍。
          </li>
          <li>
            <strong>能見度是推估值。</strong>用前 48 小時累積雨量當濁度代理，抓得到大雨後的濁流，但抓不到湧浪攪底、藻華或潮流帶來的變化。
          </li>
          <li>
            <strong>格點不是潛點。</strong>浪高取自 0.25° 的海洋格點（約 25 km），代表的是外海整體海況，不是石朗或大白沙背風面的實際狀況。綠島東西岸在同一天可以差很多。
          </li>
          <li>
            <strong>十天以外的預報會變。</strong>目前這個時距的價值在於「趨勢與風險」，不在於「哪天幾點浪多高」。出發前 4 天與前 1 天各再看一次。
          </li>
        </ul>
      </Card>
    </>
  )
}
