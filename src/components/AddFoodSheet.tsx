import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Barcode, Camera, Clock, Image, PenLine, ScanLine, Search } from 'lucide-react'
import { searchLocal } from '../data/foods'
import { detectBarcode, scanBarcodeLive, scannerAvailable } from '../lib/bodyVision'
import { fileToJpegBase64 } from '../lib/image'
import { lookupBarcode, searchOff } from '../lib/openFoodFacts'
import type { FoodItem, Meal } from '../lib/types'
import { validateFood } from '../lib/validation'
import { fmt } from '../lib/utils'
import { recentFoods, useApp } from '../store/app'
import { AmountSheet, mealLabels } from './AmountSheet'
import { PhotoTab } from './PhotoTab'
import { Button, Field, MacroLine, NumberField, Sheet, Spinner, TextInput } from './ui'

type Tab = 'search' | 'photo' | 'barcode' | 'manual'

export function AddFoodSheet({
  open,
  meal,
  date,
  onClose,
  goToProfile,
}: {
  open: boolean
  meal: Meal
  date: string
  onClose: () => void
  goToProfile: () => void
}) {
  const addFood = useApp((s) => s.addFood)
  const [tab, setTab] = useState<Tab>('search')
  const [picked, setPicked] = useState<FoodItem | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'search', label: 'Поиск', icon: <Search size={16} /> },
    { id: 'photo', label: 'Фото', icon: <Camera size={16} /> },
    { id: 'barcode', label: 'Штрихкод', icon: <Barcode size={16} /> },
    { id: 'manual', label: 'Своё', icon: <PenLine size={16} /> },
  ]

  return (
    <>
      <Sheet open={open} onClose={onClose} title={`${mealLabels[meal]} · добавить`} full>
        <div className="px-5 pb-3">
          <div className="bg-surface rounded-2xl p-1 grid grid-cols-4 gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`h-14 rounded-xl text-[13px] font-medium flex flex-col items-center justify-center leading-tight ${
                  tab === t.id ? 'bg-surface-2 text-text' : 'text-muted'
                }`}
              >
                {t.icon}
                <span className="mt-0.5">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        {tab === 'search' && <SearchTab onPick={setPicked} />}
        {tab === 'photo' && (
          <PhotoTab
            onPick={setPicked}
            goToProfile={goToProfile}
            onAddMany={(items) => {
              items.forEach((i) => addFood(i.food, i.grams, meal, date))
              setToast(`Добавлено: ${items.length}`)
              onClose()
            }}
          />
        )}
        {tab === 'barcode' && <BarcodeTab onPick={setPicked} />}
        {tab === 'manual' && <ManualTab onPick={setPicked} />}
      </Sheet>

      <AmountSheet
        food={picked}
        initialMeal={meal}
        onClose={() => setPicked(null)}
        onSubmit={(grams, m) => {
          if (picked) addFood(picked, grams, m, date)
          setToast(`${picked?.name} — добавлено`)
          setPicked(null)
        }}
      />

      {toast && createPortal(
        // Рядом с листом, который живёт в body: иначе уведомление осталось бы под ним.
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(var(--sab)+90px)] z-[60] bg-surface-2 border border-line rounded-full px-4 py-2.5 text-[14px] font-medium shadow-xl animate-fade max-w-[90%] truncate">
          {toast}
        </div>,
        document.body,
      )}
    </>
  )
}

function FoodRow({ food, onClick }: { food: FoodItem; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pressable w-full text-left py-3 border-b border-line/60">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[16px] leading-snug min-w-0">
          {food.name}
          {food.brand && <span className="text-muted"> · {food.brand}</span>}
        </div>
        <div className="tnum text-[14px] font-semibold shrink-0">{fmt(food.kcal)}</div>
      </div>
      <MacroLine protein={food.protein} fat={food.fat} carbs={food.carbs} className="mt-0.5 text-[12px]" />
    </button>
  )
}

function SearchTab({ onPick }: { onPick: (f: FoodItem) => void }) {
  const log = useApp((s) => s.foodLog)
  const [q, setQ] = useState('')
  const [off, setOff] = useState<FoodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const reqId = useRef(0)

  const recent = useMemo(() => recentFoods(log), [log])
  const local = useMemo(() => searchLocal(q), [q])

  useEffect(() => {
    ++reqId.current
    setOff([])
    setErr(null)
    setLoading(false)
  }, [q])

  const searchOnline = async () => {
    const query = q.trim()
    if (query.length < 2 || loading) return
    const id = ++reqId.current
    setLoading(true)
    setErr(null)
      try {
        const res = await searchOff(query)
        if (id === reqId.current) setOff(res)
      } catch (e) {
        if (id === reqId.current) setErr((e as Error).message || 'Open Food Facts не ответил. Проверь интернет.')
      } finally {
        if (id === reqId.current) setLoading(false)
      }
  }

  useEffect(() => () => { ++reqId.current }, [])

  const recentMatches = q.trim() ? recent.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())) : recent

  return (
    <div className="px-5 pb-6">
      <form className="relative" onSubmit={(e) => { e.preventDefault(); void searchOnline() }}>
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Гречка, творог, Chudo…" className="pl-11" />
      </form>
      <div className="text-[12px] text-faint mt-1.5 px-1">ккал на 100 г · Б/Ж/У в граммах</div>

      {recentMatches.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            <Clock size={14} /> Недавние
          </div>
          {recentMatches.slice(0, q ? 5 : 15).map((f, i) => (
            <FoodRow key={`r${i}`} food={f} onClick={() => onPick(f)} />
          ))}
        </div>
      )}

      {local.length > 0 && (
        <div className="mt-5">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Базовые продукты</div>
          {local.map((f) => (
            <FoodRow key={f.name} food={f} onClick={() => onPick(f)} />
          ))}
        </div>
      )}

      {q.trim().length >= 2 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            Open Food Facts {loading && <Spinner size={14} />}
          </div>
          <Button variant="secondary" className="w-full mt-2" disabled={loading} onClick={() => void searchOnline()}>
            <Search size={17} /> {loading ? 'Ищу продукты…' : 'Найти в открытой базе'}
          </Button>
          {err && <div className="text-danger text-[14px] mt-2">{err}</div>}
          {!loading && !err && off.length === 0 && <div className="text-muted text-[13px] mt-2">Для упакованных продуктов нажми поиск. Базовые продукты и недавние доступны офлайн.</div>}
          {off.map((f, i) => (
            <FoodRow key={`${f.barcode}-${i}`} food={f} onClick={() => onPick(f)} />
          ))}
        </div>
      )}
    </div>
  )
}

function BarcodeTab({ onPick }: { onPick: (f: FoodItem) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [notFound, setNotFound] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void scannerAvailable().then(setLive)
  }, [])

  const find = async (value: string) => {
    const c = value.replace(/\D/g, '')
    if (![8, 12, 13, 14].includes(c.length)) return setMsg('Введи 8, 12, 13 или 14 цифр штрихкода')
    setCode(c)
    setBusy(true)
    setMsg(null)
    setNotFound(null)
    try {
      const f = await lookupBarcode(c)
      if (f) onPick(f)
      else setNotFound(c)
    } catch {
      setMsg('Open Food Facts не ответил. Проверь интернет.')
    } finally {
      setBusy(false)
    }
  }

  const scanLive = async () => {
    setMsg(null)
    setBusy(true)
    try {
      const c = await scanBarcodeLive()
      if (c) await find(c)
    } catch (e) {
      setMsg((e as Error).message || 'Сканер недоступен')
    } finally {
      setBusy(false)
    }
  }

  const fromPhoto = async (file?: File) => {
    if (!file) return
    setMsg(null)
    setBusy(true)
    try {
      const { base64 } = await fileToJpegBase64(file, 2000, 0.92)
      const codes = await detectBarcode(base64)
      if (codes.length) await find(codes[0])
      else setMsg('Штрихкод на фото не найден — попробуй ближе и ровнее')
    } catch (e) {
      setMsg((e as Error).message || 'Не удалось прочитать фото')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-5 pb-6">
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void fromPhoto(e.target.files?.[0]); e.target.value = '' }} />
      {live && (
        <Button className="w-full h-14" onClick={scanLive} disabled={busy}>
          <ScanLine size={20} /> Сканировать камерой
        </Button>
      )}
      <Button variant="secondary" className="w-full mt-2" onClick={() => photoRef.current?.click()} disabled={busy}>
        <Image size={18} /> Штрихкод с фото
      </Button>

      <div className="text-[13px] text-muted mt-6 mb-2">Или введи цифры под штрихкодом</div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void find(code)
        }}
      >
        <TextInput aria-label="Штрихкод" disabled={busy} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="4600000000000" className="tnum flex-1" />
        <Button type="submit" className="w-24" disabled={busy}>
          {busy ? <Spinner /> : 'Найти'}
        </Button>
      </form>
      {msg && <div className="text-danger text-[14px] mt-3">{msg}</div>}
      {notFound && (
        <div className="bg-surface rounded-2xl p-4 mt-4 text-[14px] text-muted">
          Для товара с кодом <span className="tnum text-text">{notFound}</span> нет полных данных о КБЖУ в Open Food Facts. Перепиши значения с упаковки во вкладке «Своё» —
          потом продукт будет в «Недавних».
        </div>
      )}
      <p className="text-[12px] text-faint mt-6">Данные: Open Food Facts — открытая база продуктов, в т.ч. российских. Значения на 100 г.</p>
    </div>
  )
}

function ManualTab({ onPick }: { onPick: (f: FoodItem) => void }) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState(0)
  const [protein, setProtein] = useState(0)
  const [fat, setFat] = useState(0)
  const [carbs, setCarbs] = useState(0)
  const auto = Math.round(protein * 4 + fat * 9 + carbs * 4)
  const food: FoodItem = { name: name.trim(), kcal: kcal || auto, protein, fat, carbs, source: 'manual' }
  let error: string | null = null
  try { validateFood(food) } catch (e) { error = (e as Error).message }
  return (
    <div className="px-5 pb-6 space-y-4">
      <Field label="Название">
        <TextInput maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, домашний суп" />
      </Field>
      <div className="text-[13px] text-muted">На 100 г продукта</div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { l: 'Белки, г', v: protein, s: setProtein },
          { l: 'Жиры, г', v: fat, s: setFat },
          { l: 'Углеводы, г', v: carbs, s: setCarbs },
          { l: 'Ккал', v: kcal, s: setKcal },
        ].map((x) => (
          <Field key={x.l} label={x.l}>
            <NumberField ariaLabel={x.l} max={x.l === 'Ккал' ? 1200 : 100} value={x.v} onChange={x.s} className="w-full h-12 text-[18px] font-semibold" />
          </Field>
        ))}
      </div>
      {!kcal && auto > 0 && <div className="text-[13px] text-faint">Калорийность посчитается по БЖУ: {auto} ккал</div>}
      {error && name.trim() && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <Button
        className="w-full"
        disabled={!!error}
        onClick={() => onPick(food)}
      >
        Дальше — указать граммы
      </Button>
    </div>
  )
}
