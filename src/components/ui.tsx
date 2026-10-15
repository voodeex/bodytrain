import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { fmt, parseNum } from '../lib/utils'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

export function ScreenHeader({ title, right, sub }: { title: string; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="px-5 pt-3 pb-2 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight">{title}</h1>
        {sub && <div className="text-muted text-[15px] mt-0.5">{sub}</div>}
      </div>
      {right}
    </header>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={cx('bg-surface rounded-[20px]', onClick && 'pressable cursor-pointer', className)}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 mt-6 mb-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
      {right}
    </div>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: BtnVariant
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-accent text-accent-ink font-semibold',
    secondary: 'bg-surface-2 text-text font-medium',
    ghost: 'bg-transparent text-accent font-medium',
    danger: 'bg-danger/15 text-danger font-semibold',
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'pressable h-12 px-5 rounded-2xl inline-flex items-center justify-center gap-2 text-[16px] disabled:opacity-40 disabled:pointer-events-none',
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  label: string
  className?: string
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cx('pressable w-11 h-11 rounded-full bg-surface-2 inline-flex items-center justify-center text-text', className)}
    >
      {children}
    </button>
  )
}

/** Числовое поле: держит строку локально, чтобы можно было стереть и ввести «7,5». */
export function NumberField({
  value,
  onChange,
  className,
  placeholder,
  decimal = true,
  autoFocus,
  ariaLabel,
  min = 0,
  max = 10000,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  placeholder?: string
  decimal?: boolean
  autoFocus?: boolean
  ariaLabel?: string
  min?: number
  max?: number
}) {
  const [text, setText] = useState(value ? fmtInput(value) : '')
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value ? fmtInput(value) : '')
  }, [value])
  return (
    <input
      aria-label={ariaLabel}
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoFocus={autoFocus}
      placeholder={placeholder ?? '0'}
      value={text}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        const parsed = decimal ? parseNum(text) : Math.round(parseNum(text))
        const next = Math.max(min, Math.min(max, parsed))
        onChange(next)
        setText(next ? fmtInput(next) : '')
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '')
        setText(t)
        const parsed = decimal ? parseNum(t) : Math.round(parseNum(t))
        if (parsed >= min && parsed <= max) onChange(parsed)
      }}
      className={cx('tnum bg-surface-2 rounded-xl text-center outline-none focus:ring-2 focus:ring-accent/70 placeholder:text-faint', className)}
    />
  )
}

const fmtInput = (n: number) => String(Number(n.toFixed(2))).replace('.', ',')

export function Sheet({
  open,
  onClose,
  title,
  children,
  full,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  full?: boolean
  footer?: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== dialog) return
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current() }
      if (e.key === 'Tab') {
        const nodes = [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([hidden]), a[href], [tabindex="0"]') ?? [])].filter((node) => node.getClientRects().length > 0)
        const first = nodes[0], last = nodes.at(-1)
        if (e.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [open])
  if (!open) return null
  // Лист — поверх всего приложения, поэтому он живёт в body, а не внутри экрана.
  // Внутри <main> (прокрутка + анимация) образуется контекст наложения, и z-50 действовал
  // бы только внутри него: панель вкладок с backdrop-фильтром перекрывала бы нижнюю кнопку.
  return createPortal(
    <div className="app-layer fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Диалог'}
        className={cx(
          'relative bg-bg border-t border-line rounded-t-[28px] animate-sheet flex flex-col',
          full ? 'h-[calc(100%-var(--sat)-12px)]' : 'max-h-[calc(100%-var(--sat)-12px)]',
        )}
      >
        <div className="flex justify-center pt-2">
          <div className="w-10 h-1.5 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3 gap-3">
          <div className="text-[20px] font-bold min-w-0 truncate">{title}</div>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="scroll flex-1 min-h-0">{children}</div>
        {footer && <div className="px-5 pt-3 pb-[calc(var(--sab)+12px)] border-t border-line bg-bg">{footer}</div>}
        {!footer && <div className="h-[var(--sab)]" />}
      </div>
    </div>,
    document.body,
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('bg-surface rounded-2xl p-1 flex gap-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 h-11 rounded-xl text-[14px] font-medium transition-colors inline-flex items-center justify-center gap-1.5',
            value === o.value ? 'bg-surface-2 text-text' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Ring({
  value,
  max,
  size = 132,
  stroke = 12,
  color = 'var(--color-accent)',
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  color?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  const over = max > 0 && value > max
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--color-danger)' : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted">{label}</span>
      </div>
      <div className="tnum text-[15px] font-semibold mt-0.5">
        {fmt(value)}
        <span className="text-muted font-normal"> / {fmt(max)} г</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 mt-1.5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: color, transition: 'width 500ms ease' }} />
      </div>
    </div>
  )
}

export function MacroLine({ kcal, protein, fat, carbs, className }: { kcal?: number; protein: number; fat: number; carbs: number; className?: string }) {
  return (
    <div className={cx('tnum flex items-center gap-2.5 text-[13px] text-muted', className)}>
      {kcal !== undefined && <span className="text-text font-medium">{fmt(kcal)} ккал</span>}
      <span>
        <span className="text-protein">Б</span> {fmt(protein, 1)}
      </span>
      <span>
        <span className="text-fat">Ж</span> {fmt(fat, 1)}
      </span>
      <span>
        <span className="text-carbs">У</span> {fmt(carbs, 1)}
      </span>
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-10">
      <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center text-muted mb-3">{icon}</div>
      <div className="font-semibold text-[17px]">{title}</div>
      {text && <div className="text-muted text-[14px] mt-1 max-w-[280px]">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="block">
      <div className="text-[13px] text-muted mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[12px] text-faint mt-1">{hint}</div>}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full h-12 px-4 bg-surface rounded-2xl outline-none focus:ring-2 focus:ring-accent/70 placeholder:text-faint',
        props.className,
      )}
    />
  )
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin text-muted">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
