import { fmt } from '../lib/utils'

export interface Point {
  label: string
  value: number
  /** Реальное расстояние по горизонтали для нерегулярных взвешиваний. */
  time?: number
}

/** Простой линейный график без библиотек. */
export function LineChart({ points, height = 160, color = 'var(--color-accent)', unit = '' }: { points: Point[]; height?: number; color?: string; unit?: string }) {
  const w = 340
  const padX = 8
  const padTop = 22
  const padBottom = 22
  if (points.length === 0) return null
  const values = points.map((p) => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  min -= span * 0.12
  max += span * 0.12
  const timed = points.every((p) => p.time !== undefined)
  const firstTime = points[0].time ?? 0
  const timeSpan = (points.at(-1)?.time ?? 0) - firstTime
  const x = (i: number) => (points.length === 1 ? w / 2 : padX + (w - padX * 2) *
    (timed && timeSpan > 0 ? (points[i].time! - firstTime) / timeSpan : i / (points.length - 1)))
  const y = (v: number) => padTop + (1 - (v - min) / (max - min)) * (height - padTop - padBottom)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${d} L${x(points.length - 1).toFixed(1)},${height - padBottom} L${x(0).toFixed(1)},${height - padBottom} Z`
  const last = points[points.length - 1]
  const best = Math.max(...values)
  const labelEvery = Math.max(1, Math.ceil(points.length / 5))
  const gid = `g${Math.round(Math.random() * 1e6)}`

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={0} x2={w} y1={padTop + t * (height - padTop - padBottom)} y2={padTop + t * (height - padTop - padBottom)} stroke="var(--color-line)" strokeDasharray="2 4" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={p === last ? 4.5 : 2.5} fill={p === last ? color : 'var(--color-bg)'} stroke={color} strokeWidth={2} />
      ))}
      <text x={x(points.length - 1)} y={y(last.value) - 10} textAnchor={points.length === 1 ? 'middle' : 'end'} fontSize="12" fontWeight="600" fill="var(--color-text)">
        {fmt(last.value, 1)}
        {unit}
      </text>
      {best !== last.value && (
        <text x={4} y={14} fontSize="11" fill="var(--color-muted)">
          макс {fmt(best, 1)}
          {unit}
        </text>
      )}
      {points.map((p, i) =>
        (timed ? i === 0 || i === points.length - 1 : i % labelEvery === 0 || i === points.length - 1) ? (
          <text key={`l${i}`} x={x(i)} y={height - 5} fontSize="10" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fill="var(--color-faint)">
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/** Столбики с линией цели. */
export function BarChart({ points, target, height = 150 }: { points: Point[]; target?: number; height?: number }) {
  const w = 340
  const padTop = 16
  const padBottom = 20
  const max = Math.max(target ?? 0, ...points.map((p) => p.value), 1) * 1.1
  const bw = (w / points.length) * 0.62
  const step = w / points.length
  const y = (v: number) => padTop + (1 - v / max) * (height - padTop - padBottom)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      {points.map((p, i) => {
        const over = target !== undefined && p.value > target * 1.05
        const h = height - padBottom - y(p.value)
        return (
          <g key={i}>
            <rect
              x={i * step + (step - bw) / 2}
              y={y(p.value)}
              width={bw}
              height={Math.max(h, p.value > 0 ? 2 : 0)}
              rx={Math.min(5, bw / 2)}
              fill={p.value === 0 ? 'transparent' : over ? 'var(--color-fat)' : 'var(--color-accent)'}
              opacity={i === points.length - 1 ? 1 : 0.75}
            />
            <text x={i * step + step / 2} y={height - 5} fontSize="10" textAnchor="middle" fill="var(--color-faint)">
              {p.label}
            </text>
          </g>
        )
      })}
      {target !== undefined && target > 0 && (
        <>
          <line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke="var(--color-muted)" strokeDasharray="4 4" />
          <text x={w - 2} y={y(target) - 4} fontSize="10" textAnchor="end" fill="var(--color-muted)">
            цель {fmt(target)}
          </text>
        </>
      )}
    </svg>
  )
}
