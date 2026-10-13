import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImagePlus, Sparkles, Cpu, RefreshCw } from 'lucide-react'
import { visionLabelToFood, type VisionFood } from '../data/visionFoods'
import { classifyFood, visionAvailable } from '../lib/bodyVision'
import { aiProviders, recognizeFood, type RecognizedFood } from '../lib/foodAI'
import { fileToJpegBase64 } from '../lib/image'
import { getAIKey, getCloudflareAccount } from '../lib/secrets'
import type { FoodItem } from '../lib/types'
import { fmt, macrosFor, sumMacros } from '../lib/utils'
import { useApp } from '../store/app'
import { Button, cx, MacroLine, NumberField, Spinner, TextInput } from './ui'

type Candidate = VisionFood & { confidence: number }

const dishLabels = new Set([
  'pizza', 'hamburger', 'sandwich', 'salad', 'sushi', 'soup', 'pasta', 'spaghetti', 'ramen', 'burrito', 'taco',
  'curry', 'paella', 'risotto', 'biryani', 'stir_fry', 'dumpling', 'pierogi', 'shawarma', 'kebab', 'hotdog',
  'omelet', 'pancake', 'waffle', 'cake', 'cheesecake', 'casserole', 'quesadilla', 'nachos', 'steak', 'oatmeal',
])

export function PhotoTab({
  onPick,
  onAddMany,
  goToProfile,
}: {
  onPick: (food: FoodItem) => void
  onAddMany: (items: { food: FoodItem; grams: number }[]) => void
  goToProfile: () => void
}) {
  const provider = useApp((s) => s.settings.aiProvider)
  const [image, setImage] = useState<{ base64: string; dataUrl: string } | null>(null)
  const [vision, setVision] = useState<Candidate[] | null>(null)
  const [visionErr, setVisionErr] = useState<string | null>(null)
  const [visionBusy, setVisionBusy] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [hint, setHint] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudErr, setCloudErr] = useState<string | null>(null)
  const [cloud, setCloud] = useState<{ items: (RecognizedFood & { on: boolean })[]; note: string } | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [imageBusy, setImageBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setApiKey('')
    setAccountId('')
    setCloud(null)
    void Promise.all([getAIKey(provider), provider === 'cloudflare' ? getCloudflareAccount() : Promise.resolve('')]).then(([key, account]) => {
      if (!cancelled) { setApiKey(key); setAccountId(account) }
    }).catch(() => { if (!cancelled) setCloudErr('Не удалось прочитать ключ. Сохрани его снова в профиле.') })
    return () => { cancelled = true; ++generation.current }
  }, [provider])

  const onFile = async (file?: File) => {
    if (!file) return
    const id = ++generation.current
    setImageBusy(true)
    setVision(null)
    setVisionErr(null)
    setCloud(null)
    setCloudErr(null)
    try {
      const img = await fileToJpegBase64(file)
      if (id !== generation.current) return
      setImage(img)
      if (visionAvailable) {
        setVisionBusy(true)
        try {
          const labels = await classifyFood(img.base64)
          if (id !== generation.current) return
          const out: Candidate[] = []
          const seenNames = new Set<string>()
          for (const l of labels) {
            const vf = visionLabelToFood(l.id)
            if (!vf || seenNames.has(vf.food.name)) continue
            seenNames.add(vf.food.name)
            out.push({ ...vf, confidence: l.confidence })
          }
          // Метки иерархические: «food», «meat» и «hamburger» приходят с одной уверенностью.
          // Готовые блюда поднимаем, категории опускаем.
          const rank = (c: Candidate) => c.confidence * (c.generic ? 0.6 : dishLabels.has(c.label) ? 2 : 1)
          out.sort((a, b) => rank(b) - rank(a))
          setVision(out.filter((c) => c.confidence >= 0.03).slice(0, 6))
        } catch (e) {
          if (id === generation.current) setVisionErr((e as Error).message || 'Не удалось распознать')
        } finally {
          if (id === generation.current) setVisionBusy(false)
        }
      }
    } catch (e) {
      if (id === generation.current) setVisionErr((e as Error).message || 'Не удалось открыть фото')
    } finally {
      if (id === generation.current) setImageBusy(false)
    }
  }

  const runCloud = async () => {
    if (!image) return
    const id = generation.current
    setCloudBusy(true)
    setCloudErr(null)
    try {
      const res = await recognizeFood({ apiKey, provider, accountId, imageBase64: image.base64, hint: hint.trim() || undefined })
      if (id === generation.current) setCloud({ note: res.note, items: res.items.map((i) => ({ ...i, on: true })) })
    } catch (e) {
      if (id === generation.current) setCloudErr((e as Error).message)
    } finally {
      if (id === generation.current) setCloudBusy(false)
    }
  }

  const chosen = cloud?.items.filter((i) => i.on && i.grams > 0) ?? []
  const chosenTotal = sumMacros(chosen.map((i) => macrosFor(i, i.grams)))
  const service = aiProviders.find((p) => p.id === provider)!
  const modelLabel = `${service.model} · ${service.label}`
  const configured = !!apiKey && (provider !== 'cloudflare' || /^[a-f0-9]{32}$/i.test(accountId))

  return (
    <div className="px-5 pb-6">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />

      {imageBusy && <div role="status" className="flex items-center gap-2 text-muted mb-3"><Spinner /> Подготавливаю фото…</div>}
      {!image && visionErr && <p role="alert" className="text-danger text-[14px] mb-3">{visionErr}</p>}
      {!image ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={imageBusy} onClick={() => cameraRef.current?.click()} className="pressable bg-surface rounded-[20px] p-5 flex flex-col items-center gap-2">
              <Camera size={28} className="text-accent" />
              <span className="font-semibold">Снять фото</span>
            </button>
            <button disabled={imageBusy} onClick={() => galleryRef.current?.click()} className="pressable bg-surface rounded-[20px] p-5 flex flex-col items-center gap-2">
              <ImagePlus size={28} className="text-accent" />
              <span className="font-semibold">Из галереи</span>
            </button>
          </div>
          <div className="mt-4 space-y-2 text-[14px] text-muted">
            <div className="flex gap-3 bg-surface/60 rounded-2xl p-3.5">
              <Cpu size={18} className="shrink-0 mt-0.5 text-text" />
              <div>
                <span className="text-text font-medium">На устройстве</span> — встроенная в iOS модель Apple Vision. Бесплатно, без интернета;
                предлагает похожие продукты; массу порции выбираешь сам.
              </div>
            </div>
            <div className="flex gap-3 bg-surface/60 rounded-2xl p-3.5">
              <Sparkles size={18} className="shrink-0 mt-0.5 text-text" />
              <div>
                <span className="text-text font-medium">Облачный анализ</span> — {modelLabel} оценивает состав, порции и КБЖУ. У сервиса есть бесплатный тариф с лимитами.
                {!configured && (
                  <>
                    {' '}
                    Нужен API-ключ —{' '}
                    <button className="text-accent" onClick={goToProfile}>
                      добавить в профиле
                    </button>
                    .
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="relative">
            <img src={image.dataUrl} alt="Фото еды" className="w-full max-h-[240px] object-cover rounded-[20px]" />
            <button
              disabled={cloudBusy || visionBusy || imageBusy}
              onClick={() => galleryRef.current?.click()}
              className="pressable absolute right-3 bottom-3 h-9 px-3 rounded-full bg-black/60 backdrop-blur text-[14px] font-medium flex items-center gap-1.5"
            >
              <RefreshCw size={15} /> Другое фото
            </button>
          </div>

          {/* На устройстве */}
          <div className="mt-5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            <Cpu size={15} /> На устройстве
          </div>
          {!visionAvailable && <div className="text-[14px] text-faint mt-2">Доступно на iPhone. В браузере используй облачный анализ, поиск или ручной ввод.</div>}
          {visionBusy && (
            <div className="flex items-center gap-2 text-muted mt-3">
              <Spinner /> Распознаю…
            </div>
          )}
          {visionErr && <div className="text-danger text-[14px] mt-2">{visionErr}</div>}
          {vision && vision.length === 0 && <div className="text-[14px] text-faint mt-2">Еды на фото не нашлось. Попробуй облачный анализ или поиск.</div>}
          {vision && vision.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {vision.map((c) => (
                <button
                  key={c.label}
                  onClick={() => onPick(c.food)}
                  className="pressable w-full bg-surface rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.food.name}</div>
                    <div className="tnum text-[13px] text-muted">
                      {fmt(c.food.kcal)} ккал / 100 г · порция ~{c.food.portion} г
                    </div>
                  </div>
                  <div className="tnum text-[13px] font-semibold text-accent">{Math.round(c.confidence * 100)}%</div>
                </button>
              ))}
            </div>
          )}

          {/* Cloud */}
          <div className="mt-6 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            <Sparkles size={15} /> Облачный анализ · {modelLabel}
          </div>
          {!configured ? (
            <div className="bg-surface rounded-2xl p-4 mt-2 text-[14px] text-muted">
              Добавь ключ {service.label}{provider === 'cloudflare' ? ' и Account ID' : ''}, чтобы модель оценивала граммовку и КБЖУ каждого компонента.
              <Button variant="secondary" className="w-full mt-3 h-11" onClick={goToProfile}>
                Открыть настройки
              </Button>
            </div>
          ) : !cloud ? (
            <div className="mt-2">
              <TextInput value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Уточнение (необязательно): «плов, тарелка 300 г»" />
              <Button className="w-full mt-2" onClick={runCloud} disabled={cloudBusy || visionBusy || imageBusy}>
                {cloudBusy ? (
                  <>
                    <Spinner /> Анализирую фото…
                  </>
                ) : (
                  <>
                    <Sparkles size={18} /> Посчитать КБЖУ по фото
                  </>
                )}
              </Button>
              {cloudErr && <div className="text-danger text-[14px] mt-2">{cloudErr}</div>}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-[13px] text-muted mb-3">Это оценка по фото. Проверь состав и поправь граммы; масло и скрытые ингредиенты могут быть не учтены.</p>
              {cloud.items.length === 0 && <div className="text-[14px] text-muted">{cloud.note}</div>}
              <div className="space-y-1.5">
                {cloud.items.map((it, idx) => {
                  const m = macrosFor(it, it.grams)
                  return (
                    <div key={idx} className={cx('bg-surface rounded-2xl p-3 flex items-center gap-3', !it.on && 'opacity-50')}>
                      <button
                        aria-label="Выбрать"
                        onClick={() => setCloud((c) => c && { ...c, items: c.items.map((x, j) => (j === idx ? { ...x, on: !x.on } : x)) })}
                        className={cx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', it.on ? 'bg-accent text-accent-ink' : 'bg-surface-2')}
                      >
                        {it.on && <Check size={18} strokeWidth={3} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium leading-snug">
                          {it.name}
                          {it.confidence === 'low' && <span className="text-fat text-[12px] font-normal"> · не уверен</span>}
                        </div>
                        <MacroLine kcal={m.kcal} protein={m.protein} fat={m.fat} carbs={m.carbs} className="text-[12px] gap-2 mt-0.5" />
                      </div>
                      <div className="flex items-center gap-1">
                        <NumberField
                          value={it.grams}
                          ariaLabel="Граммы"
                          max={10000}
                          onChange={(v) => setCloud((c) => c && { ...c, items: c.items.map((x, j) => (j === idx ? { ...x, grams: v } : x)) })}
                          className="w-16 h-10 font-semibold"
                        />
                        <span className="text-muted text-[13px]">г</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {cloud.items.length > 0 && cloud.note && <div className="text-[13px] text-faint mt-2">{cloud.note}</div>}
              {chosen.length > 0 && (
                <Button className="w-full mt-3" onClick={() => onAddMany(chosen.map(({ on: _on, grams, confidence: _c, ...food }) => ({ food, grams })))}>
                  Добавить ({chosen.length}) · {fmt(chosenTotal.kcal)} ккал
                </Button>
              )}
              <button className="w-full text-center text-[14px] text-muted mt-3" onClick={() => setCloud(null)}>
                Пересчитать
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
