# 長風 Windward

**線上版：<https://yencheng1226.github.io/windward/>**
（綠島行程報告：<https://yencheng1226.github.io/windward/report/>）

Windy Premium 等級的**長期預報儀表板**：多模式比較、系集離散度、35 天次季節展望，台灣在地化。
純前端，資料全部來自 [Open-Meteo](https://open-meteo.com/) 的免費 API，不需要金鑰、不需要後端。

```bash
npm install
npm run dev      # http://localhost:5273
npm run build    # 產生 dist/
npm run bundle   # dist/ + 最新的綠島報告，可直接發佈
```

## 發佈

網站是純靜態的，沒有後端。`npm run bundle` 產生的 `dist/` 可以放上任何靜態主機。
目前發佈在 GitHub Pages 的 `gh-pages` 分支：

```bash
npm run bundle
D=$(mktemp -d) && cp -R dist/. "$D"/ && git -C "$D" init -q -b gh-pages \
  && git -C "$D" add -A && git -C "$D" commit -q -m 發佈 \
  && git -C "$D" push -f https://github.com/YenCheng1226/windward.git gh-pages
```

`dist/.nojekyll` 必須保留，否則 GitHub Pages 會用 Jekyll 處理並忽略部分檔案。

## 六個分頁

| 分頁 | 內容 |
|---|---|
| **總覽** | 目前天氣、16 天逐日卡片、每日高低溫與雨量圖 |
| **逐時** | 單一模式的逐時氣象圖（溫度／降水／雲量濕度／風／氣壓，每張圖單一 y 軸） |
| **多模式** | 各國模式疊圖 + 模式間最大差異 + 「模式何時開始分歧」指標 |
| **系集** | 成員分位帶（p10–p90 / p25–p75）、中位數、控制場、義大利麵圖、門檻超越機率、離散度曲線 |
| **長期展望** | 35 天次季節系集，對照 ERA5 十年氣候平均的距平，逐週摘要 |
| **熱帶系統** | 颱風／熱低壓追蹤、醞釀中的擾動、系集生成訊號 |
| **資料表** | 圖表背後的原始數值，可下載 CSV |

外加一個 **行程評估** 分頁：把預報翻譯成「這幾天能不能下水」。

## 為什麼這比一般天氣 App 有用

一般 App 給你「9/3 會下雨」。10 天以外沒有任何單一模式能回答這個問題。這個儀表板改成回答三件事：

1. **各家模式同不同意？**（多模式分頁）— 線條分岔的時間點就是這個地點的可預報度界線。
2. **同一個模式自己有多少把握？**（系集分頁）— 51 個成員的分布寬度，比任何單一數字誠實。
3. **這幾週相對常年是偏暖還是偏冷？**（長期展望）— 35 天尺度只剩趨勢，所以一律用週為單位並對照氣候值。

## 行程評估與可分享報告

`行程評估` 分頁針對水上活動（自由潛水、水肺潛水、浮潛、SUP、衝浪）逐時段評分，
並獨立呈現船班停航風險——離島行程真正的成敗關鍵。

門檻寫在 `src/lib/activities.ts` 的 `ACTIVITIES`，是業界經驗法則而非官方標準，
刻意寫成資料以便檢視與修改。兩個設計決定比數字本身更重要：

1. **最差的因素決定成敗。** 水上活動是被限制而非被平均的：無浪但 12 m/s 的風對
   SUP 不是「七成好」，是不能玩。任一項觸及否決門檻整格歸零，其餘以加權幾何平均
   結合，讓單一弱項確實拖累。
2. **輸出的重點是限制因素。** 單一分數對規劃幾乎沒用；知道週四卡在湧浪、週五卡在
   風，才知道要盯哪個預報、備案是什麼。

### 網址即分析

整個儀表板的狀態編碼在 URL hash，連結打開就是同一份分析：

```
#tab=trip&name=綠島&lat=22.6600&lon=121.4890&from=2026-09-09&to=2026-09-12&act=freedive
```

### 產生離線報告

`npm run report` 會抓即時資料、跑同一套評分邏輯，產生一份完全自包含的 HTML
（`report/index.html`，約 53 KB，除 Google Fonts 外無任何外部請求）。這份檔案可以
直接傳給別人或發布成網頁，不需要伺服器。

```bash
npm run report          # 預設綠島 9/9–9/12
npm run snapshot -- --name 蘭嶼 --lat 22.057 --lon 121.558 --from 2026-09-20 --to 2026-09-23 --out report/data.json
npm run render
```

報告是**快照**，不會自動更新——十天以外的預報一定會變，出發前 4 天與前 1 天各重跑一次。

## 熱帶系統追蹤

分三層，對應「東西已經在那裡／正在醞釀／還沒有人點名」：

| 層級 | 來源 | 內容 |
|---|---|---|
| 已生成 | 日本氣象廳 `jma.go.jp/bosai/typhoon` | 位置、強度、中心氣壓、暴風圈、預報路徑與 70% 機率圈；換算成台灣的颱風分級並算出與所選地點的距離與最近接近時刻 |
| 醞釀中 | JTWC `abpwweb.txt` | 熱帶天氣報，在系統被命名之前就列出可疑擾動區 |
| 還沒點名 | GEFS 系集（自算） | 成員海平面氣壓低於 1000 hPa 的比例與 8 級陣風機率 |

**為什麼不是中央氣象署**：CWA 是台灣的權責機關，但它的兩個管道靜態網頁都讀不到——開放資料 API
需要金鑰（放進公開網站等於外流），公開 RSS 沒有送 `Access-Control-Allow-Origin`，瀏覽器直接擋。
上面兩個來源都經實測會送 `Access-Control-Allow-Origin: *`。氣象廳是西北太平洋的 WMO 指定機構
（RSMC 東京），也是 CWA 作業所依據的上游。**實際發布的警特報仍以中央氣象署為準。**

強度數字兩家不會一致：氣象廳用 10 分鐘平均風（與 CWA 同慣例），JTWC 用 1 分鐘平均風，
同一系統後者約高 12%。程式因此是從風速換算台灣分級，而不是翻譯對方的分級名稱。

系集生成訊號刻意排除頭 48 小時：附近只要有已知系統，當下氣壓本來就低，會把指標洗到 100%
而蓋掉真正要看的東西。

## 資料來源

| 用途 | 端點 | 說明 |
|---|---|---|
| 多模式預報 | `api.open-meteo.com/v1/forecast` | GFS 16d、ECMWF IFS／AIFS 15d、JMA 11d、GEM 10d、ICON 7.5d、UKMO 7d、CMA 5d |
| 系集 | `ensemble-api.open-meteo.com/v1/ensemble` | ECMWF ENS 51 成員 15d、GEFS 31 成員、GEM 21 成員（後兩者到 35d） |
| 氣候基準 | `archive-api.open-meteo.com/v1/archive` | ERA5 再分析，十年逐日資料算 day-of-year 常年值（±7 天平滑） |
| 地點搜尋 | `geocoding-api.open-meteo.com/v1/search` | 僅作為台灣內建清單以外的備援 |
| 海象 | `marine-api.open-meteo.com/v1/marine` | 浪高、週期、湧浪、海溫。`ncep_gfswave025` 16 天、`ecmwf_wam025` 14.8 天；預設 `best_match` 只到 9 天，不夠涵蓋兩週後的行程 |

波浪**沒有**公開系集，所以浪高的不確定性只能用兩家模式的差異估計；風速則有真正的
系集機率。行程超出 ECMWF ENS 時距時自動改用 GEFS 0.5°（35 天）。

`models.ts` 裡的 `maxDays` 是實際打 API 量到的最後一筆非空值（以台北為測點），不是官方宣稱值。

## 程式結構

```
src/
  lib/
    openmeteo.ts   API 客戶端（多模式、系集、ERA5 氣候值）+ 時間處理
    models.ts      模式目錄（時距、解析度、發布單位）
    locations.ts   台灣內建地點 + geocoding 備援
    weather.ts     WMO 天氣碼、單位格式化、分位數／超越機率／信心度
    palette.ts     設計 token（淺色與深色各自選色，非自動反轉）
    hooks.ts       async 資料 hook（含快取與重試）、主題 hook
    activities.ts  水上活動適宜度模型：門檻、評分、船班風險、旅遊舒適度
    trip.ts        把大氣／海象／系集三個來源併到同一時間軸並彙整
    urlState.ts    網址 hash 編解碼（視為不可信輸入）
    tropical.ts    JMA／JTWC 客戶端、台灣颱風分級換算、距離與方位
  components/
    TimeChart.tsx  uPlot 包裝層（分位帶、義大利麵、十字游標 tooltip、日條紋）
    *Panel.tsx     七個分頁
scripts/
  snapshot.ts      抓即時資料、跑評分、輸出 report/data.json
  page.ts          離線報告的 HTML 樣板（海圖配色）
  render.ts        data.json -> 自包含的 report/index.html
```

### 兩個容易踩的地雷

**時間**：API 帶 `timezone=` 時回傳的是沒有時區標記的當地時間字串。程式把它轉成「UTC 欄位等於當地牆上時鐘」的偏移時戳，之後一律用 `getUTC*` 讀。這些數值**不是真正的 epoch**，不要拿去和 `Date.now()` 直接相減（`App.tsx` 裡的 `nowMs` 有做同樣的偏移）。

轉換時要注意逐日與逐時的字串格式不同：逐日是純日期 `2026-08-27`，逐時是 `2026-08-27T09:00`。直接接上 `Z` 會產生 `2026-08-27Z`——**V8 接受這個非標準格式，WebKit 一律回 `NaN`**，症狀是 Safari 上所有逐日日期變成 `NaN/NaN` 而 Chrome 完全正常。`localMs()` 會先把純日期補成完整時戳。跨瀏覽器的日期解析差異只有實際跑 WebKit 才驗得出來：

```bash
npx playwright install webkit   # 之後可用 playwright 的 webkit 驗證
```

**顏色跟著模式走，不跟著順序走**：`modelColor()` 用模式在目錄中的固定索引取色，所以關掉一個模式不會讓其他模式換色。

## 授權與歸屬

Open-Meteo 資料為 CC BY 4.0；模式原始資料來自 ECMWF、NOAA、DWD、JMA、CMC、Met Office、CMA。
