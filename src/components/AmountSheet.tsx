import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { FoodItem, Meal } from '../lib/types'
import { fmt, macrosFor } from '../lib/utils'
import { Button, cx, MacroLine, NumberField, Segmented, Sheet } from './ui'

export const mealLabels: Record<Meal, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
}
export const mealOrder: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const guessMeal = (): Meal => {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

const sourceLabel: Record<FoodItem['source'], string> = {
  local: 'Базовая таблица',
  off: 'Open Food Facts',
  vision: 'Распознано на устройстве',
  claude: 'Оценка Claude',
  gemini: 'Оценка Gemini',
  groq: 'Оценка Qwen · Groq',
  cloudflare: 'Оценка Moondream · Cloudflare',
  manual: 'Добавлено вручную',
}

export function AmountSheet({
  food,
  initialGrams,
  initialMeal,
  onClose,
  onSubmit,
  onDelete,
  submitLabel = 'Добавить',
}: {
  food: FoodItem | null
  initialGrams?: number
  initialMeal: Meal
  onClose: () => void
  onSubmit: (grams: number, meal: Meal) => void
  onDelete?: () => void
  submitLabel?: string
}) {
  const [grams, setGrams] = useState(100)
  const [meal, setMeal] = useState<Meal>(initialMeal)

  useEffect(() => {
    if (food) {
      setGrams(initialGrams ?? food.portion ?? 100)
      setMeal(initialMeal)
    }
  }, [food, initialGrams, initialMeal])

  if (!food) return null
  const m = macrosFor(food, grams)
  const chips = [...new Set([food.portion, 50, 100, 150, 200, 300].filter((x): x is number => !!x))].sort((a, b) => a - b)

  return (
    <Sheet
      open
      onClose={onClose}
      title={food.name}
      footer={
        <div className="flex gap-2">
          {onDelete && (
            <Button variant="danger" className="w-14 px-0" onClick={onDelete}>
              <Trash2 size={20} />
            </Button>
          )}
          <Button className="flex-1" disabled={grams <= 0} onClick={() => onSubmit(grams, meal)}>
            {submitLabel} · {fmt(m.kcal)} ккал
          </Button>
        </div>
      }
    >
      <div className="px-5 pb-4">
        <div className="text-[13px] text-muted -mt-1">
          {food.brand ? `${food.brand} · ` : ''}
          {sourceLabel[food.source]} · на 100 г: {fmt(food.kcal)} ккал
        </div>

        <div className="flex items-end gap-3 mt-5">
          <NumberField value={grams} onChange={setGrams} className="h-16 text-[34px] font-bold flex-1" autoFocus={false} ariaLabel="Граммы" />
          <div className="text-[20px] text-muted pb-4">г</div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => setGrams(c)}
              className={cx(
                'tnum shrink-0 h-9 px-3.5 rounded-full text-[14px] font-medium',
                grams === c ? 'bg-accent text-accent-ink' : 'bg-surface text-muted',
              )}
            >
              {c === food.portion ? `порция ${c}` : c} г
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 mt-5">
          {[
            { l: 'ккал', v: m.kcal, c: 'text-accent', d: 0 },
            { l: 'белки', v: m.protein, c: 'text-protein', d: 1 },
            { l: 'жиры', v: m.fat, c: 'text-fat', d: 1 },
            { l: 'углев.', v: m.carbs, c: 'text-carbs', d: 1 },
          ].map((x) => (
            <div key={x.l} className="bg-surface rounded-2xl py-3 text-center">
              <div className={cx('tnum text-[19px] font-bold', x.c)}>{fmt(x.v, x.d)}</div>
              <div className="text-[12px] text-muted">{x.l}</div>
            </div>
          ))}
        </div>

        <div className="text-[13px] text-muted mt-5 mb-2">Приём пищи</div>
        <Segmented value={meal} onChange={setMeal} options={mealOrder.map((v) => ({ value: v, label: mealLabels[v] }))} />
        <MacroLine className="mt-4 justify-center" protein={food.protein} fat={food.fat} carbs={food.carbs} kcal={food.kcal} />
        <div className="text-center text-[12px] text-faint mt-1">на 100 г</div>
      </div>
    </Sheet>
  )
}
