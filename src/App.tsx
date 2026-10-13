import { useEffect, useState } from 'react'
import { Dumbbell, LineChart, Trophy, User, UtensilsCrossed } from 'lucide-react'
import { Button, cx } from './components/ui'
import { ActiveWorkout } from './screens/ActiveWorkout'
import { LeaderboardScreen } from './screens/Leaderboard'
import { NutritionScreen } from './screens/Nutrition'
import { ProfileScreen } from './screens/Profile'
import { ProgressScreen } from './screens/Progress'
import { WorkoutsScreen } from './screens/Workouts'
import { initAccount } from './store/account'
import { hydrationError, useApp } from './store/app'
import { flushStorage, storageError } from './lib/storage'

type Tab = 'workouts' | 'nutrition' | 'leaderboard' | 'progress' | 'profile'

const tabs: { id: Tab; label: string; icon: typeof Dumbbell }[] = [
  { id: 'workouts', label: 'Тренировки', icon: Dumbbell },
  { id: 'nutrition', label: 'Питание', icon: UtensilsCrossed },
  { id: 'leaderboard', label: 'Рейтинг', icon: Trophy },
  { id: 'progress', label: 'Прогресс', icon: LineChart },
  { id: 'profile', label: 'Профиль', icon: User },
]

function useHydrated() {
  const [hydrated, setHydrated] = useState(useApp.persist.hasHydrated())
  useEffect(() => {
    const unsub = useApp.persist.onFinishHydration(() => setHydrated(true))
    setHydrated(useApp.persist.hasHydrated())
    return unsub
  }, [])
  useEffect(() => {
    const update = () => setHydrated(useApp.persist.hasHydrated() || !!hydrationError)
    window.addEventListener('bodytrain-hydration', update)
    update()
    return () => window.removeEventListener('bodytrain-hydration', update)
  }, [])
  return hydrated
}

export default function App() {
  const hydrated = useHydrated()
  const hasActive = useApp((s) => s.activeWorkout !== null)
  const [tab, setTab] = useState<Tab>('workouts')
  const [activeOpen, setActiveOpen] = useState(false)
  const [saveError, setSaveError] = useState(storageError)
  useEffect(() => {
    const update = () => setSaveError(storageError)
    window.addEventListener('bodytrain-storage', update)
    return () => window.removeEventListener('bodytrain-storage', update)
  }, [])

  useEffect(() => {
    if (!hasActive) setActiveOpen(false)
  }, [hasActive])

  useEffect(() => {
    // Аккаунт и синхронизация — только после чтения дневника с диска, иначе на сервер уйдёт пустой дневник.
    if (hydrated && !hydrationError) void initAccount()
  }, [hydrated])

  useEffect(() => {
    if (hydrated && import.meta.env.VITE_SELFTEST === '1') void import('./selftest').then((m) => m.runSelfTest())
  }, [hydrated])

  if (!hydrated) return <div className="h-full bg-bg flex items-center justify-center text-muted">Открываю дневник…</div>
  if (hydrationError) return <div className="h-full p-8 flex flex-col justify-center gap-4"><h1 className="text-2xl font-bold">Не удалось открыть дневник</h1><p className="text-muted">{hydrationError}</p><Button onClick={() => location.reload()}>Повторить</Button></div>

  return (
    <div className="h-full flex flex-col">
      {saveError && <div role="alert" className="fixed top-[calc(var(--sat)+8px)] left-4 right-4 z-[80] bg-surface-2 border border-danger rounded-2xl p-3 text-[13px]">{saveError}<button className="text-accent ml-2" onClick={() => void flushStorage().catch(() => undefined)}>Повторить</button></div>}
      <main key={tab} className="scroll flex-1 pt-[var(--sat)] animate-fade">
        {tab === 'workouts' && <WorkoutsScreen onOpenActive={() => setActiveOpen(true)} />}
        {tab === 'nutrition' && <NutritionScreen goToProfile={() => setTab('profile')} />}
        {tab === 'leaderboard' && <LeaderboardScreen goToWorkouts={() => setTab('workouts')} />}
        {tab === 'progress' && <ProgressScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>

      <nav className="shrink-0 border-t border-line bg-bg/95 backdrop-blur-xl pb-[var(--sab)]">
        <div className="h-[var(--tabbar-h)] grid grid-cols-5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              aria-current={tab === id ? 'page' : undefined}
              key={id}
              onClick={() => setTab(id)}
              className={cx('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', tab === id ? 'text-accent' : 'text-faint')}
            >
              <span className="relative">
                <Icon size={24} strokeWidth={tab === id ? 2.4 : 2} />
                {id === 'workouts' && hasActive && <span className="absolute -top-0.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-bg" />}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>

      {activeOpen && hasActive && <ActiveWorkout onMinimize={() => setActiveOpen(false)} />}
    </div>
  )
}
