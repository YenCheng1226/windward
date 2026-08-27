# 長風 Windward

Windy Premium 等級的**長期預報儀表板**：多模式比較、系集離散度、35 天次季節展望，台灣在地化。
純前端，資料全部來自 [Open-Meteo](https://open-meteo.com/) 的免費 API，不需要金鑰、不需要後端。

```bash
npm install
npm run dev      # http://localhost:5273
npm run build    # 產生 dist/
```

## 六個分頁

| 分頁 | 內容 |
|---|---|
| **總覽** | 目前天氣、16 天逐日卡片、每日高低溫與雨量圖 |
| **逐時** | 單一模式的逐時氣象圖（溫度／降水／雲量濕度／風／氣壓，每張圖單一 y 軸） |
| **多模式** | 各國模式疊圖 + 模式間最大差異 + 「模式何時開始分歧」指標 |
| **系集** | 成員分位帶（p10–p90 / p25–p75）、中位數、控制場、義大利麵圖、門檻超越機率、離散度曲線 |
| **長期展望** | 35 天次季節系集，對照 ERA5 十年氣候平均的距平，逐週摘要 |
| **資料表** | 圖表背後的原始數值，可下載 CSV |

## 為什麼這比一般天氣 App 有用

一般 App 給你「9/3 會下雨」。10 天以外沒有任何單一模式能回答這個問題。這個儀表板改成回答三件事：

1. **各家模式同不同意？**（多模式分頁）— 線條分岔的時間點就是這個地點的可預報度界線。
2. **同一個模式自己有多少把握？**（系集分頁）— 51 個成員的分布寬度，比任何單一數字誠實。
3. **這幾週相對常年是偏暖還是偏冷？**（長期展望）— 35 天尺度只剩趨勢，所以一律用週為單位並對照氣候值。

## 資料來源

| 用途 | 端點 | 說明 |
|---|---|---|
| 多模式預報 | `api.open-meteo.com/v1/forecast` | GFS 16d、ECMWF IFS／AIFS 15d、JMA 11d、GEM 10d、ICON 7.5d、UKMO 7d、CMA 5d |
| 系集 | `ensemble-api.open-meteo.com/v1/ensemble` | ECMWF ENS 51 成員 15d、GEFS 31 成員、GEM 21 成員（後兩者到 35d） |
| 氣候基準 | `archive-api.open-meteo.com/v1/archive` | ERA5 再分析，十年逐日資料算 day-of-year 常年值（±7 天平滑） |
| 地點搜尋 | `geocoding-api.open-meteo.com/v1/search` | 僅作為台灣內建清單以外的備援 |

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
  components/
    TimeChart.tsx  uPlot 包裝層（分位帶、義大利麵、十字游標 tooltip、日條紋）
    *Panel.tsx     六個分頁
```

### 兩個容易踩的地雷

**時間**：API 帶 `timezone=` 時回傳的是沒有時區標記的當地時間字串。程式用 `Date.parse(t + 'Z')` 把它轉成「UTC 欄位等於當地牆上時鐘」的偏移時戳，之後一律用 `getUTC*` 讀。這些數值**不是真正的 epoch**，不要拿去和 `Date.now()` 直接相減（`App.tsx` 裡的 `nowMs` 有做同樣的偏移）。

**顏色跟著模式走，不跟著順序走**：`modelColor()` 用模式在目錄中的固定索引取色，所以關掉一個模式不會讓其他模式換色。

## 授權與歸屬

Open-Meteo 資料為 CC BY 4.0；模式原始資料來自 ECMWF、NOAA、DWD、JMA、CMC、Met Office、CMA。
