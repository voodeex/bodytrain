import pg from 'pg'

export type Db = pg.Pool

/** Миграции применяются по порядку при старте; номер = индекс + 1. */
const migrations: string[] = [
  `
  create table users (
    id bigserial primary key,
    username text unique,
    password_hash text,
    telegram_id bigint unique,
    telegram_username text,
    display_name text not null,
    show_in_leaderboard boolean not null default true,
    token_version integer not null default 0,
    created_at timestamptz not null default now()
  );
  create table user_state (
    user_id bigint primary key references users(id) on delete cascade,
    revision integer not null,
    data jsonb not null,
    updated_at timestamptz not null default now()
  );
  create table workout_stats (
    user_id bigint not null references users(id) on delete cascade,
    workout_id text not null,
    started_at timestamptz not null,
    tonnage double precision not null,
    primary key (user_id, workout_id)
  );
  create index workout_stats_started_at on workout_stats (started_at);
  `,
]

export function createDb(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 })
}

export async function migrate(db: Db) {
  const client = await db.connect()
  try {
    // Защита от одновременной миграции двумя экземплярами сервера.
    await client.query('select pg_advisory_lock(727001)')
    await client.query('create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())')
    const { rows } = await client.query<{ version: number }>('select version from schema_migrations')
    const applied = new Set(rows.map((r) => r.version))
    for (let i = 0; i < migrations.length; i++) {
      const version = i + 1
      if (applied.has(version)) continue
      await client.query('begin')
      try {
        await client.query(migrations[i])
        await client.query('insert into schema_migrations (version) values ($1)', [version])
        await client.query('commit')
      } catch (e) {
        await client.query('rollback')
        throw e
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => undefined)
    client.release()
  }
}
