import test from 'node:test'
import assert from 'node:assert/strict'

const values = new Map<string, string>()
let quotaError = false
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (quotaError) throw new Error('QuotaExceeded'); values.set(key, value) },
  removeItem: (key: string) => values.delete(key),
} })
const { useApp, lastSetsFor } = await import('../src/store/app')
const { initialData } = await import('../src/data/defaults')
const { localFoods } = await import('../src/data/foods')
const { visionFoodLabels, visionLabelToFood } = await import('../src/data/visionFoods')
const { parseAppData, parseBackup, validateFood, validDate } = await import('../src/lib/validation')
const { macrosFor, sumMacros, shiftDay, e1rm, workoutVolume, dayKey } = await import('../src/lib/utils')
const { calcTargets, targetsFor, targetsWithOffset } = await import('../src/lib/nutrition')
const { periodStart, compareWeight, weightTrend, nutritionAdvice, daysBetween } = await import('../src/lib/weightTrend')
const { parseRecognition, parseAIText, recognizeFood, checkAIKey, chooseOpenRouterModel, resetOpenRouterModel } = await import('../src/lib/foodAI')
const { toFood, searchOff } = await import('../src/lib/openFoodFacts')
const { appStorage, flushStorage } = await import('../src/lib/storage')
await useApp.persist.rehydrate()
const food = { name: 'Тестовый рис', kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, source: 'manual' as const }

test('КБЖУ считается на массу порции, без округления каждой записи', () => {
  assert.deepEqual(macrosFor(food, 200), { kcal: 260, protein: 5.4, fat: 0.6, carbs: 56 })
  assert.equal(sumMacros([macrosFor(food, 50), macrosFor(food, 50)]).kcal, 130)
  assert.equal(e1rm(60, 10), 80)
})
test('Даты корректны на границе месяца и високосного года', () => {
  assert.equal(shiftDay('2024-02-28', 1), '2024-02-29')
  assert.equal(shiftDay('2025-12-31', 1), '2026-01-01')
  assert.equal(validDate('2026-02-30'), false)
})
test('Цели питания для стандартного профиля конечны и согласованы с БЖУ', () => {
  const targets = calcTargets(initialData.profile)
  assert.equal(targets.kcal, 2720)
  assert.ok(Math.abs(targets.kcal - (targets.protein * 4 + targets.fat * 9 + targets.carbs * 4)) <= 2)
})
test('Завершение тренировки сохраняет только выполненные подходы и повторяет с новыми ID', () => {
  useApp.getState().resetAll()
  useApp.getState().startWorkout()
  useApp.getState().addExerciseToWorkout('bench-press')
  const we = useApp.getState().activeWorkout!.exercises[0]
  useApp.getState().updateSet(we.id, we.sets[0].id, { weight: 60, reps: 10, done: true })
  useApp.getState().addSet(we.id)
  useApp.getState().setRestTimer(Date.now() + 90000, 90)
  useApp.getState().finishWorkout()
  const saved = useApp.getState().workouts[0]
  assert.equal(saved.exercises[0].sets.length, 1)
  assert.equal(saved.restEndsAt, undefined)
  assert.equal(lastSetsFor(useApp.getState().workouts, 'bench-press')[0].weight, 60)
  useApp.getState().startWorkout(saved)
  const next = useApp.getState().activeWorkout!
  assert.notEqual(next.id, saved.id)
  assert.notEqual(next.exercises[0].sets[0].id, saved.exercises[0].sets[0].id)
  assert.equal(next.exercises[0].sets[0].done, false)
  assert.equal(next.exercises[0].sets[0].weight, 60)
})
test('Нельзя завершить подход с нулём повторов или записать NaN и отрицательный вес', () => {
  const we = useApp.getState().activeWorkout!.exercises[0]
  const id = we.sets[0].id
  useApp.getState().updateSet(we.id, id, { weight: -5, reps: 0, done: true })
  const result = useApp.getState().activeWorkout!.exercises[0].sets[0]
  assert.equal(result.done, false)
  assert.equal(result.weight, 60)
  useApp.getState().updateSet(we.id, id, { reps: NaN })
  assert.equal(useApp.getState().activeWorkout!.exercises[0].sets[0].reps, 0)
})
test('Секунды и минуты не считаются как тоннаж', () => {
  const workout = { id: 'w', title: 'Кардио', startedAt: 0, exercises: [{ id: 'e', exerciseId: 'plank', sets: [{ id: 's', weight: 10, reps: 60, done: true }] }] }
  assert.equal(workoutVolume(workout, initialData.exercises), 0)
  assert.equal(workoutVolume({ ...workout, exercises: [{ ...workout.exercises[0], exerciseId: 'bench-press' }] }, initialData.exercises), 600)
})
test('Дневник питания отклоняет неправильную порцию и дату', () => {
  assert.throws(() => useApp.getState().addFood(food, -10, 'lunch', '2026-10-13'))
  assert.throws(() => useApp.getState().addFood(food, 100, 'lunch', '2026-02-30'))
  useApp.getState().addFood(food, 200, 'lunch', '2026-10-13')
  assert.equal(useApp.getState().foodLog.at(-1)!.grams, 200)
})
test('Повреждённый импорт отклоняется атомарно и не подменяет методы store', () => {
  const previous = useApp.getState().foodLog
  assert.throws(() => useApp.getState().importData({ ...initialData, workouts: [{ title: 'Bad' }] }))
  assert.equal(useApp.getState().foodLog, previous)
  useApp.getState().importData({ ...initialData, startWorkout: 'not a function' })
  assert.equal(typeof useApp.getState().startWorkout, 'function')
  assert.throws(() => parseBackup({ ...initialData, app: 'BodyTrain', schemaVersion: 99 }))
  assert.throws(() => parseAppData({ ...initialData, foodLog: [{ id: 'bad' }] }))
})
test('Копия проходит круг экспорта/импорта, включая таймер и старые настройки', () => {
  useApp.getState().startWorkout()
  useApp.getState().addExerciseToWorkout('plank')
  useApp.getState().setRestTimer(2000000000000, 90)
  const parsed = parseBackup(JSON.parse(JSON.stringify({ ...useApp.getState(), app: 'BodyTrain', schemaVersion: 1 })))
  assert.equal(parsed.activeWorkout!.restEndsAt, 2000000000000)
  assert.equal(parsed.exercises.find((x) => x.id === 'plank')!.unit, 'seconds')
  assert.equal(parseAppData({ ...initialData, settings: { restSeconds: 90, claudeModel: 'legacy' } }).settings.aiProvider, 'groq')
})
test('Все продукты локальной базы проходят проверку значений на 100 г', () => {
  assert.ok(localFoods.length >= 100)
  for (const item of localFoods) assert.doesNotThrow(() => validateFood(item), item.name)
})
test('Все продукты распознавания Vision имеют допустимые значения КБЖУ', () => {
  for (const label of visionFoodLabels) assert.doesNotThrow(() => validateFood(visionLabelToFood(label)!.food), label)
})
test('Open Food Facts переводит кДж и отбрасывает повреждённые нутриенты', () => {
  const item = toFood({ product_name: 'Рис', nutriments: { energy_100g: 418.4, proteins_100g: 2, fat_100g: 0, carbohydrates_100g: 23 } })
  assert.equal(item!.kcal, 100)
  assert.equal(toFood({ product_name: 'Bad', nutriments: { 'energy-kcal_100g': -3, fat_100g: 2 } }), null)
  assert.equal(toFood({ product_name: 'Nutella', nutriments: { 'energy-kcal_100g': 5, proteins_100g: 5.4, fat_100g: 29.7, carbohydrates_100g: 59.5 } }), null)
})
test('Ответ AI валидируется: пустое фото, невозможные КБЖУ и масса', () => {
  assert.deepEqual(parseRecognition({ items: [], note: 'Нет еды' }), { items: [], note: 'Нет еды' })
  const item = { ...food, grams: 200, confidence: 'medium' }
  assert.equal(parseRecognition({ items: [item], note: 'Оценка' }).items[0].source, 'groq')
  assert.throws(() => parseRecognition({ items: [{ ...item, grams: -10 }], note: '' }))
  assert.throws(() => parseRecognition({ items: [{ ...item, fat: 150 }], note: '' }))
  assert.throws(() => parseRecognition({ items: [{ ...item, confidence: 'fake' }], note: '' }))
})
test('Groq отправляет фото и ключ в заголовке, сообщает об исчерпании квоты', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.groq.com/openai/v1/chat/completions')
    assert.ok(!String(input).includes('test-key'))
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer test-key')
    const body = JSON.parse(init!.body as string)
    assert.equal(body.model, 'qwen/qwen3.8-27b')
    assert.equal(body.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,image')
    assert.equal(body.response_format.type, 'json_object')
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ items: [{ ...food, grams: 200, confidence: 'medium' }], note: 'Оценка' }) } }] }), { status: 200 })
  }
  try {
    assert.equal((await recognizeFood({ apiKey: 'test-key', provider: 'groq', imageBase64: 'image' })).items[0].source, 'groq')
    globalThis.fetch = async () => new Response('{}', { status: 429 })
    await assert.rejects(() => recognizeFood({ apiKey: 'test-key', provider: 'groq', imageBase64: 'image' }), /лимит/)
  } finally { globalThis.fetch = original }
})

test('Cloudflare отправляет фото в Moondream query и использует отдельный источник', async () => {
  const original = globalThis.fetch
  const accountId = 'a'.repeat(32)
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/moondream/moondream3.1-9B-A2B`)
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer cf-test')
    const body = JSON.parse(init!.body as string)
    assert.equal(body.task, 'query')
    assert.equal(body.image, 'data:image/jpeg;base64,image')
    assert.equal(body.reasoning, false)
    return new Response(JSON.stringify({ success: true, result: { finish_reason: 'stop', answer: JSON.stringify({ items: [{ ...food, grams: 200, confidence: 'low' }], note: 'Оценка' }) } }), { status: 200 })
  }
  try {
    assert.equal((await recognizeFood({ apiKey: 'cf-test', provider: 'cloudflare', accountId, imageBase64: 'image' })).items[0].source, 'cloudflare')
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { status: 200 })
    await assert.rejects(() => recognizeFood({ apiKey: 'cf-test', provider: 'cloudflare', accountId, imageBase64: 'image' }), /Cloudflare не выполнил/)
  } finally { globalThis.fetch = original }
})

test('Cloudflare не делает запрос с неверным Account ID или пустым ключом', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected request') }
  try {
    await assert.rejects(() => recognizeFood({ apiKey: 'cf-test', provider: 'cloudflare', accountId: 'bad/id', imageBase64: 'image' }), /Account ID/)
    await assert.rejects(() => recognizeFood({ apiKey: '', provider: 'groq', imageBase64: 'image' }), /API-ключ/)
    assert.equal(calls, 0)
  } finally { globalThis.fetch = original }
})

test('Проверка ключа не отправляет фото и не запускает inference', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    assert.equal(init!.method, 'GET')
    assert.equal(init!.body, undefined)
    if (String(input).includes('groq')) return new Response(JSON.stringify({ data: [{ id: 'qwen/qwen3.8-27b' }] }), { status: 200 })
    assert.ok(String(input).endsWith('/user/tokens/verify'))
    return new Response(JSON.stringify({ success: true, result: { status: 'active' } }), { status: 200 })
  }
  try {
    assert.match(await checkAIKey({ apiKey: 'test-key', provider: 'groq' }), /ключ принят/)
    assert.match(await checkAIKey({ apiKey: 'cf-test', provider: 'cloudflare', accountId: 'a'.repeat(32) }), /активен/)
    globalThis.fetch = async () => new Response('{}', { status: 401 })
    await assert.rejects(() => checkAIKey({ apiKey: 'wrong', provider: 'groq' }), /ключ не принят/)
  } finally { globalThis.fetch = original }
})

test('Ответ в JSON-блоке принимается, обрезанный ответ и свободный текст отклоняются', async () => {
  assert.deepEqual(parseAIText('```json\n{"items":[],"note":"Нет еды"}\n```', 'cloudflare').items, [])
  assert.throws(() => parseAIText('Some food on the table', 'cloudflare'), /JSON/)
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"items":[],"note":""}' } }] }), { status: 200 })
  try { await assert.rejects(() => recognizeFood({ apiKey: 'test-key', provider: 'groq', imageBase64: 'image' }), /обрезан/) }
  finally { globalThis.fetch = original }
})

test('Поиск OFF кэширует один запрос и ограничивает повторные обращения', async () => {
  const original = globalThis.fetch
  let count = 0
  globalThis.fetch = async (input) => {
    count++
    // Браузер ходит в OFF через свой сервер: напрямую запрос блокирует CORS.
    assert.equal(String(input), '/api/off/search?q=test&page_size=25')
    return new Response(JSON.stringify({ hits: [] }), { status: 200 })
  }
  try {
    await searchOff('test')
    await searchOff('test')
    assert.equal(count, 1)
    await assert.rejects(() => searchOff('different'), /Подожди/)
  } finally { globalThis.fetch = original }
})
test('Последняя запись побеждает, а после сбоя сохранение можно повторить', async () => {
  appStorage.setItem('test-storage', 'first')
  appStorage.setItem('test-storage', 'last')
  await flushStorage()
  assert.equal(await appStorage.getItem('test-storage'), 'last')
  quotaError = true
  appStorage.setItem('test-storage', 'after-failure')
  await assert.rejects(() => flushStorage(), /Quota/)
  quotaError = false
  await flushStorage()
  assert.equal(values.get('test-storage'), 'after-failure')
})

const trendFixture = (today: string, weeklyRate = 0) => Array.from({ length: 15 }, (_, i) => ({
  date: shiftDay(today, -28 + i * 2), kg: 75 + weeklyRate * (-28 + i * 2) / 7,
}))
const trendToday = '2026-10-13'

test('Периоды веса используют календарные месяцы с правильным последним днём', () => {
  assert.equal(periodStart('week', '2026-01-03'), '2025-12-27')
  assert.equal(periodStart('month', '2024-03-31'), '2024-02-29')
  assert.equal(periodStart('month', '2026-03-31'), '2026-02-28')
  assert.equal(periodStart('halfYear', '2024-08-31'), '2024-02-29')
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2)
})
test('Неделя, месяц и полгода показывают свой прирост/снижение в кг и процентах', () => {
  const records = [{ date: '2026-04-13', kg: 80 }, { date: '2026-09-13', kg: 78 }, { date: '2026-10-06', kg: 76 }, { date: trendToday, kg: 75 }]
  for (const [period, delta] of [['week', -1], ['month', -3], ['halfYear', -5]] as const) {
    const result = compareWeight(records, period, trendToday)
    assert.equal(result.delta, delta)
    assert.equal(result.complete, true)
    assert.equal(result.percent, delta / (75 - delta) * 100)
  }
  assert.equal(compareWeight([{ date: '2026-10-06', kg: 74 }, { date: trendToday, kg: 75 }], 'week', trendToday).delta, 1)
})
test('Неполная история, одно измерение, устаревшие и будущие даты не создают ложное сравнение', () => {
  const partial = compareWeight([{ date: '2026-10-11', kg: 76 }, { date: trendToday, kg: 75 }], 'month', trendToday)
  assert.equal(partial.complete, false)
  assert.equal(partial.days, 2)
  assert.equal(partial.delta, -1)
  assert.equal(compareWeight([{ date: trendToday, kg: 75 }], 'week', trendToday).delta, undefined)
  const old = compareWeight([{ date: '2026-09-13', kg: 78 }, { date: '2026-09-20', kg: 77 }], 'month', trendToday)
  assert.equal(old.stale, true)
  assert.equal(old.complete, false)
  assert.equal(compareWeight([{ date: '2026-10-06', kg: 76 }, { date: trendToday, kg: 75 }, { date: '2026-10-14', kg: 80 }], 'week', trendToday).delta, -1)
})
test('Тренд требует распределённых измерений, 14 дней и свежего веса', () => {
  assert.equal(weightTrend(trendFixture(trendToday, -0.3), trendToday).status, 'ready')
  assert.ok(Math.abs(weightTrend(trendFixture(trendToday, -0.3), trendToday).weeklyRate! + 0.3) < 1e-9)
  assert.equal(weightTrend(trendFixture(trendToday).slice(-6), trendToday).status, 'insufficient')
  assert.equal(weightTrend([{ date: '2026-09-15', kg: 75 }, ...Array.from({ length: 5 }, (_, i) => ({ date: shiftDay(trendToday, -4 + i), kg: 75 }))], trendToday).status, 'insufficient')
  assert.equal(weightTrend(trendFixture(shiftDay(trendToday, -8)), trendToday).status, 'stale')
})
test('Один скачок внутри истории не портит тренд, шум и ошибка последнего веса блокируют поправку', () => {
  const outlier = trendFixture(trendToday, -0.3)
  outlier[7].kg += 5
  const trend = weightTrend(outlier, trendToday)
  assert.equal(trend.status, 'ready')
  assert.ok(Math.abs(trend.weeklyRate! + 0.3) < 1e-9)
  const noisy = trendFixture(trendToday).map((e, i) => ({ ...e, kg: e.kg + (i % 2 ? 2 : -2) }))
  assert.equal(weightTrend(noisy, trendToday).status, 'noisy')
  outlier.at(-1)!.kg = 90
  assert.equal(weightTrend(outlier, trendToday).status, 'noisy')
})
test('Коррекция реагирует на похудение, набор и поддержание, а подходящий темп оставляет КБЖУ', () => {
  const profile = initialData.profile
  assert.equal(nutritionAdvice({ ...profile, goal: 'lose' }, trendFixture(trendToday), trendToday).kcalChange, -100)
  assert.equal(nutritionAdvice({ ...profile, goal: 'gain' }, trendFixture(trendToday), trendToday).kcalChange, 125)
  assert.equal(nutritionAdvice(profile, trendFixture(trendToday, 0.3), trendToday).kcalChange, -125)
  assert.equal(nutritionAdvice(profile, trendFixture(trendToday, -0.3), trendToday).kcalChange, 125)
  assert.equal(nutritionAdvice(profile, trendFixture(trendToday), trendToday).status, 'onTrack')
  assert.equal(nutritionAdvice({ ...profile, goal: 'lose' }, trendFixture(trendToday, -0.3), trendToday).status, 'onTrack')
  assert.equal(nutritionAdvice({ ...profile, goal: 'gain' }, trendFixture(trendToday, 0.15), trendToday).status, 'onTrack')
})
test('Ручные цели, возраст до 18, низкий ИМТ и очень быстрый тренд не получают предложений', () => {
  const records = trendFixture(trendToday)
  const p = initialData.profile
  assert.equal(nutritionAdvice({ ...p, manualTargets: calcTargets(p) }, records, trendToday).status, 'manual')
  assert.equal(nutritionAdvice({ ...p, age: 17 }, records, trendToday).status, 'limited')
  assert.equal(nutritionAdvice({ ...p, weight: 50 }, records, trendToday).status, 'limited')
  assert.equal(nutritionAdvice(p, trendFixture(trendToday, -2), trendToday).status, 'limited')
  assert.equal(nutritionAdvice(p, records.slice(-3), trendToday).proposed, undefined)
})
test('Шаг ограничен, суммарная поправка и минимальные калории не позволяют бесконечно урезать норму', () => {
  for (const sex of ['male', 'female'] as const) {
    const p = { ...initialData.profile, sex, goal: 'lose' as const }
    const bounded = targetsWithOffset(p, -10000)
    assert.ok(bounded.kcal >= (sex === 'male' ? 1500 : 1200))
    assert.ok(bounded.kcal >= calcTargets(p).kcal * 0.8 - 1)
    assert.ok(Math.abs(bounded.kcal - (bounded.protein * 4 + bounded.fat * 9 + bounded.carbs * 4)) <= 2)
    const advice = nutritionAdvice(p, trendFixture(trendToday), trendToday)
    assert.ok(Math.abs(advice.kcalChange!) <= 150)
    assert.equal(advice.proposed!.protein, calcTargets(p).protein)
    assert.equal(advice.proposed!.fat, calcTargets(p).fat)
  }
  const p = { ...initialData.profile, goal: 'lose' as const }
  const limit = Math.min(600, Math.round(calcTargets(p).kcal * 0.2))
  const saturated = { ...p, nutritionAdjustment: { kcalOffset: -limit, kcalChange: -100, appliedAt: '2026-09-01', weeklyRate: 0, goal: 'lose' as const } }
  assert.equal(nutritionAdvice(saturated, trendFixture(trendToday), trendToday).status, 'limited')
})
test('После смены нормы нужен новый период наблюдений, старый тренд не переиспользуется', () => {
  const p = { ...initialData.profile, nutritionReviewAfter: '2026-10-01' }
  const advice = nutritionAdvice(p, trendFixture(trendToday, 0.3), trendToday)
  assert.equal(advice.status, 'waiting')
  assert.equal(advice.reviewDate, '2026-10-15')
  assert.equal(nutritionAdvice({ ...p, nutritionReviewAfter: '2026-09-29' }, trendFixture(trendToday, 0.3), trendToday).status, 'suggestion')
})
test('Store записывает прошлый вес, заменяет дату, отклоняет будущий и возвращает последний при удалении', () => {
  useApp.getState().resetAll()
  const today = dayKey()
  useApp.getState().logBodyWeight(76, today)
  useApp.getState().logBodyWeight(80, shiftDay(today, -30))
  assert.equal(useApp.getState().profile.weight, 76)
  useApp.getState().logBodyWeight(75, today)
  assert.equal(useApp.getState().bodyWeight.length, 2)
  assert.equal(useApp.getState().profile.weight, 75)
  assert.throws(() => useApp.getState().logBodyWeight(70, shiftDay(today, 1)))
  useApp.getState().removeBodyWeight(today)
  assert.equal(useApp.getState().profile.weight, 80)
})
test('Применённая поправка сохраняется в копии, действует на КБЖУ и не повторяется до новых наблюдений', () => {
  const today = dayKey()
  useApp.getState().importData({ ...initialData, bodyWeight: trendFixture(today), profile: { ...initialData.profile, goal: 'lose' } })
  const before = targetsFor(useApp.getState().profile)
  useApp.getState().applyNutritionAdjustment()
  const applied = useApp.getState().profile
  assert.equal(targetsFor(applied).kcal, before.kcal - 100)
  assert.equal(applied.nutritionAdjustment!.appliedAt, today)
  useApp.getState().applyNutritionAdjustment()
  assert.equal(useApp.getState().profile.nutritionAdjustment!.kcalOffset, -100)
  const copy = parseBackup(JSON.parse(JSON.stringify({ ...useApp.getState(), app: 'BodyTrain', schemaVersion: 1 })))
  assert.deepEqual(copy.profile.nutritionAdjustment, applied.nutritionAdjustment)
  useApp.getState().importData(copy)
  assert.equal(targetsFor(useApp.getState().profile).kcal, before.kcal - 100)
  useApp.getState().resetNutritionAdjustment()
  assert.equal(targetsFor(useApp.getState().profile).kcal, before.kcal)
  assert.equal(nutritionAdvice(useApp.getState().profile, useApp.getState().bodyWeight).status, 'waiting')
})
test('Смена цели сбрасывает поправку; старые копии читаются, повреждённая корректировка отклоняется', () => {
  const today = dayKey()
  useApp.getState().importData({ ...initialData, bodyWeight: trendFixture(today), profile: { ...initialData.profile, goal: 'lose' } })
  useApp.getState().applyNutritionAdjustment()
  useApp.getState().setProfile({ goal: 'gain' })
  assert.equal(useApp.getState().profile.nutritionAdjustment, undefined)
  assert.equal(useApp.getState().profile.nutritionReviewAfter, today)
  assert.equal(parseAppData(initialData).profile.nutritionAdjustment, undefined)
  assert.throws(() => parseAppData({ ...initialData, profile: { ...initialData.profile, nutritionAdjustment: { kcalOffset: -9999 } } }))
  assert.throws(() => parseAppData({ ...initialData, profile: { ...initialData.profile, nutritionAdjustment: { kcalOffset: -100, kcalChange: -100, appliedAt: today, weeklyRate: 0, goal: 'lose' } } }))
})

const orCatalog = { data: [
  { id: 'paid/vision-pro', architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0.000005', completion: '0.00001' } },
  { id: 'free/text-only:free', architecture: { input_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' } },
  { id: 'zzz/unknown-vlm:free', architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0', completion: '0' } },
  { id: 'qwen/qwen3-vl-30b:free', architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0', completion: '0' } },
] }

test('OpenRouter берёт бесплатную модель с поддержкой фото, платные и текстовые пропускает', () => {
  assert.equal(chooseOpenRouterModel(orCatalog.data), 'qwen/qwen3-vl-30b:free')
  // Без знакомого семейства годится любая бесплатная модель, читающая фото.
  assert.equal(chooseOpenRouterModel(orCatalog.data.filter((m) => !m.id.startsWith('qwen'))), 'zzz/unknown-vlm:free')
  assert.throws(() => chooseOpenRouterModel(orCatalog.data.filter((m) => m.pricing.prompt !== '0' || !m.architecture.input_modalities.includes('image'))), /нет бесплатной модели/)
  assert.throws(() => chooseOpenRouterModel(undefined), /нет бесплатной модели/)
})

test('OpenRouter отправляет фото выбранной модели и читает JSON среди пояснений', async () => {
  const original = globalThis.fetch
  resetOpenRouterModel()
  const urls: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    urls.push(url)
    if (url.endsWith('/models')) return new Response(JSON.stringify(orCatalog), { status: 200 })
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.ok(!url.includes('or-test'))
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer or-test')
    const body = JSON.parse(init!.body as string)
    assert.equal(body.model, 'qwen/qwen3-vl-30b:free')
    assert.equal(body.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,image')
    const json = JSON.stringify({ items: [{ ...food, grams: 200, confidence: 'medium' }], note: 'Оценка' })
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: `Вот разбор фото:\n\`\`\`json\n${json}\n\`\`\`\nПроверь граммы.` } }] }), { status: 200 })
  }
  try {
    const res = await recognizeFood({ apiKey: 'or-test', provider: 'openrouter', imageBase64: 'image' })
    assert.equal(res.items[0].source, 'openrouter')
    assert.equal(res.items[0].grams, 200)
    assert.deepEqual(urls, ['https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/chat/completions'])
    // Каталог запрашивается один раз на ключ.
    await recognizeFood({ apiKey: 'or-test', provider: 'openrouter', imageBase64: 'image' })
    assert.equal(urls.filter((u) => u.endsWith('/models')).length, 1)
  } finally { globalThis.fetch = original; resetOpenRouterModel() }
})

test('Лимит на минуту и исчерпанная дневная квота объясняются по-разному', async () => {
  const original = globalThis.fetch
  const answer = (body: string) => async (input: Request | string | URL) =>
    String(input).endsWith('/models') ? new Response(JSON.stringify(orCatalog), { status: 200 }) : new Response(body, { status: 429 })
  try {
    resetOpenRouterModel()
    globalThis.fetch = answer(JSON.stringify({ error: { message: 'Rate limit exceeded: free-models-per-day' } })) as typeof fetch
    await assert.rejects(() => recognizeFood({ apiKey: 'or-test', provider: 'openrouter', imageBase64: 'image' }), /дневная бесплатная квота/)
    globalThis.fetch = answer(JSON.stringify({ error: { message: 'Rate limit exceeded: 20 per minute' } })) as typeof fetch
    await assert.rejects(() => recognizeFood({ apiKey: 'or-test', provider: 'openrouter', imageBase64: 'image' }), /Подожди минуту/)
    globalThis.fetch = async () => new Response('{}', { status: 429 })
    await assert.rejects(() => recognizeFood({ apiKey: 'test-key', provider: 'groq', imageBase64: 'image' }), /лимит запросов или бесплатной квоты/)
  } finally { globalThis.fetch = original; resetOpenRouterModel() }
})

test('Проверка ключа OpenRouter показывает модель и дневной лимит, не отправляя фото', async () => {
  const original = globalThis.fetch
  resetOpenRouterModel()
  globalThis.fetch = async (input, init) => {
    assert.equal(init!.method, 'GET')
    assert.equal(init!.body, undefined)
    if (String(input).endsWith('/key')) return new Response(JSON.stringify({ data: { is_free_tier: true } }), { status: 200 })
    return new Response(JSON.stringify(orCatalog), { status: 200 })
  }
  try {
    const message = await checkAIKey({ apiKey: 'or-test', provider: 'openrouter' })
    assert.match(message, /qwen\/qwen3-vl-30b:free/)
    assert.match(message, /50 в день/)
    globalThis.fetch = async () => new Response('{}', { status: 401 })
    await assert.rejects(() => checkAIKey({ apiKey: 'wrong', provider: 'openrouter' }), /ключ не принят/)
  } finally { globalThis.fetch = original; resetOpenRouterModel() }
})

test('Настройки принимают OpenRouter, неизвестный сервис отклоняется', () => {
  assert.equal(parseAppData({ ...initialData, settings: { restSeconds: 90, aiProvider: 'openrouter' } }).settings.aiProvider, 'openrouter')
  assert.throws(() => parseAppData({ ...initialData, settings: { restSeconds: 90, aiProvider: 'unknown-service' } }), /сервис распознавания/)
  assert.equal(validateFood({ ...food, source: 'openrouter' }).source, 'openrouter')
})
