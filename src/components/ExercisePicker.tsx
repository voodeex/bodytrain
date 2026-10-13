import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { muscleLabels, muscleOrder } from '../data/exercises'
import type { Exercise, MuscleGroup } from '../lib/types'
import { useApp } from '../store/app'
import { Button, cx, Segmented, Sheet, TextInput } from './ui'

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (exerciseId: string) => void }) {
  const exercises = useApp((s) => s.exercises)
  const createExercise = useApp((s) => s.createExercise)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('chest')
  const [unit, setUnit] = useState<NonNullable<Exercise['unit']>>('reps')

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/ё/g, 'е')
    return exercises.filter(
      (e) =>
        (muscle === 'all' || e.muscle === muscle) &&
        (!query || e.name.toLowerCase().replace(/ё/g, 'е').includes(query)),
    )
  }, [exercises, q, muscle])

  const grouped = muscleOrder
    .map((m) => ({ m, items: filtered.filter((e) => e.muscle === m) }))
    .filter((g) => g.items.length)

  const close = () => {
    setQ('')
    setCreating(false)
    onClose()
  }

  const pick = (id: string) => {
    onPick(id)
    close()
  }

  return (
    <Sheet open={open} onClose={close} title="Упражнение" full>
      <div className="px-5 sticky top-0 bg-bg pb-2 z-10">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <TextInput maxLength={200} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск упражнения" className="pl-11" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-5 px-5">
          {(['all', ...muscleOrder] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMuscle(m)}
              className={cx(
                'shrink-0 h-8 px-3.5 rounded-full text-[14px] font-medium',
                muscle === m ? 'bg-accent text-accent-ink' : 'bg-surface text-muted',
              )}
            >
              {m === 'all' ? 'Все' : muscleLabels[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-6">
        {q.trim() && !creating && (
          <button onClick={() => setCreating(true)} className="pressable w-full flex items-center gap-3 py-3 text-accent">
            <Plus size={20} /> Создать «{q.trim()}»
          </button>
        )}
        {creating && (
          <div className="bg-surface rounded-2xl p-4 my-2">
            <div className="text-[15px] font-semibold mb-3">Новое упражнение: {q.trim()}</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {muscleOrder.map((m) => (
                <button
                  key={m}
                  onClick={() => setNewMuscle(m)}
                  className={cx('h-8 px-3 rounded-full text-[14px]', newMuscle === m ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted')}
                >
                  {muscleLabels[m]}
                </button>
              ))}
            </div>
            <div className="text-[13px] text-muted mb-2">Что записывать в подходе</div>
            <Segmented value={unit} onChange={setUnit} options={[{ value: 'reps', label: 'Повторы' }, { value: 'seconds', label: 'Секунды' }, { value: 'minutes', label: 'Минуты' }]} />
            <Button className="w-full mt-4" disabled={!q.trim()} onClick={() => pick(createExercise(q, newMuscle, unit).id)}>
              Создать и добавить
            </Button>
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.m} className="mt-3">
            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint mb-1">{muscleLabels[g.m]}</div>
            {g.items.map((e) => (
              <button
                key={e.id}
                onClick={() => pick(e.id)}
                className="pressable w-full text-left py-3 border-b border-line/60 flex items-center justify-between"
              >
                <span className="text-[16px]">{e.name}</span>
                {e.custom && <span className="text-[12px] text-faint">своё</span>}
              </button>
            ))}
          </div>
        ))}
        {grouped.length === 0 && !q.trim() && <div className="text-muted text-center py-10">Ничего не найдено</div>}
      </div>
    </Sheet>
  )
}
