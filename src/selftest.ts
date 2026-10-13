/** Нативные проверки запускаются только в отдельном bundle ID .selftest. */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { App as NativeApp } from '@capacitor/app'
import { searchLocal } from './data/foods'
import { classifyFood, detectBarcode, scannerAvailable } from './lib/bodyVision'
import { lookupBarcode, searchOff } from './lib/openFoodFacts'
import { getAIKey, setAIKey, getCloudflareAccount, setCloudflareAccount } from './lib/secrets'
import { flushStorage } from './lib/storage'
import { parseAppData } from './lib/validation'
import { apiAvailable, leaderboardApi } from './lib/api'
import { getSessionToken } from './lib/secrets'
import { accountActions, currentToken, syncNow } from './store/account'
import { useApp } from './store/app'

const log = (...a: unknown[]) => console.log('[SELFTEST]', ...a)
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
function sampleImage() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256)
  return canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
}

export async function runSelfTest() {
  if ((await NativeApp.getInfo()).id !== 'com.voodeex.bodytrain.selftest') {
    log('done', 'failures=1: самотест разрешён только в изолированном приложении')
    return
  }
  let failures = 0
  log('start')
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try { log(name, 'OK', JSON.stringify(await fn())) }
    catch (e) { failures++; log(name, 'FAIL', (e as Error).message ?? String(e)) }
  }
  await run('local-foods', async () => {
    const names = searchLocal('гречка').map((f) => f.name)
    check(names.length > 0, 'Локальная база пуста'); return names
  })
  await run('off-search', async () => {
    const items = await searchOff('nutella', 5)
    check(items.length > 0, 'Нет результатов живого поиска'); return items.map((f) => f.name)
  })
  await run('off-barcode', async () => {
    const food = await lookupBarcode('3017620422003')
    check(food && food.kcal > 0, 'Нет КБЖУ по тестовому штрихкоду'); return food?.name
  })
  await run('vision', async () => {
    try { await classifyFood(sampleImage()); return 'Классификатор выполнился; точность требует фото на iPhone' }
    catch (e) {
      if ((e as { code?: string }).code === 'SIMULATOR') return 'SKIP: Apple Vision требует физический iPhone'
      throw e
    }
  })
  await run('barcode-photo', async () => {
    const codes = await detectBarcode(sampleImage()); check(codes.length === 0, 'Штрихкод на пустом фото'); return codes
  })
  await run('scanner-availability', async () => scannerAvailable())
  await run('keychain', async () => {
    if (await getAIKey('groq') || await getAIKey('cloudflare') || await getCloudflareAccount()) return 'SKIP: существующие ключи сохранены'
    try {
      await setAIKey('groq-test-no-real-key', 'groq')
      await setAIKey('cf-test-no-real-key', 'cloudflare')
      await setCloudflareAccount('a'.repeat(32))
      check(await getAIKey('groq') === 'groq-test-no-real-key', 'Groq ключ не прочитан')
      check(await getAIKey('cloudflare') === 'cf-test-no-real-key', 'Cloudflare ключ не прочитан или смешан с Groq')
      check(await getCloudflareAccount() === 'a'.repeat(32), 'Account ID не прочитан')
      await setAIKey('', 'groq')
      check(await getAIKey('cloudflare') === 'cf-test-no-real-key', 'Удаление Groq затронуло Cloudflare')
      return 'Groq и Cloudflare: независимая запись, чтение и удаление в Keychain'
    } finally {
      await setAIKey('', 'groq'); await setAIKey('', 'cloudflare'); await setCloudflareAccount('')
    }
  })
  await run('workout-and-persist', async () => {
    const previousId = useApp.getState().activeWorkout?.id
    useApp.getState().resetAll()
    useApp.getState().startWorkout()
    useApp.getState().addExerciseToWorkout('bench-press')
    const ex = useApp.getState().activeWorkout!.exercises[0]
    useApp.getState().updateSet(ex.id, ex.sets[0].id, { weight: 60, reps: 10, done: true })
    useApp.getState().setRestTimer(Date.now() + 90000, 90)
    useApp.getState().addFood({ name: 'Тестовый рис', kcal: 130, protein: 2, fat: 1, carbs: 28, source: 'manual' }, 200, 'lunch', '2026-10-13')
    const expectedId = useApp.getState().activeWorkout!.id
    await flushStorage()
    const file = await Filesystem.readFile({ path: 'bodytrain-bodytrain-state.json', directory: Directory.Library, encoding: Encoding.UTF8 })
    const saved = parseAppData(JSON.parse(file.data as string).state)
    check(saved.activeWorkout?.id === expectedId, 'Тренировка не сохранена')
    check(saved.activeWorkout!.exercises[0].sets[0].weight === 60, 'Вес не сохранён')
    check(saved.activeWorkout!.restDuration === 90, 'Таймер не сохранён')
    check(saved.foodLog[0].grams === 200, 'Питание не сохранено')
    await useApp.persist.rehydrate()
    check(useApp.getState().activeWorkout?.id === expectedId, 'Состояние не восстановилось')
    return { diskReadback: true, rehydration: true, previousRunRestored: !!previousId }
  })
  await run('account-sync-leaderboard', async () => {
    if (!apiAvailable) return 'SKIP: собрано без VITE_API_URL'
    const password = `pw-${crypto.randomUUID()}`
    await accountActions.register(`selftest_${Date.now().toString(36)}`, password, 'Самотест')
    try {
      check(await getSessionToken(), 'Токен сессии не сохранён в Keychain')
      useApp.getState().finishWorkout() // жим 60×10 из прошлого шага
      await syncNow()
      const board = await leaderboardApi.get(currentToken()!, 'day')
      check(board.me.tonnage === 600, `Тоннаж в рейтинге: ${board.me.tonnage}`)
      return { rank: board.me.rank, tonnage: board.me.tonnage, participants: board.participants }
    } finally {
      await accountActions.deleteAccount(password)
      check(!(await getSessionToken()), 'Токен не удалён из Keychain')
    }
  })
  log('done', `failures=${failures}`)
}
