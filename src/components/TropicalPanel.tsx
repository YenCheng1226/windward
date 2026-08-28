import { useMemo } from 'react'
import { useCyclones, useDisturbances, useEnsemble } from '../lib/hooks'
import type { Place } from '../lib/locations'
import { alpha, type Palette } from '../lib/palette'
import type { Cyclone } from '../lib/tropical'
import TimeChart, { type ChartBand, type ChartSeries } from './TimeChart'
import { Card, ErrorBox, Legend, Spinner, StatTile } from './ui'

const fmtUTC8 = (ms: number) => {
  const d = new Date(ms + 8 * 3600000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Distance bands that decide how loudly a system is presented. */
function threatOf(c: Cyclone): { level: string; tone: 'good' | 'warning' | 'critical' } {
  const km = c.closest ? Math.min(c.closest.km, c.distanceKm) : c.distanceKm
  if (km <= 300) return { level: '直接影響範圍', tone: 'critical' }
  if (km <= 800) return { level: '需要注意', tone: 'warning' }
  return { level: '距離尚遠', tone: 'good' }
}

export default function TropicalPanel({ place, palette, nowMs }: { place: Place; palette: Palette; nowMs: number }) {
  const cyclones = useCyclones(place.lat, place.lon)
  const disturbances = useDisturbances()

  // Ensemble pressure is the earliest numerical hint of something spinning up — it
  // drops days before any agency names a system, and long before a warning is issued.
  const pressure = useEnsemble({ lat: place.lat, lon: place.lon, model: 'gfs05', variable: 'pressure_msl', days: 20, windUnit: 'ms' })
  const gusts = useEnsemble({ lat: place.lat, lon: place.lon, model: 'gfs05', variable: 'wind_gusts_10m', days: 20, windUnit: 'ms' })

  const genesis = useMemo(() => {
    if (!pressure.data) return null
    const t = pressure.data.time
    const n = t.length
    const minP: (number | null)[] = []
    const p10: (number | null)[] = []
    const median: (number | null)[] = []
    // The share of members below 1000 hPa matters far more than the single lowest one:
    // one member at 968 out of 31 is an outlier, ten members at 995 is a signal.
    const lowShare: (number | null)[] = []
    for (let i = 0; i < n; i++) {
      const col = pressure.data.members.map((m) => m[i]).filter((v): v is number => v != null && Number.isFinite(v))
      if (!col.length) {
        minP.push(null); p10.push(null); median.push(null); lowShare.push(null)
        continue
      }
      lowShare.push((col.filter((v) => v < 1000).length / col.length) * 100)
      col.sort((a, b) => a - b)
      minP.push(col[0])
      p10.push(col[Math.floor(col.length * 0.1)])
      median.push(col[col.length >> 1])
    }
    // Share of members reaching gale force (8 級, 17.2 m/s) — the impact side.
    let galeProb: (number | null)[] = []
    if (gusts.data) {
      galeProb = gusts.data.time.map((_, i) => {
        const col = gusts.data!.members.map((m) => m[i]).filter((v): v is number => v != null && Number.isFinite(v))
        return col.length ? (col.filter((v) => v >= 17.2).length / col.length) * 100 : null
      })
    }
    // Skip the first 48 h. Pressure is already low today whenever a known system sits
    // nearby, and that would peg the headline at 100 % — burying the thing this panel
    // exists to surface, which is a system nobody has named yet.
    const LEAD_CUTOFF = nowMs + 48 * 3600000
    const future = lowShare.map((v, i) => (t[i] >= LEAD_CUTOFF ? v : null))
    const shares = future.filter((v): v is number => v != null)
    const peakShare = shares.length ? Math.max(...shares) : null
    const peakShareAt = peakShare != null ? t[future.indexOf(peakShare)] : null
    const lowest = minP.filter((v): v is number => v != null)
    const peakGale = galeProb.filter((v): v is number => v != null)
    return {
      time: t,
      minP,
      p10,
      median,
      lowShare,
      peakShare,
      peakShareAt,
      members: pressure.data.members.length,
      galeTime: gusts.data?.time ?? [],
      galeProb,
      lowestP: lowest.length ? Math.min(...lowest) : null,
      lowestAt: lowest.length ? t[minP.indexOf(Math.min(...lowest))] : null,
      peakGale: peakGale.length ? Math.max(...peakGale) : null,
      peakGaleAt: peakGale.length ? (gusts.data?.time ?? [])[galeProb.indexOf(Math.max(...peakGale))] : null,
    }
  }, [pressure.data, gusts.data, nowMs])

  const pressureSeries: ChartSeries[] = useMemo(() => {
    if (!genesis) return []
    return [
      { label: 'p10', values: genesis.p10, color: palette.series[0], boundary: true, hideInTooltip: true },
      { label: '成員最低氣壓', values: genesis.minP, color: palette.series[7], width: 2, unit: 'hPa' },
      { label: '系集中位數', values: genesis.median, color: palette.series[0], width: 2, unit: 'hPa' },
    ]
  }, [genesis, palette])

  const pressureBands: ChartBand[] = useMemo(() => [{ upper: 0, lower: 1, fill: alpha(palette.series[7], 0.12) }], [palette])

  const probSeries: ChartSeries[] = useMemo(() => {
    if (!genesis) return []
    const out: ChartSeries[] = [{ label: '氣壓低於 1000 hPa 的成員比例', values: genesis.lowShare, color: palette.series[7], width: 2, fill: alpha(palette.series[7], 0.16), unit: '%' }]
    if (genesis.galeProb.length) out.push({ label: '陣風達 8 級的成員比例', values: genesis.galeProb, color: palette.series[1], width: 2, unit: '%' })
    return out
  }, [genesis, palette])

  return (
    <>
      <Card
        title="熱帶系統追蹤"
        subtitle={
          <>
            分成三層：<strong>已生成</strong>的系統來自日本氣象廳（RSMC 東京，西北太平洋的 WMO 指定機構，也是中央氣象署的作業基礎）；
            <strong>醞釀中</strong>的擾動來自美軍 JTWC 的熱帶天氣報；<strong>還沒被任何機構點名</strong>的，只能從系集氣壓看端倪。
          </>
        }
      >
        {cyclones.loading && !cyclones.data && <Spinner label="讀取日本氣象廳颱風資料…" />}
        {cyclones.error && <ErrorBox message={`氣象廳資料：${cyclones.error}`} onRetry={cyclones.reload} />}
        {cyclones.data && cyclones.data.length === 0 && <p className="hint">目前西北太平洋沒有活躍的熱帶氣旋。</p>}
        {cyclones.data && cyclones.data.length > 0 && (
          <div className="stat-grid stat-grid-4">
            <StatTile label="活躍系統" value={String(cyclones.data.length)} unit=" 個" note="日本氣象廳現行編號中的熱帶氣旋" />
            <StatTile
              label={`最近的系統距${place.name}`}
              value={Math.round(cyclones.data[0].distanceKm).toLocaleString()}
              unit=" km"
              note={`${cyclones.data[0].nameEn}・位於${cyclones.data[0].bearing}方`}
              tone={threatOf(cyclones.data[0]).tone === 'good' ? 'good' : threatOf(cyclones.data[0]).tone}
            />
            <StatTile
              label="預報最近接近"
              value={cyclones.data[0].closest ? Math.round(cyclones.data[0].closest.km).toLocaleString() : '—'}
              unit=" km"
              note={
                cyclones.data[0].closest == null
                  ? '無預報路徑'
                  : cyclones.data[0].closest.hours === 0
                    ? '目前即為預報路徑上最接近的時刻，之後逐漸遠離'
                    : `${fmtUTC8(cyclones.data[0].closest.at)}（+${cyclones.data[0].closest.hours} 小時）`
              }
            />
            <StatTile
              label="醞釀中的擾動"
              value={disturbances.data ? (disturbances.data.none ? '無' : '有') : '—'}
              note={disturbances.data ? (disturbances.data.none ? 'JTWC 明確回報無擾動' : '見下方原文') : '讀取中'}
              tone={disturbances.data?.none ? 'good' : disturbances.data ? 'warning' : undefined}
            />
          </div>
        )}
      </Card>

      {cyclones.data?.map((c) => {
        const t = threatOf(c)
        return (
          <Card
            key={c.id}
            title={`${c.nameEn}${c.nameJp ? `（${c.nameJp}）` : ''}　颱風第 ${c.number} 號`}
            subtitle={`日本氣象廳 ${fmtUTC8(c.issued)} 發布・觀測時間 ${fmtUTC8(c.validTime)}（台灣時間）`}
            actions={<span className={`chip tone-${t.tone}`}>{t.level}</span>}
          >
            <div className="stat-grid stat-grid-4">
              <StatTile label="強度（台灣分級）" value={c.cwaScale} note={c.sustainedMs != null ? `近中心最大風速 ${c.sustainedMs} m/s${c.gustMs != null ? `，陣風 ${c.gustMs} m/s` : ''}` : undefined} />
              <StatTile label="中心氣壓" value={c.pressureHpa != null ? String(c.pressureHpa) : '—'} unit=" hPa" note={`位置 ${c.lat.toFixed(1)}°N ${c.lon.toFixed(1)}°E・${c.location}`} />
              <StatTile label="移動" value={c.course || '—'} note={c.speedKmh != null ? `時速 ${c.speedKmh} km` : undefined} />
              <StatTile
                label={`距${place.name}`}
                value={Math.round(c.distanceKm).toLocaleString()}
                unit=" km"
                note={`在${c.bearing}方${c.galeRadiusKm ? `・七級風半徑 ${c.galeRadiusKm} km` : ''}`}
                tone={t.tone}
              />
            </div>
            {c.track.length > 1 && (
              <div className="model-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>預報時距</th>
                      <th>時間（台灣）</th>
                      <th className="num">位置</th>
                      <th className="num">距{place.name}</th>
                      <th className="num">70% 機率圈半徑</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.track.map((p) => (
                      <tr key={p.hours}>
                        <td>{p.hours === 0 ? '目前' : `+${p.hours} 小時`}</td>
                        <td className="nowrap">{p.validTime ? fmtUTC8(p.validTime) : '—'}</td>
                        <td className="num">{p.lat.toFixed(1)}°N {p.lon.toFixed(1)}°E</td>
                        <td className="num">{Math.round(p.distanceKm).toLocaleString()} km</td>
                        <td className="num muted">{p.circleKm != null ? `${Math.round(p.circleKm)} km` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )
      })}

      <Card title="醞釀中的擾動" subtitle="美軍聯合颱風警報中心（JTWC）每 6 小時發布的熱帶天氣報。這份文件會在系統被命名之前就列出可疑的擾動區，是「有沒有東西正在生成」最早的官方訊號。">
        {disturbances.loading && !disturbances.data && <Spinner label="讀取 JTWC 熱帶天氣報…" />}
        {disturbances.error && <ErrorBox message={`JTWC：${disturbances.error}`} onRetry={disturbances.reload} />}
        {disturbances.data && (
          <>
            <p className={`disturb ${disturbances.data.none ? 'none' : 'active'}`}>
              {disturbances.data.none ? '西北太平洋目前沒有醞釀中的熱帶擾動。' : disturbances.data.summary}
            </p>
            <details className="raw">
              <summary>原文（{disturbances.data.issued}）</summary>
              <pre>{disturbances.data.raw}</pre>
            </details>
          </>
        )}
      </Card>

      <Card
        title="系集生成訊號"
        subtitle="在任何機構點名之前，模式就會先在氣壓場上表現出來。這裡看 GEFS 31 個成員在此地點算出的海平面氣壓。頭 48 小時刻意排除在指標之外——附近只要有已知系統，現在的氣壓本來就低，會把數字洗到 100% 而蓋掉真正要看的東西：還沒有人點名的系統。"
      >
        {pressure.loading && !genesis && <Spinner label="讀取系集氣壓…" />}
        {pressure.error && <ErrorBox message={pressure.error} onRetry={pressure.reload} />}
        {genesis && (
          <>
            <div className="stat-grid stat-grid-4">
              <StatTile
                label="低壓成員最高比例（48 小時後）"
                value={genesis.peakShare != null ? genesis.peakShare.toFixed(0) : '—'}
                unit=" %"
                note={genesis.peakShareAt != null ? `${fmtUTC8(genesis.peakShareAt - 8 * 3600000)} 有 ${Math.round(((genesis.peakShare ?? 0) / 100) * genesis.members)}/${genesis.members} 個成員低於 1000 hPa` : undefined}
                tone={genesis.peakShare != null && genesis.peakShare >= 30 ? 'warning' : 'good'}
              />
              <StatTile
                label="最低的單一成員"
                value={genesis.lowestP != null ? genesis.lowestP.toFixed(0) : '—'}
                unit=" hPa"
                note={genesis.lowestAt != null ? `${fmtUTC8(genesis.lowestAt - 8 * 3600000)}・這是 ${genesis.members} 個成員中最極端的一個，不是預報` : undefined}
              />
              <StatTile
                label="8 級陣風最高機率"
                value={genesis.peakGale != null ? genesis.peakGale.toFixed(0) : '—'}
                unit=" %"
                note={genesis.peakGaleAt != null ? `出現在 ${fmtUTC8(genesis.peakGaleAt - 8 * 3600000)}` : undefined}
                tone={genesis.peakGale != null && genesis.peakGale >= 30 ? 'warning' : 'good'}
              />
              <StatTile label="判讀門檻" value="1000 hPa" note="此緯度的環境氣壓約 1008–1012；成員跌破 1000 值得注意，但要有相當比例的成員一起跌破才算訊號" />
            </div>
            <Legend
              items={[
                { label: '成員最低氣壓', color: palette.series[7] },
                { label: '系集中位數', color: palette.series[0] },
                { label: '最低到 p10 之間', color: alpha(palette.series[7], 0.3), swatch: 'band' },
              ]}
            />
            <TimeChart time={genesis.time} series={pressureSeries} bands={pressureBands} palette={palette} unit="hPa" height={240} markerAt={nowMs} />
            {probSeries.length > 0 && (
              <>
                <Legend
                  items={[
                    { label: '氣壓低於 1000 hPa 的成員比例', color: palette.series[7] },
                    { label: '陣風達 8 級（≥17.2 m/s）的成員比例', color: palette.series[1] },
                  ]}
                />
                <TimeChart time={genesis.time} series={probSeries} palette={palette} unit="%" height={190} yMin={0} yMax={100} markerAt={nowMs} />
              </>
            )}
          </>
        )}
      </Card>

      <Card title="關於這些資料">
        <ul className="caveats">
          <li>
            <strong>為什麼不是中央氣象署。</strong>CWA 是台灣的權責機關，但它的兩個管道靜態網頁都讀不到：開放資料 API 需要金鑰（把金鑰放進公開網站等於外流），公開 RSS 沒有送 CORS 標頭，瀏覽器會直接擋掉。這裡改用氣象署本身作業所依據的上游來源。<strong>實際發布的警特報，仍以中央氣象署為準。</strong>
          </li>
          <li>
            <strong>兩家的強度數字不會一樣。</strong>氣象廳用 10 分鐘平均風（和中央氣象署相同慣例），JTWC 用 1 分鐘平均風，同一個系統後者大約高 12%。這不是誰算錯。
          </li>
          <li>
            <strong>系集訊號不是預報。</strong>成員出現低壓只代表模式認為有機會發展，不代表會生成、更不代表路徑。它的價值在於比官方公告早幾天讓你開始留意，不在於取代公告。
          </li>
          <li>
            <strong>距離是到系統中心的直線距離。</strong>暴風圈與外圍環流的影響範圍遠大於中心點，颱風在 500 km 外仍可能帶來長浪與強陣風——這也是為什麼行程評估看的是浪高與風速本身，而不是「颱風離多遠」。
          </li>
        </ul>
      </Card>
    </>
  )
}
