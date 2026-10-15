import type { FoodItem } from './types'
import { HttpError, isNative, requestJson } from './http'
import { validateFood } from './validation'

/**
 * Open Food Facts — открытая база упакованных продуктов (в т.ч. российских).
 * Поиск: search-a-licious (search.openfoodfacts.org), по штрихкоду: API v2.
 *
 * Браузер не может обратиться к OFF напрямую: search.openfoodfacts.org не отдаёт
 * Access-Control-Allow-Origin, и запрос из Mini App блокирует CORS. Поэтому веб-версия
 * ходит через свой сервер (/api/off/*), который заодно ставит User-Agent — его просит OFF,
 * а браузеру запрещено задавать этот заголовок. На iOS запрос идёт нативно, мимо сервера.
 */
const UA = 'BodyTrain/0.1 (iOS; personal app)'
const FIELDS = 'code,product_name,product_name_ru,brands,nutriments,serving_quantity'

const searchUrl = (query: string, pageSize: number) => {
  const q = encodeURIComponent(query)
  return isNative
    ? `https://search.openfoodfacts.org/search?q=${q}&page_size=${pageSize}&langs=ru,en&fields=${FIELDS}`
    : `/api/off/search?q=${q}&page_size=${pageSize}`
}

const productUrl = (code: string) => isNative
  ? `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`
  : `/api/off/product/${encodeURIComponent(code)}`

interface OffNutriments {
  'energy-kcal_100g'?: number
  'energy_100g'?: number
  proteins_100g?: number
  fat_100g?: number
  carbohydrates_100g?: number
}

interface OffProduct {
  code?: string
  product_name?: string
  product_name_ru?: string
  brands?: string | string[]
  nutriments?: OffNutriments
  serving_quantity?: number | string
}

const num = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : undefined
}

export function toFood(p: OffProduct): FoodItem | null {
  const n = p.nutriments
  if (!n) return null
  let kcal = num(n['energy-kcal_100g'])
  if (kcal === undefined && num(n['energy_100g']) !== undefined) kcal = num(n['energy_100g'])! / 4.184
  const protein = num(n.proteins_100g)
  const fat = num(n.fat_100g)
  const carbs = num(n.carbohydrates_100g)
  if (kcal === undefined || protein === undefined || fat === undefined || carbs === undefined) return null
  const name = (p.product_name_ru || p.product_name || '').trim()
  if (!name) return null
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0]
  const serving = num(p.serving_quantity)
  try { return validateFood({
    name,
    brand: brand?.trim() || undefined,
    kcal: Math.round(kcal),
    protein: protein ?? 0,
    fat: fat ?? 0,
    carbs: carbs ?? 0,
    source: 'off',
    barcode: p.code,
    portion: serving && serving > 0 && serving < 2000 ? serving : undefined,
  }) } catch { return null }
}

const cache = new Map<string, { expires: number; items: FoodItem[] }>()
let lastSearch = 0

export async function searchOff(query: string, pageSize = 25): Promise<FoodItem[]> {
  const key = `${query.trim().toLowerCase()}|${pageSize}`
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.items
  if (Date.now() - lastSearch < 6500) throw new Error('Подожди несколько секунд перед следующим поиском в открытой базе')
  lastSearch = Date.now()
  const url = searchUrl(query.trim(), pageSize)
  let res: { hits?: OffProduct[] }
  try { res = await requestJson(url, { headers: { 'User-Agent': UA } }) }
  catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 429) throw new Error('Open Food Facts ограничил запросы. Подожди минуту.')
      // Свой сервер объясняет причину точнее, чем «не ответил».
      const message = (e.body as { error?: string } | null)?.error
      if (typeof message === 'string' && message) throw new Error(message)
    }
    throw new Error('Open Food Facts не ответил. Проверь интернет; локальная база доступна офлайн.')
  }
  if (!Array.isArray(res.hits)) throw new Error('Открытая база вернула неожиданный ответ. Попробуй штрихкод или ручной ввод.')
  const seen = new Set<string>()
  const out: FoodItem[] = []
  for (const hit of res.hits ?? []) {
    const f = toFood(hit)
    if (!f) continue
    const key = `${f.name}|${f.brand}|${f.kcal}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  if (cache.size > 50) cache.delete(cache.keys().next().value!)
  cache.set(key, { expires: Date.now() + 5 * 60 * 1000, items: out })
  return out
}

export async function lookupBarcode(code: string): Promise<FoodItem | null> {
  const url = productUrl(code)
  try {
    const res = await requestJson<{ status?: number; product?: OffProduct }>(url, { headers: { 'User-Agent': UA } })
    if (!res.product) return null
    return toFood({ ...res.product, code })
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null
    throw e
  }
}
