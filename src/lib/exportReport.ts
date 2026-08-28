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

export interface ReportReason {
  claim: string
  evidence: string
  confidence: string
  basis: string
}

export interface ReportDay {
  date: string
  weekday: string
  status: string
  tone: string
  verdict: string
  reasons: ReportReason[]
  wouldChange: string
  stillWorks: string | null
}

export interface HtmlReportInput {
  title: string
  place: string
  range: string
  generated: string
  conclusion: string
  reasoning: string[]
  uncertainty: { level: string; statement: string; factors: { label: string; detail: string }[] }
  days: ReportDay[]
  actions: string[]
  svgs: SVGSVGElement[]
  sourceNote: string
  dark: boolean
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** A complete, offline HTML file — no scripts, no external requests at all. */
export function buildHtmlReport(input: HtmlReportInput): Blob {
  const ink = input.dark ? '#e9f0f1' : '#14201f'
  const muted = input.dark ? '#98aab0' : '#5d6d72'
  const ground = input.dark ? '#0d1618' : '#f4f6f5'
  const paper = input.dark ? '#162326' : '#ffffff'
  const rule = input.dark ? '#26383d' : '#dbe3e1'
  const toneColor = (t: string) => (t === 'critical' ? '#b3453f' : t === 'warning' ? '#9c6b12' : t === 'muted' ? muted : '#2c7a4d')

  const svgs = input.svgs.map((n) => `<figure>${serializeSvg(n).xml}</figure>`).join('')

  const days = input.days
    .map(
      (d) => `<article class="day">
      <header><strong>${esc(d.date)}</strong><span class="m">週${esc(d.weekday)}</span>
        <span class="st" style="color:${toneColor(d.tone)}">${esc(d.status)}</span></header>
      <p class="vd">${esc(d.verdict)}</p>
      ${
        d.reasons.length
          ? `<ul class="rs">${d.reasons
              .map(
                (r) => `<li>
            <div class="cl">${esc(r.claim)}<span class="cf">把握 ${esc(r.confidence)}</span></div>
            <p class="ev">${esc(r.evidence)}</p>
            <p class="bs">為什麼只有這樣的把握：${esc(r.basis)}</p>
          </li>`,
              )
              .join('')}</ul>`
          : ''
      }
      ${d.stillWorks ? `<p class="wk">仍然可行：${esc(d.stillWorks)}</p>` : ''}
      ${d.wouldChange ? `<p class="ch">會翻盤的條件：${esc(d.wouldChange)}</p>` : ''}
    </article>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)}</title>
<style>
  :root { color-scheme: ${input.dark ? 'dark' : 'light'}; }
  * { box-sizing: border-box; }
  body { margin:0; background:${ground}; color:${ink}; font-family:${SANS}; font-size:15px; line-height:1.8; }
  .wrap { max-width:820px; margin:0 auto; padding:36px 20px 64px; display:flex; flex-direction:column; gap:20px; }
  header.top { border-top:3px solid ${ink}; padding-top:14px; }
  h1 { margin:0; font-size:26px; letter-spacing:-.01em; }
  .meta { margin:8px 0 0; font-size:12px; color:${muted}; }
  section { background:${paper}; border:1px solid ${rule}; border-radius:5px; padding:18px 22px; }
  section h2 { margin:0 0 10px; font-size:15px; }
  .concl { border-left:5px solid ${toneColor('warning')}; }
  .concl .tag { font-size:11px; letter-spacing:.14em; color:${muted}; font-weight:700; }
  .concl p { margin:6px 0 0; font-size:17px; line-height:1.75; }
  ol.why { margin:0; padding-left:20px; font-size:14px; line-height:1.85; }
  ol.why li { margin-bottom:6px; }
  .unc { border-left:5px solid ${toneColor('warning')}; }
  .unc .lv { font-size:13px; font-weight:700; color:${toneColor('warning')}; }
  .unc p { margin:6px 0 12px; font-size:14px; color:${ink}; }
  .unc ul { margin:0; padding-left:18px; font-size:12.5px; color:${muted}; line-height:1.75; }
  .unc strong { color:${ink}; display:block; }
  figure { margin:0 0 14px; } figure svg { width:100%; height:auto; }
  .day { border:1px solid ${rule}; border-radius:5px; padding:14px 16px; margin-bottom:12px; }
  .day header { display:flex; align-items:baseline; gap:8px; font-size:14px; }
  .day .st { margin-left:auto; font-weight:700; }
  .m { color:${muted}; font-size:12px; }
  .vd { margin:6px 0 10px; font-size:14px; }
  ul.rs { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
  ul.rs li { border-left:2px solid ${rule}; padding-left:12px; }
  .cl { font-weight:600; font-size:13.5px; display:flex; gap:10px; align-items:baseline; }
  .cf { font-size:11px; color:${muted}; font-weight:400; }
  .ev { margin:3px 0 0; font-size:12.5px; color:${ink}; }
  .bs { margin:3px 0 0; font-size:11.5px; color:${muted}; }
  .wk,.ch { margin:10px 0 0; font-size:12px; color:${muted}; }
  ol.act { margin:0; padding-left:20px; font-size:14px; line-height:1.85; }
  footer { font-size:11.5px; color:${muted}; border-top:1px solid ${rule}; padding-top:14px; line-height:1.7; }
  @media print { body { background:#fff; } section,.day { break-inside:avoid; } }
</style></head>
<body><div class="wrap">
  <header class="top">
    <h1>${esc(input.place)} ${esc(input.range)} 行程評估</h1>
    <p class="meta">資料時間 ${esc(input.generated)}</p>
  </header>

  <section class="concl"><div class="tag">結論</div><p>${esc(input.conclusion)}</p></section>

  ${input.reasoning.length ? `<section><h2>為什麼</h2><ol class="why">${input.reasoning.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></section>` : ''}

  <section class="unc">
    <h2>這份評估有多可信　<span class="lv">${esc(input.uncertainty.level)}</span></h2>
    <p>${esc(input.uncertainty.statement)}</p>
    <ul>${input.uncertainty.factors.map((f) => `<li><strong>${esc(f.label)}</strong>${esc(f.detail)}</li>`).join('')}</ul>
  </section>

  <section><h2>示意圖</h2>${svgs}</section>

  <section><h2>逐日理由</h2>${days}</section>

  <section><h2>建議行動</h2><ol class="act">${input.actions.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>

  <footer>${esc(input.sourceNote)}</footer>
</div></body></html>`

  return new Blob(['\ufeff' + html], { type: 'text/html;charset=utf-8' })
}

export function downloadHtml(blob: Blob, filename: string) {
  download(blob, filename)
}
