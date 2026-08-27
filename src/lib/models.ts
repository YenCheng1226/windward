/**
 * Model catalogue.
 *
 * `maxDays` values were probed against the live API for a Taiwan point — they are
 * the practical horizon (last non-null hour), not the marketing number. Models are
 * listed longest-horizon first because this dashboard is about long range.
 */
export interface ModelDef {
  id: string
  name: string
  centre: string
  /** Practical forecast horizon in days, measured at 25N/121E. */
  maxDays: number
  /** Approximate native grid spacing, for the "why do they differ" panel. */
  resolution: string
  note?: string
}

/** Deterministic (single-run) global models available on the forecast endpoint. */
export const DETERMINISTIC: ModelDef[] = [
  { id: 'gfs_seamless', name: 'GFS', centre: 'NOAA / 美國', maxDays: 16, resolution: '0.11–0.25°', note: '公開模式中預報最長，但中長期偏差較大' },
  { id: 'ecmwf_ifs025', name: 'ECMWF IFS', centre: 'ECMWF / 歐洲', maxDays: 15, resolution: '0.25°', note: '中期預報公認準確度最高的物理模式' },
  { id: 'ecmwf_aifs025_single', name: 'ECMWF AIFS', centre: 'ECMWF / 歐洲', maxDays: 15, resolution: '0.25°', note: 'ECMWF 的 AI 模式，颱風路徑表現常優於 IFS' },
  { id: 'jma_seamless', name: 'JMA GSM', centre: '氣象廳 / 日本', maxDays: 11, resolution: '0.5°', note: '東亞與西北太平洋在地化調校，對台灣天氣型態貼近' },
  { id: 'gem_seamless', name: 'GEM', centre: 'CMC / 加拿大', maxDays: 10, resolution: '0.15°' },
  { id: 'icon_seamless', name: 'ICON', centre: 'DWD / 德國', maxDays: 7.5, resolution: '0.0625–0.125°' },
  { id: 'ukmo_seamless', name: 'UKMO', centre: 'Met Office / 英國', maxDays: 7, resolution: '0.09–0.14°' },
  { id: 'cma_grapes_global', name: 'CMA GRAPES', centre: '中國氣象局', maxDays: 5, resolution: '0.125°' },
]

/** Models pre-selected on first load: the long-range core plus the East-Asia specialist. */
export const DEFAULT_MODELS = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'jma_seamless', 'icon_seamless']

export interface EnsembleDef extends ModelDef {
  members: number
}

/** Ensemble systems on the ensemble endpoint. `members` excludes the control run. */
export const ENSEMBLES: EnsembleDef[] = [
  { id: 'gem_global', name: 'GEM 系集', centre: 'CMC / 加拿大', members: 21, maxDays: 35, resolution: '0.5°', note: '35 天次季節預報，適合看月尺度趨勢' },
  { id: 'gfs05', name: 'GEFS 0.5°', centre: 'NOAA / 美國', members: 31, maxDays: 35, resolution: '0.5°', note: '35 天次季節預報' },
  { id: 'ecmwf_ifs025', name: 'ECMWF ENS', centre: 'ECMWF / 歐洲', members: 51, maxDays: 15, resolution: '0.25°', note: '成員數最多、離散度最可信的系集' },
  { id: 'ecmwf_aifs025', name: 'ECMWF AIFS ENS', centre: 'ECMWF / 歐洲', members: 51, maxDays: 15, resolution: '0.25°', note: 'AI 系集' },
  { id: 'gfs025', name: 'GEFS 0.25°', centre: 'NOAA / 美國', members: 31, maxDays: 10, resolution: '0.25°' },
  { id: 'ukmo_global_ensemble_20km', name: 'MOGREPS-G', centre: 'Met Office / 英國', members: 18, maxDays: 10, resolution: '20 km' },
  { id: 'icon_global', name: 'ICON-EPS', centre: 'DWD / 德國', members: 40, maxDays: 7.5, resolution: '0.25°' },
]

export const modelById = (id: string) => DETERMINISTIC.find((m) => m.id === id)
export const ensembleById = (id: string) => ENSEMBLES.find((m) => m.id === id)

/**
 * Wave models on the marine endpoint. Horizons were probed at 綠島 (22.66N/121.49E);
 * the default `best_match` only reaches ~9 days there, which is short of a
 * two-week trip window, so both long-range wave models are named explicitly.
 */
export const WAVE_MODELS: ModelDef[] = [
  { id: 'ncep_gfswave025', name: 'GFS-Wave', centre: 'NOAA / 美國', maxDays: 16, resolution: '0.25°' },
  { id: 'ecmwf_wam025', name: 'ECMWF WAM', centre: 'ECMWF / 歐洲', maxDays: 14.8, resolution: '0.25°' },
]

export const waveModelById = (id: string) => WAVE_MODELS.find((m) => m.id === id)
