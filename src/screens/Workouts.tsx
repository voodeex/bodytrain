import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Dumbbell, Play, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Card, Empty, ScreenHeader, SectionTitle, Sheet } from '../components/ui'
import type { Workout } from '../lib/types'
import { e1rm, fmt, formatDate, formatDuration, formatMinutes, formatTime, plural, workoutVolume } from '../lib/utils'
import { useApp } from '../store/app'
import { starterWorkouts } from '../data/templates'

const weekStart = () => {
  const d = new Date()
  const day = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day)
  return d.getTime()
}

function ActiveBanner({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <Card onClick={onOpen} className="mx-5 p-4 bg-accent text-accent-ink flex items-center gap-4">
      <div className="w-11 h-11 rounded-full bg-accent-ink/10 flex items-center justify-center">
        <span className="w-2.5 h-2.5 rounded-full bg-accent-ink animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium opacity-70">Тренировка идёт</div>
        <div className="text-[17px] font-bold truncate">{w.title}</div>
      </div>
      <div className="tnum text-[20px] font-bold">{formatDuration(now - w.startedAt)}</div>
      <ChevronRight size={20} />
    </Card>
  )
}

export function WorkoutsScreen({ onOpenActive }: { onOpenActive: () => void }) {
  const workouts = useApp((s) => s.workouts)
  const exercises = useApp((s) => s.exercises)
  const active = useApp((s) => s.activeWorkout)
  const startWorkout = useApp((s) => s.startWorkout)
  const [detail, setDetail] = useState<Workout | null>(null)

  const week = useMemo(() => {
    const from = weekStart()
    const list = workouts.filter((w) => w.startedAt >= from)
    return {
      count: list.length,
      volume: list.reduce((a, w) => a + workoutVolume(w, exercises), 0),
      time: list.reduce((a, w) => a + ((w.finishedAt ?? w.startedAt) - w.startedAt), 0),
    }
  }, [workouts, exercises])

  const templates = useMemo(() => {
    const seen = new Set<string>()
    return workouts.filter((w) => (seen.has(w.title) ? false : (seen.add(w.title), true))).slice(0, 4)
  }, [workouts])

  const start = (from?: Workout) => {
    if (active && !confirm('Уже есть незавершённая тренировка. Заменить её новой?')) return
    startWorkout(from)
    onOpenActive()
  }

  return (
    <div className="pb-8">
      <ScreenHeader title="Тренировки" />

      {active ? (
        <ActiveBanner w={active} onOpen={onOpenActive} />
      ) : (
        <div className="px-5">
          <Button className="w-full h-14 text-[17px]" onClick={() => start()}>
            <Play size={20} fill="currentColor" /> Начать тренировку
          </Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 px-5 mt-4">
        {[
          { v: String(week.count), l: plural(week.count, 'тренировка', 'тренировки', 'тренировок') },
          { v: week.volume >= 1000 ? `${fmt(week.volume / 1000, 1)} т` : `${fmt(week.volume)} кг`, l: 'тоннаж' },
          { v: formatMinutes(week.time), l: 'в зале' },
        ].map((s) => (
          <div key={s.l} className="bg-surface rounded-2xl p-3">
            <div className="tnum text-[20px] font-bold leading-tight">{s.v}</div>
            <div className="text-[12px] text-muted mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="text-[12px] text-faint px-5 mt-1.5">за эту неделю</div>

      <SectionTitle>Быстрый старт</SectionTitle>
      <div className="grid grid-cols-3 gap-2 px-5">
        {starterWorkouts.map((t) => (
          <button key={t.id} onClick={() => start(t)} className="pressable bg-surface rounded-2xl p-3 text-left">
            <Dumbbell size={20} className="text-accent mb-2" />
            <div className="text-[14px] font-semibold leading-snug">{t.title}</div>
            <div className="text-[12px] text-muted mt-1">{t.exercises.length} упражнений</div>
          </button>
        ))}
      </div>

      {templates.length > 0 && (
        <>
          <SectionTitle>Повторить</SectionTitle>
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-5">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => start(t)}
                className="pressable shrink-0 bg-surface rounded-2xl px-4 py-3 text-left max-w-[220px]"
              >
                <div className="flex items-center gap-1.5 text-accent text-[13px] font-medium">
                  <RotateCcw size={14} /> {t.exercises.length} упр.
                </div>
                <div className="text-[15px] font-semibold truncate mt-1">{t.title}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>История</SectionTitle>
      {workouts.length === 0 ? (
        <Empty icon={<Dumbbell size={26} />} title="Пока пусто" text="Начни первую тренировку — здесь появится история и тоннаж." />
      ) : (
        <div className="px-5 space-y-2">
          {workouts.map((w) => (
            <WorkoutRow key={w.id} w={w} onClick={() => setDetail(w)} />
          ))}
        </div>
      )}

      <WorkoutDetail
        w={detail}
        onClose={() => setDetail(null)}
        onRepeat={(w) => {
          setDetail(null)
          start(w)
        }}
      />
    </div>
  )
}

function WorkoutRow({ w, onClick }: { w: Workout; onClick: () => void }) {
  const exercises = useApp((s) => s.exercises)
  const names = w.exercises.map((we) => exercises.find((e) => e.id === we.exerciseId)?.name ?? '—')
  const sets = w.exercises.reduce((a, e) => a + e.sets.length, 0)
  return (
    <Card onClick={onClick} className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[16px] font-semibold truncate">{w.title}</div>
        <div className="text-[13px] text-muted shrink-0">{formatDate(w.startedAt)}</div>
      </div>
      <div className="text-[14px] text-muted mt-1 line-clamp-2">{names.join(' · ')}</div>
      <div className="tnum flex gap-4 text-[13px] mt-2.5">
        <span>{formatMinutes((w.finishedAt ?? w.startedAt) - w.startedAt)}</span>
        <span>
          {sets} {plural(sets, 'подход', 'подхода', 'подходов')}
        </span>
        <span className="text-accent">{fmt(workoutVolume(w, exercises))} кг</span>
      </div>
    </Card>
  )
}

function WorkoutDetail({ w, onClose, onRepeat }: { w: Workout | null; onClose: () => void; onRepeat: (w: Workout) => void }) {
  const exercises = useApp((s) => s.exercises)
  const deleteWorkout = useApp((s) => s.deleteWorkout)
  if (!w) return null
  return (
    <Sheet
      open
      onClose={onClose}
      title={w.title}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="w-14 px-0"
            onClick={() => {
              if (confirm('Удалить тренировку из истории?')) {
                deleteWorkout(w.id)
                onClose()
              }
            }}
          >
            <Trash2 size={20} />
          </Button>
          <Button className="flex-1" onClick={() => onRepeat(w)}>
            <RotateCcw size={18} /> Повторить
          </Button>
        </div>
      }
    >
      <div className="px-5 pb-4">
        <div className="tnum text-muted text-[14px]">
          {formatDate(w.startedAt)}, {formatTime(w.startedAt)} · {formatMinutes((w.finishedAt ?? w.startedAt) - w.startedAt)} ·{' '}
          <span className="text-accent">{fmt(workoutVolume(w, exercises))} кг</span>
        </div>
        {w.exercises.map((we) => {
          const ex = exercises.find((e) => e.id === we.exerciseId)
          const timed = ex?.unit === 'seconds' || ex?.unit === 'minutes'
          const best = timed ? 0 : Math.max(...we.sets.map((s) => e1rm(s.weight, s.reps)))
          return (
            <div key={we.id} className="bg-surface rounded-2xl p-4 mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-semibold text-[16px]">{ex?.name ?? '—'}</div>
                {best > 0 && <div className="tnum text-[12px] text-muted shrink-0">1ПМ ≈ {fmt(best, 1)} кг</div>}
              </div>
              <div className="tnum mt-2 flex flex-wrap gap-1.5">
                {we.sets.map((s, i) => (
                  <span key={s.id} className="bg-surface-2 rounded-lg px-2.5 py-1 text-[14px]">
                    <span className="text-faint">{i + 1}.</span> {timed ? `${s.reps} ${ex?.unit === 'seconds' ? 'сек' : 'мин'}` : `${fmt(s.weight, 1)} × ${s.reps}`}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
