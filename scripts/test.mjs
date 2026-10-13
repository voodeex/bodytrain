import { build } from 'esbuild'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Клиентские тесты: tests/*.test.ts собираются esbuild и запускаются node --test.
// Серверные (нужен PostgreSQL): npm run test:server
const dir = await mkdtemp(join(tmpdir(), 'bodytrain-tests-'))
try {
  const entries = (await readdir('tests')).filter((f) => f.endsWith('.test.ts'))
  const files = []
  for (const entry of entries) {
    const file = join(dir, entry.replace(/\.ts$/, '.mjs'))
    await build({ entryPoints: [join('tests', entry)], bundle: true, platform: 'node', format: 'esm', outfile: file, define: { 'import.meta.env.DEV': 'false' } })
    files.push(file)
  }
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally { await rm(dir, { recursive: true, force: true }) }
