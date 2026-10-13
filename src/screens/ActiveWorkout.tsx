import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Minus, Plus, Timer, Trash2, X } from 'lucide-react'
import { ExercisePicker } from '../components/ExercisePicker'
import { Button, cx, IconButton, NumberField } from '../components/ui'
import { muscleLabels } from '../data/exercises'
import { success, tap } from '../lib/haptics'
import { fmt, formatDuration, workoutVolume } from '../lib/utils'
import { lastSetsFor, useApp } from '../store/app'

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

export function ActiveWorkout({ onMinimize }: { onMinimize: () => void }) {
  const w = useApp((s) => s.activeWorkout)
  const exercises = useApp((s) => s.exercises)
  const workouts = useApp((s) => s.workouts)
  const restSeconds = useApp((s) => s.settings.restSeconds)
  const { renameWorkout, addExerciseToWorkout, removeExerciseFromWorkout, addSet, updateSet, removeSet, finishWorkout, discardWorkout, setRestTimer } =
    useApp.getState()
  const now = useNow(250)
  const [picker, setPicker] = useState(false)
  const restEnd = w?.restEndsAt
  const restTotal = w?.restDuration ?? restSeconds

  const restLeft = restEnd ? Math.ceil((restEnd - now) / 1000) : 0
  useEffect(() => {
    if (restEnd && restLeft <= 0) {
      success()
      const t = setTimeout(() => setRestTimer(), 1500)
      return () => clearTimeout(t)
    }
  }, [restEnd, restLeft <= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])
  if (!w) return null

  const doneSets = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)
  const volume = workoutVolume(w, exercises)

  const finish = () => {
    if (doneSets === 0) {
      if (confirm('Нет выполненных подходов. Удалить тренировку?')) discardWorkout()
      return
    }
    const unfinished = w.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.done).length, 0)
    if (unfinished > 0 && !confirm(`Неотмеченные подходы (${unfinished}) не сохранятся. Завершить?`)) return
    success()
    finishWorkout()
  }

  return (
    <div className="app-layer fixed inset-0 z-40 bg-bg flex flex-col animate-sheet">
      <div className="pt-[calc(var(--sat)+8px)] px-4 pb-3 border-b border-line bg-bg">
        <div className="flex items-center gap-3">
          <IconButton label="Свернуть" onClick={onMinimize}>
            <ChevronDown size={20} />
          </IconButton>
          <div className="flex-1 min-w-0">
            <input
              aria-label="Название тренировки"
              value={w.title}
              onChange={(e) => renameWorkout(e.target.value)}
              className="w-full bg-transparent outline-none text-[17px] font-semibold truncate"
            />
            <div className="tnum text-[13px] text-muted">
              {formatDuration(now - w.startedAt)} · {doneSets} подх. · {fmt(volume)} кг
            </div>
          </div>
          <Button onClick={finish} className="h-10 px-4 text-[15px]">
            Завершить
          </Button>
        </div>
      </div>

      <div className="scroll flex-1 px-4 pt-4 pb-40">
        {w.exercises.map((we) => {
          const ex = byId.get(we.exerciseId)
          const prev = lastSetsFor(workouts, we.exerciseId)
          return (
            <div key={we.id} className="bg-surface rounded-[20px] p-4 mb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold leading-snug">{ex?.name ?? 'Упражнение'}</div>
                  <div className="text-[13px] text-muted mt-0.5">
                    {ex ? muscleLabels[ex.muscle] : ''}
                    {prev.length > 0 && (
                      <span className="tnum"> · прошлый раз: {prev.map((s) => `${fmt(s.weight, 1)}×${s.reps}`).join(', ')}</span>
                    )}
                  </div>
                </div>
                <button
                  aria-label="Удалить упражнение"
                  onClick={() => confirm('Убрать упражнение из тренировки?') && removeExerciseFromWorkout(we.id)}
                  className="pressable p-2 -mr-2 -mt-1 text-faint"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="grid grid-cols-[28px_1fr_1fr_44px_28px] gap-2 items-center mt-3 text-[12px] text-faint uppercase tracking-wider">
                <div className="text-center">#</div>
                <div className="text-center">кг</div>
                <div className="text-center">{ex?.unit === 'seconds' ? 'сек' : ex?.unit === 'minutes' ? 'мин' : 'повт'}</div>
                <div />
                <div />
              </div>
              {we.sets.map((s, i) => (
                <div
                  key={s.id}
                  className={cx(
                    'grid grid-cols-[28px_1fr_1fr_44px_28px] gap-2 items-center mt-2 rounded-xl transition-colors',
                    s.done && 'bg-accent/[0.07]',
                  )}
                >
                  <div className={cx('tnum text-center text-[15px] font-semibold', s.done ? 'text-accent' : 'text-muted')}>{i + 1}</div>
                  <NumberField
                    ariaLabel="Вес"
                    max={2000}
                    value={s.weight}
                    onChange={(v) => updateSet(we.id, s.id, { weight: v })}
                    className="h-11 text-[17px] font-semibold w-full"
                  />
                  <NumberField
                    ariaLabel={ex?.unit === 'seconds' ? 'Секунды' : ex?.unit === 'minutes' ? 'Минуты' : 'Повторения'}
                    decimal={false}
                    value={s.reps}
                    onChange={(v) => updateSet(we.id, s.id, { reps: v })}
                    className="h-11 text-[17px] font-semibold w-full"
                  />
                  <button
                    disabled={!s.done && s.reps <= 0}
                    aria-label={s.done ? 'Снять отметку' : 'Подход выполнен'}
                    onClick={() => {
                      const done = !s.done
                      updateSet(we.id, s.id, { done })
                      tap()
                      if (done) {
                        setRestTimer(Date.now() + restSeconds * 1000, restSeconds)
                      }
                    }}
                    className={cx(
                      'pressable h-11 w-11 rounded-xl flex items-center justify-center',
                      s.done ? 'bg-accent text-accent-ink animate-pop' : 'bg-surface-2 text-faint',
                    )}
                  >
                    <Check size={22} strokeWidth={3} />
                  </button>
                  <button aria-label="Удалить подход" onClick={() => removeSet(we.id, s.id)} className="pressable h-11 flex items-center justify-center text-faint">
                    <Minus size={18} />
                  </button>
                </div>
              ))}
              <button onClick={() => addSet(we.id)} className="pressable mt-3 w-full h-10 rounded-xl bg-surface-2 text-[15px] font-medium flex items-center justify-center gap-1.5">
                <Plus size={18} /> Подход
              </button>
            </div>
          )
        })}

        <Button variant="secondary" className="w-full mt-1" onClick={() => setPicker(true)}>
          <Plus size={20} /> Добавить упражнение
        </Button>
        {w.exercises.length === 0 && (
          <p className="text-center text-muted text-[14px] mt-6 px-6">Добавь первое упражнение. Вес и повторения подставятся из прошлой тренировки.</p>
        )}
        <button
          onClick={() => confirm('Удалить текущую тренировку без сохранения?') && discardWorkout()}
          className="w-full text-center text-danger text-[15px] mt-8 py-2"
        >
          Отменить тренировку
        </button>
      </div>

      {restEnd && (
        <div className="absolute left-4 right-4 bottom-[calc(var(--sab)+16px)] animate-sheet">
          <div className="bg-surface-2 border border-line rounded-[22px] p-3 pl-4 flex items-center gap-3 shadow-2xl shadow-black/60 overflow-hidden relative">
            <div
              className="absolute left-0 bottom-0 h-1 bg-accent"
              style={{ width: `${Math.max(0, Math.min(1, restLeft / restTotal)) * 100}%`, transition: 'width 250ms linear' }}
            />
            <Timer size={22} className={restLeft > 0 ? 'text-accent' : 'text-success'} />
            <div className="flex-1">
              <div className="text-[12px] text-muted">{restLeft > 0 ? 'Отдых' : 'Пора!'}</div>
              <div className="tnum text-[22px] font-bold leading-none">{formatDuration(Math.max(0, restLeft) * 1000)}</div>
            </div>
            <button
              onClick={() => {
                setRestTimer(Math.max(restEnd, Date.now()) + 15000, restTotal + 15)
              }}
              className="pressable h-10 px-3 rounded-xl bg-surface text-[15px] font-semibold"
            >
              +15 с
            </button>
            <IconButton label="Пропустить отдых" onClick={() => setRestTimer()} className="bg-surface">
              <X size={18} />
            </IconButton>
          </div>
        </div>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(id) => addExerciseToWorkout(id)} />
    </div>
  )
}
