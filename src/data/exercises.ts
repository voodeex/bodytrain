import type { Exercise, MuscleGroup } from '../lib/types'

export const muscleLabels: Record<MuscleGroup, string> = {
  chest: 'Грудь',
  back: 'Спина',
  legs: 'Ноги',
  shoulders: 'Плечи',
  arms: 'Руки',
  core: 'Пресс',
  cardio: 'Кардио',
  other: 'Другое',
}

export const muscleOrder: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'other']

const list: [string, string, MuscleGroup][] = [
  ['bench-press', 'Жим штанги лёжа', 'chest'],
  ['incline-bench', 'Жим штанги на наклонной', 'chest'],
  ['db-bench', 'Жим гантелей лёжа', 'chest'],
  ['incline-db', 'Жим гантелей на наклонной', 'chest'],
  ['dips', 'Отжимания на брусьях', 'chest'],
  ['pushups', 'Отжимания от пола', 'chest'],
  ['db-fly', 'Разводка гантелей', 'chest'],
  ['cable-cross', 'Сведение в кроссовере', 'chest'],
  ['chest-press', 'Жим в тренажёре (грудь)', 'chest'],

  ['deadlift', 'Становая тяга', 'back'],
  ['pullups', 'Подтягивания', 'back'],
  ['barbell-row', 'Тяга штанги в наклоне', 'back'],
  ['db-row', 'Тяга гантели одной рукой', 'back'],
  ['lat-pulldown', 'Тяга верхнего блока', 'back'],
  ['seated-row', 'Тяга горизонтального блока', 'back'],
  ['t-bar-row', 'Тяга Т-грифа', 'back'],
  ['hyperext', 'Гиперэкстензия', 'back'],

  ['squat', 'Приседания со штангой', 'legs'],
  ['front-squat', 'Фронтальные приседания', 'legs'],
  ['leg-press', 'Жим ногами', 'legs'],
  ['rdl', 'Румынская тяга', 'legs'],
  ['lunges', 'Выпады', 'legs'],
  ['bulgarian', 'Болгарские сплит-приседания', 'legs'],
  ['leg-ext', 'Разгибание ног', 'legs'],
  ['leg-curl', 'Сгибание ног', 'legs'],
  ['hip-thrust', 'Ягодичный мост', 'legs'],
  ['calf-raise', 'Подъём на носки', 'legs'],

  ['ohp', 'Жим штанги стоя', 'shoulders'],
  ['db-press', 'Жим гантелей сидя', 'shoulders'],
  ['lateral-raise', 'Махи гантелями в стороны', 'shoulders'],
  ['rear-delt', 'Махи в наклоне', 'shoulders'],
  ['face-pull', 'Тяга к лицу', 'shoulders'],
  ['upright-row', 'Протяжка', 'shoulders'],

  ['barbell-curl', 'Подъём штанги на бицепс', 'arms'],
  ['db-curl', 'Подъём гантелей на бицепс', 'arms'],
  ['hammer-curl', 'Молотки', 'arms'],
  ['triceps-pushdown', 'Разгибание на блоке (трицепс)', 'arms'],
  ['french-press', 'Французский жим', 'arms'],
  ['close-grip', 'Жим узким хватом', 'arms'],

  ['plank', 'Планка (сек)', 'core'],
  ['crunches', 'Скручивания', 'core'],
  ['leg-raise', 'Подъём ног в висе', 'core'],
  ['ab-wheel', 'Ролик для пресса', 'core'],

  ['run', 'Бег (мин)', 'cardio'],
  ['bike', 'Велотренажёр (мин)', 'cardio'],
  ['rowing', 'Гребной тренажёр (мин)', 'cardio'],
  ['jump-rope', 'Скакалка (мин)', 'cardio'],
]

export const defaultExercises: Exercise[] = list.map(([id, name, muscle]) => ({ id, name, muscle, unit: id === 'plank' ? 'seconds' : muscle === 'cardio' ? 'minutes' : 'reps' }))
