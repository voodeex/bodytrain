import { useState, type FormEvent } from 'react'
import { Cloud, CloudOff, KeyRound, LogOut, Pencil, RefreshCw, Send, Trash2, UserRound } from 'lucide-react'
import { apiAvailable } from '../lib/api'
import { formatTime } from '../lib/utils'
import { accountActions, hasUnsyncedChanges, syncNow, useAccount } from '../store/account'
import { Button, Card, cx, Field, SectionTitle, Segmented, Sheet, Spinner, TextInput } from './ui'

/** Кружок с инициалами; цвет стабилен для пользователя. */
export function Avatar({ name, id, size = 40, me }: { name: string; id: string; size?: number; me?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
  const hues = [200, 150, 30, 280, 330, 100, 260, 10]
  const hue = hues[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length]
  return (
    <div
      aria-hidden
      className={cx('shrink-0 rounded-full flex items-center justify-center font-semibold', me && 'ring-2 ring-accent')}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 22%)`, color: `hsl(${hue} 80% 78%)` }}
    >
      {initials}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative w-[51px] h-[31px] rounded-full transition-colors shrink-0', checked ? 'bg-accent' : 'bg-surface-2')}
    >
      <span className={cx('absolute left-0 top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
    </button>
  )
}

export function AuthSheet({ open, mode: initialMode, onClose }: { open: boolean; mode: 'login' | 'register'; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState(open)
  if (open !== shownFor) {
    setShownFor(open)
    if (open) {
      setMode(initialMode)
      setError(null)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await accountActions.login(username, password)
      else await accountActions.register(username, password, name.trim())
      setPassword('')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'login' ? 'Вход' : 'Регистрация'}>
      <form onSubmit={submit} className="px-5 pb-6 space-y-4">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError(null)
          }}
          options={[
            { value: 'login', label: 'Вход' },
            { value: 'register', label: 'Регистрация' },
          ]}
        />
        <Field label="Логин" hint={mode === 'register' ? 'Латиница, цифры, «_» и «.», от 3 символов' : undefined}>
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ivan_petrov"
          />
        </Field>
        <Field label="Пароль" hint={mode === 'register' ? 'Минимум 8 символов. Восстановления по почте нет — запомни пароль.' : undefined}>
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
          />
        </Field>
        {mode === 'register' && (
          <Field label="Имя в рейтинге" hint="Его увидят другие участники. Можно поменять потом.">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Иван" />
          </Field>
        )}
        {error && (
          <div role="alert" className="text-danger text-[14px]">
            {error}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={busy || !username.trim() || !password}>
          {busy ? <Spinner /> : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </Button>
        <p className="text-[12px] text-faint text-center">
          После входа дневник синхронизируется с сервером, а тренировки попадают в рейтинг по тоннажу.
        </p>
      </form>
    </Sheet>
  )
}

function SyncLine() {
  const sync = useAccount((s) => s.sync)
  const text =
    sync.state === 'syncing'
      ? 'Синхронизация…'
      : sync.state === 'offline'
        ? 'Нет связи — изменения отправятся позже'
        : sync.state === 'error'
          ? sync.error ?? 'Ошибка синхронизации'
          : sync.at
            ? `Синхронизировано в ${formatTime(sync.at)}`
            : 'Дневник синхронизируется с аккаунтом'
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {sync.state === 'syncing' ? <Spinner size={14} /> : sync.state === 'idle' ? <Cloud size={15} className="text-success" /> : <CloudOff size={15} className={sync.state === 'error' ? 'text-danger' : 'text-muted'} />}
      <span className={cx('flex-1 min-w-0', sync.state === 'error' ? 'text-danger' : 'text-muted')}>{text}</span>
      {sync.state !== 'syncing' && (
        <button aria-label="Синхронизировать сейчас" className="text-accent p-1" onClick={() => void syncNow()}>
          <RefreshCw size={15} />
        </button>
      )}
    </div>
  )
}

export function AccountSection() {
  const { status, user, inTelegram, notice } = useAccount()
  const [auth, setAuth] = useState<'login' | 'register' | null>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [creds, setCreds] = useState(false)
  const [del, setDel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!apiAvailable) return null

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <SectionTitle>Аккаунт</SectionTitle>
      <Card className="mx-5 p-4">
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Проверяю вход…
          </div>
        )}

        {status === 'guest' && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-muted shrink-0">
                <UserRound size={20} />
              </div>
              <div className="text-[14px] text-muted">
                Ты в гостевом режиме — дневник только на этом устройстве. Войди, чтобы участвовать в рейтинге и не терять данные при смене телефона.
              </div>
            </div>
            {notice && <div className="text-[13px] text-fat">{notice}</div>}
            {inTelegram ? (
              <Button className="w-full" onClick={() => void run(accountActions.telegramLogin)}>
                <Send size={18} /> Войти через Telegram
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setAuth('register')}>Регистрация</Button>
                <Button variant="secondary" onClick={() => setAuth('login')}>
                  Вход
                </Button>
              </div>
            )}
          </div>
        )}

        {status === 'authed' && user && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.displayName} id={user.id} size={48} />
              <div className="flex-1 min-w-0">
                {editing ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(async () => {
                        await accountActions.updateMe({ displayName: name })
                        setEditing(false)
                      })
                    }}
                  >
                    <TextInput autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-10 bg-surface-2" />
                    <Button type="submit" className="h-10 px-3 text-[14px]">
                      OK
                    </Button>
                  </form>
                ) : (
                  <button
                    className="text-left w-full"
                    onClick={() => {
                      setName(user.displayName)
                      setEditing(true)
                    }}
                  >
                    <div className="text-[17px] font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{user.displayName}</span>
                      <Pencil size={14} className="text-faint shrink-0" aria-label="Изменить имя" />
                    </div>
                    <div className="text-[13px] text-muted truncate">
                      {[user.telegram && `Telegram${user.telegramUsername ? ` @${user.telegramUsername}` : ''}`, user.username && `логин ${user.username}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </button>
                )}
              </div>
            </div>
            <SyncLine />
            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <div className="text-[15px]">Показывать меня в рейтинге</div>
                <div className="text-[12px] text-faint">Имя и тоннаж видят другие участники</div>
              </div>
              <Toggle
                label="Показывать меня в рейтинге"
                checked={user.showInLeaderboard}
                onChange={(v) => void run(() => accountActions.updateMe({ showInLeaderboard: v }))}
              />
            </div>
            <div className="space-y-2">
              <Button variant="secondary" className="w-full" onClick={() => setCreds(true)}>
                <KeyRound size={18} /> {user.hasPassword ? 'Сменить пароль' : 'Пароль для входа с iPhone'}
              </Button>
              {!inTelegram && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    const warn = hasUnsyncedChanges() ? 'Часть изменений ещё не отправлена на сервер и пропадёт. ' : ''
                    if (confirm(`${warn}Выйти? Дневник останется в аккаунте, а с этого устройства удалится.`)) void run(accountActions.logout)
                  }}
                >
                  <LogOut size={18} /> Выйти
                </Button>
              )}
              <button className="w-full text-center text-danger text-[14px] pt-2" onClick={() => setDel(true)}>
                Удалить аккаунт
              </button>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="text-danger text-[14px] mt-3">
            {error}
          </div>
        )}
      </Card>

      <AuthSheet open={auth !== null} mode={auth ?? 'login'} onClose={() => setAuth(null)} />
      <CredentialsSheet open={creds} onClose={() => setCreds(false)} />
      <DeleteSheet open={del} onClose={() => setDel(false)} />
    </>
  )
}

function CredentialsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAccount((s) => s.user)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!user) return null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await accountActions.setCredentials({
        username: user.username ? undefined : username,
        password,
        currentPassword: user.hasPassword ? current : undefined,
      })
      setPassword('')
      setCurrent('')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={user.hasPassword ? 'Смена пароля' : 'Вход с iPhone'}>
      <form onSubmit={submit} className="px-5 pb-6 space-y-4">
        {!user.hasPassword && (
          <p className="text-[14px] text-muted">Задай логин и пароль — с ними можно войти в этот же аккаунт из iOS-приложения или браузера.</p>
        )}
        {!user.username && (
          <Field label="Логин">
            <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="ivan_petrov" />
          </Field>
        )}
        {user.hasPassword && (
          <Field label="Текущий пароль">
            <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        <Field label="Новый пароль" hint="Минимум 8 символов. Остальные устройства выйдут из аккаунта.">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <div role="alert" className="text-danger text-[14px]">{error}</div>}
        <Button type="submit" className="w-full" disabled={busy || password.length < 8}>
          {busy ? <Spinner /> : 'Сохранить'}
        </Button>
      </form>
    </Sheet>
  )
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAccount((s) => s.user)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!user) return null
  return (
    <Sheet open={open} onClose={onClose} title="Удаление аккаунта">
      <div className="px-5 pb-6 space-y-4">
        <p className="text-[14px] text-muted">
          С сервера удалятся аккаунт, синхронизированный дневник и место в рейтинге. Дневник на этом устройстве останется в гостевом режиме.
        </p>
        {user.hasPassword && (
          <Field label="Пароль">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        {error && <div role="alert" className="text-danger text-[14px]">{error}</div>}
        <Button
          variant="danger"
          className="w-full"
          disabled={busy || (user.hasPassword && !password)}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await accountActions.deleteAccount(user.hasPassword ? password : undefined)
              onClose()
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <Trash2 size={18} /> Удалить навсегда
        </Button>
      </div>
    </Sheet>
  )
}
