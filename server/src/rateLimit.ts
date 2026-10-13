/** Простой ограничитель частоты в памяти процесса (скользящее окно по ключу). */
export class RateLimiter {
  private hits = new Map<string, number[]>()

  constructor(private limit: number, private windowMs: number) {}

  /** true — запрос разрешён. */
  take(key: string, now = Date.now()): boolean {
    const from = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter((t) => t > from)
    if (list.length >= this.limit) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    if (this.hits.size > 50_000) this.sweep(now)
    return true
  }

  private sweep(now: number) {
    const from = now - this.windowMs
    for (const [k, list] of this.hits) if (!list.some((t) => t > from)) this.hits.delete(k)
  }
}
