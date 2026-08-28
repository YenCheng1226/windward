import { useMemo } from 'react'
import { useGenesisPoint } from '../lib/hooks'
import { GENESIS_POINTS } from '../lib/tropical'
import type { Palette } from '../lib/palette'
import { Card, StatTile } from './ui'

const fmt = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:00`
}

/**
 * One upstream basin. Kept as its own component so each point owns a hook call —
 * the alternative would be looping hooks, which React forbids.
 */
function PointRow({ point, nowMs, palette }: { point: (typeof GENESIS_POINTS)[number]; nowMs: number; palette: Palette }) {
  const ens = useGenesisPoint(point.lat, point.lon, 20)

  const stats = useMemo(() => {
    if (!ens.data) return null
    // Skip the first 48 h for the same reason as the destination watch: an existing
    // system nearby pins the share at 100 % and hides what is still forming.
    const cutoff = nowMs + 48 * 3600000
    const acc: { lowest: number | null; lowestAt: number | null; peakShare: number | null; peakShareAt: number | null } = {
      lowest: null,
      lowestAt: null,
      peakShare: null,
      peakShareAt: null,
    }
    ens.data.time.forEach((t, i) => {
      if (t < cutoff) return
      const col = ens.data!.members.map((m) => m[i]).filter((v): v is number => v != null && Number.isFinite(v))
      if (!col.length) return
      const min = Math.min(...col)
      if (acc.lowest == null || min < acc.lowest) {
        acc.lowest = min
        acc.lowestAt = t
      }
      const share = (col.filter((v) => v < 1000).length / col.length) * 100
      if (acc.peakShare == null || share > acc.peakShare) {
        acc.peakShare = share
        acc.peakShareAt = t
      }
    })
    return { ...acc, members: ens.data.members.length }
  }, [ens.data, nowMs])

  const low = stats?.lowest ?? null
  const tone = low == null ? undefined : low < 980 ? 'critical' : low < 1000 ? 'warning' : 'good'

  return (
    <StatTile
      label={point.name}
      value={low != null ? low.toFixed(0) : ens.loading ? '…' : '—'}
      unit={low != null ? ' hPa' : ''}
      note={
        stats && stats.lowest != null ? (
          <>
            {stats.lowestAt != null && `${fmt(stats.lowestAt)} 最低`}
            {stats.peakShare != null && `・最多 ${Math.round((stats.peakShare / 100) * stats.members)}/${stats.members} 成員低於 1000 hPa`}
            <em style={{ display: 'block', color: palette.textMuted, fontStyle: 'normal' }}>{point.note}</em>
          </>
        ) : (
          point.note
        )
      }
      tone={tone}
    />
  )
}

/**
 * Genesis watch over the basins upstream of Taiwan.
 *
 * Watching the destination alone is not enough: a typhoon 1,500 km east lifts the
 * swell here days before its pressure reaches the island, and long before anyone
 * names it. A low showing up in a minority of members is not a forecast — it is the
 * earliest numerical hint that something may be coming, which is exactly the window
 * in which a trip can still be rearranged cheaply.
 */
export default function UpstreamWatch({ nowMs, palette }: { nowMs: number; palette: Palette }) {
  return (
    <Card
      title="上游生成監測"
      subtitle="台灣東部的湧浪來自上游海域。這裡看 GEFS 31 個成員在三個主要生成區算出的最低氣壓——某個生成區開始出現深低壓，代表模式認為有東西在醞釀，而它的長浪會比它本身更早到。"
    >
      <div className="stat-grid stat-grid-4">
        {GENESIS_POINTS.map((p) => (
          <PointRow key={p.name} point={p} nowMs={nowMs} palette={palette} />
        ))}
      </div>
      <p className="hint">
        判讀：這個緯度的環境氣壓約 1005–1010 hPa。成員最低值跌破 1000 值得留意，跌破 980 代表模式在算颱風強度的系統。
        <strong>但少數成員出現低壓不是預報</strong>——它只說明有這個可能，且此時通常連 JTWC 都還沒列為擾動。
      </p>
    </Card>
  )
}
