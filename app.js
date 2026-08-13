import { EVENTS, INTERESTS, cityLabel, interestLabel } from './events.js';
import {
  clearState,
  defaultState,
  disableEncryption,
  enableEncryption,
  exportState,
  importStateFromJson,
  loadState,
  saveState,
  unlockWithPassphrase,
  todayKey
} from './storage.js';
import { formatLatLon, guessCityKeyFromCoords, haversineKm } from './geo.js';
import { StepCounter } from './steps.js';
import { decryptJson, encryptJson } from './encryption.js';
import { FULL_QUESTIONNAIRE, CATEGORY_LABELS, CATEGORY_ORDER, factualLabel } from './questionnaire-data.js';

const $ = (sel) => document.querySelector(sel);

// Helps diagnose cases where the module loads but init hangs (e.g. storage blocked).
window.__walkdateModuleLoaded = true;

let state = null;
let geoWatchId = null;
let stepCounter = null;
let deferredInstallPrompt = null;
let tinder = null;
let remoteEvents = [];
let remoteEventsCity = null;
let remoteEventsUpdatedAt = null;
let map = null;
let mapLayer = null;
let meMarker = null;
let nearbyMarkers = [];
let lastLocSentAt = 0;

const CIS_CITY_KEYS = new Set(['Moscow', 'Saint Petersburg', 'Kazan', 'Novosibirsk']);

const COMM_FORMATS = [
  { id: 'chat', label: 'Чат' },
  { id: 'voice', label: 'Голос' },
  { id: 'video', label: 'Видео' },
  { id: 'meet', label: 'Встречи' },
  { id: 'slow', label: 'Переписка' },
  { id: 'games', label: 'Совм. игры' }
];

const VALUES = [
  { id: 'just', label: 'Просто познакомиться' },
  { id: 'family', label: 'Семейные ценности' },
  { id: 'online', label: 'Онлайн знакомства' },
  { id: 'goout', label: 'Вместе сходить куда-нибудь' }
];

const VALUES_ADULT = [
  { id: 'sex', label: 'Секс' }
];

const MEETING_INTENTS = [
  { id: 'serious', label: 'Серьезные отношения' },
  { id: 'sex', label: 'Секс' },
  { id: 'acquaintance', label: 'Знакомство' },
  { id: 'friend', label: 'Дружеское общение' },
  { id: 'love', label: 'Любовь' },
  { id: 'business', label: 'Бизнес' },
  { id: 'party', label: 'Потусить' },
  { id: 'hangout', label: 'Вписка' },
  { id: 'work', label: 'Поработать вместе' },
  { id: 'skill', label: 'Приобрести навык' },
  { id: 'startup', label: 'Стартап' }
];

const MEETING_PLACES = [
  { id: 'all', label: 'Все места' },
  { id: 'club', label: 'Клубы' },
  { id: 'restaurant', label: 'Рестораны' },
  { id: 'culture', label: 'Культурные события' }
];

const WISHLIST_PLACES = [
  { id: 'cafe', label: 'Кофейни' },
  { id: 'park', label: 'Парки' },
  { id: 'gallery', label: 'Галереи' },
  { id: 'restaurant', label: 'Рестораны' },
  { id: 'club', label: 'Клубы' },
  { id: 'event', label: 'События' }
];

const CIRCLE_RELATIONS = [
  { id: 'friend', label: 'Друг / подруга' },
  { id: 'colleague', label: 'Коллега' },
  { id: 'classmate', label: 'Однокурсник / однокурсница' },
  { id: 'sibling', label: 'Брат / сестра' },
  { id: 'other', label: 'Другое' }
];

const FRIEND_VALUE_TAGS = [
  { id: 'reliable', label: 'Надёжность' },
  { id: 'smart', label: 'Интеллект' },
  { id: 'humor', label: 'Чувство юмора' },
  { id: 'care', label: 'Забота' },
  { id: 'ambition', label: 'Амбициозность' },
  { id: 'creative', label: 'Творчество' },
  { id: 'calm', label: 'Спокойствие' },
  { id: 'social', label: 'Открытость' },
  { id: 'kind', label: 'Щедрость' },
  { id: 'loyal', label: 'Верность' }
];

const FRIEND_NUANCE_TAGS = [
  { id: 'thoughts', label: 'Может надолго уходить в мысли' },
  { id: 'games', label: 'Любит компьютерные игры' },
  { id: 'direct', label: 'Слишком прямолинейный(ая)' },
  { id: 'emotional', label: 'Эмоциональный(ая), живёт сердцем' },
  { id: 'spontaneous', label: 'Склонен(на) к спонтанности' },
  { id: 'order', label: 'Любит порядок во всём' },
  { id: 'slow', label: 'Медленно принимает решения' },
  { id: 'active', label: 'Предпочитает активный отдых' },
  { id: 'late', label: 'Долго собирается' },
  { id: 'family', label: 'Очень привязан(а) к семье' }
];

const STEP_BUCKETS = [
  { id: '<5000', label: '< 5 000 шагов' },
  { id: '<10000', label: '< 10 000 шагов' },
  { id: '<15000', label: '< 15 000 шагов' },
  { id: '<20000', label: '< 20 000 шагов' },
  { id: '>20000', label: '> 20 000 шагов' }
];

const DATING_PROFILES = [
  {
    id: 'p1',
    likesYou: true,
    name: 'Алина',
    age: 26,
    city: 'Moscow',
    stepCount: 8400,
    meetingIntent: ['serious', 'love', 'friend', 'skill'],
    meetingPlaces: ['restaurant', 'culture'],
    photos: ['./assets/profile/avatar-4x5.jpg'],
    interests: ['coffee', 'walks', 'art'],
    communication: ['chat', 'meet', 'slow'],
    values: ['goout', 'family'],
    zodiac: 'Весы',
    jobTitle: 'Designer',
    education: 'МГУ',
    budget: '10 000 ₽',
    about: 'Люблю прогулки, выставки и уютные кофейни.',
    persona: {
      conflict: 'cooperate',
      attachment: 'safe',
      temperament: 'sanguine',
      motivation: 'love',
      pace: 'steady',
      game: 'cooperate',
      humor: 'high',
      social: 'close',
      attribution: 'balanced'
    },
    factual: {
      appearance: 'высокий',
      finance: 'накопитель',
      family: 'дети_хочу_да',
      home: 'уборка_терплю',
      hobby: 'хобби_чтение',
      travel: 'путешествия_регулярно',
      habits: 'курение_нет',
      health: 'спорт_зож_регулярно',
      relationship: 'цель_брак',
      extra: 'религия_агностик'
    }
  },
  {
    id: 'p2',
    likesYou: true,
    name: 'Илья',
    age: 29,
    city: 'Moscow',
    stepCount: 12600,
    meetingIntent: ['serious', 'acquaintance', 'love', 'business', 'work', 'startup'],
    meetingPlaces: ['club', 'restaurant'],
    photos: ['./assets/profile/avatar-square.jpg'],
    interests: ['sport', 'food', 'cinema'],
    communication: ['chat', 'voice', 'meet'],
    values: ['goout', 'just'],
    zodiac: 'Близнецы',
    jobTitle: 'Software Engineer',
    education: 'МИФИ',
    budget: '15 000 ₽',
    about: 'Бегаю по утрам, вечером кино или вкусный ужин.',
    persona: {
      conflict: 'control',
      attachment: 'safe',
      temperament: 'choleric',
      motivation: 'status',
      pace: 'fast',
      game: 'defect',
      humor: 'medium',
      social: 'open',
      attribution: 'balanced'
    },
    factual: {
      appearance: 'средний',
      finance: 'инвестор',
      family: 'дети_хочу_да',
      home: 'уборка_поровну',
      hobby: 'хобби_спорт',
      travel: 'путешествия_регулярно',
      habits: 'курение_нет',
      health: 'спорт_зож_ежедневно',
      relationship: 'цель_брак',
      extra: 'религия_атеист'
    }
  },
  {
    id: 'p3',
    likesYou: false,
    name: 'Катя',
    age: 24,
    city: 'Saint Petersburg',
    stepCount: 4200,
    meetingIntent: ['friend', 'acquaintance', 'business', 'party', 'startup'],
    meetingPlaces: ['culture', 'restaurant'],
    photos: ['./assets/profile/photo-1024.jpg'],
    interests: ['museums', 'books', 'walks'],
    communication: ['chat', 'slow', 'video'],
    values: ['online', 'family'],
    zodiac: 'Водолей',
    jobTitle: 'Student',
    education: 'СПбГУ',
    budget: '5 000 ₽',
    about: 'Скандинавские романы, музеи и длинные разговоры.',
    persona: {
      conflict: 'avoid',
      attachment: 'anxious',
      temperament: 'melancholic',
      motivation: 'family',
      pace: 'slow',
      game: 'avoid',
      humor: 'low',
      social: 'close',
      attribution: 'internal'
    },
    factual: {
      appearance: 'средний',
      finance: 'накопления_низкие',
      family: 'дети_хочу_нерешил',
      home: 'уборка_ненавижу',
      hobby: 'хобби_чтение',
      travel: 'путешествия_редко',
      habits: 'курение_нет',
      health: 'спорт_зож_нет',
      relationship: 'цель_долгосрочные',
      extra: 'религия_агностик'
    }
  },
  {
    id: 'p4',
    likesYou: true,
    name: 'Данил',
    age: 31,
    city: 'Kazan',
    stepCount: 21800,
    meetingIntent: ['sex', 'acquaintance', 'love', 'business', 'hangout', 'startup'],
    meetingPlaces: ['club', 'culture'],
    photos: ['./assets/profile/source.jpg'],
    interests: ['food', 'music', 'night'],
    communication: ['chat', 'voice', 'video', 'meet'],
    values: ['just', 'sex'],
    zodiac: 'Лев',
    jobTitle: 'Entrepreneur',
    education: 'КФУ',
    budget: '25 000 ₽',
    about: 'Люблю концерты и открывать новые места.',
    persona: {
      conflict: 'pursue',
      attachment: 'chaotic',
      temperament: 'choleric',
      motivation: 'status',
      pace: 'fast',
      game: 'control',
      humor: 'sharp',
      social: 'adaptive',
      attribution: 'humor'
    },
    factual: {
      appearance: 'высокий',
      finance: 'инвестор',
      family: 'дети_хочу_нет',
      home: 'уборка_клининг',
      hobby: 'хобби_игры',
      travel: 'путешествия_часто',
      habits: 'курение_иногда',
      health: 'спорт_зож_регулярно',
      relationship: 'цель_долгосрочные',
      extra: 'религия_всё_равно'
    }
  }
];

const QUESTIONNAIRE = [
  {
    block: 'Блок 1: Конфликт и стратегия',
    question: 'Вы с партнёром поссорились. Она ушла в другую комнату и не разговаривает. Ваши действия:',
    id: 'conflict_break',
    dimension: 'conflict',
    options: [
      { id: 'space', label: 'Даёте пространство и ждёте, пока остынет', hint: 'Стратегия: избегание • темперамент: флегматик', traits: { conflict: 'avoid', temperament: 'phlegmatic', game: 'avoid' } },
      { id: 'talk', label: 'Идёте следом и пытаетесь поговорить, даже если не хочет', hint: 'Стратегия: настойчивость • темперамент: холерик', traits: { conflict: 'pursue', temperament: 'choleric', game: 'control' } },
      { id: 'note', label: 'Оставляете записку с извинением или шуткой', hint: 'Стратегия: сотрудничество • темперамент: сангвиник', traits: { conflict: 'cooperate', temperament: 'sanguine', game: 'cooperate', humor: 'high' } },
      { id: 'freeze', label: 'Замолкаете и уходите в себя', hint: 'Стратегия: уход в себя • темперамент: меланхолик', traits: { conflict: 'avoid', temperament: 'melancholic', game: 'avoid', attribution: 'internal' } }
    ]
  },
  {
    block: 'Блок 1: Конфликт и стратегия',
    question: 'Партнёр долго не отвечает. Что вы скорее подумаете?',
    id: 'silence',
    dimension: 'attribution',
    options: [
      { id: 'busy', label: 'Он/она, скорее всего, просто занят(а)', hint: 'Теория атрибуции: балансовая интерпретация', traits: { attribution: 'balanced', attachment: 'safe' } },
      { id: 'panic', label: 'Наверное, я стал(а) менее важен(на)', hint: 'Тревожная привязанность', traits: { attribution: 'anxious', attachment: 'anxious' } },
      { id: 'distance', label: 'Лучше не навязываться — отступлю', hint: 'Избегающая привязанность', traits: { attribution: 'avoidant', attachment: 'avoidant' } },
      { id: 'check', label: 'Проверю ещё раз и пошучу, чтобы снять напряжение', hint: 'Комбинация контроля и юмора', traits: { attribution: 'suspicious', attachment: 'chaotic', humor: 'medium' } }
    ]
  },
  {
    block: 'Блок 2: Привязанность и доверие',
    question: 'Когда отношения становятся по-настоящему близкими, вы:',
    id: 'closeness',
    dimension: 'attachment',
    options: [
      { id: 'open', label: 'Расслабляюсь и открываюсь ещё больше', hint: 'Безопасная привязанность', traits: { attachment: 'safe', conflict: 'cooperate', game: 'cooperate' } },
      { id: 'worry', label: 'Начинаю переживать, что меня могут бросить', hint: 'Тревожная привязанность', traits: { attachment: 'anxious', attribution: 'anxious' } },
      { id: 'space', label: 'Становится нужно больше личного пространства', hint: 'Избегающая привязанность', traits: { attachment: 'avoidant', conflict: 'avoid' } },
      { id: 'pullaway', label: 'То сближаюсь, то резко отдаляюсь', hint: 'Тревожно-избегающий стиль', traits: { attachment: 'chaotic', conflict: 'pursue', game: 'control' } }
    ]
  },
  {
    block: 'Блок 2: Привязанность и доверие',
    question: 'Зачем вы чаще всего вступаете в отношения?',
    id: 'motivation',
    dimension: 'motivation',
    options: [
      { id: 'love', label: 'Чтобы любить и быть любимым(ой)', hint: 'Мотивация близости', traits: { motivation: 'love', attachment: 'safe' } },
      { id: 'family', label: 'Чтобы строить семью и ритуалы', hint: 'Стабильность и семья', traits: { motivation: 'family', game: 'cooperate' } },
      { id: 'status', label: 'Чтобы расти, усиливать статус или самооценку', hint: 'Рациональная цель, которая может выглядеть иррационально', traits: { motivation: 'status', game: 'defect' } },
      { id: 'play', label: 'Чтобы жить легче, интереснее и свободнее', hint: 'Свобода и игра', traits: { motivation: 'play', humor: 'high', temperament: 'sanguine' } }
    ]
  },
  {
    block: 'Блок 3: Темперамент и ритм',
    question: 'Под давлением вы скорее:',
    id: 'stress',
    dimension: 'temperament',
    options: [
      { id: 'fast', label: 'Действуете быстро и резко', hint: 'Холерик', traits: { temperament: 'choleric', pace: 'fast', conflict: 'pursue' } },
      { id: 'talk', label: 'Разговариваете, шутите и разряжаете обстановку', hint: 'Сангвиник', traits: { temperament: 'sanguine', humor: 'high', conflict: 'cooperate' } },
      { id: 'steady', label: 'Сохраняете спокойствие и двигаетесь ровно', hint: 'Флегматик', traits: { temperament: 'phlegmatic', pace: 'steady', conflict: 'avoid' } },
      { id: 'deep', label: 'Глубоко переживаете и потом долго перевариваете', hint: 'Меланхолик', traits: { temperament: 'melancholic', pace: 'slow', attribution: 'internal' } }
    ]
  },
  {
    block: 'Блок 3: Темперамент и ритм',
    question: 'Ваш естественный темп жизни — это скорее:',
    id: 'pace',
    dimension: 'pace',
    options: [
      { id: 'fast', label: 'Быстрый, насыщенный, много параллельных дел', hint: 'Высокая скорость реакции', traits: { pace: 'fast', temperament: 'choleric' } },
      { id: 'steady', label: 'Ровный, устойчивый, без резких рывков', hint: 'Стабильность', traits: { pace: 'steady', temperament: 'phlegmatic' } },
      { id: 'slow', label: 'Медленный, вдумчивый, с паузами', hint: 'Глубина и чувствительность', traits: { pace: 'slow', temperament: 'melancholic' } },
      { id: 'mixed', label: 'Зависит от людей и ситуации', hint: 'Адаптивность', traits: { pace: 'mixed', temperament: 'sanguine' } }
    ]
  },
  {
    block: 'Блок 4: Теория игр и границы',
    question: 'Когда речь идёт о договорённостях, вы обычно:',
    id: 'game',
    dimension: 'game',
    options: [
      { id: 'cooperate', label: 'Играю честно и жду взаимности', hint: 'Tit-for-Tat / сотрудничество', traits: { game: 'cooperate', conflict: 'cooperate', attribution: 'balanced' } },
      { id: 'defect', label: 'Сначала защищаю свои интересы', hint: 'Рациональный выбор ради собственной выгоды', traits: { game: 'defect', conflict: 'control', motivation: 'status' } },
      { id: 'avoid', label: 'Стараюсь не ввязываться в лишние споры', hint: 'Избегание', traits: { game: 'avoid', conflict: 'avoid', temperament: 'phlegmatic' } },
      { id: 'control', label: 'Пытаюсь держать рамку и управлять исходом', hint: 'Контроль стратегии', traits: { game: 'control', conflict: 'pursue', temperament: 'choleric' } }
    ]
  },
  {
    block: 'Блок 4: Теория игр и границы',
    question: 'Если вы чувствуете ревность, то чаще всего:',
    id: 'jealousy',
    dimension: 'attachment',
    options: [
      { id: 'talk', label: 'Сразу обсуждаю это спокойно', hint: 'Стабильная, зрелая привязанность', traits: { attachment: 'safe', game: 'cooperate', attribution: 'balanced' } },
      { id: 'ask', label: 'Ищу подтверждение и успокоение', hint: 'Тревожная привязанность', traits: { attachment: 'anxious', attribution: 'anxious' } },
      { id: 'cool', label: 'Остываю и держу дистанцию', hint: 'Избегание', traits: { attachment: 'avoidant', conflict: 'avoid' } },
      { id: 'test', label: 'Проверяю границы или провоцирую', hint: 'Контроль и сложная динамика', traits: { attachment: 'chaotic', game: 'control', conflict: 'control' } }
    ]
  },
  {
    block: 'Блок 5: Юмор и социальность',
    question: 'Какую роль в отношениях играет юмор?',
    id: 'humor',
    dimension: 'humor',
    options: [
      { id: 'high', label: 'Очень важную: он сближает и снимает напряжение', hint: 'Юмор как инструмент сотрудничества', traits: { humor: 'high', temperament: 'sanguine', conflict: 'cooperate' } },
      { id: 'medium', label: 'Умеренную: шутки нужны, но не всегда', hint: 'Юмор есть, но он не решает всё', traits: { humor: 'medium', social: 'adaptive' } },
      { id: 'low', label: 'Небольшую: важнее надёжность и смысл', hint: 'Юмор не определяет, но может помогать', traits: { humor: 'low', temperament: 'phlegmatic' } },
      { id: 'sharp', label: 'Острый / ироничный — это мой способ выживания', hint: 'Иногда помогает, иногда ранит', traits: { humor: 'sharp', temperament: 'melancholic', attribution: 'humor' } }
    ]
  },
  {
    block: 'Блок 5: Юмор и социальность',
    question: 'Ваш идеальный ритм общения с людьми:',
    id: 'social',
    dimension: 'social',
    options: [
      { id: 'open', label: 'Много общения и новые люди', hint: 'Открытая социальность', traits: { social: 'open', temperament: 'sanguine' } },
      { id: 'close', label: 'Небольшой круг своих', hint: 'Выборочная открытость', traits: { social: 'close', attachment: 'safe' } },
      { id: 'alone', label: 'Чаще нужен личный простор и тишина', hint: 'Интроверсия / приватность', traits: { social: 'alone', temperament: 'melancholic' } },
      { id: 'adaptive', label: 'Подстраиваюсь под человека и ситуацию', hint: 'Гибкость', traits: { social: 'adaptive', game: 'cooperate' } }
    ]
  }
];

const QUESTIONNAIRE_LABELS = {
  conflict: {
    cooperate: 'сотрудничество',
    avoid: 'избегание',
    control: 'контроль',
    pursue: 'настойчивость'
  },
  attachment: {
    safe: 'безопасная привязанность',
    anxious: 'тревожная привязанность',
    avoidant: 'избегающая привязанность',
    chaotic: 'тревожно-избегающая'
  },
  temperament: {
    choleric: 'холерик',
    sanguine: 'сангвиник',
    phlegmatic: 'флегматик',
    melancholic: 'меланхолик'
  },
  motivation: {
    love: 'любовь',
    family: 'семья',
    status: 'статус/самоутверждение',
    play: 'игра и лёгкость'
  },
  pace: {
    fast: 'быстрый темп',
    steady: 'ровный темп',
    slow: 'медленный темп',
    mixed: 'переменный темп'
  },
  game: {
    cooperate: 'взаимность',
    defect: 'жёсткий self-interest',
    avoid: 'избегание',
    control: 'контроль'
  },
  humor: {
    high: 'юмор выражен',
    medium: 'юмор умеренный',
    low: 'юмор сдержанный',
    sharp: 'острый юмор'
  },
  social: {
    open: 'открытый стиль',
    close: 'узкий круг',
    alone: 'нужна тишина',
    adaptive: 'адаптивность'
  },
  attribution: {
    balanced: 'сбалансированная интерпретация',
    anxious: 'тревожная интерпретация',
    avoidant: 'избегающее чтение',
    suspicious: 'подозрительность'
  }
};

// Полная анкета = психологический блок (дерево решений) + фактические категории.
const ALL_QUESTIONS = [...QUESTIONNAIRE, ...FULL_QUESTIONNAIRE];
const PSYCH_FIELDS = ['attachment', 'conflict', 'temperament', 'motivation', 'game', 'humor', 'social', 'pace', 'attribution'];
const DEALBREAKER_CATS = new Set(['habits', 'family', 'relationship', 'finance', 'extra']);

const QN_ZODIAC_MAP = {
  зодиак_овен: 'Овен',
  зодиак_телец: 'Телец',
  зодиак_близнецы: 'Близнецы'
};

let qnIndex = 0;
let qnAnimating = false;

init().catch((err) => {
  showFatal(err?.message || err);
});

async function init() {
  state = await safeLoadStateWithTimeout(1500);
  window.__walkdateStarted = true;
  boot();
  // Optional demo helper: if you open ?demoPhoto=1, it loads a sample profile photo from assets.
  // Useful to preview how photos look without uploading via file picker.
  try {
    const params = new URLSearchParams(location.search);
    const demo = params.get('demoPhoto');
    if (demo === '1' && (!state.profile.photos || state.profile.photos.length === 0)) {
      await addProfilePhotoFromUrl('./assets/profile/photo-1024.jpg');
    }
    if (demo === 'force') {
      await addProfilePhotoFromUrl('./assets/profile/photo-1024.jpg');
    }
  } catch {
    // ignore
  }
}

function boot() {
  installGlobalErrorOverlay();
  ensureTodaySteps();
  ensureTodayPlans();
  wireTabs();
  wireSettings();
  wirePwa();
  wireSwipes();
  wireQuestionnaire();
  renderAll();
  maybeStartOnboarding();

  // Ask once, then let user decide.
  if (!state.consent.asked) {
    const dlg = $('#dlgConsent');
    dlg.showModal();
    $('#btnConsentOk').addEventListener('click', () => {
      state.consent.asked = true;
      // We only enable toggles; actual permission prompts happen on start.
      state.consent.geo = true;
      state.consent.steps = true;
      save();
      startGeoIfNeeded();
      startStepsIfNeeded();
      renderAll();
    });
    dlg.addEventListener('close', () => {
      state.consent.asked = true;
      save();
      renderAll();
    }, { once: true });
  } else {
    startGeoIfNeeded();
    startStepsIfNeeded();
  }

  window.addEventListener('online', () => updateFooter());
  window.addEventListener('offline', () => updateFooter());
  updateFooter();
}

async function safeLoadState() {
  try {
    return await loadState();
  } catch (err) {
    // If IndexedDB is blocked (rare), fall back to an in-memory default state
    // so the UI still works and we can show an actionable error.
    queueMicrotask(() => showFatal(`Storage init failed: ${err?.message || err}`));
    return defaultState();
  }
}

async function safeLoadStateWithTimeout(ms) {
  try {
    return await Promise.race([
      safeLoadState(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout')), ms))
    ]);
  } catch (err) {
    showFatal(`Storage init failed: ${err?.message || err}`);
    return defaultState();
  }
}

function installGlobalErrorOverlay() {
  window.addEventListener('error', (e) => {
    showFatal(e?.error?.message || e?.message || 'Unknown error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    showFatal(e?.reason?.message || e?.reason || 'Unhandled rejection');
  });
}

function showFatal(message) {
  let el = document.getElementById('fatalOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatalOverlay';
    el.style.position = 'fixed';
    el.style.left = '12px';
    el.style.right = '12px';
    el.style.top = '12px';
    el.style.zIndex = '9999';
    el.style.padding = '12px 14px';
    el.style.borderRadius = '16px';
    el.style.border = '1px solid rgba(255,255,255,0.14)';
    el.style.background = 'rgba(17, 24, 39, 0.92)';
    el.style.backdropFilter = 'blur(12px)';
    el.style.boxShadow = '0 18px 60px rgba(0,0,0,0.55)';
    el.style.color = '#e5e7eb';
    el.style.font = '600 13px ui-sans-serif, system-ui';
    el.style.whiteSpace = 'pre-wrap';
    document.body.appendChild(el);
  }
  el.textContent = `Ошибка JS:\\n${String(message).slice(0, 600)}\\n\\nОткройте DevTools -> Console и пришлите первую ошибку.`;
}

function save() {
  saveState(state).catch(() => {});
}

function ensureTodaySteps() {
  const t = todayKey();
  if (state.steps.day !== t) {
    state.steps.day = t;
    state.steps.value = 0;
    save();
  }
}

function ensureTodayPlans() {
  const t = todayKey();
  if (!state.plans || state.plans.day !== t) {
    state.plans = { day: t, items: [] };
    save();
  }
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
      $(`#view-${tab}`).classList.remove('hidden');
      if (tab !== 'home' && state?.messages?.openChat) {
        state.messages.openChat = null;
        save();
      }
      haptic('tab');
      renderAll();
    });
  });
}

function wireSwipes() {
  // Swipe left/right on main content switches tabs (native-feel).
  const order = ['home', 'events', 'dating', 'stats', 'circle'];
  const main = document.querySelector('.main');
  if (!main) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let activeId = null;

  const onDown = (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.button != null && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    activeId = e.pointerId;
    main.setPointerCapture?.(activeId);
  };

  const onMove = (e) => {
    if (!tracking || e.pointerId !== activeId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // If vertical scroll dominates, abort.
    if (Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx)) tracking = false;
  };

  const onUp = (e) => {
    if (!tracking || e.pointerId !== activeId) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy)) return;

    const cur = document.querySelector('.tab.active')?.dataset.tab || 'home';
    const idx = order.indexOf(cur);
    if (idx < 0) return;
    const next = dx < 0 ? order[Math.min(order.length - 1, idx + 1)] : order[Math.max(0, idx - 1)];
    if (next && next !== cur) switchTab(next);
  };

  main.addEventListener('pointerdown', onDown, { passive: true });
  main.addEventListener('pointermove', onMove, { passive: true });
  main.addEventListener('pointerup', onUp, { passive: true });
  main.addEventListener('pointercancel', onUp, { passive: true });
}

function wireSettings() {
  const dlg = $('#dlgSettings');
  $('#btnSettings').addEventListener('click', () => {
    syncSettingsUi();
    dlg.showModal();
    haptic('open');
  });

  $('#toggleGeo').addEventListener('change', async (e) => {
    state.consent.geo = e.target.checked;
    save();
    await startGeoIfNeeded();
    renderAll();
  });

  $('#toggleMapShare').addEventListener('change', (e) => {
    state.geo.mapShare = e.target.checked;
    save();
    renderAll();
    maybeShareLocation();
  });

  $('#togglePlanShare').addEventListener('change', (e) => {
    state.geo.planShare = e.target.checked;
    save();
    renderAll();
    maybeSharePlans();
  });

  $('#toggleSteps').addEventListener('change', async (e) => {
    state.consent.steps = e.target.checked;
    save();
    await startStepsIfNeeded();
    renderAll();
  });

  $('#btnSaveSteps').addEventListener('click', () => {
    const n = Number(String($('#inputSteps').value || '').replace(/[^0-9]/g, ''));
    if (!Number.isFinite(n) || n < 0) return toast('Введите число шагов');
    state.steps.day = todayKey();
    state.steps.value = Math.floor(n);
    save();
    if (stepCounter) stepCounter.reset(state.steps.value);
    renderAll();
    haptic('light');
    toast('Сохранено');
  });

  $('#selectCity').addEventListener('change', (e) => {
    state.profile.cityOverride = e.target.value;
    save();
    renderAll();
  });

  $('#inputJob').addEventListener('change', (e) => {
    state.profile.jobTitle = String(e.target.value || '').trim().slice(0, 60);
    save();
    renderAll();
    pushPublicProfileNow().catch(() => {});
  });

  $('#inputEducation').addEventListener('change', (e) => {
    state.profile.education = String(e.target.value || '').trim().slice(0, 80);
    save();
    renderAll();
    pushPublicProfileNow().catch(() => {});
  });

  $('#btnSaveHealth').addEventListener('click', () => {
    const mood = clampInt($('#inputMood').value, 1, 5, 3);
    const energy = clampInt($('#inputEnergy').value, 1, 5, 3);
    const sleepHours = clampFloat($('#inputSleep').value, 0, 24, 7);
    const note = String($('#inputHealthNote').value || '').trim().slice(0, 120);

    const day = todayKey();
    const entry = { day, mood, energy, sleepHours, note };

    state.health = state.health || { last: entry, history: [] };
    state.health.last = entry;
    const hist = Array.isArray(state.health.history) ? state.health.history : [];
    const filtered = hist.filter((x) => x?.day !== day);
    filtered.unshift(entry);
    state.health.history = filtered.slice(0, 90);
    save();
    renderAll();
    haptic('light');
    toast('Здоровье сохранено');
  });

  $('#btnEnableEnc').addEventListener('click', async () => {
    try {
      const pass = String($('#inputPassphrase').value || '');
      state = await enableEncryption(pass, state);
      toast('Шифрование включено');
      haptic('light');
      $('#inputPassphrase').value = '';
      renderAll();
    } catch (err) {
      toast(err?.message || 'Не удалось включить шифрование');
    }
  });

  $('#btnUnlockEnc').addEventListener('click', async () => {
    try {
      const pass = String($('#inputPassphrase').value || '');
      state = await unlockWithPassphrase(pass, state);
      toast('Разблокировано');
      haptic('light');
      $('#inputPassphrase').value = '';
      renderAll();
    } catch (err) {
      toast(err?.message || 'Не удалось разблокировать');
    }
  });

  $('#btnDisableEnc').addEventListener('click', async () => {
    if (!confirm('Выключить шифрование? Данные останутся, но будут храниться без шифрования.')) return;
    try {
      state = await disableEncryption(state);
      toast('Шифрование выключено');
      haptic('heavy');
      renderAll();
    } catch (err) {
      toast(err?.message || 'Не удалось выключить шифрование');
    }
  });

  $('#inputServerUrl').addEventListener('change', (e) => {
    state.cloud.serverUrl = String(e.target.value || '').trim() || state.cloud.serverUrl;
    save();
    renderAll();
  });

  $('#inputEmail').addEventListener('change', (e) => {
    state.cloud.email = String(e.target.value || '').trim();
    save();
    renderAll();
  });

  $('#btnRegister').addEventListener('click', async () => {
    try {
      const serverUrl = String($('#inputServerUrl').value || state.cloud.serverUrl || '').trim();
      const email = String($('#inputEmail').value || state.cloud.email || '').trim();
      const password = String($('#inputCloudPassword').value || '');
      const r = await apiRegister(serverUrl, email, password);
      state.cloud.serverUrl = serverUrl;
      state.cloud.email = r.email;
      state.cloud.token = r.token;
      state.cloud.enabled = true;
      save();
      pushPublicProfileNow().catch(() => {});
      toast('Регистрация ок');
      haptic('light');
      renderAll();
    } catch (err) {
      toast(err?.message || 'Ошибка регистрации');
    }
  });

  $('#btnLogin').addEventListener('click', async () => {
    try {
      const serverUrl = String($('#inputServerUrl').value || state.cloud.serverUrl || '').trim();
      const email = String($('#inputEmail').value || state.cloud.email || '').trim();
      const password = String($('#inputCloudPassword').value || '');
      const r = await apiLogin(serverUrl, email, password);
      state.cloud.serverUrl = serverUrl;
      state.cloud.email = r.email;
      state.cloud.token = r.token;
      state.cloud.enabled = true;
      save();
      pushPublicProfileNow().catch(() => {});
      toast('Логин ок');
      haptic('light');
      renderAll();
    } catch (err) {
      toast(err?.message || 'Ошибка логина');
    }
  });

  $('#btnLogout').addEventListener('click', () => {
    state.cloud.token = null;
    state.cloud.enabled = false;
    save();
    toast('Выход');
    haptic('light');
    renderAll();
  });

  $('#btnPull').addEventListener('click', async () => {
    try {
      await cloudPull();
      toast('Скачано');
      haptic('light');
      renderAll();
    } catch (err) {
      toast(err?.message || 'Ошибка скачивания');
    }
  });

  $('#btnPush').addEventListener('click', async () => {
    try {
      await cloudPush();
      toast('Загружено');
      haptic('light');
      renderAll();
    } catch (err) {
      toast(err?.message || 'Ошибка загрузки');
    }
  });

  $('#btnExport').addEventListener('click', () => {
    exportState(state).then((txt) => {
      const blob = new Blob([txt], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `walkdate-export-${todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      haptic('light');
    });
  });

  $('#fileImport').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      state = await importStateFromJson(text, state);
      toast('Импортировано');
      startGeoIfNeeded();
      startStepsIfNeeded();
      renderAll();
      haptic('light');
    } catch (err) {
      toast(err?.message || 'Ошибка импорта');
    } finally {
      e.target.value = '';
    }
  });

  $('#btnClear').addEventListener('click', () => {
    if (!confirm('Точно очистить все данные на этом устройстве?')) return;
    stopGeo();
    stopSteps();
    clearState().then(async () => {
      state = await loadState();
      renderAll();
      haptic('heavy');
      toast('Очищено');
    });
  });

  const chips = $('#interestChips');
  chips.addEventListener('click', (e) => {
    const el = e.target.closest('[data-interest]');
    if (!el) return;
    const id = el.dataset.interest;
    const set = new Set(state.profile.interests);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    state.profile.interests = [...set];
    save();
    renderAll();
    pushPublicProfileNow().catch(() => {});
  });

  const comm = $('#commChips');
  comm.addEventListener('click', (e) => {
    const el = e.target.closest('[data-comm]');
    if (!el) return;
    const id = el.dataset.comm;
    const set = new Set(state.profile.communication || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    state.profile.communication = [...set];
    save();
    renderAll();
    pushPublicProfileNow().catch(() => {});
  });

  const values = $('#valuesChips');
  values.addEventListener('click', (e) => {
    const el = e.target.closest('[data-val]');
    if (!el) return;
    const id = el.dataset.val;
    const set = new Set(state.profile.values || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    state.profile.values = [...set];
    save();
    renderAll();
    pushPublicProfileNow().catch(() => {});
  });

  const valuesAdult = $('#valuesAdultChips');
  valuesAdult.addEventListener('click', (e) => {
    const el = e.target.closest('[data-val]');
    if (!el) return;
    const id = el.dataset.val;
    const set = new Set(state.profile.values || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    state.profile.values = [...set];
    save();
    renderAll();
    pushPublicProfileNow().catch(() => {});
  });

  $('#btnAdultToggle').addEventListener('click', () => {
    // Explicit separate button as requested.
    state.profile.valuesAdultUnlocked = !state.profile.valuesAdultUnlocked;
    save();
    renderAll();
    haptic('light');
  });
}

function syncSettingsUi() {
  $('#toggleGeo').checked = !!state.consent.geo;
  $('#toggleMapShare').checked = !!state.geo?.mapShare;
  $('#togglePlanShare').checked = !!state.geo?.planShare;
  $('#toggleSteps').checked = !!state.consent.steps;
  $('#inputSteps').value = String(state.steps.value || '');
  $('#selectCity').value = state.profile.cityOverride || 'auto';
  $('#inputJob').value = state.profile.jobTitle || '';
  $('#inputEducation').value = state.profile.education || '';

  const h = state.health?.last || { mood: 3, energy: 3, sleepHours: 7, note: '' };
  $('#inputMood').value = String(h.mood ?? '');
  $('#inputEnergy').value = String(h.energy ?? '');
  $('#inputSleep').value = String(h.sleepHours ?? '');
  $('#inputHealthNote').value = String(h.note ?? '');

  const preview = $('#profilePhotosPreview');
  if (preview) {
    const photos = state.profile?.photos || [];
    preview.innerHTML = photos.length
      ? photos
          .slice(0, 3)
          .map(
            (src) =>
              `<img alt="profile photo" src="${src}" style="width:64px;height:64px;object-fit:cover;border-radius:16px;border:1px solid rgba(255,255,255,0.12)" />`
          )
          .join('')
      : `<span class="muted">Фото не добавлено</span>`;
  }

  $('#encStatus').textContent = state.encryption?.enabled
    ? state.__locked
      ? 'Шифрование: включено (заблокировано)'
      : 'Шифрование: включено'
    : 'Шифрование: выключено';

  $('#inputServerUrl').value = state.cloud?.serverUrl || '';
  $('#inputEmail').value = state.cloud?.email || '';

  const cloudOn = !!state.cloud?.enabled;
  const authed = !!state.cloud?.token;
  $('#cloudStatus').textContent = cloudOn ? (authed ? 'Синк: включен (вход выполнен)' : 'Синк: включен (нет токена)') : 'Синк: выключен';

  $('#interestChips').innerHTML = INTERESTS.map((x) => {
    const active = state.profile.interests.includes(x.id);
    return `<div class="chip ${active ? 'active' : ''}" data-interest="${x.id}">${x.label}</div>`;
  }).join('');

  $('#commChips').innerHTML = COMM_FORMATS.map((x) => {
    const active = (state.profile.communication || []).includes(x.id);
    return `<div class="chip ${active ? 'active' : ''}" data-comm="${x.id}">${x.label}</div>`;
  }).join('');

  $('#valuesChips').innerHTML = VALUES.map((x) => {
    const active = (state.profile.values || []).includes(x.id);
    return `<div class="chip ${active ? 'active' : ''}" data-val="${x.id}">${x.label}</div>`;
  }).join('');

  const unlocked = !!state.profile.valuesAdultUnlocked;
  $('#valuesAdultWrap').classList.toggle('hidden', !unlocked);
  $('#btnAdultToggle').textContent = unlocked ? 'Скрыть 18+' : 'Показать 18+';
  $('#valuesAdultChips').innerHTML = VALUES_ADULT.map((x) => {
    const active = (state.profile.values || []).includes(x.id);
    return `<div class="chip ${active ? 'active' : ''}" data-val="${x.id}">${x.label}</div>`;
  }).join('');
}

function wirePwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('#btnInstall').hidden = false;
  });

  $('#btnInstall').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#btnInstall').hidden = true;
  });
}

async function startGeoIfNeeded() {
  if (!state.consent.geo) {
    stopGeo();
    state.geo.tracking = false;
    save();
    return;
  }

  if (!('geolocation' in navigator)) {
    toast('Геолокация недоступна в этом браузере');
    return;
  }

  if (geoWatchId != null) return;

  state.geo.tracking = true;
  save();

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const ts = pos.timestamp || Date.now();

      const guessedCity = guessCityKeyFromCoords(lat, lon);
      state.lastKnown = {
        lat,
        lon,
        acc,
        ts,
        cityKey: guessedCity
      };

      maybeRecordGeoPoint({ lat, lon, acc, ts, cityKey: guessedCity });
      save();
      renderAll();
      maybeShareLocation();
    },
    (err) => {
      toast(err.message || 'Ошибка геолокации');
      stopGeo();
      state.geo.tracking = false;
      state.consent.geo = false;
      save();
      renderAll();
    },
    {
      enableHighAccuracy: false,
      maximumAge: 10_000,
      timeout: 15_000
    }
  );
}

function stopGeo() {
  if (geoWatchId == null) return;
  navigator.geolocation.clearWatch(geoWatchId);
  geoWatchId = null;
}

function maybeRecordGeoPoint(p) {
  // Keep only lightweight "where I went" trail.
  const points = state.geo.points || [];
  const last = points[0];

  if (!last) {
    points.unshift({ ...p, note: '' });
    state.geo.points = points.slice(0, 300);
    return;
  }

  const km = haversineKm({ lat: p.lat, lon: p.lon }, { lat: last.lat, lon: last.lon });
  const dt = Math.abs((p.ts || 0) - (last.ts || 0));

  // Record if moved ~60m+ or 10min passed.
  if (km >= 0.06 || dt >= 10 * 60 * 1000) {
    points.unshift({ ...p, note: '' });
    state.geo.points = points.slice(0, 300);
  }
}

async function startStepsIfNeeded() {
  if (!state.consent.steps) {
    stopSteps();
    save();
    return;
  }

  if (!stepCounter) {
    stepCounter = new StepCounter({
      onStep: (n) => {
        state.steps.day = todayKey();
        state.steps.value = n;
        save();
        renderAll();
      }
    });
    stepCounter.reset(state.steps.value || 0);
  }

  if (stepCounter.running) return;

  try {
    await stepCounter.start();
    toast('Шаги: датчики включены');
  } catch (err) {
    toast(err?.message || 'Не удалось включить датчики');
    // Still keep manual input enabled.
  }
}

function stopSteps() {
  if (!stepCounter) return;
  stepCounter.stop();
}

function currentCityKey() {
  if (state.profile.cityOverride && state.profile.cityOverride !== 'auto') return state.profile.cityOverride;
  return state.lastKnown?.cityKey || null;
}

function mapUrlForCoords(lat, lon, cityKey = null, zoom = 16) {
  const isCis = cityKey ? CIS_CITY_KEYS.has(cityKey) : false;
  if (isCis) {
    return `https://yandex.com/maps/?ll=${lon}%2C${lat}&z=${zoom}&pt=${lon}%2C${lat},pm2rdm`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function cityCenter(cityKey) {
  const centers = {
    Moscow: { lat: 55.7558, lon: 37.6173 },
    'Saint Petersburg': { lat: 59.9311, lon: 30.3609 },
    Kazan: { lat: 55.7961, lon: 49.1064 },
    Novosibirsk: { lat: 55.0084, lon: 82.9357 }
  };
  return centers[cityKey] || null;
}

function cityDistanceKm(fromCityKey, toCityKey) {
  const from = cityCenter(fromCityKey);
  const to = cityCenter(toCityKey);
  if (!from || !to) return null;
  return haversineKm(from, to);
}

function matchesStepBucket(stepCount, bucket) {
  if (!bucket) return true;
  if (bucket === '<5000') return stepCount < 5000;
  if (bucket === '<10000') return stepCount < 10000;
  if (bucket === '<15000') return stepCount < 15000;
  if (bucket === '<20000') return stepCount < 20000;
  if (bucket === '>20000') return stepCount > 20000;
  return true;
}

function renderAll() {
  syncSettingsUi();
  renderHome();
  renderEvents();
  renderDating();
  renderStats();
  renderCircle();
  updateFooter();
}

function maybeStartOnboarding() {
  // Do not auto-open onboarding on app start.
  // Keep it available from the "Полная анкета" button.
  return;
}

function isProfileIncomplete(st) {
  const name = String(st.profile?.name || '').trim();
  const hasPhoto = Array.isArray(st.profile?.photos) && st.profile.photos.length > 0;
  const interests = st.profile?.interests || [];
  const comm = st.profile?.communication || [];
  const values = st.profile?.values || [];
  const job = String(st.profile?.jobTitle || '').trim();
  const edu = String(st.profile?.education || '').trim();
  const hasPlan = Array.isArray(st.plans?.items) && st.plans.items.length > 0;
  return !(name && hasPhoto && interests.length && comm.length && values.length && job && edu && hasPlan);
}

function openOnboarding() {
  toast('Онбординг убран. Анкета редактируется прямо в Профиле.');
}

function toggleFromChip(e, attr, field) {
  const el = e.target.closest(`[${attr}]`);
  if (!el) return;
  const id = el.getAttribute(attr);
  const set = new Set(state.profile[field] || []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  state.profile[field] = [...set];
  // Update chip UI immediately (wizard doesn't re-render on each click).
  el.classList.toggle('active', set.has(id));
  save();
  pushPublicProfileNow().catch(() => {});
}

async function readImageAsDataUrl(file, maxSize) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.86);
}

// Convenience: load a local workspace image by URL and store it as a profile photo.
async function addProfilePhotoFromUrl(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить фото');
  const blob = await res.blob();
  const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
  await addProfilePhotoFromFile(file);
}

async function addProfilePhotoFromFile(file) {
  const dataUrl = await readImageAsDataUrl(file, 1024);
  state.profile.photos = [dataUrl, ...(state.profile.photos || [])].slice(0, 6);
  save();
  pushPublicProfileNow().catch(() => {});
  renderAll();
}

function getQuestionnaireAnswers(profile = state.profile) {
  return profile?.questionnaireAnswers && typeof profile.questionnaireAnswers === 'object' ? profile.questionnaireAnswers : {};
}

function getOptionTraits(q, opt) {
  if (opt.traits) return opt.traits;
  if (q.category) return { [q.category]: opt.value };
  return {};
}

function setQuestionnaireAnswer(questionId, optionId, { silent } = {}) {
  state.profile.questionnaireAnswers = {
    ...(state.profile.questionnaireAnswers || {}),
    [questionId]: optionId
  };
  state.profile.portrait = buildQuestionnairePortrait(state.profile.questionnaireAnswers);

  // Сливаем данные в профиль: гороскоп берётся из анкеты и не спрашивается дважды.
  if (questionId === 'q258' && !state.profile.zodiac) {
    const opt = ALL_QUESTIONS.find((x) => x.id === 'q258')?.options.find((o) => o.id === optionId);
    if (opt && QN_ZODIAC_MAP[opt.value]) state.profile.zodiac = QN_ZODIAC_MAP[opt.value];
  }

  save();
  if (!silent) renderAll();
}

function buildQuestionnairePortrait(answers = {}) {
  const dimensionBuckets = {};
  let answered = 0;

  for (const q of ALL_QUESTIONS) {
    const answerId = answers[q.id];
    if (!answerId) continue;
    const opt = q.options.find((x) => x.id === answerId);
    if (!opt) continue;
    answered += 1;
    for (const [dim, val] of Object.entries(getOptionTraits(q, opt))) {
      if (!dimensionBuckets[dim]) dimensionBuckets[dim] = {};
      dimensionBuckets[dim][val] = (dimensionBuckets[dim][val] || 0) + 1;
    }
  }

  const summary = {};
  for (const [dim, bucket] of Object.entries(dimensionBuckets)) {
    summary[dim] = pickTopEntry(bucket);
  }

  const labels = Object.entries(summary)
    .map(([dim, val]) => questionnaireLabel(dim, val))
    .filter(Boolean);

  return {
    answered,
    total: ALL_QUESTIONS.length,
    summary,
    labels,
    categories: answeredCategories(answers)
  };
}

function answeredCategories(answers = {}) {
  const per = {};
  for (const q of ALL_QUESTIONS) {
    if (!q.category) continue;
    per[q.category] = per[q.category] || { answered: 0, total: 0 };
    per[q.category].total += 1;
    if (answers[q.id]) per[q.category].answered += 1;
  }
  return per;
}

function questionnaireLabel(dim, val) {
  if (QUESTIONNAIRE_LABELS[dim]?.[val]) return QUESTIONNAIRE_LABELS[dim][val];
  if (CATEGORY_LABELS[dim] && val) return factualLabel(val);
  return val || '';
}

function pickTopEntry(bucket) {
  let best = '';
  let bestCount = -1;
  for (const [key, count] of Object.entries(bucket || {})) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function renderQuestionnaireSummary(profile = state.profile) {
  const portrait = profile?.portrait || buildQuestionnairePortrait(profile?.questionnaireAnswers || {});
  const labels = portrait.labels || [];
  const progress = `${portrait.answered || 0}/${portrait.total || QUESTIONNAIRE.length}`;
  const snippet = labels.length
    ? labels.slice(0, 4).map((x) => `<span class="pill">${escapeHtml(x)}</span>`).join(' ')
    : `<span class="pill">Портрет ещё строится</span>`;
  const confidence = portrait.answered >= 7 ? 'Портрет уже достаточно выражен' : 'Портрет будет точнее после нескольких ответов';
  return `
    <div class="card">
      <div class="card-title">Психологический портрет</div>
      <div class="muted">Без баллов: мы собираем ответы в дерево решений и строим портрет, который потом помогает подбирать пару.</div>
      <div class="row-inline" style="margin-top:10px">${snippet}</div>
      <div class="muted" style="margin-top:10px">Прогресс: ${progress}. ${confidence}</div>
    </div>
  `;
}

function renderQuestionnaireBlocks(profile = state.profile) {
  const answers = getQuestionnaireAnswers(profile);
  const groups = [];
  let current = null;
  for (const q of QUESTIONNAIRE) {
    if (!current || current.block !== q.block) {
      current = { block: q.block, items: [] };
      groups.push(current);
    }
    current.items.push(q);
  }

  return groups
    .map((group) => {
      const questionsHtml = group.items
        .map((q) => {
          const selected = answers[q.id];
          return `
            <div class="question-block">
              <div class="question-title">${escapeHtml(q.question)}</div>
              <div class="chip-row questionnaire-options" data-question="${q.id}">
                ${q.options
                  .map((opt) => {
                    const active = selected === opt.id;
                    return `<button class="chip questionnaire-chip ${active ? 'active' : ''}" type="button" data-question-answer="${q.id}" data-option="${opt.id}"><span>${escapeHtml(opt.label)}</span><small>${escapeHtml(opt.hint)}</small></button>`;
                  })
                  .join('')}
              </div>
            </div>
          `;
        })
        .join('');
      return `
        <div class="card questionnaire-card">
          <div class="card-title">${escapeHtml(group.block)}</div>
          <div class="questionnaire-grid">${questionsHtml}</div>
        </div>
      `;
    })
    .join('');
}

function getQuestionnaireCategories() {
  const cats = CATEGORY_ORDER.map((c) => ({ id: c, label: CATEGORY_LABELS[c] || c }));
  cats.push({ id: 'psych', label: 'Психология' });
  return cats;
}

function questionsForQuestionnaireCategory(catId) {
  if (catId === 'psych') return ALL_QUESTIONS.filter((q) => !q.category);
  return ALL_QUESTIONS.filter((q) => q.category === catId);
}

function activeQuestionnaireCategory() {
  const active = state.ui?.qnCategory;
  const cats = getQuestionnaireCategories();
  return cats.some((c) => c.id === active) ? active : cats[0].id;
}

// Категории-кнопки — бесконечная карусель слева направо.
function renderQuestionnaireCategoryNav() {
  const active = activeQuestionnaireCategory();
  const chips = getQuestionnaireCategories()
    .map((c) => {
      const count = questionsForQuestionnaireCategory(c.id).length;
      return `<button class="chip qn-cat-chip ${active === c.id ? 'active' : ''}" type="button" data-qn-cat="${c.id}">${escapeHtml(c.label)} (${count})</button>`;
    })
    .join('');
  const dur = Math.max(14, chips.length * 1.6);
  return `
    <div class="qn-cat-strip">
      <div class="qn-cat-track" style="--qn-marquee-dur:${dur}s">
        <div class="qn-cat-half">${chips}</div>
        <div class="qn-cat-half" aria-hidden="true">${chips}</div>
      </div>
    </div>`;
}

// Вопросы выбранной категории — вертикальная прокрутка (сверху вниз).
function renderQuestionnaireCategoryQuestions(profile = state.profile) {
  const answers = getQuestionnaireAnswers(profile);
  const active = activeQuestionnaireCategory();
  const items = questionsForQuestionnaireCategory(active)
    .map((q) => {
      const selected = answers[q.id];
      const opts = q.options
        .map((opt) => {
          const activeOpt = selected === opt.id;
          return `<button class="chip questionnaire-chip ${activeOpt ? 'active' : ''}" type="button" data-question-answer="${q.id}" data-option="${opt.id}"><span>${escapeHtml(opt.label)}</span>${opt.hint ? `<small>${escapeHtml(opt.hint)}</small>` : ''}</button>`;
        })
        .join('');
      return `
        <div class="question-block">
          <div class="question-title">${escapeHtml(q.question)}</div>
          <div class="chip-row questionnaire-options">${opts}</div>
        </div>
      `;
    })
    .join('');
  if (!items) return `<div class="muted">В этой категории пока нет вопросов.</div>`;
  return `<div class="qn-question-list">${items}</div>`;
}

function renderQuestionnaireCategories(profile = state.profile) {
  const answers = getQuestionnaireAnswers(profile);
  const cats = answeredCategories(answers);
  const items = CATEGORY_ORDER.map((c) => {
    const info = cats[c];
    if (!info) return '';
    const done = info.answered >= info.total;
    const pct = info.total ? Math.round((info.answered / info.total) * 100) : 0;
    return `
      <div class="cat-progress-item ${done ? 'cat-progress-done' : ''}">
        <div class="cat-progress-name">${escapeHtml(CATEGORY_LABELS[c] || c)}</div>
        <div class="cat-progress-bar"><div class="cat-progress-fill" style="width:${pct}%"></div></div>
        <div class="cat-progress-count">${info.answered}/${info.total}</div>
      </div>
    `;
  }).join('');
  return `<div class="cat-progress-grid">${items}</div>`;
}

function openQuestionnaire() {
  const answers = getQuestionnaireAnswers();
  const firstUnanswered = ALL_QUESTIONS.findIndex((q) => !answers[q.id]);
  qnIndex = firstUnanswered >= 0 ? firstUnanswered : ALL_QUESTIONS.length - 1;
  qnAnimating = false;
  setQuestionCard();
  $('#dlgQuestionnaire').showModal();
  haptic('open');
}

function closeQuestionnaire() {
  $('#dlgQuestionnaire').close();
}

function setQuestionCard() {
  const q = ALL_QUESTIONS[qnIndex];
  if (!q) return;
  const answers = getQuestionnaireAnswers();
  const selected = answers[q.id];
  const opts = q.options
    .map((o) => {
      const active = selected === o.id;
      const hint = o.hint ? `<span class="qn-opt-hint">${escapeHtml(o.hint)}</span>` : '';
      return `
        <button class="qn-opt ${active ? 'selected' : ''}" type="button" data-qn-opt="${escapeHtml(o.id)}">
          <span class="qn-opt-letter">${escapeHtml(o.id.toUpperCase())}</span>
          <span class="qn-opt-text">
            <span class="qn-opt-label">${escapeHtml(o.label)}</span>
            ${hint}
          </span>
        </button>
      `;
    })
    .join('');
  $('#qnCard').innerHTML = `
    <div class="qn-q">${escapeHtml(q.question)}</div>
    <div class="qn-opts">${opts}</div>
  `;
  $('#qnBlock').textContent = q.block || (q.category ? CATEGORY_LABELS[q.category] : '');
  $('#qnCounter').textContent = `Вопрос ${qnIndex + 1} из ${ALL_QUESTIONS.length} • отвечено: ${Object.keys(answers).length}`;
  $('#qnProgressBar').style.width = Math.round(((qnIndex + 1) / ALL_QUESTIONS.length) * 100) + '%';
  $('#btnQuestionnairePrev').disabled = qnIndex === 0;
}

function qnGo(dir) {
  if (qnAnimating) return;
  const max = ALL_QUESTIONS.length - 1;
  const next = qnIndex + dir;
  if (next < 0 || next > max) return;
  qnAnimating = true;
  const card = $('#qnCard');
  const skipBtn = $('#btnQuestionnaireSkip');
  skipBtn.disabled = true;
  card.classList.add(dir > 0 ? 'slide-left' : 'slide-right');
  setTimeout(() => {
    qnIndex = next;
    setQuestionCard();
    card.classList.remove('slide-left', 'slide-right');
    card.classList.add(dir > 0 ? 'slide-right' : 'slide-left');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        card.classList.remove('slide-right', 'slide-left');
      })
    );
    skipBtn.disabled = false;
    setTimeout(() => {
      qnAnimating = false;
    }, 250);
  }, 230);
}

function wireQuestionnaire() {
  $('#btnQuestionnaireClose').addEventListener('click', closeQuestionnaire);
  $('#btnQuestionnairePrev').addEventListener('click', () => qnGo(-1));
  $('#btnQuestionnaireSkip').addEventListener('click', () => qnGo(1));
  $('#dlgQuestionnaire').addEventListener('close', () => renderAll());

  const card = $('#qnCard');
  if (!card) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pointerId = null;

  const onDown = (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.button != null && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    pointerId = e.pointerId;
    card.setPointerCapture?.(pointerId);
  };

  const onMove = (e) => {
    if (!tracking || e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    const dx = e.clientX - startX;
    if (Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx)) tracking = false;
  };

  const onUp = (e) => {
    if (!tracking || e.pointerId !== pointerId) return;
    tracking = false;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 60) return;
    qnGo(dx < 0 ? 1 : -1);
  };

  card.addEventListener('pointerdown', onDown, { passive: true });
  card.addEventListener('pointermove', onMove, { passive: true });
  card.addEventListener('pointerup', onUp, { passive: true });
  card.addEventListener('pointercancel', onUp, { passive: true });

  card.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qn-opt]');
    if (!btn) return;
    const oid = btn.dataset.qnOpt;
    const q = ALL_QUESTIONS[qnIndex];
    if (!q || !oid) return;
    setQuestionnaireAnswer(q.id, oid, { silent: true });
    haptic('light');
    qnGo(1);
  });
}

function getCircleDraft() {
  state.ui = state.ui || {};
  if (!state.ui.circleDraft) {
    state.ui.circleDraft = {
      friendName: '',
      friendRelation: 'friend',
      candidateId: '',
      recipientName: '',
      positiveTags: [],
      nuanceTags: [],
      comment: ''
    };
  }
  return state.ui.circleDraft;
}

function circleTagLabel(tag) {
  const found = FRIEND_VALUE_TAGS.find((x) => x.id === tag) || FRIEND_NUANCE_TAGS.find((x) => x.id === tag);
  return found?.label || tag;
}

function setCircleDraft(next) {
  state.ui.circleDraft = {
    ...getCircleDraft(),
    ...next
  };
  save();
}

function toggleCircleDraftTag(field, tag, limit) {
  const draft = getCircleDraft();
  const list = Array.isArray(draft[field]) ? [...draft[field]] : [];
  const idx = list.indexOf(tag);
  if (idx >= 0) list.splice(idx, 1);
  else {
    if (limit && list.length >= limit) {
      toast(limit === 5 ? 'Можно выбрать до 5 пунктов' : 'Можно выбрать до 3 пунктов');
      return;
    }
    list.push(tag);
  }
  setCircleDraft({ [field]: list });
}

function addCircleCustomTag(field, inputId, limit) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const value = String(input.value || '').trim();
  if (!value) return;
  const draft = getCircleDraft();
  const list = Array.isArray(draft[field]) ? [...draft[field]] : [];
  if (list.some((x) => normText(x) === normText(value))) {
    input.value = '';
    return;
  }
  if (limit && list.length >= limit) {
    toast(limit === 5 ? 'Можно выбрать до 5 пунктов' : 'Можно выбрать до 3 пунктов');
    return;
  }
  list.push(value);
  setCircleDraft({ [field]: list });
  input.value = '';
}

function circleKey(value) {
  return normText(value || '');
}

function getCircleFriends() {
  return Array.isArray(state.circle?.friends) ? state.circle.friends : [];
}

function getCircleRecommendations() {
  return Array.isArray(state.circle?.recommendations) ? state.circle.recommendations : [];
}

function saveCircleFriends(friends) {
  state.circle.friends = friends;
  save();
}

function saveCircleRecommendations(recommendations) {
  state.circle.recommendations = recommendations;
  save();
}

function getCircleRecommendationGroups() {
  const recs = getCircleRecommendations();
  const groups = new Map();
  for (const rec of recs) {
    const key = circleKey(rec.candidateName || rec.candidateId || '');
    if (!key) continue;
    const group = groups.get(key) || {
      key,
      candidateName: rec.candidateName || rec.candidateId || 'Без имени',
      items: []
    };
    group.items.push(rec);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

function getCircleRecommendationStatus(candidateKey) {
  const recs = getCircleRecommendations().filter((rec) => circleKey(rec.candidateName || rec.candidateId || '') === candidateKey && rec.accepted);
  if (recs.length >= 3) return { label: 'Данных достаточно', tone: 'good' };
  if (recs.length > 0) return { label: 'Недостаточно данных', tone: 'warn' };
  return { label: 'Пока нет рекомендаций', tone: 'muted' };
}

function getCircleRecommendationHighlights(candidateKey) {
  const recs = getCircleRecommendations().filter((rec) => circleKey(rec.candidateName || rec.candidateId || '') === candidateKey && rec.accepted);
  const valueCounts = new Map();
  const nuanceCounts = new Map();
  for (const rec of recs) {
    for (const tag of rec.positiveTags || []) valueCounts.set(tag, (valueCounts.get(tag) || 0) + 1);
    for (const tag of rec.nuanceTags || []) nuanceCounts.set(tag, (nuanceCounts.get(tag) || 0) + 1);
  }
  const values = [...valueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => circleTagLabel(tag));
  const nuances = [...nuanceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => circleTagLabel(tag));
  return { values, nuances };
}

function renderHomeContentHtml() {
  return renderHomeMessagesHtml();
}

function renderHomeFeedHtml() {
  const cityKey = currentCityKey();
  const steps = state.steps.value || 0;
  const points = state.geo.points || [];
  const last = state.lastKnown;
  const interests = state.profile.interests || [];
  const plans = state.plans?.items || [];
  const nowLocal = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const defaultPlanAt = `${nowLocal.getFullYear()}-${pad2(nowLocal.getMonth() + 1)}-${pad2(nowLocal.getDate())}T${pad2(
    nowLocal.getHours()
  )}:${pad2(nowLocal.getMinutes())}`;
  const suggestion = topEventSuggestion();

  return `
    <div class="grid">
      <div class="card">
        <div class="card-title">Сегодня</div>
        <div class="kpis">
          <div class="kpi"><div class="n">${steps}</div><div class="l">шагов (примерно)</div></div>
          <div class="kpi"><div class="n">${interests.length}</div><div class="l">интересов</div></div>
          <div class="kpi"><div class="n">${points.length}</div><div class="l">геометок</div></div>
          <div class="kpi"><div class="n">${cityKey ? cityLabel(cityKey) : '—'}</div><div class="l">город</div></div>
        </div>
        <div class="muted" style="margin-top:10px">
          ${last ? `Последняя геопозиция: ${formatLatLon(last.lat, last.lon)} (±${Math.round(last.acc)}м)` : 'Геопозиция не определена.'}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Планы на сегодня</div>
        ${
          plans.length
            ? `<div class="list">${plans.map(renderPlanItem).join('')}</div>`
            : `<div class="muted">Пока нет планов. Добавьте событие из вкладки “События” или создайте вручную.</div>`
        }
        <div class="plan-creator">
          <div class="plan-creator-grid">
            <div class="profile-field">
              <label class="label">Куда идёте</label>
              <input id="homePlanTitle" class="input" placeholder="Например: Кофейня, парк, выставка" />
            </div>
            <div class="profile-field">
              <label class="label">Время</label>
              <input id="homePlanTime" class="input" type="datetime-local" value="${defaultPlanAt}" />
            </div>
          </div>
          <div class="profile-field">
            <label class="label">Формат компании</label>
            <label class="plan-company">
              <input id="homePlanCompany" type="checkbox" />
              <span>Иду с компанией / не против компании</span>
            </label>
          </div>
          <div class="row-inline">
            <button class="btn" type="button" data-action="addPlan">Добавить план</button>
            <button class="btn ghost" type="button" data-action="clearPlans">Очистить</button>
          </div>
        </div>
        <div class="muted" style="margin-top:10px">Чтобы другие увидели ваши планы, включите “Публиковать планы сегодня” в Настройках.</div>
      </div>

      <div class="card">
        <div class="card-title">Рекомендация</div>
        ${suggestion ? renderEventCard(suggestion, { compact: false }) : `<div class="muted">Нет подходящих событий. Выберите интересы или включите геолокацию.</div>`}
        <div class="row-inline" style="margin-top:10px">
          <button class="btn" type="button" data-open-tab="events">Открыть события</button>
          <button class="btn ghost" type="button" data-open-tab="dating">Подобрать пару</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Приватность</div>
        <div class="muted">Это демо хранит данные локально. Для реального продукта нужны: явное согласие, минимизация данных, шифрование, сроки хранения, возможность удаления и экспорт.</div>
      </div>
    </div>
  `;
}

function profileLikesYou(id) {
  const p = DATING_PROFILES.find((x) => x.id === id);
  return !!(p && p.likesYou);
}

// Матч засчитывается только когда оба человека поставили друг другу лайк.
function getMutualMatches() {
  const likes = state.dating.likes || {};
  const qualified = (id) => likes[id] === 'like' && profileLikesYou(id);
  const out = [];
  const seen = new Set();
  for (const id of state.dating.matches || []) {
    if (qualified(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of Object.keys(likes)) {
    if (qualified(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function getMessageThreadIds() {
  return getMutualMatches();
}

function ensureMessageThread(profileId) {
  state.messages = state.messages || { activeThreadId: null, threads: {} };
  state.messages.threads = state.messages.threads || {};
  const existing = state.messages.threads[profileId];
  if (existing) return existing;

  const profile = DATING_PROFILES.find((x) => x.id === profileId);
  const name = profile?.name || 'Профиль';
  const threads = {
    p1: [
      { from: 'them', text: 'Привет. Какой у тебя план на вечер?', ts: Date.now() - 1000 * 60 * 42 },
      { from: 'me', text: 'Думаю про кофе и прогулку.', ts: Date.now() - 1000 * 60 * 35 },
      { from: 'them', text: 'Звучит нормально. Можно присоединиться?', ts: Date.now() - 1000 * 60 * 20 }
    ],
    p2: [
      { from: 'them', text: 'Вижу, у нас совпадает работа и город.', ts: Date.now() - 1000 * 60 * 70 },
      { from: 'me', text: 'Да, как раз ищу людей на созвон и кофе.', ts: Date.now() - 1000 * 60 * 60 }
    ],
    p3: [
      { from: 'them', text: 'Музеи или кофейня — что ближе?', ts: Date.now() - 1000 * 60 * 95 },
      { from: 'me', text: 'Лучше что-то спокойное и без спешки.', ts: Date.now() - 1000 * 60 * 80 }
    ],
    p4: [
      { from: 'them', text: 'Есть идея на вечер: концерт или ужин?', ts: Date.now() - 1000 * 60 * 130 }
    ]
  };

  const seed = threads[profileId] || [{ from: 'them', text: `Привет, я ${name}.`, ts: Date.now() - 1000 * 60 * 30 }];
  state.messages.threads[profileId] = {
    unread: !state.dating.seenMatches?.[profileId] && !!profile,
    messages: seed
  };
  return state.messages.threads[profileId];
}

function formatMessageTime(ts) {
  const d = new Date(ts || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderChatScreen(profileId) {
  const profile = DATING_PROFILES.find((x) => x.id === profileId) || DATING_PROFILES[0];
  const thread = ensureMessageThread(profileId);
  const messages = thread?.messages || [];
  return `
    <div class="card chat-screen">
      <div class="chat-screen-head">
        <button class="btn ghost chat-back" type="button" data-chat-back>← Назад</button>
        <div class="chat-thread-user">
          <img class="chat-thread-avatar" src="${profile.photos?.[0] || './assets/profile/avatar-square.jpg'}" alt="${escapeHtml(profile.name)}" />
          <div>
            <div class="chat-thread-name">${escapeHtml(profile.name)}, ${profile.age}</div>
            <div class="chat-thread-meta">${cityLabel(profile.city)} • ${escapeHtml(profile.jobTitle || '')}</div>
          </div>
        </div>
      </div>
      <div class="chat-thread-body">
        ${messages
          .map(
            (m) => `
              <div class="chat-bubble ${m.from === 'me' ? 'me' : 'them'}">
                <div class="chat-bubble-text">${escapeHtml(m.text)}</div>
                <div class="chat-bubble-time">${formatMessageTime(m.ts)}</div>
              </div>
            `
          )
          .join('')}
      </div>
      <div class="chat-composer">
        <input id="chatInput" class="input" placeholder="Написать сообщение..." />
        <button class="btn" type="button" data-action="sendChat">Отправить</button>
      </div>
    </div>
  `;
}

function renderHomeMessagesHtml() {
  const matches = getMutualMatches();
  const threadIds = getMessageThreadIds();

  state.messages = state.messages || { activeThreadId: null, threads: {} };

  const openChat = state.messages.openChat && threadIds.includes(state.messages.openChat) ? state.messages.openChat : null;
  if (openChat) return renderChatScreen(openChat);

  if (!threadIds.includes(state.messages.activeThreadId)) {
    state.messages.activeThreadId = threadIds[0] || null;
  }

  const seenMatches = state.dating.seenMatches || {};
  const matchesStrip = matches.length
    ? `<div class="matches-strip">${matches
        .map((id) => renderMatchCard(id, { seen: !!seenMatches[id] }))
        .join('')}</div>`
    : `<div class="muted">Пока нет матчей. Матч появляется, когда вы оба поставите друг другу лайк.</div>`;

  const list = threadIds.length
    ? threadIds
        .map((id) => {
          const profile = DATING_PROFILES.find((x) => x.id === id);
          if (!profile) return '';
          const t = ensureMessageThread(id);
          const lastMsg = t.messages?.[t.messages.length - 1];
          const unread = !!t.unread;
          return `
            <button class="chat-item" type="button" data-chat-id="${id}">
              <div class="chat-avatar-wrap ${unread ? 'unread' : ''}">
                <img class="chat-avatar" src="${profile.photos?.[0] || './assets/profile/avatar-square.jpg'}" alt="${escapeHtml(profile.name)}" />
              </div>
              <div class="chat-main">
                <div class="chat-topline">
                  <div class="chat-name">${escapeHtml(profile.name)}, ${profile.age}</div>
                  <div class="chat-time">${lastMsg ? formatMessageTime(lastMsg.ts) : ''}</div>
                </div>
                <div class="chat-preview">${escapeHtml(lastMsg?.text || profile.about || 'Новое совпадение')}</div>
              </div>
            </button>
          `;
        })
        .join('')
    : `<div class="muted">Пока нет чатов. Поставьте лайк — диалог появится при взаимном лайке.</div>`;

  return `
    <div class="card">
      <div class="card-title">Матчи</div>
      ${matchesStrip}
    </div>

    <div class="card">
      <div class="card-title">Чаты</div>
      <div class="messages-list">${list}</div>
    </div>
  `;
}

function wireHomeContentHandlers(rootSelector) {
  const root = $(rootSelector);
  if (!root) return;
  root.querySelectorAll('[data-open-tab]').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.openTab));
  });
  root.querySelector('[data-action="addPlan"]')?.addEventListener('click', () => {
    const title = String(root.querySelector('#homePlanTitle')?.value || '').trim();
    const scheduledAt = String(root.querySelector('#homePlanTime')?.value || '').trim();
    const companyOk = !!root.querySelector('#homePlanCompany')?.checked;
    if (!title) return toast('Укажите место');
    addPlan({ title: title.slice(0, 80), scheduledAt: scheduledAt || null, companyOk });
    const titleInput = root.querySelector('#homePlanTitle');
    if (titleInput) titleInput.value = '';
    const companyInput = root.querySelector('#homePlanCompany');
    if (companyInput) companyInput.checked = false;
    haptic('light');
    renderAll();
  });
  root.querySelector('[data-action="clearPlans"]')?.addEventListener('click', () => {
    if (!confirm('Очистить планы на сегодня?')) return;
    state.plans.items = [];
    save();
    maybeSharePlans();
    renderAll();
  });
  root.querySelectorAll('[data-del-plan]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.delPlan;
      state.plans.items = (state.plans.items || []).filter((x) => x.id !== id);
      save();
      maybeSharePlans();
      renderAll();
    });
  });
  root.querySelectorAll('[data-chat-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const chatId = b.dataset.chatId;
      state.messages = state.messages || { activeThreadId: null, threads: {} };
      state.messages.activeThreadId = chatId;
      state.messages.openChat = chatId;
      const t = ensureMessageThread(chatId);
      t.unread = false;
      state.dating.seenMatches = state.dating.seenMatches || {};
      state.dating.seenMatches[chatId] = true;
      save();
      renderAll();
    });
  });
  root.querySelectorAll('[data-chat-back]').forEach((b) => {
    b.addEventListener('click', () => {
      state.messages = state.messages || {};
      state.messages.openChat = null;
      save();
      renderAll();
    });
  });
  root.querySelectorAll('[data-match-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const matchId = el.dataset.matchId;
      if (!matchId) return;
      state.dating.seenMatches = state.dating.seenMatches || {};
      state.dating.seenMatches[matchId] = true;
      state.messages = state.messages || { activeThreadId: null, threads: {} };
      state.messages.openChat = matchId;
      save();
      renderAll();
    });
  });
  root.querySelector('[data-action="sendChat"]')?.addEventListener('click', () => {
    const input = root.querySelector('#chatInput');
    const text = String(input?.value || '').trim();
    if (!text) return;
    const activeId = state.messages?.activeThreadId;
    if (!activeId) return;
    const thread = ensureMessageThread(activeId);
    thread.messages.push({ from: 'me', text: text.slice(0, 300), ts: Date.now() });
    thread.unread = false;
    input.value = '';
    save();
    renderAll();
  });
}

function renderHome() {
  const root = $('#view-home');
  if (!root) return;
  root.innerHTML = renderHomeContentHtml();
  wireHomeContentHandlers('#view-home');
}

function renderEvents() {
  const cityKey = currentCityKey();
  const list = filterEventsByCity(cityKey);
  const eventsView = state.ui?.eventsView || 'places';
  const categorized = categorizeEvents(list);

  const header = `
    <div class="card">
      <div class="events-switcher" role="tablist" aria-label="События и карта">
        <button class="events-switch ${eventsView === 'places' ? 'active' : ''}" type="button" data-events-view="places">Места</button>
        <button class="events-switch ${eventsView === 'map' ? 'active' : ''}" type="button" data-events-view="map">На карте</button>
      </div>
      <div class="row" style="margin-top:14px">
        <div>
          <div class="pill">Город: ${cityKey ? cityLabel(cityKey) : 'не определён'}</div>
          <div class="muted" style="margin-top:6px">Если город не определился, откройте Настройки и выберите вручную.</div>
        </div>
        <button class="btn" type="button" data-action="refresh">Обновить</button>
      </div>
    </div>
  `;

  const placesBody = `
    <div class="card">
      <div class="card-title">Места</div>
      <div class="events-tiles">
        ${categorized
          .map((group) => {
            const preview = group.events[0];
            const bgClass = group.theme;
            return `
              <button class="event-tile ${bgClass}" type="button" data-event-group="${group.id}">
                <div class="event-tile-art">
                  <span>${group.emoji}</span>
                </div>
                <div class="event-tile-title">${group.label}</div>
                <div class="event-tile-meta">${group.events.length} событий</div>
                ${preview ? `<div class="event-tile-small">${escapeHtml(preview.title)}</div>` : ''}
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  `;

  const mapBody = `
    <div class="card">
      <div class="card-title">Карта событий</div>
      <div class="muted">События нанесены маркерами на карту.</div>
      <div id="eventsMap"></div>
    </div>
  `;

  const listBody = list.length
    ? `<div class="card"><div class="card-title">Подходящие события (${list.length})</div><div class="list">${list
        .map((e) => renderEventCard(e, { compact: true }))
        .join('')}</div></div>`
    : `<div class="card"><div class="card-title">Подходящие события</div><div class="muted">Пока нет событий для этого города. Добавьте свой источник событий на бекенде или расширьте локальный список.</div></div>`;

  $('#view-events').innerHTML = `<div class="grid">${header}${eventsView === 'map' ? mapBody : placesBody}</div>`;

  if (eventsView === 'map') {
    renderEventsMap(list, cityKey);
  }

  $('#view-events').querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
    refreshRemoteEvents(cityKey)
      .then(() => {
        renderAll();
        toast('Обновлено');
        haptic('light');
      })
      .catch((err) => toast(err?.message || 'Не удалось обновить события'));
  });

  $('#view-events').querySelectorAll('[data-events-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ui = state.ui || {};
      state.ui.eventsView = btn.dataset.eventsView;
      save();
      renderAll();
      haptic('light');
    });
  });

  $('#view-events').querySelectorAll('[data-event-group]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.eventGroup;
      const group = categorized.find((x) => x.id === groupId);
      if (!group) return;
      state.ui = state.ui || {};
      state.ui.eventsView = 'events';
      save();
      renderAll();
      setTimeout(() => {
        const first = document.querySelector(`#view-events [data-go-event="${group.events[0]?.id}"]`);
        first?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }, 50);
      haptic('light');
    });
  });

  $('#view-events').querySelectorAll('[data-go-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.goEvent;
      const ev = EVENTS.find((x) => x.id === id);
      if (!ev) return;
      addPlan({
        title: ev.title,
        kind: 'event',
        eventId: ev.id,
        cityKey: ev.city,
        lat: ev.lat,
        lon: ev.lon
      });
      toast(`Добавлено в планы: ${ev.title}`);
      haptic('light');
    });
  });
}

function renderEventsMap(list, cityKey) {
  const container = document.getElementById('eventsMap');
  if (!container) return;

  if (map?.remove) {
    try {
      map.remove();
    } catch {
      // ignore
    }
  }
  map = null;
  meMarker = null;
  nearbyMarkers = [];

  initMapIfNeeded('eventsMap');
  if (!map) return;
  updateMapMarkers([]);

  const events = Array.isArray(list) ? list : [];
  const eventMarkers = [];
  for (const ev of events) {
    if (typeof ev.lat !== 'number' || typeof ev.lon !== 'number') continue;
    const m = L.marker([ev.lat, ev.lon]).addTo(map);
    const when = formatEventDate(ev.startsAt);
    const tags = (ev.tags || []).map((t) => interestLabel(t)).join(', ');
    m.bindPopup(`
      <div style="font-weight:700;margin-bottom:4px">${escapeHtml(ev.title)}</div>
      <div style="opacity:.8">${escapeHtml(ev.place || cityLabel(ev.city))}</div>
      <div style="opacity:.8;margin-top:4px">${escapeHtml(when)}</div>
      ${tags ? `<div style="opacity:.8;margin-top:4px">${escapeHtml(tags)}</div>` : ''}
    `);
    eventMarkers.push(m);
  }

  if (eventMarkers.length) {
    const group = L.featureGroup(eventMarkers);
    map.fitBounds(group.getBounds().pad(0.2));
  } else if (cityKey) {
    const center = cityCenter(cityKey);
    if (center) map.setView([center.lat, center.lon], 12);
  }

  setTimeout(() => map?.invalidateSize?.(), 50);
}

function categorizeEvents(list) {
  const groups = [
    { id: 'culture', label: 'Культурные события', emoji: '🎭', theme: 'theme-orange', tags: ['art', 'museums', 'theatre'] },
    { id: 'food', label: 'Рестораны и кафе', emoji: '🍣', theme: 'theme-dark', tags: ['food', 'coffee'] },
    { id: 'walks', label: 'Парки и прогулки', emoji: '🌿', theme: 'theme-blue', tags: ['walks', 'sport'] },
    { id: 'cinema', label: 'Кино', emoji: '🎬', theme: 'theme-orange', tags: ['cinema', 'books'] },
    { id: 'night', label: 'Клубы и бары', emoji: '🍸', theme: 'theme-dark', tags: ['night', 'music'] }
  ];

  return groups.map((g) => ({
    ...g,
    events: list.filter((e) => (e.tags || []).some((t) => g.tags.includes(t)))
  })).filter((g) => g.events.length || g.id === 'culture');
}

function renderDating() {
  const cityKey = currentCityKey();
  const userPortrait = buildQuestionnairePortrait(state.profile?.questionnaireAnswers || {});
  const interests = new Set(state.profile.interests || []);
  const comm = new Set(state.profile.communication || []);
  const values = new Set(state.profile.values || []);
  const job = normText(state.profile.jobTitle);
  const zodiac = normText(state.profile.zodiac);
  const edu = normText(state.profile.education);
  const filters = state.dating.filters || {};
  const selectedIntents = new Set(filters.meetingIntent || []);
  const selectedPlaces = new Set(filters.meetingPlaces || []);
  const radiusKm = Number.isFinite(Number(filters.distanceKm)) ? Number(filters.distanceKm) : 500;
  const stepsBucket = String(filters.stepsBucket || '');

  const candidates = DATING_PROFILES.filter((p) => {
    if (selectedIntents.size) {
      const intents = new Set(p.meetingIntent || []);
      if (!overlapCount(selectedIntents, intents)) return false;
    }

    if (selectedPlaces.size && !selectedPlaces.has('all')) {
      const places = new Set(p.meetingPlaces || []);
      if (!overlapCount(selectedPlaces, places)) return false;
    }

    if (stepsBucket && !matchesStepBucket(Number(p.stepCount || 0), stepsBucket)) return false;

    if (cityKey && radiusKm > 0) {
      const km = cityDistanceKm(cityKey, p.city);
      if (km != null && km > radiusKm) return false;
    }

    return true;
  })
    .map((p) => ({
      ...p,
      compatibility: comparePortraits(userPortrait, p.persona || {}),
      score:
        overlapCount(interests, new Set(p.interests)) +
        overlapCount(comm, new Set(p.communication || [])) +
        overlapCount(values, new Set(p.values || [])) +
        (job && normText(p.jobTitle) === job ? 1 : 0) +
        (zodiac && normText(p.zodiac) === zodiac ? 1 : 0) +
        (edu && normText(p.education) === edu ? 1 : 0)
    }))
    .sort((a, b) => {
      const ar = (a.compatibility?.support || 0) - (a.compatibility?.tension || 0);
      const br = (b.compatibility?.support || 0) - (b.compatibility?.tension || 0);
      if (br !== ar) return br - ar;
      return b.score - a.score;
    });

  const visible = candidates.filter((p) => !state.dating.likes[p.id]).slice(0, 6);

  $('#view-dating').innerHTML = `
    <div class="grid">
      <div class="card">
        <div class="card-title">Фильтры</div>
        <div class="filters-grid">
          <div class="filter-group">
            <div class="label">Характер встречи</div>
            <div class="chip-row" data-filter-group="meetingIntent">
              ${MEETING_INTENTS.map((x) => {
                const active = selectedIntents.has(x.id);
                return `<button class="chip ${active ? 'active' : ''}" type="button" data-filter-chip="meetingIntent" data-value="${x.id}">${x.label}</button>`;
              }).join('')}
            </div>
          </div>
          <div class="filter-group">
            <div class="label">Шаги</div>
            <select class="select filter-select" data-filter-select="stepsBucket">
              <option value="">Все</option>
              ${STEP_BUCKETS.map((x) => `<option value="${x.id}" ${stepsBucket === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <div class="label">Дальность: ${radiusKm} км</div>
            <input class="range" type="range" min="0" max="3000" step="25" value="${radiusKm}" data-filter-range="distanceKm" />
            <div class="muted">От текущего города: ${cityKey ? cityLabel(cityKey) : 'город не определён'}</div>
          </div>
          <div class="filter-group">
            <div class="label">Мое потенциальное место встречи</div>
            <div class="chip-row" data-filter-group="meetingPlaces">
              ${MEETING_PLACES.map((x) => {
                const active = selectedPlaces.size === 0 ? x.id === 'all' : selectedPlaces.has(x.id);
                return `<button class="chip ${active ? 'active' : ''}" type="button" data-filter-chip="meetingPlaces" data-value="${x.id}">${x.label}</button>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Анкета</div>
        ${visible.length ? `<div class="tinder-wrap" id="tinderWrap"></div>` : `<div class="muted">Новых анкет нет. Сбросьте лайки или поменяйте интересы.</div>`}
        ${visible.length ? `<div class="tinder-actions"><button class="tbtn nope" type="button" data-tinder="nope">✕</button><button class="tbtn like" type="button" data-tinder="like">❤</button></div>` : ``}
        ${userPortrait.answered < 7 ? `<div class="muted" style="margin-top:10px">Подбор станет точнее после анкеты: <button class="btn ghost" type="button" data-action="openQuestionnaire">Пройти анкету</button></div>` : ''}
      </div>

      <div class="card">
        <div class="card-title">Знакомства</div>
        <div class="muted">Фильтр по городу: ${cityKey ? cityLabel(cityKey) : 'выключен'}; сортировка по общим интересам.</div>
        <div class="row" style="margin-top:10px">
          <button class="btn ghost" type="button" data-action="resetLikes">Сбросить лайки</button>
        </div>
      </div>
    </div>
  `;

  $('#view-dating').querySelector('[data-action="resetLikes"]')?.addEventListener('click', () => {
    state.dating.likes = {};
    state.dating.matches = [];
    state.dating.seenMatches = {};
    save();
    renderAll();
    haptic('light');
  });

  $('#view-dating').querySelector('[data-action="openQuestionnaire"]')?.addEventListener('click', openQuestionnaire);

  $('#view-dating').querySelectorAll('[data-open-tab]').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.openTab));
  });

  $('#view-dating').querySelectorAll('[data-filter-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.filterChip;
      const value = btn.dataset.value;
      state.dating.filters = state.dating.filters || {};
      if (group === 'meetingPlaces') {
        state.dating.filters[group] = value === 'all' ? ['all'] : [value];
      } else {
        const current = new Set(state.dating.filters[group] || []);
        if (current.has(value)) current.delete(value);
        else current.add(value);
        state.dating.filters[group] = [...current];
      }
      save();
      renderAll();
    });
  });

  $('#view-dating').querySelectorAll('[data-filter-select]').forEach((el) => {
    el.addEventListener('change', () => {
      const key = el.dataset.filterSelect;
      state.dating.filters = state.dating.filters || {};
      state.dating.filters[key] = String(el.value || '');
      save();
      renderAll();
    });
  });

  $('#view-dating').querySelectorAll('[data-filter-range]').forEach((el) => {
    el.addEventListener('input', () => {
      const key = el.dataset.filterRange;
      state.dating.filters = state.dating.filters || {};
      state.dating.filters[key] = Number(el.value || 0);
      const label = el.closest('.filter-group')?.querySelector('.label');
      if (label) label.textContent = `Дальность: ${Number(el.value || 0)} км`;
      save();
    });
    el.addEventListener('change', () => renderAll());
  });

  if (visible.length) {
    mountTinder(visible);
    $('#view-dating').querySelector('[data-tinder="like"]')?.addEventListener('click', () => tinder?.swipe('right'));
    $('#view-dating').querySelector('[data-tinder="nope"]')?.addEventListener('click', () => tinder?.swipe('left'));
  } else {
    tinder?.destroy?.();
    tinder = null;
  }

  $('#view-dating').querySelectorAll('[data-match-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const matchId = el.dataset.matchId;
      if (!matchId) return;
      state.dating.seenMatches = state.dating.seenMatches || {};
      state.dating.seenMatches[matchId] = true;
      save();
      renderAll();
    });
  });
}

function renderStats() {
  const name = state.profile?.name || '';
  const description = state.profile?.description || '';
  const interests = state.profile?.interests || [];
  const interestsText = interests.join(', ');
  const zodiac = state.profile?.zodiac || '';
  const jobTitle = state.profile?.jobTitle || '';
  const desiredPlace = state.profile?.desiredPlace || '';
  const budget = state.profile?.budget || '';
  const wishlistPlaces = new Set(state.profile?.wishlistPlaces || []);
  const photos = state.profile?.photos || [];
  const stepsOn = !!state.consent?.steps;
  const stepsRunning = !!stepCounter?.running;
  const portrait = buildQuestionnairePortrait(state.profile?.questionnaireAnswers || {});
  const recs = Array.isArray(state.circle?.recommendations) ? state.circle.recommendations : [];
  const selfKey = normText(state.profile?.name || 'вы');
  const selfRecs = recs.filter((r) => normText(r.candidateName || r.candidateId || '') === selfKey && r.accepted);

  $('#view-stats').innerHTML = `
    <div class="grid">
      <div class="card">
        <div class="card-title">Ваш профиль</div>
        <div class="muted">Базовая анкета и психологический портрет собраны в одном месте. Ниже мы строим карту совместимости без баллов.</div>
        <div class="row-inline" style="margin-top:10px">
          <span class="pill">${portrait.answered || 0}/${portrait.total || QUESTIONNAIRE.length} вопросов</span>
          <span class="pill">${selfRecs.length >= 3 ? 'Анонимных отзывов достаточно' : 'Недостаточно анонимных отзывов'}</span>
        </div>
      </div>

      <div class="card profile-editor">
        <div class="card-title">Анкета</div>
        <div class="photo-hero">
          <button class="photo-hero-main ${photos[0] ? '' : 'empty'}" type="button" data-action="pickPhoto">
            ${photos[0] ? `<img alt="profile photo" src="${photos[0]}" />` : `<div class="photo-empty">Фото профиля</div>`}
          </button>
          <div class="photo-hero-actions">
            <button class="btn" type="button" data-action="pickPhoto">Загрузить фото</button>
            <input id="profilePhotoInput" type="file" accept="image/*" hidden />
            <button class="btn ghost" type="button" data-action="clearPhotos">Удалить все</button>
          </div>
          <div id="profilePhotosPreview" class="photo-strip">
            ${photos.length
              ? photos
                  .slice(0, 6)
                  .map((src, idx) => `<button class="photo-thumb" type="button" data-photo-index="${idx}"><img alt="photo ${idx + 1}" src="${src}" /></button>`)
                  .join('')
              : `<div class="muted">Фото не добавлено</div>`}
          </div>
        </div>
        <div class="profile-field">
          <label class="label">Имя</label>
          <input id="profileName" class="input" maxlength="40" value="${escapeHtml(name)}" placeholder="Ваше имя" />
        </div>
        <div class="profile-field">
          <label class="label">Описание</label>
          <textarea id="profileDescription" class="input" maxlength="2000" placeholder="Расскажите о себе (до 2000 символов)">${escapeHtml(description)}</textarea>
        </div>
        <div class="muted" id="descCounter">${description.length}/2000</div>
        <div class="profile-field">
          <label class="label">Гороскоп</label>
          <input id="profileZodiac" class="input" value="${escapeHtml(zodiac)}" placeholder="Например: Овен" />
        </div>
        <div class="profile-field">
          <label class="label">Работа</label>
          <input id="profileJobTitle" class="input" value="${escapeHtml(jobTitle)}" placeholder="Например: Product Manager" />
        </div>
        <div class="profile-field">
          <label class="label">Бюджет на партнера</label>
          <input id="profileBudget" class="input" inputmode="numeric" value="${escapeHtml(budget)}" placeholder="Например: 10000 ₽" />
          <div class="muted">Сколько вы готовы потратить на партнера или совместную встречу.</div>
        </div>
        <div class="profile-field">
          <div class="muted">Места, куда хотите пойти</div>
          <div class="chip-row" data-wishlist-places>
            ${WISHLIST_PLACES.map((x) => {
              const active = wishlistPlaces.has(x.id);
              return `<button class="chip ${active ? 'active' : ''}" type="button" data-wishlist-place="${x.id}">${x.label}</button>`;
            }).join('')}
          </div>
          <input id="profileDesiredPlace" class="input" value="${escapeHtml(desiredPlace)}" placeholder="Например: кофейня, парк, бар" />
        </div>
        <div class="profile-field">
          <label class="label">Интересы</label>
          <input id="profileInterestsText" class="input" value="${escapeHtml(interestsText)}" placeholder="Например: кофе, прогулки, кино" />
        </div>
        <div class="profile-field">
          <label class="label">Шаги</label>
          <div class="profile-steps">
            <div class="muted">Статус: ${stepsOn ? (stepsRunning ? 'датчики включены' : 'разрешение есть, датчики остановлены') : 'выключено'}</div>
            <button class="btn" type="button" data-action="toggleSteps">${stepsOn ? (stepsRunning ? 'Остановить шаги' : 'Запустить шаги') : 'Включить шаги'}</button>
          </div>
        </div>
      </div>

      ${renderQuestionnaireSummary(state.profile)}

      <div class="card">
        <div class="card-title">Анкета совместимости</div>
        <div class="muted">Отвечайте карточками — вопросы перелистываются слева направо. Ответы попадают в портрет без баллов (дерево решений) и используются для подбора пары.</div>
        <div class="row-inline" style="margin-top:10px">
          <button class="btn" type="button" data-action="openQuestionnaire">${portrait.answered ? 'Продолжить анкету' : 'Пройти анкету'}</button>
          <span class="pill">${portrait.answered || 0}/${portrait.total || ALL_QUESTIONS.length}</span>
        </div>
        ${renderQuestionnaireCategories(state.profile)}
        <div class="muted" style="margin-top:12px">Категории-кнопки листаются слева направо; вопросы выбранной категории — сверху вниз.</div>
        ${renderQuestionnaireCategoryNav()}
        ${renderQuestionnaireCategoryQuestions(state.profile)}
      </div>

      <div class="card">
        <div class="card-title">Анонимные отзывы друзей</div>
        <div class="muted">Отзывы видны без имени автора. Для использования в подборе нужно минимум 3 отзыва от разных друзей.</div>
        <div class="row-inline" style="margin-top:10px">
          <span class="pill">${selfRecs.length} отзывов</span>
          <span class="pill">${selfRecs.length >= 3 ? 'Можно использовать в подборе' : 'Недостаточно данных'}</span>
        </div>
      </div>

      ${renderHomeFeedHtml()}
    </div>
  `;

  const descInput = $('#view-stats').querySelector('#profileDescription');
  const counter = $('#view-stats').querySelector('#descCounter');
  descInput?.addEventListener('input', () => {
    const len = String(descInput.value || '').length;
    if (counter) counter.textContent = `${len}/2000`;
  });

  $('#view-stats').querySelector('#profilePhotoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await addProfilePhotoFromFile(file);
    } catch {
      toast('Не удалось прочитать фото');
    } finally {
      e.target.value = '';
    }
  });

  $('#view-stats').querySelectorAll('[data-action="pickPhoto"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#view-stats').querySelector('#profilePhotoInput')?.click();
    });
  });

  $('#view-stats').querySelector('[data-action="clearPhotos"]')?.addEventListener('click', () => {
    if (!confirm('Удалить все фото?')) return;
    state.profile.photos = [];
    save();
    pushPublicProfileNow().catch(() => {});
    toast('Фото удалены');
    renderAll();
  });

  $('#view-stats').querySelectorAll('[data-wishlist-place]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.wishlistPlace;
      const set = new Set(state.profile.wishlistPlaces || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      state.profile.wishlistPlaces = [...set];
      save();
      renderAll();
    });
  });

  $('#view-stats').querySelector('[data-action="saveProfileMini"]')?.addEventListener('click', () => {
    const nextName = String($('#view-stats').querySelector('#profileName')?.value || '').trim().slice(0, 40);
    const nextDescription = String($('#view-stats').querySelector('#profileDescription')?.value || '').slice(0, 2000);
    const nextZodiac = String($('#view-stats').querySelector('#profileZodiac')?.value || '').trim().slice(0, 30);
    const nextJobTitle = String($('#view-stats').querySelector('#profileJobTitle')?.value || '').trim().slice(0, 60);
    const nextBudget = String($('#view-stats').querySelector('#profileBudget')?.value || '').trim().slice(0, 40);
    const nextDesiredPlace = String($('#view-stats').querySelector('#profileDesiredPlace')?.value || '').trim().slice(0, 120);
    const nextInterestsRaw = String($('#view-stats').querySelector('#profileInterestsText')?.value || '');
    const nextInterests = nextInterestsRaw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30);
    state.profile.name = nextName || state.profile.name;
    state.profile.description = nextDescription;
    state.profile.zodiac = nextZodiac;
    state.profile.jobTitle = nextJobTitle;
    state.profile.budget = nextBudget;
    state.profile.desiredPlace = nextDesiredPlace;
    state.profile.interests = nextInterests;
    state.profile.portrait = buildQuestionnairePortrait(state.profile.questionnaireAnswers || {});
    save();
    pushPublicProfileNow().catch(() => {});
    toast('Анкета сохранена');
    renderAll();
  });

  $('#view-stats').querySelectorAll('[data-question-answer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qid = btn.dataset.questionAnswer;
      const oid = btn.dataset.option;
      if (!qid || !oid) return;
      setQuestionnaireAnswer(qid, oid);
      haptic('light');
    });
  });

  $('#view-stats').querySelector('[data-action="openQuestionnaire"]')?.addEventListener('click', openQuestionnaire);

  $('#view-stats').querySelectorAll('[data-qn-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ui = state.ui || {};
      state.ui.qnCategory = btn.dataset.qnCat;
      save();
      renderAll();
      haptic('light');
    });
  });

  $('#view-stats').querySelector('[data-action="toggleSteps"]')?.addEventListener('click', async () => {
    if (state.consent.steps && stepCounter?.running) {
      stopSteps();
      renderAll();
      return;
    }
    state.consent.steps = true;
    save();
    await startStepsIfNeeded();
    renderAll();
  });

  wireHomeContentHandlers('#view-stats');
}

function renderCircle() {
  const friends = getCircleFriends();
  const draft = getCircleDraft();
  const groups = getCircleRecommendationGroups();
  const selfKey = circleKey(state.profile?.name || 'Вы');
  const selfSummary = getCircleRecommendationStatus(selfKey);
  const selfHighlights = getCircleRecommendationHighlights(selfKey);
  const friendOptions = friends
    .map((friend) => `<option value="${escapeHtml(friend.name)}"></option>`)
    .join('');

  const friendList = friends.length
    ? friends
        .map((friend) => {
          const selected = circleKey(draft.candidateId || '') === circleKey(friend.id || '') || circleKey(draft.friendName || '') === circleKey(friend.name || '');
          return `
            <div class="circle-friend ${selected ? 'selected' : ''}">
              <div>
                <div class="item-title">${escapeHtml(friend.name)}</div>
                <div class="item-meta">${escapeHtml(CIRCLE_RELATIONS.find((x) => x.id === friend.relation)?.label || friend.relation || 'Друг / подруга')}</div>
              </div>
              <div class="item-actions">
                <button class="btn ghost" type="button" data-circle-fill-friend="${escapeHtml(friend.id)}">Порекомендовать</button>
                <button class="btn danger" type="button" data-circle-remove-friend="${escapeHtml(friend.id)}">Удалить</button>
              </div>
            </div>
          `;
        })
        .join('')
    : `<div class="muted">Пока нет друзей. Добавьте первого человека вручную — дальше мы будем использовать его как кандидата для анонимных рекомендаций.</div>`;

  const recommendationGroups = groups.length
    ? groups
        .map((group) => {
          const status = getCircleRecommendationStatus(group.key);
          const highlights = getCircleRecommendationHighlights(group.key);
          const visibleItems = group.items
            .map((rec) => {
              const positive = (rec.positiveTags || []).map((tag) => `<span class="pill">${escapeHtml(circleTagLabel(tag))}</span>`).join(' ');
              const nuance = (rec.nuanceTags || []).map((tag) => `<span class="pill muted-pill">${escapeHtml(circleTagLabel(tag))}</span>`).join(' ');
              return `
                <div class="circle-rec-item">
                  <div class="row">
                    <div>
                      <div class="item-title">${escapeHtml(rec.friendName || rec.candidateName || 'Без имени')}</div>
                      <div class="item-meta">${escapeHtml(rec.recipientName ? `Для: ${rec.recipientName}` : 'Открытая рекомендация')} • ${rec.accepted ? 'согласие отмечено' : 'ожидает согласия'}</div>
                    </div>
                    <div class="item-actions">
                      <button class="btn ghost" type="button" data-circle-toggle-accepted="${escapeHtml(rec.id)}">${rec.accepted ? 'Скрыть' : 'Показать'}</button>
                      <button class="btn danger" type="button" data-circle-delete-rec="${escapeHtml(rec.id)}">Удалить</button>
                    </div>
                  </div>
                  ${positive ? `<div class="row-inline circle-tag-wrap">${positive}</div>` : ''}
                  ${nuance ? `<div class="row-inline circle-tag-wrap">${nuance}</div>` : ''}
                  <div class="muted">${escapeHtml(rec.comment || 'Комментарий не добавлен.')}</div>
                </div>
              `;
            })
            .join('');

          const summaryBits = [];
          if (highlights.values.length) summaryBits.push(`<div class="row-inline circle-tag-wrap">${highlights.values.map((x) => `<span class="pill">${escapeHtml(x)}</span>`).join(' ')}</div>`);
          if (highlights.nuances.length) summaryBits.push(`<div class="row-inline circle-tag-wrap">${highlights.nuances.map((x) => `<span class="pill muted-pill">${escapeHtml(x)}</span>`).join(' ')}</div>`);

          return `
            <div class="circle-group card">
              <div class="item-head">
                <div>
                  <div class="item-title">${escapeHtml(group.candidateName)}</div>
                  <div class="item-meta">Анонимные рекомендации друзей</div>
                </div>
                <span class="pill status-pill ${status.tone}">${status.label}</span>
              </div>
              ${summaryBits.join('')}
              <div class="list circle-rec-list">${visibleItems}</div>
            </div>
          `;
        })
        .join('')
    : `<div class="muted">Пока нет анонимных рекомендаций. Добавьте хотя бы одну историю, и здесь появится круг доверия.</div>`;

  $('#view-circle').innerHTML = `
    <div class="grid circle-layout">
      <div class="card">
        <div class="card-title">Круг знакомств</div>
        <div class="muted">Мы храним всё локально. Имена авторов рекомендаций не показываются — только анонимные теги и качество согласия.</div>
        <div class="row-inline" style="margin-top:10px">
          <span class="pill ${selfSummary.tone === 'good' ? 'status-pill good' : selfSummary.tone === 'bad' ? 'status-pill bad' : 'status-pill warn'}">${selfSummary.label}</span>
          ${selfHighlights.values.length ? `<span class="pill status-pill good">${escapeHtml(selfHighlights.values[0])}</span>` : ''}
          ${selfHighlights.nuances.length ? `<span class="pill status-pill warn">${escapeHtml(selfHighlights.nuances[0])}</span>` : ''}
        </div>
        <div class="muted" style="margin-top:10px">Когда по человеку есть минимум три подтверждённые анонимные рекомендации, мы считаем круг доверия достаточным для подбора.</div>
      </div>

      <div class="grid2">
        <div class="card circle-panel">
          <div class="card-title">Мои друзья</div>
          <div class="profile-field">
            <label class="label">Имя друга / подруги</label>
            <input id="circleFriendName" class="input" list="circleFriendOptions" value="${escapeHtml(draft.friendName || '')}" placeholder="Например: Анна" />
            <datalist id="circleFriendOptions">${friendOptions}</datalist>
          </div>
          <div class="profile-field">
            <label class="label">Кто это для вас</label>
            <select id="circleFriendRelation" class="select">
              ${CIRCLE_RELATIONS.map((rel) => `<option value="${rel.id}" ${draft.friendRelation === rel.id ? 'selected' : ''}>${escapeHtml(rel.label)}</option>`).join('')}
            </select>
          </div>
          <div class="profile-actions">
            <button class="btn" type="button" data-circle-add-friend>Добавить друга</button>
          </div>
          <div class="list circle-friends">${friendList}</div>
        </div>

        <div class="card circle-panel">
          <div class="card-title">Анонимная рекомендация</div>
          <div class="profile-field">
            <label class="label">Кого рекомендуете</label>
            <input id="circleCandidateName" class="input" list="circleFriendOptions" value="${escapeHtml(draft.friendName || '')}" placeholder="Например: Анна" />
            <div class="muted">Можно выбрать из списка друзей или вписать вручную.</div>
          </div>
          <div class="profile-field">
            <label class="label">Кому адресована рекомендация</label>
            <input id="circleRecipientName" class="input" value="${escapeHtml(draft.recipientName || '')}" placeholder="Оставьте пустым — рекомендация будет открытой" />
          </div>
          <div class="profile-field">
            <label class="label">Что вы цените в этом человеке</label>
            <div class="chip-row circle-chip-grid" data-circle-value-tags>
              ${FRIEND_VALUE_TAGS.map((tag) => `<button class="chip circle-chip ${Array.isArray(draft.positiveTags) && draft.positiveTags.includes(tag.id) ? 'active' : ''}" type="button" data-circle-toggle-positive="${tag.id}">${escapeHtml(tag.label)}</button>`).join('')}
            </div>
            <div class="row-inline circle-custom-row">
              <input id="circlePositiveCustom" class="input" placeholder="Добавить свой тег" />
              <button class="btn ghost" type="button" data-circle-add-positive>Добавить</button>
            </div>
          </div>
          <div class="profile-field">
            <label class="label">Что стоит знать о нём / ней</label>
            <div class="chip-row circle-chip-grid" data-circle-nuance-tags>
              ${FRIEND_NUANCE_TAGS.map((tag) => `<button class="chip circle-chip ${Array.isArray(draft.nuanceTags) && draft.nuanceTags.includes(tag.id) ? 'active' : ''}" type="button" data-circle-toggle-nuance="${tag.id}">${escapeHtml(tag.label)}</button>`).join('')}
            </div>
            <div class="row-inline circle-custom-row">
              <input id="circleNuanceCustom" class="input" placeholder="Добавить свой нюанс" />
              <button class="btn ghost" type="button" data-circle-add-nuance>Добавить</button>
            </div>
          </div>
          <div class="profile-field">
            <label class="label">Короткий комментарий</label>
            <textarea id="circleComment" class="input" maxlength="300" placeholder="Например: с ним легко найти общий язык, но лучше не звонить после 23:00.">${escapeHtml(draft.comment || '')}</textarea>
          </div>
          <div class="profile-actions">
            <button class="btn" type="button" data-circle-save-recommendation>Сохранить анонимно</button>
            <button class="btn ghost" type="button" data-circle-clear-draft>Очистить</button>
          </div>
        </div>
      </div>

      <div class="card circle-panel">
        <div class="card-title">Анонимные рекомендации</div>
        <div class="muted">Авторы скрыты. В подборе используются только подтверждённые рекомендации без раскрытия имён.</div>
        <div class="list circle-group-list" style="margin-top:12px">${recommendationGroups}</div>
      </div>
    </div>
  `;

  $('#view-circle').querySelectorAll('[data-circle-fill-friend]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const friend = friends.find((item) => String(item.id) === String(btn.dataset.circleFillFriend));
      if (!friend) return;
      setCircleDraft({ friendName: friend.name, candidateId: friend.id });
      renderAll();
      toast('Имя подставлено в рекомендацию');
    });
  });

  $('#view-circle').querySelectorAll('[data-circle-remove-friend]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = String(btn.dataset.circleRemoveFriend || '');
      const next = friends.filter((item) => String(item.id) !== id);
      saveCircleFriends(next);
      if (circleKey(draft.candidateId || '') === circleKey(id)) setCircleDraft({ candidateId: '', friendName: '' });
      renderAll();
      toast('Друг удалён');
    });
  });

  $('#view-circle').querySelector('[data-circle-add-friend]')?.addEventListener('click', () => {
    const name = String($('#circleFriendName')?.value || '').trim();
    const relation = String($('#circleFriendRelation')?.value || 'friend');
    if (!name) return toast('Введите имя друга');
    const next = [...friends];
    const exists = next.find((item) => circleKey(item.name) === circleKey(name));
    if (exists) {
      exists.relation = relation;
    } else {
      next.unshift({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, name, relation, addedAt: Date.now() });
    }
    saveCircleFriends(next.slice(0, 200));
    setCircleDraft({ friendName: '', friendRelation: relation });
    renderAll();
    toast('Друг добавлен');
  });

  $('#view-circle').querySelector('#circleFriendName')?.addEventListener('input', (e) => {
    const value = String(e.target.value || '');
    setCircleDraft({ friendName: value, candidateId: circleKey(value) });
  });

  $('#view-circle').querySelector('#circleCandidateName')?.addEventListener('input', (e) => {
    const value = String(e.target.value || '');
    setCircleDraft({ friendName: value, candidateId: circleKey(value) });
  });

  $('#view-circle').querySelector('#circleFriendRelation')?.addEventListener('change', (e) => {
    setCircleDraft({ friendRelation: String(e.target.value || 'friend') });
  });

  $('#view-circle').querySelector('#circleRecipientName')?.addEventListener('input', (e) => {
    setCircleDraft({ recipientName: String(e.target.value || '') });
  });

  $('#view-circle').querySelector('#circleComment')?.addEventListener('input', (e) => {
    setCircleDraft({ comment: String(e.target.value || '') });
  });

  $('#view-circle').querySelector('[data-circle-add-positive]')?.addEventListener('click', () => {
    addCircleCustomTag('positiveTags', 'circlePositiveCustom', 5);
    renderAll();
  });

  $('#view-circle').querySelector('[data-circle-add-nuance]')?.addEventListener('click', () => {
    addCircleCustomTag('nuanceTags', 'circleNuanceCustom', 3);
    renderAll();
  });

  $('#view-circle').querySelectorAll('[data-circle-toggle-positive]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleCircleDraftTag('positiveTags', btn.dataset.circleTogglePositive, 5);
      renderAll();
    });
  });

  $('#view-circle').querySelectorAll('[data-circle-toggle-nuance]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleCircleDraftTag('nuanceTags', btn.dataset.circleToggleNuance, 3);
      renderAll();
    });
  });

  $('#view-circle').querySelector('[data-circle-clear-draft]')?.addEventListener('click', () => {
    setCircleDraft({ friendName: '', friendRelation: 'friend', candidateId: '', recipientName: '', positiveTags: [], nuanceTags: [], comment: '' });
    renderAll();
  });

  $('#view-circle').querySelector('[data-circle-save-recommendation]')?.addEventListener('click', () => {
    const candidateName = String($('#view-circle').querySelector('#circleCandidateName')?.value || '').trim();
    const recipientName = String($('#view-circle').querySelector('#circleRecipientName')?.value || '').trim();
    const comment = String($('#view-circle').querySelector('#circleComment')?.value || '').trim();
    const positiveTags = Array.isArray(getCircleDraft().positiveTags) ? [...getCircleDraft().positiveTags] : [];
    const nuanceTags = Array.isArray(getCircleDraft().nuanceTags) ? [...getCircleDraft().nuanceTags] : [];
    if (!candidateName) return toast('Укажите человека, которого рекомендуете');
    if (!positiveTags.length && !nuanceTags.length && !comment) return toast('Добавьте хотя бы один тег или комментарий');
    const authorKey = 'local-user';
    const recommendation = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      authorKey,
      candidateId: circleKey(candidateName),
      candidateName,
      recipientName,
      positiveTags,
      nuanceTags,
      comment,
      accepted: false,
      anonymous: true,
      createdAt: Date.now()
    };
    const next = getCircleRecommendations().filter((item) => !(circleKey(item.authorKey || '') === authorKey && circleKey(item.candidateId || item.candidateName || '') === circleKey(candidateName)));
    next.unshift(recommendation);
    saveCircleRecommendations(next.slice(0, 500));
    setCircleDraft({ friendName: candidateName, candidateId: circleKey(candidateName), recipientName: '', positiveTags: [], nuanceTags: [], comment: '' });
    renderAll();
    toast('Рекомендация сохранена анонимно');
  });

  $('#view-circle').querySelectorAll('[data-circle-toggle-accepted]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = String(btn.dataset.circleToggleAccepted || '');
      const next = getCircleRecommendations().map((item) => {
        if (String(item.id) !== id) return item;
        return { ...item, accepted: !item.accepted };
      });
      saveCircleRecommendations(next);
      renderAll();
    });
  });

  $('#view-circle').querySelectorAll('[data-circle-delete-rec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = String(btn.dataset.circleDeleteRec || '');
      const next = getCircleRecommendations().filter((item) => String(item.id) !== id);
      saveCircleRecommendations(next);
      renderAll();
      toast('Рекомендация удалена');
    });
  });

  wireHomeContentHandlers('#view-circle');
}
function renderEventCard(e, { compact }) {
  const tags = (e.tags || []).map((t) => `<span class="pill">${interestLabel(t)}</span>`).join(' ');
  const when = formatEventDate(e.startsAt);
  const dist = distanceToEventKm(e);
  const distText = dist == null ? '' : `• ${dist.toFixed(1)} км`;

  return `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(e.title)}</div>
          <div class="item-meta">${escapeHtml(e.place)} • ${when} ${distText}</div>
        </div>
        ${compact ? `<div class="pill">${cityLabel(e.city)}</div>` : ''}
      </div>
      <div class="row-inline" style="gap:8px; flex-wrap:wrap">${tags}</div>
      <div class="item-actions">
        <button class="btn" type="button" data-go-event="${e.id}">Сходить</button>
        <a class="btn ghost" target="_blank" rel="noopener" href="${mapUrlForCoords(e.lat, e.lon, e.city, 16)}">Карта</a>
      </div>
    </div>
  `;
}

function renderProfileCard(p) {
  const tags = p.interests.map((t) => `<span class="pill">${interestLabel(t)}</span>`).join(' ');
  const compat = p.compatibility || null;
  const verdict = compat
    ? `<span class="pill status-pill ${compat.tone || 'warn'}">${verdictEmoji(compat.tone || 'warn')} ${escapeHtml(compat.label)}</span>`
    : `<div class="pill">${p.score > 0 ? 'Совпадение' : 'Нейтрально'}</div>`;
  return `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(p.name)}, ${p.age}</div>
          <div class="item-meta">${cityLabel(p.city)} • общих интересов: ${p.score}${p.budget ? ` • бюджет: ${escapeHtml(String(p.budget))}` : ''}</div>
        </div>
        ${verdict}
      </div>
      <div class="muted">${escapeHtml(p.about)}</div>
      <div class="row-inline">${tags}</div>
      <div class="item-actions">
        <button class="btn" type="button" data-like="${p.id}">Лайк</button>
        <button class="btn ghost" type="button" data-skip="${p.id}">Пропуск</button>
      </div>
    </div>
  `;
}

function renderMatchCard(id, { seen } = {}) {
  const p = DATING_PROFILES.find((x) => x.id === id);
  if (!p) return '';
  const photo = p.photos?.[0] || './assets/profile/avatar-square.jpg';
  return `
    <div class="match-card ${seen ? 'seen' : 'new'}" data-match-id="${p.id}" role="button" tabindex="0" aria-label="Матч ${escapeHtml(p.name)}">
      <div class="match-photo-wrap">
        <img class="match-photo" alt="${escapeHtml(p.name)}" src="${photo}" />
      </div>
      <div class="match-name">${escapeHtml(p.name)}</div>
      <div class="match-meta">${cityLabel(p.city)}</div>
    </div>
  `;
}

function renderGeoItem(p) {
  const d = new Date(p.ts || Date.now());
  const t = d.toLocaleString('ru-RU');
  const note = p.note ? ` • ${escapeHtml(p.note)}` : '';
  return `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${t}${note}</div>
          <div class="item-meta">${formatLatLon(p.lat, p.lon)} (±${Math.round(p.acc)}м) • ${p.cityKey ? cityLabel(p.cityKey) : '—'}</div>
        </div>
        <a class="btn ghost" target="_blank" rel="noopener" href="${mapUrlForCoords(p.lat, p.lon, p.cityKey, 17)}">Карта</a>
      </div>
    </div>
  `;
}

function onLike(id) {
  state.dating.likes[id] = 'like';
  const mutual = profileLikesYou(id);
  state.dating.matches = (state.dating.matches || []).filter((x) => x !== id);
  if (mutual) state.dating.matches.unshift(id);

  if (mutual) {
    state.messages = state.messages || { activeThreadId: null, threads: {} };
    state.messages.activeThreadId = id;
    state.messages.openChat = id;
    state.ui = state.ui || {};
    state.ui.homePanel = 'messages';
    haptic('match');
    toast('Есть матч!');
    save();
    switchTab('home');
    return;
  }
  haptic('like');
  toast('Лайк отправлен');
  save();
  renderAll();
}

function onSkip(id) {
  state.dating.likes[id] = 'skip';
  haptic('skip');
  save();
  renderAll();
}

function normalizeServerUrl(u) {
  const s = String(u || '').trim();
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

async function apiJson(serverUrl, path, { method, headers, body } = {}) {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(`${base}${path}`, {
    method: method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(headers || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error ? String(data.error) : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function apiRegister(serverUrl, email, password) {
  if (!email) throw new Error('Укажите email');
  if (!password || password.length < 6) throw new Error('Пароль минимум 6 символов');
  return apiJson(serverUrl, '/api/register', { method: 'POST', body: { email, password } });
}

async function apiLogin(serverUrl, email, password) {
  if (!email) throw new Error('Укажите email');
  if (!password) throw new Error('Укажите пароль');
  return apiJson(serverUrl, '/api/login', { method: 'POST', body: { email, password } });
}

async function apiGetEvents(serverUrl, cityKey) {
  const base = normalizeServerUrl(serverUrl);
  const url = cityKey ? `${base}/api/events?city=${encodeURIComponent(cityKey)}` : `${base}/api/events`;
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `HTTP ${res.status}`);
  return data.events || [];
}

async function apiGetSync(serverUrl, token) {
  return apiJson(serverUrl, '/api/sync', { method: 'GET', headers: { authorization: `Bearer ${token}` } });
}

async function apiPostSync(serverUrl, token, payload, updatedAt) {
  return apiJson(serverUrl, '/api/sync', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { payload, updatedAt }
  });
}

async function apiPostPublic(serverUrl, token, profile) {
  return apiJson(serverUrl, '/api/public', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { profile }
  });
}

async function apiPostLoc(serverUrl, token, loc) {
  return apiJson(serverUrl, '/api/loc', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { loc }
  });
}

async function apiPostPlans(serverUrl, token, day, plans) {
  return apiJson(serverUrl, '/api/plans', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { day, plans }
  });
}

async function apiGetPlans(serverUrl, token, { cityKey }) {
  const base = normalizeServerUrl(serverUrl);
  const url = `${base}/api/plans?city=${encodeURIComponent(cityKey || '')}`;
  const res = await fetch(url, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `HTTP ${res.status}`);
  return data.plans || [];
}

async function apiGetNearby(serverUrl, token, { lat, lon, cityKey, radiusKm }) {
  const base = normalizeServerUrl(serverUrl);
  const url = `${base}/api/nearby?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&city=${encodeURIComponent(
    cityKey || ''
  )}&radiusKm=${encodeURIComponent(radiusKm || 2)}`;
  const res = await fetch(url, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `HTTP ${res.status}`);
  return data.users || [];
}

async function refreshRemoteEvents(cityKey) {
  if (!cityKey) return;
  const url = state.cloud?.serverUrl || 'http://localhost:8787';
  const events = await apiGetEvents(url, cityKey);
  remoteEvents = Array.isArray(events) ? events : [];
  remoteEventsCity = cityKey;
  remoteEventsUpdatedAt = new Date().toISOString();
}

async function fetchNearby() {
  if (!state.lastKnown) throw new Error('Нет геопозиции');
  if (!state.cloud?.enabled || !state.cloud?.token) throw new Error('Нужен логин (синк)');
  const cityKey = currentCityKey();
  if (!cityKey) throw new Error('Город не определён');
  const users = await apiGetNearby(state.cloud.serverUrl, state.cloud.token, {
    lat: state.lastKnown.lat,
    lon: state.lastKnown.lon,
    cityKey,
    radiusKm: 2
  });
  return users;
}

function initMapIfNeeded(containerId = 'map') {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (map) return;
  const L = window.L;
  if (!L) return;

  const fallback = { lat: 55.751244, lon: 37.618423, zoom: 12 };
  const lat = state.lastKnown?.lat ?? fallback.lat;
  const lon = state.lastKnown?.lon ?? fallback.lon;
  const zoom = state.lastKnown ? 14 : fallback.zoom;

  map = L.map(el, { zoomControl: false });
  mapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.setView([lat, lon], zoom);
}

function updateMapMarkers(users) {
  const L = window.L;
  if (!map || !L) return;

  // Me marker
  if (state.lastKnown) {
    const ll = [state.lastKnown.lat, state.lastKnown.lon];
    if (!meMarker) {
      meMarker = L.circleMarker(ll, { radius: 8, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.9 }).addTo(map);
      meMarker.bindPopup('Вы');
    } else {
      meMarker.setLatLng(ll);
    }
    map.setView(ll, map.getZoom(), { animate: false });
  }

  // Clear nearby
  for (const m of nearbyMarkers) m.remove();
  nearbyMarkers = [];

  const list = Array.isArray(users) ? users : [];
  for (const u of list) {
    if (!u || typeof u.lat !== 'number' || typeof u.lon !== 'number') continue;
    const m = L.circleMarker([u.lat, u.lon], {
      radius: 7,
      color: '#a78bfa',
      fillColor: '#a78bfa',
      fillOpacity: 0.75
    }).addTo(map);
    const title = u.name ? escapeHtml(u.name) : 'Пользователь рядом';
    const dist = typeof u.distKm === 'number' ? ` • ${u.distKm.toFixed(2)} км` : '';
    const comm = Array.isArray(u.communication) && u.communication.length ? `<br/>${u.communication.map(commLabel).join(', ')}` : '';
    const vals = Array.isArray(u.values) && u.values.length ? `<br/>${u.values.map(valueLabel).join(', ')}` : '';
    const extra = [u.jobTitle, u.education].filter(Boolean).map(escapeHtml).join(' • ');
    const extraLine = extra ? `<br/>${extra}` : '';
    m.bindPopup(`${title}${dist}${comm}${vals}${extraLine}`);
    nearbyMarkers.push(m);
  }
}

async function fetchPlansToday() {
  const day = todayKey();
  const cityKey = currentCityKey();
  if (!cityKey) throw new Error('Город не определён');
  if (!state.cloud?.enabled || !state.cloud?.token) throw new Error('Нужен логин (синк)');
  const list = await apiGetPlans(state.cloud.serverUrl, state.cloud.token, { cityKey });
  // Only today's plans.
  return list.filter((x) => x?.day === day);
}

function maybeShareLocation() {
  if (!state.lastKnown) return;
  if (!state.geo?.mapShare) return;
  if (!state.cloud?.enabled || !state.cloud?.token) return;
  const cityKey = currentCityKey();
  if (!cityKey) return;

  const now = Date.now();
  // Throttle to avoid spamming.
  if (now - lastLocSentAt < 25_000) return;
  lastLocSentAt = now;

  const serverUrl = state.cloud.serverUrl;
  const token = state.cloud.token;

  // Send a minimal public profile (NOT encrypted) for map display.
  const publicProfile = {
    name: state.profile?.name || 'Пользователь',
    communication: state.profile?.communication || [],
    interests: state.profile?.interests || [],
    values: state.profile?.values || [],
    zodiac: state.profile?.zodiac || '',
    jobTitle: state.profile?.jobTitle || '',
    education: state.profile?.education || ''
  };

  apiPostPublic(serverUrl, token, publicProfile).catch(() => {});
  apiPostLoc(serverUrl, token, {
    lat: state.lastKnown.lat,
    lon: state.lastKnown.lon,
    cityKey,
    ts: new Date(state.lastKnown.ts || Date.now()).toISOString()
  }).catch(() => {});
}

function maybeSharePlans() {
  if (!state.geo?.planShare) return;
  if (!state.cloud?.enabled || !state.cloud?.token) return;
  if (!state.plans?.day) ensureTodayPlans();
  const day = state.plans.day;
  const plans = Array.isArray(state.plans.items) ? state.plans.items : [];
  apiPostPlans(state.cloud.serverUrl, state.cloud.token, day, plans).catch(() => {});
}

function addPlan(partial) {
  ensureTodayPlans();
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    title: String(partial?.title || '').trim().slice(0, 80) || 'План',
    scheduledAt: partial?.scheduledAt || null,
    companyOk: !!partial?.companyOk,
    kind: partial?.kind || 'custom',
    eventId: partial?.eventId || null,
    cityKey: partial?.cityKey || currentCityKey(),
    lat: typeof partial?.lat === 'number' ? partial.lat : null,
    lon: typeof partial?.lon === 'number' ? partial.lon : null
  };
  state.plans.items = [item, ...(state.plans.items || [])].slice(0, 12);
  save();
  maybeSharePlans();
  return item;
}

function renderPlanItem(p) {
  const t = new Date(p.createdAt || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const scheduled = p.scheduledAt ? new Date(p.scheduledAt) : null;
  const scheduledText = scheduled
    ? `${scheduled.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} • ${scheduled.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })}`
    : 'время не указано';
  const place = p.title ? escapeHtml(p.title) : '—';
  const city = p.cityKey ? cityLabel(p.cityKey) : '—';
  const mapLink =
    typeof p.lat === 'number' && typeof p.lon === 'number'
      ? `<a class="btn ghost" target="_blank" rel="noopener" href="${mapUrlForCoords(p.lat, p.lon, p.cityKey, 17)}">Карта</a>`
      : '';
  const companyBadge = p.companyOk ? `<span class="pill plan-company-badge">с компанией</span>` : `<span class="pill plan-company-badge muted-pill">один/без уточнения</span>`;
  return `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${place}</div>
          <div class="item-meta">${scheduledText} • ${city} • создано ${t}</div>
          <div class="item-tags">${companyBadge}</div>
        </div>
        <div class="item-actions">
          ${mapLink}
          <button class="btn danger" type="button" data-del-plan="${p.id}">Удалить</button>
        </div>
      </div>
    </div>
  `;
}

async function cloudPush() {
  if (!state.cloud?.enabled) throw new Error('Синхронизация выключена');
  if (!state.cloud?.token) throw new Error('Нет токена (сделайте логин)');
  if (!state.encryption?.enabled) throw new Error('Для синка включите шифрование');
  if (state.__locked || !state.__cryptoKey) throw new Error('Сначала разблокируйте (введите пароль)');
  if (!state.encryption.saltB64) throw new Error('Нет соли шифрования');

  const plain = JSON.parse(await exportState(state));
  const enc = await encryptJson(state.__cryptoKey, plain);
  const payload = {
    v: 1,
    saltB64: state.encryption.saltB64,
    iterations: state.encryption.iterations,
    enc
  };
  const updatedAt = new Date().toISOString();
  await apiPostSync(state.cloud.serverUrl, state.cloud.token, payload, updatedAt);
}

async function cloudPull() {
  if (!state.cloud?.enabled) throw new Error('Синхронизация выключена');
  if (!state.cloud?.token) throw new Error('Нет токена (сделайте логин)');
  if (!state.encryption?.enabled) throw new Error('Для синка включите шифрование');
  if (state.__locked || !state.__cryptoKey) throw new Error('Сначала разблокируйте (введите пароль)');

  const r = await apiGetSync(state.cloud.serverUrl, state.cloud.token);
  const payload = r.payload;
  if (!payload) throw new Error('На сервере нет данных');
  if (payload.v !== 1 || !payload.enc) throw new Error('Неподдерживаемый payload');
  if (payload.saltB64 && state.encryption.saltB64 && payload.saltB64 !== state.encryption.saltB64) {
    throw new Error('Соль шифрования отличается. Настройте шифрование одинаково на обоих устройствах.');
  }

  const nextPlain = await decryptJson(state.__cryptoKey, payload.enc);
  const keepCloud = state.cloud;
  const keepEnc = state.encryption;
  const keepKey = state.__cryptoKey;

  state = nextPlain;
  state.cloud = keepCloud;
  state.encryption = keepEnc;
  state.__cryptoKey = keepKey;
  state.__locked = false;
  save();
}

// Keep public profile up to date after auth changes.
async function pushPublicProfileNow() {
  if (!state.cloud?.enabled || !state.cloud?.token) return;
  const publicProfile = {
    name: state.profile?.name || 'Пользователь',
    communication: state.profile?.communication || [],
    interests: state.profile?.interests || [],
    values: state.profile?.values || [],
    zodiac: state.profile?.zodiac || '',
    jobTitle: state.profile?.jobTitle || '',
    education: state.profile?.education || ''
  };
  await apiPostPublic(state.cloud.serverUrl, state.cloud.token, publicProfile);
}

function filterEventsByCity(cityKey) {
  const interests = new Set(state.profile.interests || []);
  const source =
    cityKey && remoteEventsCity === cityKey && Array.isArray(remoteEvents) && remoteEvents.length ? remoteEvents : EVENTS;
  const list = source
    .filter((e) => (!cityKey ? true : e.city === cityKey))
    .map((e) => ({
      ...e,
      score: overlapCount(interests, new Set(e.tags || []))
    }))
    .sort((a, b) => {
      const da = distanceToEventKm(a);
      const db = distanceToEventKm(b);
      const pa = (a.score || 0) * 10 + (da == null ? 0 : Math.max(0, 20 - da));
      const pb = (b.score || 0) * 10 + (db == null ? 0 : Math.max(0, 20 - db));
      return pb - pa;
    });

  return list;
}

function topEventSuggestion() {
  const cityKey = currentCityKey();
  const list = filterEventsByCity(cityKey);
  return list[0] || null;
}

function distanceToEventKm(ev) {
  const last = state.lastKnown;
  if (!last) return null;
  return haversineKm({ lat: last.lat, lon: last.lon }, { lat: ev.lat, lon: ev.lon });
}

function overlapCount(aSet, bSet) {
  let n = 0;
  for (const x of aSet) if (bSet.has(x)) n += 1;
  return n;
}

function formatEventDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function switchTab(tab) {
  const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
  if (btn) btn.click();
}

function updateFooter() {
  const el = $('#footerStatus');
  const online = navigator.onLine;
  const geo = state.consent.geo ? 'geo:on' : 'geo:off';
  const steps = state.consent.steps ? 'steps:on' : 'steps:off';
  el.textContent = `${online ? 'Онлайн' : 'Оффлайн'} • ${geo} • ${steps}`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function haptic(kind) {
  // Best-effort: works on some Android devices.
  if (!('vibrate' in navigator)) return;
  const map = {
    tab: 8,
    light: 10,
    open: 12,
    like: 14,
    skip: 16,
    match: [20, 30, 20],
    heavy: [30, 20, 30]
  };
  const pat = map[kind] ?? 0;
  if (!pat) return;
  try {
    navigator.vibrate(pat);
  } catch {
    // ignore
  }
}

function mountTinder(profiles) {
  tinder?.destroy?.();

  const wrap = $('#tinderWrap');
  if (!wrap) return;

  wrap.innerHTML = '';
  // Show exactly one card at a time (no stacking/overlap).
  const stack = profiles.slice(0, 1);
  const cards = stack.map((p) => {
    const el = document.createElement('div');
    el.className = 'tinder-card';
    el.dataset.pid = p.id;
    el.innerHTML = renderTinderInner(p);
    wrap.appendChild(el);
    return el;
  });

  const top = cards[0];
  if (!top) return;

  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let dragging = false;
  let pointerId = null;

  const likeStamp = top.querySelector('.tinder-stamp.like');
  const nopeStamp = top.querySelector('.tinder-stamp.nope');

  const setStamp = () => {
    const a = Math.min(1, Math.abs(dx) / 90);
    if (dx > 0) {
      likeStamp.style.opacity = String(a);
      nopeStamp.style.opacity = '0';
    } else if (dx < 0) {
      nopeStamp.style.opacity = String(a);
      likeStamp.style.opacity = '0';
    } else {
      likeStamp.style.opacity = '0';
      nopeStamp.style.opacity = '0';
    }
  };

  const onDown = (e) => {
    if (state.__locked) return;
    if (e.pointerType === 'mouse') return;
    if (e.button != null && e.button !== 0) return;
    e.stopPropagation();
    dragging = true;
    pointerId = e.pointerId;
    top.setPointerCapture?.(pointerId);
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dy = 0;
    top.style.transition = 'none';
  };

  const onMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    e.stopPropagation();
    dx = e.clientX - startX;
    dy = e.clientY - startY;

    if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx)) {
      dragging = false;
      top.style.transition = 'transform 160ms ease';
      top.style.transform = 'translate(0px,0px) rotate(0deg)';
      setStamp();
      return;
    }

    const rot = Math.max(-18, Math.min(18, dx / 14));
    top.style.transform = `translate(${dx}px, ${dy * 0.15}px) rotate(${rot}deg)`;
    setStamp();
  };

  const commit = (dir) => {
    const pid = top.dataset.pid;
    if (!pid) return;
    if (dir === 'right') onLike(pid);
    else onSkip(pid);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    top.style.transition = 'transform 220ms ease';

    if (Math.abs(dx) > 90) {
      const dir = dx > 0 ? 'right' : 'left';
      const x = dir === 'right' ? 420 : -420;
      const rot = dir === 'right' ? 18 : -18;
      top.style.transform = `translate(${x}px, -10px) rotate(${rot}deg)`;
      setStamp();
      setTimeout(() => commit(dir), 140);
    } else {
      top.style.transform = 'translate(0px,0px) rotate(0deg)';
      likeStamp.style.opacity = '0';
      nopeStamp.style.opacity = '0';
    }
  };

  top.addEventListener('pointerdown', onDown, { passive: true });
  top.addEventListener('pointermove', onMove, { passive: true });
  top.addEventListener('pointerup', onUp, { passive: true });
  top.addEventListener('pointercancel', onUp, { passive: true });

  const swipe = (dir) => {
    if (state.__locked) return;
    const x = dir === 'right' ? 420 : -420;
    const rot = dir === 'right' ? 18 : -18;
    top.style.transition = 'transform 220ms ease';
    top.style.transform = `translate(${x}px, -10px) rotate(${rot}deg)`;
    setTimeout(() => commit(dir === 'right' ? 'right' : 'left'), 140);
  };

  tinder = {
    swipe,
    destroy: () => {
      try {
        top.removeEventListener('pointerdown', onDown);
        top.removeEventListener('pointermove', onMove);
        top.removeEventListener('pointerup', onUp);
        top.removeEventListener('pointercancel', onUp);
      } catch {
        // ignore
      }
    }
  };
}

function renderTinderInner(p) {
  const tags = p.interests.map((t) => `<span class="pill">${interestLabel(t)}</span>`).join(' ');
  const comm = (p.communication || []).map((t) => `<span class="pill">${commLabel(t)}</span>`).join(' ');
  const vals = (p.values || []).map((t) => `<span class="pill">${valueLabel(t)}</span>`).join(' ');
  const zodiac = p.zodiac ? `<span class="pill">${escapeHtml(p.zodiac)}</span>` : '';
  const job = p.jobTitle ? `<span class="pill">${escapeHtml(p.jobTitle)}</span>` : '';
  const edu = p.education ? `<span class="pill">${escapeHtml(p.education)}</span>` : '';
  const compat = p.compatibility || { label: 'портрет ещё строится', shared: [], differences: [], neutral: [] };
  const circle = getCircleRecommendationStatus(circleKey(p.name || ''));
  const circleHighlights = getCircleRecommendationHighlights(circleKey(p.name || ''));
  const shared = Array.isArray(compat.shared) && compat.shared.length ? compat.shared.slice(0, 3).map((x) => `<span class="pill">${escapeHtml(x)}</span>`).join(' ') : '';
  const diff = Array.isArray(compat.differences) && compat.differences.length ? compat.differences.slice(0, 2).map((x) => `<span class="pill muted-pill">${escapeHtml(x)}</span>`).join(' ') : '';
  const neutral = Array.isArray(compat.neutral) && compat.neutral.length ? compat.neutral.slice(0, 2).map((x) => `<span class="pill muted-pill">${escapeHtml(x)}</span>`).join(' ') : '';
  return `
    <div class="tinder-stamp like">LIKE</div>
    <div class="tinder-stamp nope">NOPE</div>
    <div class="pad">
      <div>
        <div class="tinder-title">${escapeHtml(p.name)}, ${p.age}</div>
        <div class="tinder-sub"><span class="verdict ${compat.tone || 'warn'}">${verdictEmoji(compat.tone || 'warn')}</span> ${escapeHtml(compat.label)}</div>
      </div>
      <div class="tinder-about">${escapeHtml(p.about)}</div>
      <div class="tinder-badges">${tags}</div>
      <div class="tinder-badges">${comm}</div>
      <div class="tinder-badges">${vals}</div>
      <div class="tinder-badges">${zodiac} ${job} ${edu}</div>
      <div class="tinder-badges"><span class="pill status-pill ${circle.tone === 'good' ? 'good' : circle.tone === 'bad' ? 'bad' : circle.tone === 'warn' ? 'warn' : 'muted'}">${circle.label}</span></div>
      ${circleHighlights.values.length ? `<div class="tinder-badges">${circleHighlights.values.slice(0, 2).map((x) => `<span class="pill">${escapeHtml(x)}</span>`).join(' ')}</div>` : ''}
      ${shared ? `<div class="tinder-badges">${shared}</div>` : ''}
      ${diff ? `<div class="tinder-badges">${diff}</div>` : ''}
      ${neutral ? `<div class="tinder-badges">${neutral}</div>` : ''}
      <div class="muted" style="margin-top:auto">Свайп вправо — лайк, влево — пропуск</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function commLabel(id) {
  return COMM_FORMATS.find((x) => x.id === id)?.label ?? id;
}

function valueLabel(id) {
  return VALUES.find((x) => x.id === id)?.label ?? VALUES_ADULT.find((x) => x.id === id)?.label ?? id;
}

function clampInt(raw, min, max, fallback) {
  const n = Number(String(raw || '').replace(/[^0-9-]/g, ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clampFloat(raw, min, max, fallback) {
  const s = String(raw || '').replace(',', '.').replace(/[^0-9.\\-]/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normText(s) {
  return String(s || '').trim().toLowerCase();
}

function getPortraitSummaryFromAnswers(answers = {}) {
  return buildQuestionnairePortrait(answers);
}

function comparePortraits(userPortrait = {}, candidatePersona = {}) {
  const summary = userPortrait?.summary || {};
  const shared = [];
  const differences = [];
  const neutral = [];
  let support = 0;
  let tension = 0;

  for (const field of PSYCH_FIELDS) {
    const a = summary[field];
    const b = candidatePersona[field];
    if (!a || !b) continue;
    if (a === b) {
      support += field === 'humor' ? 0.5 : 1;
      shared.push(questionnaireLabel(field, a));
      continue;
    }

    if (isSoftComplement(field, a, b)) {
      support += 0.5;
      shared.push(`${questionnaireLabel(field, a)} ↔ ${questionnaireLabel(field, b)}`);
      continue;
    }

    if (isHardTension(field, a, b)) {
      tension += 1.2;
      differences.push(`${questionnaireLabel(field, a)} ↔ ${questionnaireLabel(field, b)}`);
      continue;
    }

    tension += field === 'humor' ? 0.4 : 0.8;
    differences.push(`${questionnaireLabel(field, a)} ↔ ${questionnaireLabel(field, b)}`);
  }

  // Фактические категории из большой анкеты (дерево решений по категориям).
  const factual = candidatePersona?.factual || {};
  for (const cat of Object.keys(factual)) {
    const a = summary[cat];
    const b = factual[cat];
    if (!a || !b) continue;
    const block = CATEGORY_LABELS[cat] || cat;
    const la = factualLabel(a);
    const lb = factualLabel(b);
    if (a === b) {
      support += 1;
      shared.push(`${block}: ${la}`);
      continue;
    }
    if (DEALBREAKER_CATS.has(cat)) {
      tension += 1.0;
      differences.push(`${block}: ${la} ↔ ${lb}`);
      continue;
    }
    neutral.push(`${block}: ${la} ↔ ${lb}`);
  }

  let label = 'есть отличия, но можно обсудить';
  let tone = 'warn';
  const net = support - tension;
  if (tension >= 3.2) {
    label = 'существенные расхождения';
    tone = 'bad';
  } else if (net >= 5) {
    label = 'много общего';
    tone = 'good';
  }

  return { label, tone, shared, differences, neutral, support, tension };
}

function verdictEmoji(tone) {
  return tone === 'good' ? '🟢' : tone === 'bad' ? '🔴' : '🟡';
}

function isSoftComplement(field, a, b) {
  if (field === 'temperament') {
    return (a === 'choleric' && b === 'phlegmatic') || (a === 'phlegmatic' && b === 'choleric') || (a === 'sanguine' && b === 'melancholic') || (a === 'melancholic' && b === 'sanguine');
  }
  if (field === 'social') {
    return (a === 'open' && b === 'adaptive') || (a === 'adaptive' && b === 'open') || (a === 'close' && b === 'adaptive') || (a === 'adaptive' && b === 'close');
  }
  if (field === 'humor') {
    return (a === 'high' && b === 'medium') || (a === 'medium' && b === 'high');
  }
  if (field === 'pace') {
    return (a === 'fast' && b === 'mixed') || (a === 'mixed' && b === 'fast') || (a === 'steady' && b === 'mixed') || (a === 'mixed' && b === 'steady');
  }
  if (field === 'motivation') {
    return (a === 'love' && b === 'family') || (a === 'family' && b === 'love') || (a === 'play' && b === 'love') || (a === 'love' && b === 'play');
  }
  return false;
}

function isHardTension(field, a, b) {
  if (field === 'attachment') {
    return (a === 'anxious' && b === 'avoidant') || (a === 'avoidant' && b === 'anxious') || a === 'chaotic' || b === 'chaotic';
  }
  if (field === 'conflict') {
    return (a === 'control' && b === 'avoid') || (a === 'avoid' && b === 'control') || (a === 'control' && b === 'control') || (a === 'pursue' && b === 'avoid') || (a === 'avoid' && b === 'pursue');
  }
  if (field === 'game') {
    return (a === 'defect' && b === 'cooperate') || (a === 'cooperate' && b === 'defect') || (a === 'control' && b === 'avoid') || (a === 'avoid' && b === 'control');
  }
  if (field === 'attribution') {
    return (a === 'anxious' && b === 'avoidant') || (a === 'avoidant' && b === 'anxious') || (a === 'balanced' && b === 'suspicious') || (a === 'suspicious' && b === 'balanced');
  }
  return false;
}
