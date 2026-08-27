/**
 * Built-in Taiwan location list.
 *
 * Open-Meteo's geocoding search is unreliable for Chinese place names — querying
 * 「高雄」 returns a town in Sichuan before Kaohsiung — so the Taiwan set is
 * hard-coded and the geocoder is only a fallback for everywhere else.
 */
export interface Place {
  name: string
  lat: number
  lon: number
  /** Metres; shown because model elevation often differs sharply in the mountains. */
  elevation?: number
  group: '直轄市 / 縣市' | '離島' | '高山' | '景點 / 海域'
}

export const TAIWAN_PLACES: Place[] = [
  { name: '臺北市', lat: 25.033, lon: 121.5654, group: '直轄市 / 縣市' },
  { name: '新北市 板橋', lat: 25.0118, lon: 121.4628, group: '直轄市 / 縣市' },
  { name: '基隆市', lat: 25.1276, lon: 121.7392, group: '直轄市 / 縣市' },
  { name: '桃園市', lat: 24.9937, lon: 121.3009, group: '直轄市 / 縣市' },
  { name: '新竹市', lat: 24.8138, lon: 120.9675, group: '直轄市 / 縣市' },
  { name: '新竹縣 竹北', lat: 24.8387, lon: 121.0125, group: '直轄市 / 縣市' },
  { name: '苗栗縣', lat: 24.5602, lon: 120.8214, group: '直轄市 / 縣市' },
  { name: '臺中市', lat: 24.1477, lon: 120.6736, group: '直轄市 / 縣市' },
  { name: '彰化縣', lat: 24.0756, lon: 120.5442, group: '直轄市 / 縣市' },
  { name: '南投縣', lat: 23.9609, lon: 120.6714, group: '直轄市 / 縣市' },
  { name: '雲林縣 斗六', lat: 23.7075, lon: 120.5439, group: '直轄市 / 縣市' },
  { name: '嘉義市', lat: 23.4801, lon: 120.4491, group: '直轄市 / 縣市' },
  { name: '嘉義縣 太保', lat: 23.459, lon: 120.332, group: '直轄市 / 縣市' },
  { name: '臺南市', lat: 22.9999, lon: 120.227, group: '直轄市 / 縣市' },
  { name: '高雄市', lat: 22.6273, lon: 120.3014, group: '直轄市 / 縣市' },
  { name: '屏東縣', lat: 22.669, lon: 120.488, group: '直轄市 / 縣市' },
  { name: '宜蘭縣', lat: 24.7021, lon: 121.7378, group: '直轄市 / 縣市' },
  { name: '花蓮縣', lat: 23.9871, lon: 121.6015, group: '直轄市 / 縣市' },
  { name: '臺東縣', lat: 22.7583, lon: 121.1444, group: '直轄市 / 縣市' },

  { name: '澎湖 馬公', lat: 23.5655, lon: 119.5794, group: '離島' },
  { name: '金門 金城', lat: 24.4321, lon: 118.3171, group: '離島' },
  { name: '馬祖 南竿', lat: 26.1608, lon: 119.949, group: '離島' },
  { name: '蘭嶼', lat: 22.057, lon: 121.558, group: '離島' },
  { name: '綠島', lat: 22.66, lon: 121.489, group: '離島' },
  { name: '小琉球', lat: 22.34, lon: 120.372, group: '離島' },

  { name: '玉山北峰', lat: 23.472, lon: 120.959, elevation: 3858, group: '高山' },
  { name: '合歡山 武嶺', lat: 24.1373, lon: 121.2748, elevation: 3275, group: '高山' },
  { name: '雪山主峰', lat: 24.3847, lon: 121.2306, elevation: 3886, group: '高山' },
  { name: '南湖大山', lat: 24.3617, lon: 121.4406, elevation: 3742, group: '高山' },
  { name: '阿里山', lat: 23.51, lon: 120.803, elevation: 2216, group: '高山' },
  { name: '拉拉山', lat: 24.706, lon: 121.42, elevation: 2031, group: '高山' },
  { name: '太平山', lat: 24.499, lon: 121.535, elevation: 1950, group: '高山' },
  { name: '清境農場', lat: 24.057, lon: 121.162, elevation: 1750, group: '高山' },

  { name: '日月潭', lat: 23.85, lon: 120.915, group: '景點 / 海域' },
  { name: '太魯閣', lat: 24.158, lon: 121.622, group: '景點 / 海域' },
  { name: '陽明山 擎天崗', lat: 25.165, lon: 121.561, group: '景點 / 海域' },
  { name: '墾丁', lat: 21.948, lon: 120.798, group: '景點 / 海域' },
  { name: '福隆', lat: 25.021, lon: 121.944, group: '景點 / 海域' },
  { name: '七股潟湖', lat: 23.14, lon: 120.08, group: '景點 / 海域' },
  { name: '龜山島', lat: 24.838, lon: 121.956, group: '景點 / 海域' },
  { name: '臺灣海峽中線', lat: 24.2, lon: 119.5, group: '景點 / 海域' },
  { name: '巴士海峽', lat: 21.5, lon: 121.0, group: '景點 / 海域' },
]

export const DEFAULT_PLACE = TAIWAN_PLACES[0]

export interface GeoResult {
  name: string
  lat: number
  lon: number
  country: string
  admin?: string
}

/** Fallback search for places outside the built-in Taiwan list. */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=zh&format=json`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const json = await res.json()
  if (!json.results) return []
  return json.results.map((r: Record<string, unknown>) => ({
    name: r.name as string,
    lat: r.latitude as number,
    lon: r.longitude as number,
    country: (r.country as string) ?? '',
    admin: r.admin1 as string | undefined,
  }))
}
