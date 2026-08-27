/**
 * Renders report/data.json into one self-contained HTML page.
 *
 * Everything is inlined because the publish target blocks external requests — the only
 * exception the host allows is Google Fonts, so the typefaces are linked and every
 * other asset, style and script lives in the file.
 *
 * Visual language is borrowed from a nautical chart: depth-tinted cells for the score
 * matrix (a darker cell is deeper water, a better window), hairline rules, and the
 * chart-correction magenta reserved exclusively for cautions.
 *
 *   npm run render
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { Report } from './snapshot'
import { renderPage } from './page'

const data: Report = JSON.parse(readFileSync('report/data.json', 'utf8'))

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// ------------------------------------------------------------------ verdict

/** The headline answer: which windows work, and what would break them. */
function headline(): { lead: string; detail: string; tone: string } {
  const usable = data.days.filter((d) => !d.outOfRange)
  if (!usable.length) return { lead: '目前還看不出來', detail: '整段行程都超出全球模式的 16 天預報範圍。', tone: 'muted' }

  const cells = usable.flatMap((d) => d.cells.map((c) => ({ d, c })))
  const diveIds = ['freedive', 'scuba', 'snorkel']
  const diveScore = ({ c }: { c: (typeof cells)[number]['c'] }) => {
    const v = diveIds.map((id) => c.scores[id]?.score).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const good = cells.filter((x) => (diveScore(x) ?? 0) >= 70)
  const best = cells.reduce((a, b) => ((diveScore(b) ?? -1) > (diveScore(a) ?? -1) ? b : a))
  const ferryBad = usable.filter((d) => d.ferry.level === '高' || d.ferry.level === '極高')

  const limits = cells
    .flatMap((x) => diveIds.map((id) => x.c.scores[id]?.limiting).filter(Boolean))
    .reduce<Record<string, number>>((acc, l) => ((acc[l!] = (acc[l!] ?? 0) + 1), acc), {})
  const topLimit = Object.entries(limits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '浪高'

  const lead =
    good.length >= cells.length * 0.6
      ? `這幾天適合下水`
      : good.length > 0
        ? `部分時段可以下水`
        : `這幾天條件普通`
  const detail =
    `${usable.length} 天當中有 ${good.length}/${cells.length} 個時段的潛水類活動達 70 分以上，最好的是 ${best.d.date} ${best.c.part}。` +
    `目前最常見的限制因素是${topLimit}。` +
    (ferryBad.length ? `另有 ${ferryBad.length} 天的船班停航風險偏高。` : `期間船班停航風險都不高。`)
  return { lead, detail, tone: good.length >= cells.length * 0.6 ? 'good' : good.length ? 'warning' : 'muted' }
}

// -------------------------------------------------------------------- charts

interface Pt { x: number; y: number }

const W = 720
const H = 200
const PAD = { l: 38, r: 12, t: 14, b: 26 }

function scaler(xs: number[], ys: number[]) {
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y1 = Math.max(...ys, 0.1) * 1.15
  return {
    x: (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r),
    y: (v: number) => H - PAD.b - (v / y1) * (H - PAD.t - PAD.b),
    y1,
    x0,
    x1,
  }
}

const path = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

/** Day boundaries and their labels, for the chart's x axis. */
function dayTicks(x0: number, x1: number) {
  const out: { t: number; label: string }[] = []
  const DAY = 86400000
  for (let d = Math.ceil(x0 / DAY) * DAY; d <= x1; d += DAY) {
    out.push({ t: d, label: `${new Date(d).getUTCMonth() + 1}/${new Date(d).getUTCDate()}` })
  }
  return out
}

function waveChart(): string {
  const series = data.waveSeries
  if (!series.length) return ''
  const xs = series[0].points.map(([t]) => t)
  const ys = series.flatMap((s) => s.points.map(([, v]) => v ?? 0))
  const s = scaler(xs, ys)
  const colors = ['var(--depth)', 'var(--depth-2)']

  const lines = series
    .map((ser, i) => {
      const pts = ser.points.filter(([, v]) => v != null).map(([t, v]) => ({ x: s.x(t), y: s.y(v!) }))
      if (!pts.length) return ''
      const area = i === 0 ? `<path d="${path(pts)} L${pts[pts.length - 1].x.toFixed(1)} ${H - PAD.b} L${pts[0].x.toFixed(1)} ${H - PAD.b} Z" fill="var(--depth-fill)" />` : ''
      return `${area}<path d="${path(pts)}" fill="none" stroke="${colors[i]}" stroke-width="2" stroke-linejoin="round" />`
    })
    .join('')

  const gridY = [0.5, 1, 1.5, 2].filter((v) => v < s.y1)
  const grid = gridY
    .map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${s.y(v).toFixed(1)}" y2="${s.y(v).toFixed(1)}" stroke="var(--rule)" stroke-width="1" /><text x="${PAD.l - 7}" y="${(s.y(v) + 3.5).toFixed(1)}" class="ax" text-anchor="end">${v}</text>`)
    .join('')
  const ticks = dayTicks(s.x0, s.x1)
    .map((d) => `<line x1="${s.x(d.t).toFixed(1)}" x2="${s.x(d.t).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="var(--rule)" stroke-width="1" /><text x="${s.x(d.t).toFixed(1)}" y="${H - PAD.b + 15}" class="ax" text-anchor="middle">${d.label}</text>`)
    .join('')

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="行程期間浪高，兩家波浪模式">${grid}${ticks}${lines}</svg>`
}

function windChart(): string {
  const fan = data.windFan.filter((f) => f.p50 != null)
  if (!fan.length) return ''
  const xs = fan.map((f) => f.time)
  const s = scaler(xs, fan.map((f) => f.p90 ?? 0))
  const limit = Math.min(...data.activities.map((a) => a.windLimit))

  const up = fan.map((f) => ({ x: s.x(f.time), y: s.y(f.p90 ?? 0) }))
  const down = [...fan].reverse().map((f) => ({ x: s.x(f.time), y: s.y(f.p10 ?? 0) }))
  const band = `<path d="${path(up)} ${path(down).replace(/^M/, 'L')} Z" fill="var(--depth-fill)" />`
  const mid = `<path d="${path(fan.map((f) => ({ x: s.x(f.time), y: s.y(f.p50!) })))}" fill="none" stroke="var(--depth)" stroke-width="2" />`
  const rule = `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${s.y(limit).toFixed(1)}" y2="${s.y(limit).toFixed(1)}" stroke="var(--caution)" stroke-width="1.5" stroke-dasharray="5 4" />`

  const grid = [5, 10, 15]
    .filter((v) => v < s.y1)
    .map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${s.y(v).toFixed(1)}" y2="${s.y(v).toFixed(1)}" stroke="var(--rule)" stroke-width="1" /><text x="${PAD.l - 7}" y="${(s.y(v) + 3.5).toFixed(1)}" class="ax" text-anchor="end">${v}</text>`)
    .join('')
  const ticks = dayTicks(s.x0, s.x1)
    .map((d) => `<line x1="${s.x(d.t).toFixed(1)}" x2="${s.x(d.t).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="var(--rule)" stroke-width="1" /><text x="${s.x(d.t).toFixed(1)}" y="${H - PAD.b + 15}" class="ax" text-anchor="middle">${d.label}</text>`)
    .join('')

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="行程期間風速系集分布">${grid}${ticks}${band}${mid}${rule}</svg>`
}

// --------------------------------------------------------------------- table

const tone = (score: number | null) => (score == null ? 'na' : score >= 75 ? 's4' : score >= 55 ? 's3' : score >= 35 ? 's2' : 's1')

function matrix(): string {
  const head = `<tr><th scope="col">日期</th><th scope="col">時段</th>${data.activities
    .map((a) => `<th scope="col" class="num">${esc(a.name)}</th>`)
    .join('')}<th scope="col" class="num">浪高</th><th scope="col" class="num">風速</th><th scope="col" class="num">雨量</th><th scope="col" class="num">雲量</th><th scope="col" class="num">舒適度</th></tr>`

  const body = data.days
    .map((d) => {
      if (d.outOfRange) {
        return `<tr class="daystart"><th scope="row" class="daycell">${d.date}<span>週${d.weekday}</span></th><td colspan="${data.activities.length + 6}" class="oor">超出 16 天預報範圍　·　${d.entersRange} 進入預報後才有數字</td></tr>`
      }
      return d.cells
        .map(
          (c, i) => `<tr class="${i === 0 ? 'daystart' : ''}">${
            i === 0 ? `<th scope="row" rowspan="${d.cells.length}" class="daycell">${d.date}<span>週${d.weekday}</span></th>` : ''
          }<td class="part">${esc(c.part)}</td>${data.activities
            .map((a) => {
              const s = c.scores[a.id]
              const t = tone(s.score)
              const title = s.limiting ? `限制因素：${s.limiting}${s.limitValue ? ' ' + s.limitValue : ''}` : ''
              return `<td class="num"><span class="score ${t}" title="${esc(title)}">${s.score ?? '—'}</span></td>`
            })
            .join('')}<td class="num mono">${c.wave != null ? c.wave.toFixed(1) : '—'}</td><td class="num mono">${c.wind != null ? c.wind.toFixed(1) : '—'}</td><td class="num mono">${c.rainSum != null ? c.rainSum.toFixed(1) : '—'}${c.rainProbMax != null ? `<em class="sub">${c.rainProbMax.toFixed(0)}%</em>` : ''}</td><td class="num mono">${c.cloudMean != null ? c.cloudMean.toFixed(0) : '—'}</td><td class="num mono comfort">${c.comfortScore ?? '—'}</td></tr>`,
        )
        .join('')
    })
    .join('')

  return `<div class="scroll"><table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>`
}

/**
 * Sunshine is reported per day, never per daypart: the hourly sunshine field is
 * binary at the WMO threshold and reads as "100 %" under 45 % cloud. Cloud cover
 * carries the within-day shape instead.
 */
function sunCards(): string {
  return data.days
    .filter((d) => !d.outOfRange)
    .map(
      (d) => `<div class="sunday">
      <div class="sunday-head"><strong>${d.date}</strong><span>週${d.weekday}</span><em class="tag ${d.sunTone}">${esc(d.sunLabel)}</em></div>
      <div class="sunday-main">
        <span class="sun-h mono">${d.sunHours != null ? d.sunHours.toFixed(1) : '—'}<em>小時日照</em></span>
        <span class="sun-track"><i style="width:${((d.sunFrac ?? 0) * 100).toFixed(0)}%"></i></span>
        <span class="sun-pct mono">${d.sunFrac != null ? (d.sunFrac * 100).toFixed(0) + '% 白天' : '—'}</span>
      </div>
      ${d.cells
        .map(
          (c) => `<div class="sunday-part"><span>${esc(c.part)}</span><span class="mono">雲量 ${c.cloudMean != null ? c.cloudMean.toFixed(0) + '%' : '—'}</span><span class="mono rain">${
            c.rainSum != null && c.rainSum >= 1
              ? `雨 ${c.rainSum.toFixed(1)} mm`
              : c.rainSum != null && c.rainSum >= 0.2
                ? `微量 ${c.rainSum.toFixed(1)} mm`
                : c.rainProbMax != null && c.rainProbMax >= 30
                  ? `降水機率 ${c.rainProbMax.toFixed(0)}%`
                  : '無雨'
          }${c.rainHours ? ` · ${c.rainHours} 小時` : ''}</span></div>`,
        )
        .join('')}
    </div>`,
    )
    .join('')
}

function ferryCards(): string {
  return data.days
    .map(
      (d) => `<div class="ferry ${d.ferry.tone}">
      <span class="ferry-date">${d.date}<em>週${d.weekday}</em></span>
      <strong>${esc(d.ferry.level)}</strong>
      <span class="ferry-why">${esc(d.outOfRange ? `${d.entersRange} 才會進入預報範圍` : d.ferry.reason)}</span>
    </div>`,
    )
    .join('')
}

/** Per-activity detail, one panel each; the selector swaps them client-side. */
function detailPanels(): string {
  return data.activities
    .map((a) => {
      const rows = data.days
        .filter((d) => !d.outOfRange)
        .flatMap((d) =>
          d.cells.map((c) => {
            const s = c.scores[a.id]
            const prob = c.windProb[a.id]
            const bars = s.parts
              .map(
                (p) => `<li><span class="pl">${esc(p.label)}</span><span class="pbar"><i style="width:${p.score < 0 ? 0 : Math.max(2, p.score * 100).toFixed(0)}%" class="${p.score < 0 ? 'na' : p.score >= 0.6 ? 'ok' : p.score > 0 ? 'mid' : 'bad'}"></i></span><span class="pv mono">${p.value != null ? p.value.toFixed(1) + ' ' + esc(p.unit) : '無資料'}</span></li>`,
              )
              .join('')
            return `<article class="panel">
              <header><span>${d.date} ${esc(c.part)}<em>${esc(c.hours)}</em></span><span class="score ${tone(s.score)}">${s.score ?? '—'}</span></header>
              ${s.limiting ? `<p class="limit">限制因素 <strong>${esc(s.limiting)}</strong>${s.limitValue ? ` ${esc(s.limitValue)}` : ''}　${esc(s.why ?? '')}</p>` : ''}
              <ul class="parts">${bars}</ul>
              ${prob != null ? `<p class="prob">系集 <strong class="mono">${prob.toFixed(0)}%</strong> 的成員風速維持在 ${a.windLimit} m/s 可行上限內<em>${esc(data.ensembleName)}・${data.ensembleMembers} 成員；僅風速有系集</em></p>` : ''}
              ${c.comfortNotes.length ? `<ul class="notes">${c.comfortNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
            </article>`
          }),
        )
        .join('')
      return `<div class="detail" data-act="${a.id}" hidden><p class="blurb">${esc(a.blurb)}</p><div class="panels">${rows}</div></div>`
    })
    .join('')
}

// ---------------------------------------------------------------------- page

const h = headline()
const gen = new Date(data.generatedAt)
const genLabel = `${gen.getUTCFullYear()}/${gen.getUTCMonth() + 1}/${gen.getUTCDate()} ${String(gen.getUTCHours() + 8).padStart(2, '0')}:00`.replace(/ (\d+):/, (_m, hh) => ` ${String(Number(hh) % 24).padStart(2, '0')}:`)

const page = renderPage({
  place: data.place,
  from: data.from,
  to: data.to,
  leadDays: data.leadDays,
  generated: genLabel,
  headline: h,
  matrix: matrix(),
  ferry: ferryCards(),
  sun: sunCards(),
  details: detailPanels(),
  activities: data.activities.map((a) => ({ id: a.id, name: a.name, icon: a.icon })),
  waveChart: waveChart(),
  windChart: windChart(),
  waveConfidence: data.waveConfidence,
  waveSpreadMax: data.waveSpreadMax,
  recheck: data.recheck,
  ensembleName: data.ensembleName,
  ensembleMembers: data.ensembleMembers,
  models: data.models,
  marineLat: data.marineLat,
  marineLon: data.marineLon,
  lat: data.lat,
  lon: data.lon,
})

writeFileSync('report/index.html', page)
console.error(`已產生 report/index.html（${(page.length / 1024).toFixed(0)} KB）`)
