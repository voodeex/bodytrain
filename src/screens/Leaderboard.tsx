import { useCallback, useEffect, useState } from 'react'
import { EyeOff, RefreshCw, Trophy } from 'lucide-react'
import { AuthSheet, Avatar } from '../components/Account'
import { Button, Card, cx, Empty, IconButton, ScreenHeader, Segmented, Spinner } from '../components/ui'
import { apiAvailable, leaderboardApi, type Leaderboard } from '../lib/api'
import { fmt, plural } from '../lib/utils'
import { accountActions, currentToken, syncNow, useAccount } from '../store/account'

type Period = 'day' | 'week'

export const formatTonnage = (kg: number) => (kg >= 10_000 ? `${fmt(kg / 1000, 1)} т` : `${fmt(kg)} кг`)

const medal = ['bg-[#f5c542] text-black', 'bg-[#c9ced6] text-black', 'bg-[#d08a4f] text-black']

export function LeaderboardScreen({ goToWorkouts }: { goToWorkouts: () => void }) {
  const { status, user, inTelegram } = useAccount()
  const [period, setPeriod] = useState<Period>('day')
  const [data, setData] = useState<Leaderboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auth, setAuth] = useState<'login' | 'register' | null>(null)

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      // Сначала отправляем свежие тренировки, чтобы видеть себя в рейтинге сразу.
      await syncNow()
      const token = currentToken()
      if (!token) throw new Error('Нужно войти')
      const res = await leaderboardApi.get(token, p)
      setData(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authed') void load(period)
  }, [status, period, load])

  const header = (
    <ScreenHeader
      title="Рейтинг"
      sub="Тоннаж выполненных подходов"
      right={
        status === 'authed' ? (
          <IconButton label="Обновить" onClick={() => void load(period)}>
            {loading ? <Spinner size={18} /> : <RefreshCw size={18} />}
          </IconButton>
        ) : undefined
      }
    />
  )

  if (!apiAvailable) {
    return (
      <div className="pb-8">
        {header}
        <Empty icon={<Trophy size={26} />} title="Рейтинг недоступен" text="В этой сборке не указан адрес сервера (VITE_API_URL)." />
      </div>
    )
  }

  if (status !== 'authed' || !user) {
    return (
      <div className="pb-8">
        {header}
        {status === 'loading' ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <Empty
            icon={<Trophy size={26} />}
            title="Соревнуйся по тоннажу"
            text="Лидеры за день и за неделю. Войди, чтобы твои тренировки попали в рейтинг."
            action={
              inTelegram ? (
                <Button onClick={() => void accountActions.telegramLogin().catch((e) => setError((e as Error).message))}>Войти через Telegram</Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => setAuth('register')}>Регистрация</Button>
                  <Button variant="secondary" onClick={() => setAuth('login')}>
                    Вход
                  </Button>
                </div>
              )
            }
          />
        )}
        {error && <div className="text-danger text-[14px] text-center px-6">{error}</div>}
        <AuthSheet open={auth !== null} mode={auth ?? 'login'} onClose={() => setAuth(null)} />
      </div>
    )
  }

  const me = data?.me
  const meInTop = data?.entries.some((e) => e.me)

  return (
    <div className="pb-8">
      {header}
      <div className="px-5">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'day', label: 'Сегодня' },
            { value: 'week', label: 'Неделя' },
          ]}
        />
      </div>

      {me && (
        <Card className="mx-5 mt-4 p-4 flex items-center gap-4">
          <div className={cx('w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0', me.rank ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted')}>
            {me.hidden ? <EyeOff size={20} /> : me.rank ? <span className="tnum text-[20px] font-bold leading-none">{me.rank}</span> : <span className="text-[20px] leading-none">—</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-muted">
              {me.hidden
                ? 'Ты скрыт из рейтинга (Профиль → Аккаунт)'
                : me.rank
                  ? `Твоё место из ${data!.participants}`
                  : period === 'day'
                    ? 'Сегодня тренировок ещё нет'
                    : 'На этой неделе тренировок ещё нет'}
            </div>
            <div className="tnum text-[22px] font-bold leading-tight">{formatTonnage(me.tonnage)}</div>
            {me.workouts > 0 && (
              <div className="text-[12px] text-faint">
                {me.workouts} {plural(me.workouts, 'тренировка', 'тренировки', 'тренировок')}
              </div>
            )}
          </div>
          {!me.rank && !me.hidden && (
            <Button className="h-10 px-4 text-[14px]" onClick={goToWorkouts}>
              Начать
            </Button>
          )}
        </Card>
      )}

      {error && (
        <div className="mx-5 mt-4 text-danger text-[14px]">
          {error}{' '}
          <button className="text-accent" onClick={() => void load(period)}>
            Повторить
          </button>
        </div>
      )}

      {!data && loading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {data && data.entries.length === 0 && (
        <Empty icon={<Trophy size={26} />} title="Пока никого" text={period === 'day' ? 'Сегодня ещё никто не тренировался. Будь первым!' : 'На этой неделе пока пусто.'} />
      )}

      {data && data.entries.length > 0 && (
        <div className="mx-5 mt-4 bg-surface rounded-[20px] overflow-hidden">
          {data.entries.map((e) => (
            <div key={e.userId} className={cx('flex items-center gap-3 px-4 py-3 border-b border-line/60 last:border-b-0', e.me && 'bg-accent/[0.07]')}>
              <div
                className={cx(
                  'tnum w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0',
                  e.rank <= 3 ? medal[e.rank - 1] : 'text-muted',
                )}
              >
                {e.rank}
              </div>
              <Avatar name={e.displayName} id={e.userId} size={36} me={e.me} />
              <div className="flex-1 min-w-0">
                <div className={cx('text-[15px] truncate', e.me && 'font-semibold')}>
                  {e.displayName}
                  {e.me && <span className="text-accent"> · ты</span>}
                </div>
                <div className="text-[12px] text-faint">
                  {e.workouts} {plural(e.workouts, 'тренировка', 'тренировки', 'тренировок')}
                </div>
              </div>
              <div className="tnum text-[15px] font-semibold">{formatTonnage(e.tonnage)}</div>
            </div>
          ))}
          {!meInTop && me?.rank && (
            <div className="flex items-center gap-3 px-4 py-3 bg-accent/[0.07] border-t border-line">
              <div className="tnum w-7 text-center text-[13px] font-bold text-muted">{me.rank}</div>
              <Avatar name={user.displayName} id={user.id} size={36} me />
              <div className="flex-1 text-[15px] font-semibold truncate">{user.displayName}</div>
              <div className="tnum text-[15px] font-semibold">{formatTonnage(me.tonnage)}</div>
            </div>
          )}
        </div>
      )}

      {data && (
        <p className="text-[12px] text-faint px-6 mt-4 text-center leading-relaxed">
          {period === 'day' ? 'День' : 'Неделя с понедельника'} — по времени {data.timeZone === 'Europe/Moscow' ? 'Москвы' : data.timeZone}. Считаются выполненные подходы
          с весом до 500 кг и до 100 повторов; кардио и упражнения на время не входят.
        </p>
      )}
    </div>
  )
}
