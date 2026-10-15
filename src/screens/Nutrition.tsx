import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { AddFoodSheet } from '../components/AddFoodSheet'
import { AmountSheet, guessMeal, mealLabels, mealOrder } from '../components/AmountSheet'
import { Card, IconButton, MacroBar, Ring, ScreenHeader } from '../components/ui'
import { targetsFor } from '../lib/nutrition'
import type { FoodEntry, Meal } from '../lib/types'
import { dayKey, fmt, formatDay, macrosFor, shiftDay, sumMacros } from '../lib/utils'
import { useApp } from '../store/app'

export function NutritionScreen({ goToProfile }: { goToProfile: () => void }) {
  const foodLog = useApp((s) => s.foodLog)
  const profile = useApp((s) => s.profile)
  const { updateFoodEntry, removeFoodEntry } = useApp.getState()
  const [date, setDate] = useState(dayKey())
  const [addMeal, setAddMeal] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<FoodEntry | null>(null)

  const entries = useMemo(() => foodLog.filter((e) => e.date === date), [foodLog, date])
  const total = sumMacros(entries.map((e) => macrosFor(e.food, e.grams)))
  const target = targetsFor(profile)
  const left = target.kcal - total.kcal

  return (
    <div className="pb-8">
      <ScreenHeader
        title="Питание"
        right={
          <div className="flex items-center gap-1 pb-1">
            <IconButton label="Предыдущий день" onClick={() => setDate((d) => shiftDay(d, -1))}>
              <ChevronLeft size={20} />
            </IconButton>
            <button onClick={() => setDate(dayKey())} className="text-[15px] font-medium min-w-[92px] text-center">
              {formatDay(date)}
            </button>
            <IconButton label="Следующий день" onClick={() => setDate((d) => shiftDay(d, 1))}>
              <ChevronRight size={20} />
            </IconButton>
          </div>
        }
      />

      <Card className="mx-5 p-5">
        <div className="flex items-center gap-5">
          <Ring value={total.kcal} max={target.kcal}>
            <div className="tnum text-[28px] font-bold leading-none">{fmt(total.kcal)}</div>
            <div className="text-[12px] text-muted mt-1">из {fmt(target.kcal)} ккал</div>
          </Ring>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-muted">{left >= 0 ? 'Осталось' : 'Перебор'}</div>
            <div className={`tnum text-[26px] font-bold leading-tight ${left >= 0 ? '' : 'text-danger'}`}>
              {fmt(Math.abs(left))} <span className="text-[15px] font-medium text-muted">ккал</span>
            </div>
            <div className="text-[12px] text-faint mt-1">
              цель: {profile.manualTargets ? 'вручную' : profile.goal === 'lose' ? 'похудение' : profile.goal === 'gain' ? 'набор' : 'поддержание'}
              {!profile.manualTargets && profile.nutritionAdjustment && <span className="block text-protein mt-1">С поправкой по весу</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-4 mt-5">
          <MacroBar label="Белки" value={total.protein} max={target.protein} color="var(--color-protein)" />
          <MacroBar label="Жиры" value={total.fat} max={target.fat} color="var(--color-fat)" />
          <MacroBar label="Углеводы" value={total.carbs} max={target.carbs} color="var(--color-carbs)" />
        </div>
      </Card>

      <div className="px-5 mt-4 space-y-3">
        {mealOrder.map((meal) => {
          const list = entries.filter((e) => e.meal === meal)
          const sum = sumMacros(list.map((e) => macrosFor(e.food, e.grams)))
          return (
            <Card key={meal} className="overflow-hidden">
              {/* Нажимается вся строка приёма пищи, а не только кружок с плюсом. */}
              <button
                onClick={() => setAddMeal(meal)}
                className="pressable w-full text-left flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold">{mealLabels[meal]}</div>
                  {list.length > 0 ? (
                    <div className="tnum text-[13px] text-muted">
                      {fmt(sum.kcal)} ккал · Б {fmt(sum.protein)} · Ж {fmt(sum.fat)} · У {fmt(sum.carbs)}
                      {/* Сводку VoiceOver читает с экрана, а назначение кнопки — отдельной подписью. */}
                      <span className="sr-only">. Записать приём пищи</span>
                    </div>
                  ) : (
                    <div className="text-[13px] text-muted">Записать приём пищи</div>
                  )}
                </div>
                <span aria-hidden className="w-11 h-11 shrink-0 rounded-full bg-accent text-accent-ink flex items-center justify-center">
                  <Plus size={22} strokeWidth={2.5} />
                </span>
              </button>
              {list.map((e) => {
                const m = macrosFor(e.food, e.grams)
                return (
                  <button
                    key={e.id}
                    onClick={() => setEditing(e)}
                    className="pressable w-full text-left px-4 py-3 border-t border-line/60 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] truncate">{e.food.name}</div>
                      <div className="tnum text-[12px] text-muted">
                        {fmt(e.grams)} г · Б {fmt(m.protein, 1)} · Ж {fmt(m.fat, 1)} · У {fmt(m.carbs, 1)}
                      </div>
                    </div>
                    <div className="tnum text-[15px] font-semibold">{fmt(m.kcal)}</div>
                  </button>
                )
              })}
            </Card>
          )
        })}
      </div>

      <AddFoodSheet open={addMeal !== null} meal={addMeal ?? guessMeal()} date={date} onClose={() => setAddMeal(null)} goToProfile={goToProfile} />

      <AmountSheet
        food={editing?.food ?? null}
        initialGrams={editing?.grams}
        initialMeal={editing?.meal ?? 'snack'}
        submitLabel="Сохранить"
        onClose={() => setEditing(null)}
        onSubmit={(grams, meal) => {
          if (editing) updateFoodEntry(editing.id, { grams, meal })
          setEditing(null)
        }}
        onDelete={() => {
          if (editing) removeFoodEntry(editing.id)
          setEditing(null)
        }}
      />
    </div>
  )
}
