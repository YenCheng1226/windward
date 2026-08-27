/**
 * The report's HTML shell.
 *
 * Visual language is a paper nautical chart: depth-shaded blues on chart stock, a
 * buff second sounding line, and the chart-correction magenta reserved for cautions.
 * The score cells are tinted like depth contours — a darker cell is a better window —
 * so the table reads as a shape before it reads as numbers.
 *
 * Google Fonts is the one external host the publish target permits; everything else
 * is inlined so the page works with no network at all.
 */
export interface PageParts {
  place: string
  from: string
  to: string
  leadDays: number
  generated: string
  headline: { lead: string; detail: string; tone: string }
  matrix: string
  ferry: string
  sun: string
  details: string
  activities: { id: string; name: string; icon: string }[]
  waveChart: string
  windChart: string
  waveConfidence: string
  waveSpreadMax: number | null
  recheck: string
  ensembleName: string
  ensembleMembers: number
  models: string[]
  marineLat: number
  marineLon: number
  lat: number
  lon: number
}

const STYLE = `
:root {
  color-scheme: light;
  --ground: #eaeeed;
  --paper: #fbfcfb;
  --paper-2: #f2f5f4;
  --ink: #0e1a1f;
  --ink-2: #46585f;
  --ink-3: #798a90;
  --rule: #d6dedb;
  --rule-2: #b9c6c3;
  --depth: #1a6a88;
  --depth-2: #c96a2c;
  --depth-fill: rgba(26, 106, 136, 0.13);
  --caution: #ad3477;
  --good: #2c7a4d;
  --warn: #a86d0c;
  --bad: #a83232;
  --s4: rgba(26, 106, 136, 0.22);
  --s3: rgba(26, 106, 136, 0.10);
  --s2: rgba(168, 109, 12, 0.16);
  --s1: rgba(168, 50, 50, 0.15);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ground: #091115;
    --paper: #121d22;
    --paper-2: #17252b;
    --ink: #e9f0f1;
    --ink-2: #a6bbc1;
    --ink-3: #7a8e94;
    --rule: #24363d;
    --rule-2: #354b52;
    --depth: #5cb2d0;
    --depth-2: #e08c4e;
    --depth-fill: rgba(92, 178, 208, 0.16);
    --caution: #e173ac;
    --good: #4fb37a;
    --warn: #d9a13c;
    --bad: #e07070;
    --s4: rgba(92, 178, 208, 0.26);
    --s3: rgba(92, 178, 208, 0.12);
    --s2: rgba(217, 161, 60, 0.18);
    --s1: rgba(224, 112, 112, 0.18);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #091115;
  --paper: #121d22;
  --paper-2: #17252b;
  --ink: #e9f0f1;
  --ink-2: #a6bbc1;
  --ink-3: #7a8e94;
  --rule: #24363d;
  --rule-2: #354b52;
  --depth: #5cb2d0;
  --depth-2: #e08c4e;
  --depth-fill: rgba(92, 178, 208, 0.16);
  --caution: #e173ac;
  --good: #4fb37a;
  --warn: #d9a13c;
  --bad: #e07070;
  --s4: rgba(92, 178, 208, 0.26);
  --s3: rgba(92, 178, 208, 0.12);
  --s2: rgba(217, 161, 60, 0.18);
  --s1: rgba(224, 112, 112, 0.18);
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: "Noto Sans TC", system-ui, -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}

.mono { font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace; font-variant-numeric: tabular-nums; }

.wrap { max-width: 940px; margin: 0 auto; padding: 40px 20px 72px; display: flex; flex-direction: column; gap: 28px; }

/* Masthead — a chart's title block: rule above, sounding data beneath. */
.mast { border-top: 3px solid var(--ink); padding-top: 16px; }
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--depth);
  font-weight: 700;
  margin: 0 0 8px;
}
h1 {
  font-family: "Noto Serif TC", Georgia, serif;
  font-weight: 700;
  font-size: clamp(28px, 5vw, 40px);
  line-height: 1.25;
  letter-spacing: -0.01em;
  margin: 0;
  text-wrap: balance;
}
.subtitle { margin: 10px 0 0; color: var(--ink-2); font-size: 15px; max-width: 62ch; }
.meta {
  margin: 16px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--rule);
  display: flex;
  flex-wrap: wrap;
  gap: 6px 26px;
  font-size: 12px;
  color: var(--ink-3);
}
.meta b { color: var(--ink-2); font-weight: 500; }

/* Headline verdict — the answer, before any table. */
.verdict {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--depth);
  border-radius: 4px;
  padding: 20px 24px;
}
.verdict.warning { border-left-color: var(--warn); }
.verdict.muted { border-left-color: var(--ink-3); }
.verdict h2 {
  font-family: "Noto Serif TC", Georgia, serif;
  font-size: 22px;
  margin: 0 0 6px;
  font-weight: 600;
}
.verdict p { margin: 0; color: var(--ink-2); font-size: 14.5px; max-width: 64ch; }

section { background: var(--paper); border: 1px solid var(--rule); border-radius: 4px; padding: 22px 24px; }
section > h2 {
  font-family: "Noto Serif TC", Georgia, serif;
  font-size: 17px;
  font-weight: 600;
  margin: 0 0 4px;
}
section > .lede { margin: 0 0 18px; color: var(--ink-2); font-size: 13.5px; max-width: 66ch; }

.scroll { overflow-x: auto; }

table.matrix { width: 100%; border-collapse: collapse; font-size: 13.5px; }
table.matrix th, table.matrix td { padding: 7px 10px; text-align: left; white-space: nowrap; }
table.matrix thead th {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
  font-weight: 500;
  border-bottom: 1px solid var(--rule-2);
}
table.matrix .num { text-align: right; }
table.matrix thead th br { line-height: 1.3; }
.sub { font-style: normal; color: var(--ink-3); font-size: 10px; margin-left: 4px; }
/* Comfort is context, not a go/no-go call — kept visually quieter than the scores. */
.comfort { color: var(--ink-3); }
table.matrix tr.daystart th, table.matrix tr.daystart td { border-top: 1px solid var(--rule); }
.daycell { font-weight: 600; vertical-align: top; padding-top: 10px; }
.daycell span { display: block; font-weight: 400; font-size: 11.5px; color: var(--ink-3); }
.part { color: var(--ink-2); font-size: 12.5px; }
.oor { color: var(--ink-3); font-size: 12.5px; white-space: normal; font-style: italic; }

/* Depth-contour tint: darker cell = deeper water = better window. */
.score {
  display: inline-block;
  min-width: 40px;
  padding: 3px 9px;
  border-radius: 3px;
  font-family: "IBM Plex Mono", monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 13px;
  text-align: center;
}
.score.s4 { background: var(--s4); color: var(--ink); }
.score.s3 { background: var(--s3); color: var(--ink); }
.score.s2 { background: var(--s2); color: var(--ink); }
.score.s1 { background: var(--s1); color: var(--bad); }
.score.na { color: var(--ink-3); }

.key { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--ink-2); }
.key li { display: flex; align-items: center; gap: 7px; }
.key i { width: 26px; height: 15px; border-radius: 3px; display: inline-block; }

.ferries { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.ferry { border: 1px solid var(--rule); border-radius: 4px; padding: 13px 15px; background: var(--paper-2); }
.ferry-date { font-size: 12px; color: var(--ink-3); display: flex; gap: 6px; }
.ferry-date em { font-style: normal; }
.ferry strong { display: block; font-size: 24px; font-family: "Noto Serif TC", serif; font-weight: 600; line-height: 1.3; margin: 2px 0 4px; }
.ferry.good strong { color: var(--good); }
.ferry.warning strong { color: var(--warn); }
.ferry.critical strong { color: var(--bad); }
.ferry.muted strong { color: var(--ink-3); }
.ferry-why { font-size: 11.5px; color: var(--ink-2); line-height: 1.6; }

/* Activity selector */
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; }
.tabs button {
  font: inherit;
  font-size: 13px;
  padding: 6px 13px;
  border: 1px solid var(--rule-2);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
}
.tabs button:hover { border-color: var(--depth); color: var(--ink); }
.tabs button[aria-selected="true"] { background: var(--depth); border-color: var(--depth); color: #fff; font-weight: 500; }
.tabs button:focus-visible { outline: 2px solid var(--caution); outline-offset: 2px; }

.blurb { margin: 0 0 16px; color: var(--ink-2); font-size: 13.5px; max-width: 66ch; }
.panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.panel { border: 1px solid var(--rule); border-radius: 4px; padding: 14px 16px; background: var(--paper-2); }
.panel header { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13.5px; font-weight: 500; }
.panel header em { font-style: normal; color: var(--ink-3); font-size: 11.5px; margin-left: 7px; }
.limit { margin: 10px 0 0; font-size: 12px; color: var(--ink-2); line-height: 1.65; }
.limit strong { color: var(--ink); }

.parts { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.parts li { display: grid; grid-template-columns: 5.5em 1fr 6.5em; align-items: center; gap: 10px; font-size: 11.5px; color: var(--ink-2); }
.pbar { height: 6px; border-radius: 3px; background: var(--rule); overflow: hidden; }
.pbar i { display: block; height: 100%; border-radius: 3px; }
.pbar i.ok { background: var(--good); }
.pbar i.mid { background: var(--warn); }
.pbar i.bad { background: var(--bad); }
.pbar i.na { background: transparent; }
.pv { text-align: right; font-size: 11px; }

.prob { margin: 12px 0 0; font-size: 11.5px; color: var(--ink-2); line-height: 1.6; }
.prob em { display: block; font-style: normal; color: var(--ink-3); font-size: 10.5px; }
.notes { margin: 10px 0 0; padding-left: 16px; font-size: 11.5px; color: var(--ink-3); line-height: 1.7; }

figure { margin: 0; }
figure svg { width: 100%; height: auto; display: block; }
.ax { font-family: "IBM Plex Mono", monospace; font-size: 10px; fill: var(--ink-3); }
figcaption { margin-top: 10px; font-size: 12px; color: var(--ink-3); display: flex; flex-wrap: wrap; gap: 6px 18px; }
figcaption span { display: flex; align-items: center; gap: 6px; }
figcaption i { width: 18px; height: 3px; border-radius: 2px; display: inline-block; }
figcaption i.dash { height: 0; border-top: 2px dashed var(--caution); }

/* Sunshine cards — the day's total is the headline, cloud gives the within-day shape. */
.sundays { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.sunday { border: 1px solid var(--rule); border-radius: 4px; padding: 13px 15px; background: var(--paper-2); }
.sunday-head { display: flex; align-items: baseline; gap: 8px; font-size: 13.5px; }
.sunday-head strong { font-family: "IBM Plex Mono", monospace; }
.sunday-head span { font-size: 11.5px; color: var(--ink-3); }
.tag { margin-left: auto; font-style: normal; font-size: 11.5px; font-weight: 500; }
.tag.good { color: var(--good); }
.tag.warning { color: var(--warn); }
.tag.critical { color: var(--bad); }
.tag.muted { color: var(--ink-3); }
.sunday-main { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; margin: 8px 0 10px; }
.sun-h { font-size: 21px; font-weight: 600; }
.sun-h em { font-style: normal; font-size: 11px; font-weight: 400; color: var(--ink-3); margin-left: 4px; }
.sun-track { height: 7px; border-radius: 4px; background: var(--rule); overflow: hidden; }
.sun-track i { display: block; height: 100%; background: var(--warn); border-radius: 4px; }
.sun-pct { font-size: 11px; color: var(--ink-3); }
.sunday-part { display: grid; grid-template-columns: 2.8em 1fr auto; gap: 10px; font-size: 11.5px; color: var(--ink-2); padding: 4px 0; border-top: 1px solid var(--rule); }
.sunday-part .rain { text-align: right; color: var(--ink-3); }
.foot-note { margin: 14px 0 0; font-size: 12px; color: var(--ink-3); line-height: 1.7; }

/* Chart correction notes are printed in magenta on real charts — same job here. */
.caveats { border-left: 3px solid var(--caution); padding-left: 18px; margin: 0; }
.caveats h2 { font-family: "Noto Serif TC", serif; font-size: 15px; margin: 0 0 12px; color: var(--caution); }
.caveats ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.8; color: var(--ink-2); }
.caveats li { margin-bottom: 8px; }
.caveats strong { color: var(--ink); }

footer { font-size: 11.5px; color: var(--ink-3); line-height: 1.8; border-top: 1px solid var(--rule); padding-top: 16px; }
footer a { color: var(--depth); }

@media (max-width: 620px) {
  .wrap { padding: 24px 14px 48px; }
  section { padding: 16px 15px; }
  .parts li { grid-template-columns: 4.5em 1fr 5.5em; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`

const SCRIPT = `
// Activity selector. The panels are all in the document already — this only toggles
// which one is shown, so the page works fully before (and without) any script.
(function () {
  var tabs = document.querySelectorAll(".tabs button");
  var panels = document.querySelectorAll(".detail");
  function show(id) {
    tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.act === id)); });
    panels.forEach(function (p) { p.hidden = p.dataset.act !== id; });
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { show(t.dataset.act); }); });
  if (tabs.length) show(tabs[0].dataset.act);
})();
`

export function renderPage(p: PageParts): string {
  const tabs = p.activities
    .map((a, i) => `<button type="button" role="tab" data-act="${a.id}" aria-selected="${i === 0}">${a.icon} ${a.name}</button>`)
    .join('')

  return `<title>綠島下水窗口</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap">
<style>${STYLE}</style>
<div class="wrap">

  <header class="mast">
    <p class="eyebrow">水上活動條件評估</p>
    <h1>${p.place} ${p.from}–${p.to}　能不能下水</h1>
    <p class="subtitle">自由潛水、水肺潛水、浮潛、SUP、衝浪五項活動的逐時段適宜度，加上船班停航風險與預報不確定性。</p>
    <p class="meta">
      <span><b>資料時間</b> ${p.generated}</span>
      <span><b>出發前</b> ${p.leadDays} 天</span>
      <span><b>大氣模式</b> ${p.models.join('、')}</span>
      <span><b>海象格點</b> ${p.marineLat.toFixed(2)}°N ${p.marineLon.toFixed(2)}°E</span>
    </p>
  </header>

  <div class="verdict ${p.headline.tone}">
    <h2>${p.headline.lead}</h2>
    <p>${p.headline.detail}</p>
  </div>

  <section>
    <h2>適宜度總表</h2>
    <p class="lede">每格是該時段的綜合評分（0–100）。水上活動由最差的因素決定，所以任何一項觸及否決門檻，整格即為 0。滑到分數上可以看到該格的限制因素。最右欄的旅遊舒適度看的是岸上：降雨、日照與體感溫度。</p>
    ${p.matrix}
    <ul class="key">
      <li><i style="background:var(--s4)"></i>75 以上　很適合</li>
      <li><i style="background:var(--s3)"></i>55–74　可以玩</li>
      <li><i style="background:var(--s2)"></i>35–54　勉強</li>
      <li><i style="background:var(--s1)"></i>34 以下　不建議</li>
    </ul>
  </section>

  <section>
    <h2>曬太陽與降雨</h2>
    <p class="lede">日照時數取自模式的逐日累計值，是直射陽光超過門檻的實際時數，不是雲量的反面。逐時的日照欄位在這裡不可用——它是二元的，雲量 45% 也照樣記整整一小時，所以日是日照最小的誠實單位；時段內的變化改看雲量。</p>
    <div class="sundays">${p.sun}</div>
    <p class="foot-note">九月的${p.place} UV 幾乎每天都是過量級——日照越充足，防曬與補水越關鍵。反過來說，雲多時水下光線會變暗，攝影與能見度的體感都會打折。</p>
  </section>

  <section>
    <h2>船班停航風險</h2>
    <p class="lede">離島行程真正的成敗關鍵——活動條件再好，船不開就去不了。門檻取自這條航線常見的停航海況，屬經驗法則，實際以當日船公司公告為準。</p>
    <div class="ferries">${p.ferry}</div>
  </section>

  <section>
    <h2>逐項活動詳解</h2>
    <div class="tabs" role="tablist" aria-label="選擇活動">${tabs}</div>
    ${p.details}
  </section>

  ${p.waveChart ? `<section>
    <h2>行程期間浪高</h2>
    <p class="lede">兩家獨立波浪模式。它們分岔的幅度就是浪高預報的不確定性——這個海域沒有公開的波浪系集，模式間差異是目前最好的替代指標。</p>
    <figure>
      ${p.waveChart}
      <figcaption>
        <span><i style="background:var(--depth)"></i>GFS-Wave（16 天）</span>
        <span><i style="background:var(--depth-2)"></i>ECMWF WAM（14.8 天）</span>
        <span>單位 m</span>
      </figcaption>
    </figure>
  </section>` : ''}

  ${p.windChart ? `<section>
    <h2>行程期間風速系集</h2>
    <p class="lede">${p.ensembleName}，${p.ensembleMembers} 組成員。帶狀是 10–90 百分位；洋紅虛線是所有活動中最嚴格的風速上限（SUP）。帶狀落在虛線下方越多，風況越有把握。</p>
    <figure>
      ${p.windChart}
      <figcaption>
        <span><i style="background:var(--depth)"></i>系集中位風速</span>
        <span><i style="background:var(--depth-fill)"></i>10–90 百分位</span>
        <span><i class="dash"></i>最嚴格可行上限</span>
        <span>單位 m/s</span>
      </figcaption>
    </figure>
  </section>` : ''}

  <section class="caveats">
    <h2>這份評估的限制</h2>
    <ul>
      <li><strong>門檻是經驗法則。</strong>各活動的浪高、風速界線來自潛店與水上活動業者的通用說法，未針對${p.place}任何一個特定點位校正。實際能不能下水，當地教練的判斷永遠優先。</li>
      <li><strong>只有風速有系集。</strong>公開資料沒有這個海域的波浪系集，浪高的不確定性只能用兩家模式的差異估計（目前最大差 ${p.waveSpreadMax != null ? p.waveSpreadMax.toFixed(2) + ' m' : '無資料'}，一致性${p.waveConfidence}），這會低估真實的不確定範圍。</li>
      <li><strong>能見度是推估值。</strong>用前 48 小時累積雨量當濁度代理，抓得到大雨後的濁流，但抓不到湧浪攪底、藻華或潮流帶來的變化。</li>
      <li><strong>格點不是潛點。</strong>浪高取自 0.25°（約 25 km）的海洋格點，代表外海整體海況，不是某個特定潛點背風面的實際狀況；同一天島嶼東西岸可以差很多。</li>
      <li><strong>這是一份快照。</strong>資料停在上方標示的時間，不會自動更新。十天以外的預報一定會變——建議在 ${p.recheck}（出發前 4 天）與出發前一天各重新產生一次。</li>
    </ul>
  </section>

  <footer>
    <p>預報資料 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>（CC BY 4.0）・模式來源 ECMWF、NOAA、DWD、JMA・波浪 NCEP GFS-Wave 與 ECMWF WAM・海溫與海象格點取自 Open-Meteo Marine API。</p>
    <p>座標 ${p.lat.toFixed(3)}°N ${p.lon.toFixed(3)}°E・時間均為台灣時間（UTC+8）・評分邏輯與門檻出自長風 Windward 的 <span class="mono">lib/activities.ts</span>，可重新產生。</p>
  </footer>

</div>
<script>${SCRIPT}</script>`
}
