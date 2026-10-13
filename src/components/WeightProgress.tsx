import { useMemo, useState } from 'react'
import { Scale, Sparkles, Trash2 } from 'lucide-react'
import { LineChart } from './charts'
import { Button, Card, cx, NumberField, SectionTitle } from './ui'
import { goalLabels } from '../lib/nutrition'
import { compareWeight, nutritionAdvice, weightDay, weightPeriods, type WeightPeriod } from '../lib/weightTrend'
import { dayKey, fmt, parseDayKey } from '../lib/utils'
import { useApp } from '../store/app'
import type { BodyWeightEntry } from '../lib/types'

const dateLabel = (key: string) => parseDayKey(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
const chartDate = (key: string) => parseDayKey(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const signed = (n: number, digits = 1) => {
  const rounded = Number(n.toFixed(digits))
  return `${rounded > 0 ? '+' : ''}${fmt(rounded, digits)}`
}

export function WeightProgress() {
  const entries = useApp((s) => s.bodyWeight)
  const profile = useApp((s) => s.profile)
  const { logBodyWeight, removeBodyWeight } = useApp.getState()
  const today = dayKey()
  const [period, setPeriod] = useState<WeightPeriod>('month')
  const [date, setDate] = useState(today)
  const [kg, setKg] = useState(0)
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(0)
  const [deleted, setDeleted] = useState<BodyWeightEntry | null>(null)
  const comparisons = useMemo(() => weightPeriods.map((p) => ({ ...p, ...compareWeight(entries, p.id, today) })), [entries, today])
  const selected = comparisons.find((p) => p.id === period)!
  const last = entries.filter((e) => e.date <= today).at(-1)
  const existing = entries.find((e) => e.date === date)
  const history = [...entries].reverse()

  return <>
    <SectionTitle>Вес тела</SectionTitle>
    <Card className="mx-5 p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[13px] text-muted">Последнее взвешивание</div>
          <div className="tnum text-[30px] font-bold leading-tight">{last ? fmt(last.kg, 1) : '—'} <span className="text-[16px] text-muted font-medium">кг</span></div>
          <div className="text-[12px] text-faint mt-1">{last ? dateLabel(last.date) : 'Добавь первую запись ниже'}</div>
        </div>
        <div className="p-3 rounded-2xl bg-protein/10 text-protein"><Scale size={24} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2" aria-label="Изменение веса по периодам">
        {comparisons.map((p) => <button key={p.id} aria-pressed={period === p.id} aria-label={`Вес: ${p.label}`} onClick={() => setPeriod(p.id)}
          className={cx('min-w-0 text-left p-2.5 rounded-xl border', period === p.id ? 'border-protein/50 bg-protein/10' : 'border-line bg-surface-2/50')}>
          <div className="text-[12px] text-muted">{p.label}</div>
          <div className="tnum text-[17px] font-semibold mt-1">{p.delta === undefined ? '—' : signed(p.delta)} <span className="text-[11px] font-normal text-muted">кг</span></div>
          <div className="tnum text-[11px] text-faint mt-1">{p.delta === undefined ? 'Нет сравнения' : `${signed(p.percent!)}%`}</div>
        </button>)}
      </div>
      <div className="text-[12px] text-muted mt-3 leading-relaxed" aria-live="polite">
        {selected.delta !== undefined ? <>
          {!selected.complete && <span className="text-fat">{selected.stale ? 'Нет свежего веса' : 'Неполный период'} · </span>}
          {dateLabel(selected.first!.date)} — {dateLabel(selected.last!.date)} · {selected.days} дн.
        </> : 'Для сравнения нужны два взвешивания около начала и конца периода.'}
      </div>
      {selected.points.length > 0 && <div className="mt-1" aria-label="График веса">
        <LineChart points={selected.points.map((e) => ({ label: chartDate(e.date), value: e.kg, time: weightDay(e.date) }))} unit=" кг" color="var(--color-protein)" />
        <p className="text-[11px] text-faint">Каждая точка — записанное взвешивание</p>
      </div>}
      <form className="mt-4 pt-4 border-t border-line" onSubmit={(e) => {
        e.preventDefault()
        try { logBodyWeight(kg, date); setKg(0); setMessage(`Сохранено: ${fmt(kg, 1)} кг · ${dateLabel(date)}`) }
        catch (error) { setMessage((error as Error).message) }
      }}>
        <div className="flex gap-3 items-end">
          <label className="flex-1 min-w-0 text-[12px] text-muted">Дата
            <input type="date" aria-label="Дата взвешивания" min="1900-01-01" max={today} value={date} onChange={(e) => {
              setDate(e.target.value); setKg(entries.find((x) => x.date === e.target.value)?.kg ?? 0); setMessage('')
            }} className="block w-full min-w-0 mt-1.5 h-12 rounded-xl bg-surface-2 px-2 text-text text-[14px] outline-none focus:ring-2 focus:ring-accent/50" />
          </label>
          <label className="w-28 shrink-0 text-[12px] text-muted">Вес, кг
            <NumberField min={20} max={400} value={kg} onChange={setKg} placeholder={fmt(existing?.kg ?? last?.kg ?? profile.weight, 1)} className="w-full h-12 mt-1.5 text-[20px] font-semibold" ariaLabel="Вес, кг" />
          </label>
        </div>
        <Button type="submit" className="w-full mt-3" disabled={!date || date > today || kg < 20 || kg > 400}>
          {existing ? 'Обновить вес' : 'Записать вес'}
        </Button>
        {message && <p role="status" className="text-[12px] text-muted mt-2">{message}</p>}
        {deleted && <button type="button" onClick={() => { logBodyWeight(deleted.kg, deleted.date); setDeleted(null); setMessage('Запись восстановлена') }} className="text-protein text-[13px] mt-2">Восстановить удалённую запись</button>}
      </form>
      {history.length > 0 && <div className="mt-4">
        <button aria-expanded={visible > 0} onClick={() => setVisible(visible > 0 ? 0 : 5)} className="text-[13px] text-protein py-1 mb-1">{visible > 0 ? 'Скрыть историю' : `История взвешиваний (${history.length})`}</button>
        {visible > 0 && <div className="text-[12px] text-faint mb-1">Нажми на запись, чтобы исправить</div>}
        {history.slice(0, visible).map((e) => <div key={e.date} className="tnum flex items-center border-t border-line/60 text-[14px]">
          <button className="flex-1 min-w-0 flex items-center justify-between gap-2 py-3 text-left" aria-label={`Изменить вес: ${dateLabel(e.date)}`} onClick={() => { setDate(e.date); setKg(e.kg); setMessage('') }}>
            <span className="text-muted text-[12px]">{dateLabel(e.date)}</span><span>{fmt(e.kg, 1)} кг</span>
          </button>
          <button aria-label={`Удалить вес: ${dateLabel(e.date)}`} onClick={() => { removeBodyWeight(e.date); setDeleted(e); setMessage('Запись удалена'); if (date === e.date) setKg(0) }} className="text-faint p-3 -mr-2"><Trash2 size={16} /></button>
        </div>)}
        {visible > 0 && history.length > visible && <button onClick={() => setVisible((v) => v + 20)} className="text-protein text-[13px] py-2">Показать ещё ({history.length - visible})</button>}
      </div>}
    </Card>
    <SmartNutrition />
  </>
}

function SmartNutrition() {
  const profile = useApp((s) => s.profile)
  const entries = useApp((s) => s.bodyWeight)
  const { applyNutritionAdjustment, resetNutritionAdjustment } = useApp.getState()
  const advice = nutritionAdvice(profile, entries)
  const adjustment = profile.nutritionAdjustment
  const rate = advice.trend.weeklyRate
  return <>
    <SectionTitle>Умная корректировка</SectionTitle>
    <Card className="mx-5 p-4">
      <div className="flex items-center gap-2 text-[13px] text-accent"><Sparkles size={16} /> {goalLabels[profile.goal]} · по тренду веса</div>
      {rate !== undefined && <div className="tnum mt-3 mb-1">
        <span className="text-[24px] font-bold">{signed(rate, 2)}</span><span className="text-[13px] text-muted"> кг / нед.</span>
        <div className="text-[12px] text-faint">{advice.trend.count} взвешиваний за {advice.trend.days} дн. · скачки отдельных дней сглажены</div>
      </div>}
      <div className="text-[16px] font-semibold mt-3">{advice.title}</div>
      <p className="text-[13px] leading-relaxed text-muted mt-1.5">{advice.message}</p>
      {advice.reviewDate && <p className="text-[12px] text-faint mt-2">Следующая оценка — не раньше {dateLabel(advice.reviewDate)}</p>}
      {advice.status !== 'manual' && advice.status !== 'limited' && <p className="tnum text-[12px] text-faint mt-2">Ориентир: {signed(advice.range[0], 2)}…{signed(advice.range[1], 2)} кг / нед.</p>}
      {advice.proposed && <div className="mt-4 p-3.5 rounded-2xl bg-accent/10">
        <div className="tnum flex flex-wrap items-baseline gap-x-2"><span className="text-muted text-[15px]">{fmt(advice.current.kcal)}</span><span className="text-muted">→</span>
          <span className="text-[25px] font-bold">{fmt(advice.proposed.kcal)}</span><span className="text-[13px] text-muted">ккал / день</span>
        </div>
        <div className="tnum text-[12px] text-muted mt-1">Б {advice.proposed.protein} г · Ж {advice.proposed.fat} г · У {advice.proposed.carbs} г</div>
        <Button className="w-full mt-3" onClick={applyNutritionAdjustment}>Применить {signed(advice.kcalChange!, 0)} ккал</Button>
        <p className="text-[11px] text-muted mt-2">Белки и жиры сохраняются; меняются углеводы. Новый шаг — после 14 дней наблюдений.</p>
      </div>}
      {adjustment && !profile.manualTargets && <div className="mt-4 pt-3 border-t border-line">
        <div className="tnum text-[12px] text-muted">Поправка к формуле: {signed(adjustment.kcalOffset, 0)} ккал · {dateLabel(adjustment.appliedAt)}</div>
        <button onClick={resetNutritionAdjustment} className="text-accent text-[13px] mt-2">Вернуть расчёт без поправки</button>
      </div>}
      <p className="text-[11px] text-faint mt-3">Подсказка по дневнику, не медицинское назначение. Работает на устройстве без нейросети и ключа.</p>
    </Card>
  </>
}
