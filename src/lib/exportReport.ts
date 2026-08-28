/**
 * Export the risk report as a PNG image or a self-contained HTML file.
 *
 * Both paths serialise the live SVG nodes. Two things break naive serialisation and
 * are handled here: an SVG sized with `width="100%"` rasterises to a zero-width canvas
 * (so explicit pixel dimensions are stamped on the clone), and the document's fonts
 * are not available to the image decoder (so the markup carries its own font stack).
 */

const SANS = 'system-ui, -apple-system, "Noto Sans TC", "PingFang TC", sans-serif'

/** Serialise an SVG node with concrete dimensions, ready to rasterise or embed. */
export function serializeSvg(node: SVGSVGElement): { xml: string; width: number; height: number } {
  const box = node.viewBox.baseVal
  const width = box.width || node.clientWidth || 720
  const height = box.height || node.clientHeight || 400
  const clone = node.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('font-family', SANS)
  return { xml: new XMLSerializer().serializeToString(clone), width, height }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next frame: revoking synchronously can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Stack several SVG nodes into one PNG at 2× for legibility when shared.
 * `background` must be opaque — a transparent PNG is unreadable in dark chat clients.
 */
export async function exportPng(nodes: SVGSVGElement[], filename: string, background: string): Promise<void> {
  const parts = nodes.map(serializeSvg)
  const gap = 16
  const width = Math.max(...parts.map((p) => p.width))
  const height = parts.reduce((sum, p) => sum + p.height, 0) + gap * (parts.length - 1)

  const images = await Promise.all(
    parts.map(
      (p) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('圖片轉檔失敗'))
          // A data URI avoids the tainted-canvas rules that blob: URLs can trigger.
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.xml)}`
        }),
    ),
  )

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('瀏覽器不支援 canvas')
  ctx.scale(scale, scale)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  let y = 0
  images.forEach((img, i) => {
    ctx.drawImage(img, (width - parts[i].width) / 2, y, parts[i].width, parts[i].height)
    y += parts[i].height + gap
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG 產生失敗')
  download(blob, filename)
}

export interface HtmlReportInput {
  title: string
  place: string
  range: string
  generated: string
  level: string
  score: number
  headline: string
  summary: string
  actions: string[]
  rows: { date: string; weekday: string; level: string; score: number | null; driver: string; detail: string; best: string }[]
  svgs: SVGSVGElement[]
  caveats: string[]
  sourceNote: string
  dark: boolean
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** A complete, offline HTML file — no scripts, no external requests beyond none at all. */
export function buildHtmlReport(input: HtmlReportInput): Blob {
  const ink = input.dark ? '#e9f0f1' : '#14201f'
  const muted = input.dark ? '#98aab0' : '#5d6d72'
  const ground = input.dark ? '#0d1618' : '#f4f6f5'
  const paper = input.dark ? '#16232699' : '#ffffff'
  const rule = input.dark ? '#26383d' : '#dbe3e1'

  const tone = (lv: string) => (lv === '極高' || lv === '高' ? '#b3453f' : lv === '中' ? '#9c6b12' : '#2c7a4d')

  const svgs = input.svgs.map((n) => `<figure>${serializeSvg(n).xml}</figure>`).join('')

  const rows = input.rows
    .map(
      (r) => `<tr>
      <td><strong>${esc(r.date)}</strong> <span class="m">週${esc(r.weekday)}</span></td>
      <td><span class="lv" style="color:${tone(r.level)}">${esc(r.level)}</span></td>
      <td class="n">${r.score ?? '—'}</td>
      <td>${esc(r.driver)}</td>
      <td class="m">${esc(r.detail)}</td>
      <td class="m">${esc(r.best)}</td>
    </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)}</title>
<style>
  :root { color-scheme: ${input.dark ? 'dark' : 'light'}; }
  * { box-sizing: border-box; }
  body { margin:0; background:${ground}; color:${ink};
    font-family:${SANS}; font-size:15px; line-height:1.75; }
  .wrap { max-width:860px; margin:0 auto; padding:36px 20px 64px; display:flex; flex-direction:column; gap:22px; }
  header { border-top:3px solid ${ink}; padding-top:14px; }
  h1 { margin:0; font-size:27px; letter-spacing:-.01em; }
  .meta { margin:10px 0 0; font-size:12px; color:${muted}; display:flex; flex-wrap:wrap; gap:4px 22px; }
  .hero { background:${paper}; border:1px solid ${rule}; border-left:5px solid ${tone(input.level)};
    border-radius:5px; padding:18px 22px; }
  .hero .lvl { font-size:13px; letter-spacing:.1em; color:${tone(input.level)}; font-weight:700; }
  .hero h2 { margin:4px 0 6px; font-size:23px; }
  .hero p { margin:0; color:${muted}; font-size:14px; }
  section { background:${paper}; border:1px solid ${rule}; border-radius:5px; padding:18px 22px; }
  section h3 { margin:0 0 12px; font-size:15px; }
  figure { margin:0 0 14px; }
  figure svg { width:100%; height:auto; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:7px 9px; border-bottom:1px solid ${rule}; vertical-align:top; }
  th { font-size:11px; color:${muted}; font-weight:500; }
  .n { text-align:right; font-variant-numeric:tabular-nums; }
  .m { color:${muted}; font-size:12px; }
  .lv { font-weight:700; }
  ol { margin:0; padding-left:20px; font-size:13.5px; line-height:1.8; }
  ul.cav { margin:0; padding-left:20px; font-size:12.5px; line-height:1.8; color:${muted}; }
  footer { font-size:11.5px; color:${muted}; border-top:1px solid ${rule}; padding-top:14px; line-height:1.7; }
  @media print { body { background:#fff; } section,.hero { break-inside:avoid; } }
</style></head>
<body><div class="wrap">
  <header>
    <h1>${esc(input.place)} ${esc(input.range)} 行程風險報告</h1>
    <p class="meta"><span>資料時間 ${esc(input.generated)}</span><span>風險分數 ${input.score}/100</span></p>
  </header>

  <div class="hero">
    <div class="lvl">整體風險　${esc(input.level)}</div>
    <h2>${esc(input.headline)}</h2>
    <p>${esc(input.summary)}</p>
  </div>

  <section><h3>示意圖</h3>${svgs}</section>

  <section>
    <h3>逐日風險</h3>
    <table>
      <thead><tr><th>日期</th><th>風險</th><th class="n">分數</th><th>主要因素</th><th>說明</th><th>最佳活動</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>

  <section><h3>建議行動</h3><ol>${input.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></section>

  <section><h3>這份報告的限制</h3><ul class="cav">${input.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>

  <footer>${esc(input.sourceNote)}</footer>
</div></body></html>`

  return new Blob(['﻿' + html], { type: 'text/html;charset=utf-8' })
}

export function downloadHtml(blob: Blob, filename: string) {
  download(blob, filename)
}
