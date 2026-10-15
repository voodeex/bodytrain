import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, KeyRound, Upload } from 'lucide-react'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { AccountSection } from '../components/Account'
import { Button, Card, cx, Field, NumberField, ScreenHeader, SectionTitle, Segmented, Sheet, TextInput } from '../components/ui'
import { aiProviders, checkAIKey } from '../lib/foodAI'
import { isNative } from '../lib/http'
import { activityLabels, bmr, goalLabels, targetsFor, tdee } from '../lib/nutrition'
import { getAIKey, setAIKey, getCloudflareAccount, setCloudflareAccount } from '../lib/secrets'
import { flushStorage } from '../lib/storage'
import { parseBackup } from '../lib/validation'
import type { Activity, AIProvider, Goal } from '../lib/types'
import { dayKey, fmt } from '../lib/utils'
import { useApp, type AppData } from '../store/app'

export function ProfileScreen() {
  return (
    <div className="pb-10">
      <ScreenHeader title="Профиль" />
      <AccountSection />
      <BodyParams />
      <Targets />
      <AiSettings />
      <TrainingSettings />
      <DataSection />
      <p className="text-center text-[12px] text-faint mt-8 px-8">
        BodyTrain 0.3.0 · дневник на устройстве, после входа — синхронизируется с аккаунтом · фото отправляется выбранному сервису только при запуске облачного анализа
      </p>
    </div>
  )
}

function BodyParams() {
  const p = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  return (
    <>
      <SectionTitle>Параметры</SectionTitle>
      <Card className="mx-5 p-4 space-y-4">
        <Segmented
          value={p.sex}
          onChange={(sex) => setProfile({ sex })}
          options={[
            { value: 'male', label: 'Мужчина' },
            { value: 'female', label: 'Женщина' },
          ]}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Возраст">
            <NumberField ariaLabel="Возраст" min={14} max={100} decimal={false} value={p.age} onChange={(age) => age > 0 && setProfile({ age })} className="w-full h-12 text-[18px] font-semibold" />
          </Field>
          <Field label="Рост, см">
            <NumberField ariaLabel="Рост" min={100} max={250} decimal={false} value={p.height} onChange={(height) => height > 0 && setProfile({ height })} className="w-full h-12 text-[18px] font-semibold" />
          </Field>
          <Field label="Вес, кг">
            <NumberField ariaLabel="Вес тела" min={20} max={400} value={p.weight} onChange={(weight) => weight > 0 && setProfile({ weight })} className="w-full h-12 text-[18px] font-semibold" />
          </Field>
        </div>
        <div>
          <div className="text-[13px] text-muted mb-1.5">Активность</div>
          <div className="space-y-1">
            {(Object.keys(activityLabels) as Activity[]).map((a) => (
              <button
                key={a}
                onClick={() => setProfile({ activity: a })}
                className={cx(
                  'w-full text-left px-3.5 h-11 rounded-xl text-[15px] flex items-center justify-between',
                  p.activity === a ? 'bg-surface-2 text-text' : 'text-muted',
                )}
              >
                {activityLabels[a]}
                {p.activity === a && <span className="w-2 h-2 rounded-full bg-accent" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[13px] text-muted mb-1.5">Цель</div>
          <Segmented value={p.goal} onChange={(goal: Goal) => setProfile({ goal })} options={(Object.keys(goalLabels) as Goal[]).map((g) => ({ value: g, label: goalLabels[g] }))} />
        </div>
      </Card>
    </>
  )
}

function Targets() {
  const p = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  const t = targetsFor(p)
  const manual = !!p.manualTargets
  return (
    <>
      <SectionTitle
        right={
          <button
            className="text-accent text-[14px] font-medium"
            onClick={() => setProfile({ manualTargets: manual ? undefined : t })}
          >
            {manual ? 'Рассчитать' : 'Задать вручную'}
          </button>
        }
      >
        Норма в день
      </SectionTitle>
      <Card className="mx-5 p-4">
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ['kcal', 'ккал', 'text-accent'],
              ['protein', 'белки', 'text-protein'],
              ['fat', 'жиры', 'text-fat'],
              ['carbs', 'углев.', 'text-carbs'],
            ] as const
          ).map(([k, l, c]) => (
            <div key={k} className="text-center">
              {manual ? (
                <NumberField
                  ariaLabel={l}
                  min={k === 'kcal' ? 1 : 0}
                  max={k === 'kcal' ? 20000 : 3000}
                  decimal={false}
                  value={t[k]}
                  onChange={(v) => setProfile({ manualTargets: { ...t, [k]: v } })}
                  className={cx('w-full h-11 text-[17px] font-bold', c)}
                />
              ) : (
                <div className={cx('tnum text-[20px] font-bold', c)}>{fmt(t[k])}</div>
              )}
              <div className="text-[12px] text-muted mt-1">{l}</div>
            </div>
          ))}
        </div>
        {!manual && (
          <div className="tnum text-[12px] text-faint mt-3 leading-relaxed">
            Базовый обмен {fmt(bmr(p))} ккал (Миффлин — Сан Жеор) × активность = {fmt(tdee(p))} ккал
            {p.goal === 'lose' ? ', −15% на похудение' : p.goal === 'gain' ? ', +10% на набор' : ''}. Белок {p.goal === 'keep' ? '1,8' : '2'} г/кг,
            жиры ~0,9 г/кг.
            {p.nutritionAdjustment && <span className="block mt-1 text-protein">Поправка по весу: {p.nutritionAdjustment.kcalOffset > 0 ? '+' : ''}{fmt(p.nutritionAdjustment.kcalOffset)} ккал. Управление — в разделе «Прогресс».</span>}
          </div>
        )}
      </Card>
    </>
  )
}

function AiSettings() {
  const provider = useApp((s) => s.settings.aiProvider)
  const setSettings = useApp((s) => s.setSettings)
  return (
    <>
      <SectionTitle>Распознавание еды</SectionTitle>
      <Card className="mx-5 p-4 space-y-4">
        <p className="text-[14px] text-muted leading-relaxed">На iPhone Apple Vision работает без ключа и интернета. Для оценки состава и порций по фото выбери облачный сервис с бесплатным тарифом — дневные лимиты у них разные и указаны под выбором.</p>
        <Segmented value={provider} onChange={(aiProvider: AIProvider) => setSettings({ aiProvider })} options={aiProviders.map((p) => ({ value: p.id, label: p.label }))} />
        <ProviderSettings key={provider} provider={provider} />
        <p className="text-[12px] text-muted">Ключи хранятся в Keychain на iPhone и не входят в резервную копию. Фото и уточнение отправляются только по кнопке анализа; профиль и дневник остаются на устройстве. Используй Free план. Доступ зависит от сервиса и аккаунта.</p>
      </Card>
    </>
  )
}

const providerNotes: Record<AIProvider, string> = {
  groq: 'Free план: до 1000 запросов в день, также действуют лимиты токенов и частоты. Точные лимиты — в консоли Groq.',
  openrouter: 'Бесплатные модели: 20 запросов в минуту и 50 в день, после пополнения счёта от $10 — 1000 в день. Модель для фото подбирается из каталога бесплатных автоматически.',
  cloudflare: 'Workers Free: 10 000 нейронов в день. В Workers AI нажми Use REST API → Create a Workers AI API Token; скопируй токен и Account ID.',
}
const keyPlaceholders: Record<AIProvider, string> = { groq: 'gsk_…', openrouter: 'sk-or-v1-…', cloudflare: 'Workers AI API Token' }

function ProviderSettings({ provider }: { provider: AIProvider }) {
  const service = aiProviders.find((p) => p.id === provider)!
  const [key, setKey] = useState('')
  const [account, setAccount] = useState('')
  const [saved, setSaved] = useState({ key: '', account: '' })
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    void Promise.all([getAIKey(provider), provider === 'cloudflare' ? getCloudflareAccount() : Promise.resolve('')]).then(([key, account]) => {
      if (!cancelled) { setKey(key); setAccount(account); setSaved({ key, account }); setLoaded(true) }
    }).catch(() => { if (!cancelled) { setMessage('Не удалось прочитать ключ. Открой профиль снова.'); setLoaded(true) } })
    return () => { cancelled = true }
  }, [provider])
  const dirty = key.trim() !== saved.key || account.trim() !== saved.account
  const accountValid = provider !== 'cloudflare' || /^[a-f0-9]{32}$/i.test(account.trim())
  return (
    <>
      <div className="rounded-2xl bg-surface-2 p-3.5">
        <div className="font-semibold">{service.model}</div>
        <p className="text-[13px] text-muted mt-1">{service.hint}</p>
        <p className="text-[12px] text-muted mt-2">{providerNotes[provider]}</p>
      </div>
      <Field label={`API-ключ ${service.label}`} hint={<a href={service.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">Получить свой ключ <ExternalLink size={12} /></a>}>
        <div className="relative">
          <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <TextInput aria-label={`API-ключ ${service.label}`} type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={!loaded || busy} value={key} onChange={(e) => setKey(e.target.value)} placeholder={keyPlaceholders[provider]} className="pl-10 bg-surface-2" />
        </div>
      </Field>
      {provider === 'cloudflare' && <Field label="Account ID"><TextInput aria-label="Account ID" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={32} disabled={!loaded || busy} value={account} onChange={(e) => setAccount(e.target.value.trim())} placeholder="32 символа из панели Cloudflare" className="bg-surface-2" /></Field>}
      {provider === 'cloudflare' && account && !accountValid && <p className="text-[13px] text-danger">Account ID должен содержать 32 шестнадцатеричных символа.</p>}
      <div className="flex gap-2">
        {dirty && <Button className="flex-1" disabled={busy || !loaded || (!!key.trim() && !accountValid)} onClick={async () => {
          setBusy(true)
          try {
            await setAIKey(key, provider)
            if (provider === 'cloudflare') await setCloudflareAccount(account)
            setSaved({ key: key.trim(), account: account.trim() })
            setMessage(key.trim() ? 'Ключ сохранён' : 'Ключ удалён')
          } catch { setMessage('Не удалось сохранить настройки. Попробуй ещё раз.') }
          finally { setBusy(false) }
        }}>Сохранить</Button>}
        <Button variant="secondary" className="flex-1" disabled={!loaded || busy || !key.trim() || !accountValid} onClick={async () => {
          setBusy(true)
          setMessage('Проверяю ключ…')
          try { setMessage(await checkAIKey({ provider, apiKey: key, accountId: account })) }
          catch (e) { setMessage((e as Error).message) }
          finally { setBusy(false) }
        }}>Проверить ключ</Button>
      </div>
      {message && <p role="status" className="text-[13px] text-muted">{message}</p>}
    </>
  )
}

function TrainingSettings() {
  const rest = useApp((s) => s.settings.restSeconds)
  const setSettings = useApp((s) => s.setSettings)
  return (
    <>
      <SectionTitle>Тренировки</SectionTitle>
      <Card className="mx-5 p-4">
        <div className="text-[13px] text-muted mb-2">Таймер отдыха после подхода</div>
        <div className="grid grid-cols-5 gap-1.5">
          {[45, 60, 90, 120, 180].map((s) => (
            <button
              key={s}
              onClick={() => setSettings({ restSeconds: s })}
              className={cx('tnum h-10 rounded-xl text-[15px] font-medium', rest === s ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted')}
            >
              {s < 60 ? `${s}с` : `${Math.floor(s / 60)}${s % 60 ? ',5' : ''}м`}
            </button>
          ))}
        </div>
      </Card>
    </>
  )
}

function DataSection() {
  const importData = useApp((s) => s.importData)
  const resetAll = useApp((s) => s.resetAll)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [exportJson, setExportJson] = useState<string | null>(null)

  const exportData = async () => {
    try {
      const s = useApp.getState()
      const data: AppData & { app: string; schemaVersion: number; exportedAt: string } = {
        app: 'BodyTrain',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        exercises: s.exercises,
        workouts: s.workouts,
        activeWorkout: s.activeWorkout,
        foodLog: s.foodLog,
        bodyWeight: s.bodyWeight,
        profile: s.profile,
        settings: s.settings,
      }
      const json = JSON.stringify(data, null, 2)
      const name = `BodyTrain-${dayKey()}.json`
      if (isNative) {
        await Filesystem.writeFile({ path: name, data: json, directory: Directory.Documents, encoding: Encoding.UTF8 })
        setMsg(`Сохранено: Файлы → На iPhone → BodyTrain → ${name}`)
      } else {
        setExportJson(json)
        setMsg('Резервная копия подготовлена')
      }
    } catch { setMsg('Не удалось сохранить копию. Проверь свободное место.') }
  }

  const onImport = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Копия слишком большая (максимум 25 МБ)')
      const data = parseBackup(JSON.parse(await file.text()))
      if (!confirm('Заменить все текущие данные данными из файла?')) return
      importData(data)
      await flushStorage()
      setMsg('Данные восстановлены')
    } catch (e) {
      setMsg((e as Error).message || 'Не удалось прочитать файл')
    }
  }

  return (
    <>
      <SectionTitle>Данные</SectionTitle>
      <Card className="mx-5 p-4 space-y-2">
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = '' }} />
        <Button variant="secondary" className="w-full" onClick={() => void exportData()}>
          <Download size={18} /> Экспорт в JSON
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
          <Upload size={18} /> Импорт из JSON
        </Button>
        {msg && <div className="text-[13px] text-muted pt-1">{msg}</div>}
        <button
          onClick={() => {
            if (confirm('Удалить все тренировки, дневник питания и настройки?') && confirm('Точно? Это нельзя отменить.')) resetAll()
          }}
          className="w-full text-center text-danger text-[15px] pt-3"
        >
          Сбросить все данные
        </button>
      </Card>
      <Sheet open={exportJson !== null} onClose={() => setExportJson(null)} title="Резервная копия">
        <div className="px-5 pb-6 space-y-3">
          <p className="text-[14px] text-muted">Сохрани файл или скопируй данные. Для восстановления используй импорт JSON.</p>
          <Button className="w-full" onClick={() => {
            if (!exportJson) return
            const a = document.createElement('a')
            const url = URL.createObjectURL(new Blob([exportJson], { type: 'application/json' }))
            a.href = url
            a.download = `BodyTrain-${dayKey()}.json`
            document.body.append(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }}><Download size={18} /> Скачать файл</Button>
          <Button variant="secondary" className="w-full" onClick={async () => {
            try { await navigator.clipboard.writeText(exportJson ?? ''); setMsg('Резервная копия скопирована') }
            catch { setMsg('Выдели текст ниже и скопируй его вручную') }
          }}>Копировать данные</Button>
          <textarea aria-label="JSON резервной копии" readOnly value={exportJson ?? ''} className="w-full h-48 rounded-2xl bg-surface p-3 text-[13px] font-mono outline-none" onFocus={(e) => e.currentTarget.select()} />
          {msg && <p role="status" className="text-[13px] text-muted">{msg}</p>}
        </div>
      </Sheet>
    </>
  )
}
