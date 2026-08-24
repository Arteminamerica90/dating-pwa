import { EVENTS, INTERESTS, cityLabel, interestLabel, VENUES, venueById } from './events.js?v=70';
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
} from './storage.js?v=70';
import { formatLatLon, guessCityKeyFromCoords, haversineKm } from './geo.js?v=70';
import { StepCounter } from './steps.js?v=70';
import { decryptJson, encryptJson } from './encryption.js?v=70';
import { decryptChatText, derivePairKey, encryptChatText } from './chat-crypto.js?v=70';
import { FULL_QUESTIONNAIRE, CATEGORY_LABELS, CATEGORY_ORDER, factualLabel } from './questionnaire-data.js?v=70';
import { partnerFilterText } from './partner-filter-text.js?v=70';
import {
  isSupabaseConfigured,
  supabaseCurrentUser,
  supabaseEnsureMatch,
  supabaseGetMyLikes,
  supabaseGetMyMatches,
  supabaseGetPlansToday,
  supabaseGetLocations,
  supabaseGetMessages,
  supabaseListPublicProfiles,
  supabaseLoadProfile,
  supabaseMarkMatchSeen,
  supabaseOnAuth,
  supabaseChangePassword,
  supabaseResetPassword,
  supabaseResendConfirmation,
  supabaseSaveLike,
  supabaseSaveLocation,
  supabaseSaveMessage,
  supabaseSavePlans,
  supabaseSaveProfile,
  supabaseDeleteProfile,
  supabaseSignIn,
  supabaseSignOut,
  supabaseSignUp,
  warmupSupabase
} from './supabase.js?v=88';

const $ = (sel) => document.querySelector(sel);

// Helps diagnose cases where the module loads but init hangs (e.g. storage blocked).
window.__walkdateModuleLoaded = true;

let state = null;
let geoWatchId = null;
let stepCounter = null;
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
  { id: 'cafe', label: 'Кофейни' },
  { id: 'park', label: 'Парки' },
  { id: 'restaurant', label: 'Рестораны' },
  { id: 'gallery', label: 'Галереи' },
  { id: 'culture', label: 'Культурные события' },
  { id: 'club', label: 'Клубы' },
  { id: 'theatre', label: 'Театр' },
  { id: 'cinema', label: 'Кино' },
  { id: 'bowling', label: 'Боулинг / квесты' },
  { id: 'sport', label: 'Спорт и активный отдых' },
  { id: 'home', label: 'Дома' },
  { id: 'work', label: 'Совместная работа' }
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
    gender: 'female',
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
    gender: 'male',
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
    gender: 'female',
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
    gender: 'male',
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

let liveProfiles = [];
let liveProfilesLoaded = false;
let lastPushedMatchIds = [];

function toDatingProfile(p) {
  return {
    id: p.id,
    likesYou: false,
    name: p.name || 'Аноним',
    gender: p.gender || '',
    age: p.age,
    city: p.cityOverride || p.city || '',
    stepCount: p.stepCount || 0,
    meetingIntent: p.meetingIntent || [],
    meetingPlaces: p.meetingPlaces || [],
    photos: p.photos || [],
    interests: p.interests || [],
    communication: p.communication || [],
    values: p.values || [],
    zodiac: p.zodiac || '',
    jobTitle: p.jobTitle || '',
    education: p.education || '',
    budget: p.budget || '',
    about: p.about || p.description || '',
    persona: p.persona || {},
    factual: p.factual || {}
  };
}

async function loadLiveProfiles() {
  liveProfilesLoaded = true;
  try {
    if (!accountInfo?.id || !isSupabaseConfigured()) return;
    const list = await supabaseListPublicProfiles({ excludeUserId: accountInfo.id });
    liveProfiles = list.map(toDatingProfile);
    await syncLikesFromSupabase();
    renderAll();
  } catch (err) {
    console.warn('live profiles', err?.message);
  }
}

async function syncLikesFromSupabase() {
  try {
    if (!accountInfo?.id || !isSupabaseConfigured()) return;
    const { mine, likedMe } = await supabaseGetMyLikes(accountInfo.id);
    state.dating.likes = { ...state.dating.likes, ...mine };
    state.dating.likedMe = { ...(state.dating.likedMe || {}), ...likedMe };
    await syncMatchesFromSupabase();
    save();
  } catch (err) {
    console.warn('sync likes', err?.message);
  }
}

async function syncMatchesFromSupabase() {
  if (!accountInfo?.id || !isSupabaseConfigured()) return;
  const rows = await supabaseGetMyMatches(accountInfo.id);
  const fresh = rows.filter((r) => !r.otherUnmatched).map((r) => r.other);
  const demo = (state.dating.matches || []).filter((id) => !fresh.includes(id));
  state.dating.matches = [...fresh, ...demo];
  const known = new Set(lastPushedMatchIds);
  const newOnes = fresh.filter((id) => !known.has(id));
  lastPushedMatchIds = fresh;
  if (newOnes.length) {
    toast('Есть новый матч!');
    haptic('match');
    renderAll();
  }
}

const QUESTIONNAIRE = [
  {
    block: 'Блок 1: Конфликт и стратегия',
    question: 'Вы с партнёром поссорились. Как вы ведёте себя при ссоре?',
    id: 'conflict_break',
    dimension: 'conflict',
    options: [
      { id: 'space', label: 'Сразу идёт мириться и говорить', hint: 'Стратегия: сотрудничество • сангвиник', traits: { conflict: 'cooperate', temperament: 'sanguine', game: 'cooperate' } },
      { id: 'talk', label: 'Даёт время остыть и ждёт первого шага', hint: 'Стратегия: избегание • флегматик', traits: { conflict: 'avoid', temperament: 'phlegmatic', game: 'avoid' } },
      { id: 'note', label: 'Замыкается и уходит в себя', hint: 'Стратегия: уход в себя • меланхолик', traits: { conflict: 'avoid', temperament: 'melancholic', attribution: 'internal' } },
      { id: 'freeze', label: 'Настойчиво договаривается, даже если я не готова', hint: 'Стратегия: настойчивость • холерик', traits: { conflict: 'pursue', temperament: 'choleric', game: 'control' } },
      { id: 'note2', label: 'Переводит всё в шутку и разряжает обстановку', hint: 'Стратегия: юмор • сангвиник', traits: { conflict: 'cooperate', humor: 'high', game: 'cooperate' } },
      { id: 'letter', label: 'Оставляет записку, пишет сообщение с извинением', hint: 'Стратегия: мягкое сотрудничество', traits: { conflict: 'cooperate', attachment: 'safe', humor: 'medium' } },
      { id: 'cool2', label: 'Сначала остывает, потом спокойно возвращается к разговору', hint: 'Стратегия: пауза + диалог • флегматик', traits: { conflict: 'cooperate', temperament: 'phlegmatic', pace: 'steady' } },
      { id: 'third', label: 'Привлекает посредника — друга или родственника', hint: 'Стратегия: внешняя поддержка', traits: { conflict: 'cooperate', social: 'open', game: 'cooperate' } },
      { id: 'wait', label: 'Ждёт, пока я сама начну разговор', hint: 'Стратегия: избегание инициативы', traits: { conflict: 'avoid', game: 'avoid', attribution: 'balanced' } },
      { id: 'deal', label: 'Предлагает компромисс и новую договорённость', hint: 'Стратегия: переговоры', traits: { conflict: 'cooperate', game: 'cooperate', attribution: 'balanced' } }
    ]
  },
  {
    block: 'Блок 1: Конфликт и стратегия',
    question: 'Партнёр долго не отвечает. Ваша реакция:',
    id: 'silence',
    dimension: 'attribution',
    options: [
      { id: 'busy', label: 'Решит, что я просто занят(а) — ничего страшного', hint: 'Сбалансированная интерпретация', traits: { attribution: 'balanced', attachment: 'safe' } },
      { id: 'panic', label: 'Начнёт переживать, что я охладел(а)', hint: 'Тревожная привязанность', traits: { attribution: 'anxious', attachment: 'anxious' } },
      { id: 'distance', label: 'Не будет навязываться и просто отступит', hint: 'Избегающая привязанность', traits: { attribution: 'avoidant', attachment: 'avoidant' } },
      { id: 'check', label: 'Напишет ещё раз или пошутит, чтобы снять напряжение', hint: 'Комбинация контроля и юмора', traits: { attribution: 'suspicious', attachment: 'chaotic', humor: 'medium' } },
      { id: 'offended', label: 'Обидится и будет ждать моей инициативы', hint: 'Обида как стратегия', traits: { attribution: 'anxious', conflict: 'avoid', game: 'avoid' } },
      { id: 'search', label: 'Проверит мои сети или позвонит, чтобы найти меня', hint: 'Контроль и тревога', traits: { attribution: 'suspicious', attachment: 'anxious', game: 'control' } },
      { id: 'call', label: 'Позвонит, чтобы убедиться, что я в порядке', hint: 'Забота и безопасная привязанность', traits: { attachment: 'safe', attribution: 'balanced', conflict: 'cooperate' } },
      { id: 'cool', label: 'Отнесётся спокойно: у каждого своя жизнь', hint: 'Здоровый баланс', traits: { attribution: 'balanced', attachment: 'avoidant', social: 'adaptive' } }
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
    block: 'Блок 3: Темперамент и ритм',
    question: 'Как вы ведёте себя под давлением?',
    id: 'stress',
    dimension: 'temperament',
    options: [
      { id: 'fast', label: 'Действует быстро и решительно', hint: 'Холерик', traits: { temperament: 'choleric', pace: 'fast', conflict: 'pursue' } },
      { id: 'talk', label: 'Разговаривает, шутит и разряжает обстановку', hint: 'Сангвиник', traits: { temperament: 'sanguine', humor: 'high', conflict: 'cooperate' } },
      { id: 'steady', label: 'Сохраняет спокойствие и идёт по плану', hint: 'Флегматик', traits: { temperament: 'phlegmatic', pace: 'steady', conflict: 'avoid' } },
      { id: 'deep', label: 'Глубоко переживает и переваривает молча', hint: 'Меланхолик', traits: { temperament: 'melancholic', pace: 'slow', attribution: 'internal' } },
      { id: 'panic2', label: 'Паникует и суетится', hint: 'Тревожная реакция', traits: { temperament: 'choleric', attribution: 'anxious', conflict: 'avoid' } },
      { id: 'support', label: 'Ищет поддержку у близких', hint: 'Опора на окружение', traits: { attachment: 'safe', social: 'open', conflict: 'cooperate' } },
      { id: 'close2', label: 'Закрывается и откладывает решение', hint: 'Избегание и отсрочка', traits: { conflict: 'avoid', attribution: 'avoidant', pace: 'slow' } },
      { id: 'plan2', label: 'Берёт паузу, а потом возвращается с чётким планом', hint: 'Хладнокровие и стратегия', traits: { temperament: 'phlegmatic', game: 'cooperate', pace: 'steady' } }
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
      { id: 'mixed', label: 'Зависит от людей и ситуации', hint: 'Адаптивность', traits: { pace: 'mixed', temperament: 'sanguine' } },
      { id: 'burst', label: 'Рваный: всплеск энергии, потом затишье', hint: 'Импульсивность', traits: { pace: 'mixed', temperament: 'choleric' } },
      { id: 'two', label: 'Спокойный дома, быстрый в делах', hint: 'Разные скорости', traits: { pace: 'mixed', temperament: 'sanguine' } },
      { id: 'rush', label: 'Всегда спешит и почти всегда не успевает', hint: 'Постоянная гонка', traits: { pace: 'fast', attribution: 'anxious' } },
      { id: 'warmup', label: 'Медленно раскачивается, зато работает надолго', hint: 'Долгий разгон', traits: { pace: 'slow', temperament: 'melancholic' } }
    ]
  },
  {
    block: 'Блок 4: Теория игр и границы',
    question: 'Когда речь идёт о договорённостях, вы обычно:',
    id: 'game',
    dimension: 'game',
    options: [
      { id: 'cooperate', label: 'Играет честно и ждёт взаимности', hint: 'Tit-for-Tat / сотрудничество', traits: { game: 'cooperate', conflict: 'cooperate', attribution: 'balanced' } },
      { id: 'defect', label: 'Сначала защищает свои интересы', hint: 'Рациональный выбор ради выгоды', traits: { game: 'defect', conflict: 'control' } },
      { id: 'avoid', label: 'Избегает лишних споров', hint: 'Избегание', traits: { game: 'avoid', conflict: 'avoid', temperament: 'phlegmatic' } },
      { id: 'control', label: 'Держит рамку и контролирует исход', hint: 'Контроль стратегии', traits: { game: 'control', conflict: 'pursue', temperament: 'choleric' } },
      { id: 'word', label: 'Соблюдает слово, даже если это невыгодно', hint: 'Надёжность', traits: { game: 'cooperate', temperament: 'phlegmatic', attribution: 'balanced' } },
      { id: 'bargain', label: 'Торгуется до последнего', hint: 'Переговоры и выгода', traits: { game: 'defect', conflict: 'control', temperament: 'choleric' } },
      { id: 'forget', label: 'Легко забывает о своих обещаниях', hint: 'Ненадёжность договорённостей', traits: { game: 'defect', temperament: 'sanguine', attribution: 'avoidant' } },
      { id: 'flex', label: 'Гибко меняет условия, если жизнь изменилась', hint: 'Адаптивные правила', traits: { game: 'cooperate', pace: 'mixed', social: 'adaptive' } }
    ]
  },
  {
    block: 'Блок 4: Теория игр и границы',
    question: 'Когда вы чувствуете ревность, то чаще всего:',
    id: 'jealousy',
    dimension: 'attachment',
    options: [
      { id: 'talk', label: 'Спокойно обсуждает это сразу', hint: 'Стабильная, зрелая привязанность', traits: { attachment: 'safe', game: 'cooperate', attribution: 'balanced' } },
      { id: 'ask', label: 'Ищет подтверждение и успокоение', hint: 'Тревожная привязанность', traits: { attachment: 'anxious', attribution: 'anxious' } },
      { id: 'cool', label: 'Остывает и держит дистанцию', hint: 'Избегание', traits: { attachment: 'avoidant', conflict: 'avoid' } },
      { id: 'test', label: 'Проверяет границы или провоцирует', hint: 'Контроль и сложная динамика', traits: { attachment: 'chaotic', game: 'control', conflict: 'control' } },
      { id: 'self', label: 'Ревнует, но честно признаётся и смеётся над собой', hint: 'Здоровая самоирония', traits: { attachment: 'safe', humor: 'high', attribution: 'balanced' } },
      { id: 'spy', label: 'Контролирует переписки и перемещения', hint: 'Контроль и недоверие', traits: { attachment: 'chaotic', game: 'control', conflict: 'control' } },
      { id: 'silent2', label: 'Ревнует молча и копит', hint: 'Накопление обиды', traits: { attachment: 'anxious', conflict: 'avoid', attribution: 'internal' } },
      { id: 'none', label: 'Не ревнует совсем — полностью доверяет', hint: 'Максимальное доверие', traits: { attachment: 'safe', attribution: 'balanced' } }
    ]
  },
  {
    block: 'Блок 5: Юмор и социальность',
    question: 'Какую роль в отношениях играет юмор?',
    id: 'humor',
    dimension: 'humor',
    options: [
      { id: 'high', label: 'Очень важную: сближает и снимает напряжение', hint: 'Юмор как инструмент сотрудничества', traits: { humor: 'high', temperament: 'sanguine', conflict: 'cooperate' } },
      { id: 'medium', label: 'Умеренную: шутит, но не всё время', hint: 'Юмор есть, но не решает всё', traits: { humor: 'medium', social: 'adaptive' } },
      { id: 'low', label: 'Небольшую: важнее надёжность и смысл', hint: 'Юмор не определяет', traits: { humor: 'low', temperament: 'phlegmatic' } },
      { id: 'sharp', label: 'Острый, ироничный — это его/её способ общаться', hint: 'Иногда помогает, иногда ранит', traits: { humor: 'sharp', temperament: 'melancholic', attribution: 'humor' } },
      { id: 'mood', label: 'Зависит от компании и настроения', hint: 'Ситуативный юмор', traits: { humor: 'medium', social: 'adaptive', temperament: 'sanguine' } }
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
      { id: 'adaptive', label: 'Подстраивается под человека и ситуацию', hint: 'Гибкость', traits: { social: 'adaptive', game: 'cooperate' } },
      { id: 'dosed', label: 'Дозированно: яркие встречи и паузы восстановления', hint: 'Баланс общения и отдыха', traits: { social: 'adaptive', pace: 'mixed', attachment: 'safe' } }
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
const PSYCH_FIELDS = ['attachment', 'conflict', 'temperament', 'game', 'humor', 'social', 'pace', 'attribution'];
const DEALBREAKER_CATS = new Set(['habits', 'family', 'relationship', 'finance', 'extra']);

const QN_ZODIAC_MAP = {
  зодиак_овен: 'Овен',
  зодиак_телец: 'Телец',
  зодиак_близнецы: 'Близнецы',
  зодиак_рак: 'Рак',
  зодиак_лев: 'Лев',
  зодиак_дева: 'Дева',
  зодиак_весы: 'Весы',
  зодиак_скорпион: 'Скорпион',
  зодиак_стрелец: 'Стрелец',
  зодиак_козерог: 'Козерог',
  зодиак_водолей: 'Водолей',
  зодиак_рыбы: 'Рыбы'
};

const CITY_ANSWER_TO_KEY = {
  a: 'Moscow',
  b: 'Saint Petersburg',
  c: 'Kazan',
  d: 'Novosibirsk'
};

let qnIndex = 0;
let qnAnimating = false;

init().catch((err) => {
  showFatal(err?.message || err);
});

async function init() {
  state = await safeLoadStateWithTimeout(1500);
  window.__walkdateStarted = true;

  window.__deleteMyProfile = async () => {
    if (!accountInfo?.id) return toast('Нет активной сессии');
    try {
      await supabaseDeleteProfile(accountInfo.id);
      toast('Профиль удалён с сервера');
    } catch (err) {
      toast(err?.message || 'Ошибка удаления');
    }
  };
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

let accountInfo = null;

async function refreshAccountInfo() {
  try {
    accountInfo = await supabaseCurrentUser();
  } catch {
    accountInfo = null;
  }
  renderAccountBadge();
}

function renderAccountBadge() {
  const el = document.getElementById('accountBadge');
  if (!el) return;
  if (!isSupabaseConfigured()) {
    el.innerHTML = `<span class="muted">Бэкенд не настроен</span>`;
    return;
  }
  if (accountInfo?.email) {
    el.innerHTML = `
      <span class="account-badge-info"><b>${escapeHtml(accountInfo.email)}</b></span>`;
  } else {
    el.innerHTML = `
      <span class="muted">Вход не выполнен</span>`;
  }
}

function syncLegalConsentFromStorage() {
  try {
    if (localStorage.getItem('xystar_legal_consent_v1') === '1') {
      if (!(state.consent?.agreement && state.consent?.personalData && state.consent?.newsletters && state.consent?.cookies)) {
        state.consent.agreement = true;
        state.consent.personalData = true;
        state.consent.newsletters = true;
        state.consent.cookies = true;
        save();
        renderAll();
      }
    }
  } catch {
    // ignore storage errors
  }
}

function boot() {
  installGlobalErrorOverlay();
  syncLegalConsentFromStorage();
  warmupSupabase();
  ensureTodaySteps();
  ensureTodayPlans();
  wireTabs();
  wirePwa();
  wireSwipes();
  wireQuestionnaire();
  renderAll();
  maybeStartOnboarding();
  supabaseOnAuth((event) => {
    if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && isSupabaseConfigured())) {
      refreshAccountInfo();
      syncProfileAfterAuth();
    } else if (event === 'SIGNED_OUT') {
      accountInfo = null;
      renderAccountBadge();
      renderAll();
    }
  });

  // Гео-трекинг и датчики отключены (UI убран); город выбирается вручную в настройках.
  save();

  // Периодическая подгрузка новых сообщений в открытом реальном чате.
  setInterval(() => {
    const open = state?.messages?.openChat;
    if (open && isRealChat(open)) loadRemoteChat(open);
  }, 12_000);
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

let cloudPushTimer = null;
function scheduleCloudSync() {
  if (state.__locked || !state.__cryptoKey) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    if (state.cloud?.enabled && state.cloud?.token) {
      cloudPush().catch(() => {});
    } else if (isSupabaseConfigured()) {
      supabasePushProfile().catch(() => {});
    }
  }, 4000);
}

async function supabasePushProfile() {
  try {
    const user = await supabaseCurrentUser();
    if (!user) return;
    if (!state.consent?.personalData) return;
    const payload = {
      profile: state.profile,
      plans: state.plans,
      dating: { likes: state.dating?.likes || {}, matches: state.dating?.matches || [] },
      consent: {
        agreement: !!state.consent?.agreement,
        personalData: !!state.consent?.personalData,
        newsletters: !!state.consent?.newsletters,
        cookies: !!state.consent?.cookies
      },
      updated_at: new Date().toISOString()
    };
    await supabaseSaveProfile(user.id, payload);
  } catch (err) {
    console.warn('supabase push', err?.message);
  }
}

async function syncProfileAfterAuth() {
  try {
    const user = await supabaseCurrentUser();
    if (!user) return;
    const payload = await supabaseLoadProfile(user.id);
    if (payload) {
      if (payload.profile) {
        const remote = { ...payload.profile };
        const localAnswers = Object.keys(state.profile.questionnaireAnswers || {}).length;
        const remoteAnswers = Object.keys(remote.questionnaireAnswers || {}).length;
        if (localAnswers > remoteAnswers) {
          delete remote.questionnaireAnswers;
          delete remote.portrait;
        }
        state.profile = { ...state.profile, ...remote };
      }
      if (payload.plans) state.plans = payload.plans;
      if (payload.dating?.likes) state.dating.likes = { ...state.dating.likes, ...payload.dating.likes };
      if (payload.dating?.matches) {
        const remoteMatches = payload.dating.matches;
        state.dating.matches = [...new Set([...remoteMatches, ...(state.dating.matches || [])])];
      }
      if (payload.consent) {
        state.consent.agreement = !!payload.consent.agreement;
        state.consent.personalData = !!payload.consent.personalData;
        state.consent.newsletters = !!payload.consent.newsletters;
        state.consent.cookies = !!payload.consent.cookies;
      }
    }
    await supabasePushProfile();
    await syncLikesFromSupabase();
    renderAll();
  } catch (err) {
    console.warn('supabase pull', err?.message);
  }
}

function save() {
  saveState(state).catch((err) => {
    console.error('save failed', err);
    toast('Ошибка сохранения. Данные могут не сохраниться.');
  });
  scheduleCloudSync();
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
  const main = document.querySelector('.main');
  const fadeTab = () => {
    if (!main) return;
    main.classList.remove('tab-fading');
    void main.offsetWidth;
    main.classList.add('tab-fading');
  };
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
      fadeTab();
      renderAll();
    });
  });
}

function wireSwipes() {
  // Swipe left/right on main content switches tabs (native-feel).
  const order = ['home', 'dating', 'stats'];
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
  $('#authForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
  });

  $('#accountEmail')?.addEventListener('change', (e) => {
    state.cloud.email = String(e.target.value || '').trim();
    save();
  });

  async function runWithButton(btn, label, fn) {
    if (!btn || btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Одну секунду…';
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
      delete btn.dataset.busy;
    }
  }

  $('#btnAccountRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    runWithButton($('#btnAccountRegister'), 'Регистрация', async () => {
      const email = String($('#accountEmail').value || state.cloud.email || '').trim().toLowerCase();
      const password = String($('#accountPassword').value || '');
      if (!email || password.length < 6) return toast('Нужны email и пароль от 6 символов');
      try {
        const reg = await supabaseSignUp(email, password, {
          emailRedirectTo: location.origin + location.pathname
        });
        state.cloud.email = email;
        state.cloud.enabled = true;
        save();
        accountInfo = reg.user;
        renderAll();
        toast(reg.session ? 'Регистрация ок — вход выполнен' : 'Регистрация ок — проверьте почту и подтвердите адрес');
        haptic('light');
        syncProfileAfterAuth().catch(() => {});
      } catch (err) {
        toast(err?.message || 'Ошибка регистрации');
      }
    });
  });

  $('#btnAccountLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    runWithButton($('#btnAccountLogin'), 'Войти', async () => {
      const email = String($('#accountEmail').value || state.cloud.email || '').trim().toLowerCase();
      const password = String($('#accountPassword').value || '');
      if (!email || !password) return toast('Введите email и пароль');
      try {
        const user = await supabaseSignIn(email, password);
        accountInfo = user;
        state.cloud.email = email;
        state.cloud.enabled = true;
        save();
        renderAll();
        toast('Вход выполнен');
        haptic('light');
        syncProfileAfterAuth().catch(() => {});
      } catch (err) {
        const msg = String(err?.message || '');
        if (/invalid/i.test(msg)) {
          toast('Неверный email или пароль. Если аккаунт создавался ранее — нажмите «Регистрация»: оно отправит письмо подтверждения.');
        } else {
          toast(msg || 'Ошибка входа');
        }
      }
    });
  });

  $('#btnForgotPassword')?.addEventListener('click', (e) => {
    e.preventDefault();
    runWithButton($('#btnForgotPassword'), 'Забыли пароль?', async () => {
      const email = String($('#accountEmail').value || '').trim().toLowerCase();
      if (!email) return toast('Введите email в поле выше');
      try {
        await supabaseResetPassword(email);
        toast('Письмо для сброса пароля отправлено на ' + email);
      } catch (err) {
        toast(err?.message || 'Не удалось отправить письмо');
      }
    });
  });

  $('#btnResendConfirm')?.addEventListener('click', (e) => {
    e.preventDefault();
    runWithButton($('#btnResendConfirm'), 'Повторить письмо', async () => {
      const email = String($('#accountEmail').value || '').trim().toLowerCase();
      if (!email) return toast('Введите email в поле выше');
      try {
        await supabaseResendConfirmation(email);
        toast('Письмо подтверждения отправлено. Проверьте почту.');
      } catch (err) {
        toast(err?.message || 'Не удалось отправить письмо');
      }
    });
  });

  $('#btnAccountLogout')?.addEventListener('click', (e) => {
    haptic('light');
    const btn = $('#btnAccountLogout');
    if (btn) { btn.disabled = true; const old = btn.textContent; btn.textContent = 'Выход…'; }
    // Local logout first — instant response, never blocked by network.
    state.cloud.token = null;
    state.cloud.enabled = false;
    accountInfo = null;
    liveProfiles = [];
    liveProfilesLoaded = false;
    if (state.dating) {
      state.dating.likedMe = {};
      for (const id of Object.keys(state.dating.likes)) delete state.dating.likes[id];
    }
    save();
    toast('Выход');
    renderAll();
    // Remote sign-out in background — must never block the UI.
    supabaseSignOut().catch(() => {});
    if (btn) setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 400);
  });

  $('#btnChangePassword')?.addEventListener('click', () => {
    $('#changePasswordBox').hidden = false;
  });

  $('#btnChangePasswordCancel')?.addEventListener('click', () => {
    $('#changePasswordBox').hidden = true;
    const inp = $('#newPassword');
    if (inp) inp.value = '';
  });

  $('#btnChangePasswordSave')?.addEventListener('click', async () => {
    const password = String($('#newPassword')?.value || '');
    if (password.length < 6) return toast('Пароль должен быть минимум 6 символов');
    try {
      await supabaseChangePassword(password);
      const inp = $('#newPassword');
      if (inp) inp.value = '';
      $('#changePasswordBox').hidden = true;
      toast('Пароль изменён');
      haptic('light');
    } catch (err) {
      toast(err?.message || 'Не удалось сменить пароль');
    }
  });

  $('#btnAcceptAll')?.addEventListener('click', () => {
    const on = !(state.consent?.agreement && state.consent?.personalData && state.consent?.newsletters && state.consent?.cookies);
    state.consent.agreement = on;
    state.consent.personalData = on;
    state.consent.newsletters = on;
    state.consent.cookies = on;
    save();
    renderAll();
    toast(on ? 'Согласие принято' : 'Согласие отозвано');
    haptic('light');
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.data && event.data.type === 'xystar-legal-consent') {
      state.consent.agreement = true;
      state.consent.personalData = true;
      state.consent.newsletters = true;
      state.consent.cookies = true;
      save();
      renderAll();
      toast('Согласие принято');
      haptic('light');
    }
  });
}

function syncSettingsUi() {
  $('#accountEmail') && ($('#accountEmail').value = state.cloud?.email || '');
}

function wirePwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
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
  renderHome();
  // renderEvents(); // скрыто — вернём позже
  renderDating();
  renderStats();
  // renderCircle(); // скрыто — вернём позже
  renderAccountBadge();
  syncSettingsUi();
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
  syncProfileFormFields();
  const dataUrl = await readImageAsDataUrl(file, 1024);
  state.profile.photos = [dataUrl, ...(state.profile.photos || [])].slice(0, 3);
  save();
  pushPublicProfileNow().catch(() => {});
  renderAll();
  toast('Фото добавлено');
}

function syncProfileFormFields() {
  const root = $('#view-stats');
  if (!root) return;
  const nextName = String(root.querySelector('#profileName')?.value || '').trim().slice(0, 40);
  const nextGender = String(root.querySelector('#profileGender')?.value || '');
  const nextDescription = String(root.querySelector('#profileDescription')?.value || '').slice(0, 2000);
  const nextInterestsRaw = String(root.querySelector('#profileInterestsText')?.value || '');
  const nextInterests = nextInterestsRaw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (nextName) state.profile.name = nextName;
  if (nextGender) state.profile.gender = nextGender;
  state.profile.description = nextDescription;
  if (nextInterestsRaw.trim()) state.profile.interests = nextInterests;
  state.profile.portrait = buildQuestionnairePortrait(state.profile.questionnaireAnswers || {});
}

function getQuestionnaireAnswers(profile = state.profile) {
  return profile?.questionnaireAnswers && typeof profile.questionnaireAnswers === 'object' ? profile.questionnaireAnswers : {};
}

function getOptionTraits(q, opt) {
  if (opt.traits) return opt.traits;
  if (q.category) return { [q.category]: opt.value };
  return {};
}

function profileGender() {
  const g = String(state.profile?.gender || '');
  if (g === 'female' || g === 'f') return 'f';
  if (g === 'male' || g === 'm') return 'm';
  return '';
}

function questionOptions(q) {
  const g = profileGender();
  return g === 'f' && Array.isArray(q.optionsF)
    ? q.optionsF
    : g === 'm' && Array.isArray(q.optionsM)
      ? q.optionsM
      : q.options || [];
}

function questionText(q) {
  const g = profileGender();
  return g === 'f' && q.questionF ? q.questionF : g === 'm' && q.questionM ? q.questionM : q.question;
}

function numericBucket(q, value) {
  if (!q.numeric) return null;
  const n = Number(String(value || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const steps = Array.isArray(q.numeric) && q.numeric.length ? q.numeric : [{ min: 0, value: `${q.id}_низкий` }];
  let bucket = steps[steps.length - 1].value;
  for (const s of steps) {
    if (n <= s.min) {
      bucket = s.value;
      break;
    }
  }
  return bucket;
}

function numericAnswerValue(answerId) {
  return String(answerId || '').startsWith('custom:') ? String(answerId).slice(7) : null;
}

function searchAnswerValue(answerId) {
  return String(answerId || '').startsWith('search:') ? String(answerId).slice(7) : null;
}

function multiAnswerList(answerId) {
  return String(answerId || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function setQuestionnaireAnswer(questionId, optionId, { silent } = {}) {
  const q = ALL_QUESTIONS.find((x) => x.id === questionId);
  let stored = optionId;
  if (q?.multi) {
    const cur = multiAnswerList(state.profile.questionnaireAnswers?.[questionId]);
    const idx = cur.indexOf(optionId);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(optionId);
    stored = [...new Set(cur)].sort().join(',');
  }
  state.profile.questionnaireAnswers = {
    ...(state.profile.questionnaireAnswers || {}),
    [questionId]: stored
  };
  state.profile.portrait = buildQuestionnairePortrait(state.profile.questionnaireAnswers);

  // Сливаем данные в профиль: гороскоп берётся из анкеты и не спрашивается дважды.
  if (questionId === 'q258' && !state.profile.zodiac) {
    const opt = q ? questionOptions(q).find((o) => o.id === optionId) : null;
    if (opt && QN_ZODIAC_MAP[opt.value]) state.profile.zodiac = QN_ZODIAC_MAP[opt.value];
  }

  // Город из анкеты становится городом пользователя (используется фильтром дальности).
  if (questionId === 'q274') {
    const cityKey = CITY_ANSWER_TO_KEY[stored];
    state.profile.cityOverride = cityKey || 'auto';
    if (!cityKey && !silent) toast('Город: определяется по геолокации');
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
    const num = numericAnswerValue(answerId);
    const searched = searchAnswerValue(answerId);
    const traitsList = num != null
      ? (() => {
          const bucket = numericBucket(q, num);
          return bucket ? [{ [q.category]: bucket }] : [];
        })()
      : searched != null
        ? (() => {
            const cat = (q.searchMap || {})[searched] || '';
            return cat ? [{ [q.category]: cat }] : [];
          })()
        : multiAnswerList(answerId).map((oid) => {
            const opt = questionOptions(q).find((x) => x.id === oid);
            return opt ? getOptionTraits(q, opt) : null;
          }).filter(Boolean);
    if (!traitsList.length) continue;
    answered += 1;
    for (const traits of traitsList) {
      for (const [dim, val] of Object.entries(traits)) {
        if (!dimensionBuckets[dim]) dimensionBuckets[dim] = {};
        dimensionBuckets[dim][val] = (dimensionBuckets[dim][val] || 0) + 1;
      }
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
  const snippet = labels.length
    ? labels.slice(0, 4).map((x) => `<span class="pill">${escapeHtml(x)}</span>`).join(' ')
    : '';
  return `
    <div class="muted">Ответы строят портрет и помогают подбирать пару.</div>
    ${snippet ? `<div class="row-inline" style="margin-top:10px">${snippet}</div>` : ''}
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
          const custom = numericAnswerValue(selected);
          const searched = searchAnswerValue(selected);
          if (q.numeric) {
            return `
            <div class="question-block">
              <div class="question-title">${escapeHtml(questionText(q))}</div>
              ${custom != null ? `<div class="row-inline"><span class="pill">${escapeHtml(fmtNumeric(q, Number(custom)))}</span></div>` : `<div class="muted">Точное значение — в анкете совместимости</div>`}
            </div>
          `;
          }
          if (q.search) {
            return `
            <div class="question-block">
              <div class="question-title">${escapeHtml(questionText(q))}</div>
              ${searched != null ? `<div class="row-inline"><span class="pill">${escapeHtml(searched)}</span></div>` : `<div class="muted">Профессия — в анкете совместимости</div>`}
            </div>
          `;
          }
          const multiSel = q.multi ? new Set(multiAnswerList(selected)) : null;
          return `
            <div class="question-block">
              <div class="question-title">${escapeHtml(questionText(q))}${q.multi ? ' <span class="pill">несколько</span>' : ''}</div>
              <div class="chip-row questionnaire-options" data-question="${q.id}">
                ${questionOptions(q)
                  .map((opt) => {
                    const active = multiSel ? multiSel.has(opt.id) : selected === opt.id;
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

function renderQuestionnaireCategories(profile = state.profile) {
  const answers = getQuestionnaireAnswers(profile);
  const cats = answeredCategories(answers);
  const items = CATEGORY_ORDER.map((c) => {
    const info = cats[c];
    if (!info) return '';
    const done = info.answered >= info.total;
    const pct = info.total ? Math.round((info.answered / info.total) * 100) : 0;
    return `
      <button type="button" class="cat-progress-item ${done ? 'cat-progress-done' : ''}" data-open-cat="${c}">
        <div class="cat-progress-name">${escapeHtml(CATEGORY_LABELS[c] || c)}</div>
        <div class="cat-progress-bar"><div class="cat-progress-fill" style="width:${pct}%"></div></div>
        <div class="cat-progress-count">${info.answered}/${info.total} — открыть</div>
      </button>
    `;
  }).join('');
  const psychAnswered = QUESTIONNAIRE.filter((q) => answers[q.id]).length;
  const psychTotal = QUESTIONNAIRE.length;
  const psychPct = psychTotal ? Math.round((psychAnswered / psychTotal) * 100) : 0;
  const psychItem = `
    <button type="button" class="cat-progress-item ${psychAnswered >= psychTotal ? 'cat-progress-done' : ''}" data-open-cat="__psych">
      <div class="cat-progress-name">ПСИХОЛОГИЯ</div>
      <div class="cat-progress-bar"><div class="cat-progress-fill" style="width:${psychPct}%"></div></div>
      <div class="cat-progress-count">${psychAnswered}/${psychTotal} — открыть</div>
    </button>
  `;
  return `<div class="cat-progress-grid">${items}${psychItem}</div>`;
}

function openQuestionnaireAt(qid) {
  const idx = ALL_QUESTIONS.findIndex((q) => q.id === qid);
  if (idx < 0) return openQuestionnaire();
  qnIndex = idx;
  qnAnimating = false;
  setQuestionCard();
  $('#dlgQuestionnaire').showModal();
  haptic('open');
}

function openQuestionnaireCategory(catId) {
  const answers = getQuestionnaireAnswers();
  const list = catId === '__psych' ? QUESTIONNAIRE : FULL_QUESTIONNAIRE.filter((q) => q.category === catId);
  const target = list.find((q) => !answers[q.id]) || list[0];
  if (!target) return toast('В этой категории нет вопросов');
  openQuestionnaireAt(target.id);
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
  const custom = numericAnswerValue(selected);
  const searched = searchAnswerValue(selected);
  let inner;
  if (q.numeric) {
    inner = `
      <div class="qn-num">
        <input id="qnNumInput" class="input qn-num-input" type="number" inputmode="numeric" min="0" step="1" placeholder="Введите ${q.numericSymbol ? q.numericSymbol.trim() : 'сумму в рублях'}" value="${custom != null ? escapeHtml(custom) : ''}" />
        <div class="muted">Укажите точную цифру — она попадёт в дерево совместимости</div>
        <button class="btn" type="button" id="qnNumSave" disabled>Сохранить ответ</button>
      </div>
    `;
  } else if (q.search) {
    inner = `
      <div class="qn-search">
        <input id="qnSearchInput" class="input qn-search-input" type="search" placeholder="Начните вводить профессию..." autocomplete="off" />
        <div class="qn-search-results" id="qnSearchResults">${renderSearchResults(q, searched, '')}</div>
      </div>
    `;
  } else {
    const multiSel = q.multi ? new Set(multiAnswerList(selected)) : null;
    const opts = questionOptions(q)
      .map((o, idx) => {
        const active = multiSel ? multiSel.has(o.id) : selected === o.id;
        const hint = o.hint ? `<span class="qn-opt-hint">${escapeHtml(o.hint)}</span>` : '';
        const letter = String.fromCharCode(97 + (idx % 26)).toUpperCase();
        return `
          <button class="qn-opt ${active ? 'selected' : ''}" type="button" data-qn-opt="${escapeHtml(o.id)}">
            <span class="qn-opt-letter">${letter}</span>
            <span class="qn-opt-text">
              <span class="qn-opt-label">${escapeHtml(o.label)}</span>
              ${hint}
            </span>
          </button>
        `;
      })
      .join('');
    inner = `
      <div class="qn-opts-wrap">
        <div class="qn-opts" id="qnOptsStrip">${opts}</div>
      </div>
      ${q.multi ? `<button class="btn qn-multi-done" type="button" id="qnMultiDone" disabled>Готово →</button>` : ''}`;
  }
  $('#qnCard').innerHTML = `
    <div class="qn-q">${escapeHtml(questionText(q))}${q.multi ? ` <span class="pill">можно выбрать несколько</span>` : ''}</div>
    ${inner}
  `;
  $('#qnBlock').textContent = q.block || (q.category ? CATEGORY_LABELS[q.category] : '');
  const answers2 = getQuestionnaireAnswers();
  const count2 = Object.keys(answers2).length;
  $('#qnCounter').textContent = `Вопрос ${qnIndex + 1} из ${ALL_QUESTIONS.length} • отвечено: ${count2}`;
  $('#qnProgressBar').style.width = Math.round(((qnIndex + 1) / ALL_QUESTIONS.length) * 100) + '%';
  const optsStrip = document.getElementById('qnOptsStrip');
  if (optsStrip) {
    const sel = optsStrip.querySelector('.qn-opt.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (q.numeric) {
    const input = document.getElementById('qnNumInput');
    const saveBtn = document.getElementById('qnNumSave');
    if (input && saveBtn) {
      input.addEventListener('input', () => {
        const v = numericAnswerValue(`custom:${input.value}`);
        saveBtn.disabled = v == null;
      });
      saveBtn.addEventListener('click', () => {
        const v = numericAnswerValue(`custom:${input?.value || ''}`);
        if (v == null) return;
        setQuestionnaireAnswer(q.id, `custom:${v}`, { silent: true });
        haptic('light');
        qnGo(1);
      });
      setTimeout(() => input?.focus(), 120);
    }
  } else if (q.search) {
    const input = document.getElementById('qnSearchInput');
    if (input) {
      const refresh = () => {
        const results = document.getElementById('qnSearchResults');
        if (results) results.innerHTML = renderSearchResults(q, searched, input.value);
      };
      input.addEventListener('input', refresh);
      setTimeout(() => {
        input.focus();
        refresh();
      }, 120);
    }
  } else if (q.multi) {
    const doneBtn = document.getElementById('qnMultiDone');
    if (doneBtn) doneBtn.addEventListener('click', () => qnGo(1));
  }
}

function renderSearchResults(q, chosen, query) {
  const list = Array.isArray(q.searchList) ? q.searchList : (q.searchMap ? Object.keys(q.searchMap) : []);
  const needle = String(query || '').toLowerCase().trim();
  const items = needle
    ? list.filter((p) => String(p).toLowerCase().includes(needle))
    : list;
  const top = items.slice(0, needle ? 30 : 12);
  if (chosen && !items.includes(chosen)) {
    return `<button class="qn-search-item chosen" type="button" data-qn-search="${escapeHtml(chosen)}"><span>✓ ${escapeHtml(chosen)}</span></button>${top.map((p) => `<button class="qn-search-item" type="button" data-qn-search="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')}`;
  }
  if (!top.length) return '<div class="muted">Ничего не найдено — выберите ближайший вариант или введите точное название</div>';
  return top.map((p) => {
    const isChosen = chosen === p;
    return `<button class="qn-search-item ${isChosen ? 'chosen' : ''}" type="button" data-qn-search="${escapeHtml(p)}">${isChosen ? '✓ ' : ''}${escapeHtml(p)}</button>`;
  }).join('');
}

function qnGo(dir) {
  if (qnAnimating) return;
  const max = ALL_QUESTIONS.length - 1;
  const next = qnIndex + dir;
  if (next < 0 || next > max) return;
  qnAnimating = true;
  const card = $('#qnCard');
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
    setTimeout(() => {
      qnAnimating = false;
    }, 250);
  }, 230);
}

function wireQuestionnaire() {
  $('#btnQuestionnaireClose').addEventListener('click', closeQuestionnaire);
  $('#btnBookingClose')?.addEventListener('click', () => $('#dlgBooking')?.close());
  $('#dlgQuestionnaire').addEventListener('close', () => {
    renderAll();
    scheduleCloudSync();
  });

  $('#btnQuestionnaireBack')?.addEventListener('click', () => qnGo(-1));
  $('#btnQuestionnaireNext')?.addEventListener('click', () => qnGo(1));

  const card = $('#qnCard');
  if (!card) return;

  card.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qn-opt]');
    if (btn) {
      const oid = btn.dataset.qnOpt;
      const q = ALL_QUESTIONS[qnIndex];
      if (!q || !oid) return;
      if (q.multi) {
        setQuestionnaireAnswer(q.id, oid, { silent: true });
        haptic('light');
        const sel = new Set(multiAnswerList(getQuestionnaireAnswers()[q.id]));
        card.querySelectorAll('[data-qn-opt]').forEach((b) => {
          b.classList.toggle('selected', sel.has(b.dataset.qnOpt));
        });
        const doneBtn = document.getElementById('qnMultiDone');
        if (doneBtn) doneBtn.disabled = !sel.size;
        return;
      }
      const prev = getQuestionnaireAnswers()[q.id];
      if (prev === oid) {
        setQuestionnaireAnswer(q.id, null, { silent: true });
        btn.classList.remove('selected');
      } else {
        setQuestionnaireAnswer(q.id, oid, { silent: true });
        haptic('light');
        card.querySelectorAll('[data-qn-opt]').forEach((b) => {
          b.classList.toggle('selected', b.dataset.qnOpt === oid);
        });
        setTimeout(() => qnGo(1), 300);
      }
      const answers = getQuestionnaireAnswers();
      const count = Object.keys(answers).length;
      $('#qnCounter').textContent = `Вопрос ${qnIndex + 1} из ${ALL_QUESTIONS.length} • отвечено: ${count}`;
      $('#qnProgressBar').style.width = Math.round(((qnIndex + 1) / ALL_QUESTIONS.length) * 100) + '%';
      return;
    }
    const searchBtn = e.target.closest('[data-qn-search]');
    if (searchBtn) {
      const q = ALL_QUESTIONS[qnIndex];
      if (!q) return;
      setQuestionnaireAnswer(q.id, `search:${searchBtn.dataset.qnSearch}`, { silent: true });
      haptic('light');
      setTimeout(() => qnGo(1), 300);
    }
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
              <input id="homePlanCompany" type="checkbox" ${state.plans?.companyPref ? 'checked' : ''} />
              <span>Иду с компанией / не против компании</span>
            </label>
          </div>
          <div class="profile-field">
            <label class="plan-company">
              <input id="homePlanShare" type="checkbox" ${state.geo?.planShare ? 'checked' : ''} />
              <span>Публиковать планы сегодня</span>
            </label>
          </div>
          <div class="row-inline">
            <button class="btn" type="button" data-action="addPlan">Добавить план</button>
            <button class="btn ghost" type="button" data-action="clearPlans">Очистить</button>
          </div>
        </div>
        <div class="muted" style="margin-top:10px">${state.geo?.planShare ? 'Ваши планы видны другим людям.' : 'Включите «Публиковать планы сегодня», чтобы другие увидели ваши планы.'}</div>
      </div>

      <div class="card">
        <div class="card-title">Рекомендация</div>
        ${suggestion ? renderEventCard(suggestion, { compact: false }) : `<div class="muted">Нет подходящих событий. Выберите интересы или включите геолокацию.</div>`}
        <div class="row-inline" style="margin-top:10px">
          <button class="btn" type="button" data-open-tab="events">Открыть события</button>
          <button class="btn ghost" type="button" data-open-tab="dating">Подобрать пару</button>
        </div>
      </div>
    </div>
  `;
}

function profileLikesYou(id) {
  const p = DATING_PROFILES.find((x) => x.id === id);
  if (p) return !!p.likesYou;
  return !!(state.dating.likedMe && state.dating.likedMe[id]);
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
  const ids = new Set(getMutualMatches());
  const threads = state.messages?.threads ? Object.keys(state.messages.threads) : [];
  for (const id of threads) if (id) ids.add(id);
  return [...ids];
}

function ensureMessageThread(profileId) {
  state.messages = state.messages || { activeThreadId: null, threads: {} };
  state.messages.threads = state.messages.threads || {};
  const existing = state.messages.threads[profileId];
  if (existing) return existing;

  const profile = DATING_PROFILES.find((x) => x.id === profileId) || liveProfiles.find((x) => x.id === profileId);
  const name = profile?.name || 'Профиль';

  if (isRealChat(profileId)) {
    state.messages.threads[profileId] = {
      unread: !state.dating.seenMatches?.[profileId] && !!profile,
      messages: []
    };
    return state.messages.threads[profileId];
  }

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

function resolveChatProfile(profileId) {
  return (
    DATING_PROFILES.find((x) => x.id === profileId) ||
    liveProfiles.find((x) => x.id === profileId) || {
      id: profileId,
      name: 'Профиль',
      age: '',
      city: '',
      jobTitle: '',
      photos: []
    }
  );
}

function renderChatScreen(profileId) {
  const profile = resolveChatProfile(profileId);
  const thread = ensureMessageThread(profileId);
  const messages = thread?.messages || [];
  const secured = isRealChat(profileId);
  const mutual = getMutualMatches().includes(profileId);
  return `
    <div class="card chat-screen">
      <div class="chat-screen-head">
        <button class="btn ghost chat-back" type="button" data-chat-back>← Назад</button>
        <div class="chat-thread-user">
          <img class="chat-thread-avatar" src="${profile.photos?.[0] || './assets/profile/avatar-square.jpg'}" alt="${escapeHtml(profile.name)}" />
          <div>
            <div class="chat-thread-name">${escapeHtml(profile.name)}, ${profile.age}</div>
            <div class="chat-thread-meta">${cityLabel(profile.city)} • ${escapeHtml(profile.jobTitle || '')}${mutual ? ' • Общий метч с «' + escapeHtml(profile.name) + '»' : ''}</div>
          </div>
        </div>
        ${secured ? '<div class="pill" title="AES-GCM 256, ключ пары через PBKDF2">🔒 зашифровано</div>' : ''}
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
    : `<div class="muted">У вас ещё нет метчей. Матч появляется, когда вы оба поставите друг другу лайк.</div>`;

  const list = threadIds.length
    ? threadIds
        .map((id) => {
          const profile = resolveChatProfile(id);
          const t = ensureMessageThread(id);
          const lastMsg = t.messages?.[t.messages.length - 1];
          const unread = !!t.unread;
          const secured = isRealChat(id);
          const mutual = matches.includes(id);
          return `
            <button class="chat-item" type="button" data-chat-id="${id}">
              <div class="chat-avatar-wrap ${unread ? 'unread' : ''}">
                <img class="chat-avatar" src="${profile.photos?.[0] || './assets/profile/avatar-square.jpg'}" alt="${escapeHtml(profile.name)}" />
              </div>
              <div class="chat-main">
                <div class="chat-topline">
                  <div class="chat-name">${escapeHtml(profile.name)}, ${profile.age}${secured ? ' 🔒' : ''}</div>
                  <div class="chat-time">${lastMsg ? formatMessageTime(lastMsg.ts) : ''}</div>
                </div>
                <div class="chat-preview">${lastMsg ? escapeHtml(lastMsg.text) : (mutual ? 'Общий метч с ' + escapeHtml(profile.name) : escapeHtml(profile.about || 'Новое совпадение'))}</div>
                ${mutual ? `<div class="chat-mutual">Общий метч</div>` : ''}
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
    haptic('light');
    renderAll();
  });
  root.querySelector('#homePlanCompany')?.addEventListener('change', (e) => {
    state.plans = state.plans || {};
    state.plans.companyPref = !!e.target.checked;
    save();
    maybeSharePlans();
  });
  root.querySelector('#homePlanShare')?.addEventListener('change', (e) => {
    state.geo = state.geo || {};
    state.geo.planShare = !!e.target.checked;
    save();
    maybeSharePlans();
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
      if (accountInfo?.id) supabaseMarkMatchSeen(accountInfo.id, chatId).catch(() => {});
      save();
      renderAll();
      loadRemoteChat(chatId);
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
      if (accountInfo?.id) supabaseMarkMatchSeen(accountInfo.id, matchId).catch(() => {});
      save();
      renderAll();
      loadRemoteChat(matchId);
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
    if (isRealChat(activeId)) {
      pushEncryptedMessage(activeId, text.slice(0, 300)).catch((err) => {
        console.warn('encrypted send', err?.message);
      });
    }
  });
}

function isRealChat(id) {
  if (!accountInfo?.id || !isSupabaseConfigured()) return false;
  return !DATING_PROFILES.some((p) => p.id === id);
}

async function pushEncryptedMessage(otherId, text) {
  const key = await derivePairKey(accountInfo.id, otherId);
  const cipher = await encryptChatText(key, text);
  await supabaseSaveMessage(accountInfo.id, otherId, cipher);
}

async function loadRemoteChat(chatId) {
  if (!isRealChat(chatId)) return;
  try {
    const key = await derivePairKey(accountInfo.id, chatId);
    const rows = await supabaseGetMessages(accountInfo.id, chatId);
    const messages = [];
    for (const row of rows) {
      try {
        const text = await decryptChatText(key, { iv: row.iv, ct: row.ct });
        messages.push({ from: row.from_user === accountInfo.id ? 'me' : 'them', text, ts: new Date(row.created_at).getTime() });
      } catch {
        // skip undecryptable
      }
    }
    messages.sort((a, b) => a.ts - b.ts);
    const thread = ensureMessageThread(chatId);
    thread.messages = messages;
    save();
    renderAll();
  } catch (err) {
    console.warn('load remote chat', err?.message);
  }
}

function renderHome() {
  const root = $('#view-home');
  if (!root) return;
  root.innerHTML = renderHomeContentHtml();
  wireHomeContentHandlers('#view-home');
}

const VENUE_KIND_LABELS = {
  food: 'Рестораны',
  coffee: 'Кофейни',
  cinema: 'Кино',
  museums: 'Музеи',
  sport: 'Спортзалы',
  spa: 'СПА и массаж',
  walks: 'Парки и прогулки',
  games: 'Квесты и настолки',
  art: 'Театры и искусство',
  night: 'Бары и клубы'
};

function venueKindLabel(kind) {
  return VENUE_KIND_LABELS[kind] || kind || 'Место';
}

function tomorrowKey() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function openBookingDialog(venue) {
  const dlg = $('#dlgBooking');
  if (!dlg) return toast('Окно брони недоступно');
  $('#bkVenueTitle').textContent = `${venue.imageEmoji || ''} ${venue.title}`;
  $('#bkVenueMeta').textContent = `${venue.address || ''} • от ${venue.priceFrom ? `${venue.priceFrom} ₽` : 'бесплатно'} • ${venue.openHours || ''}`;
  const timeOptions = [];
  for (let h = 10; h <= 21; h++) timeOptions.push(`${String(h).padStart(2, '0')}:00`);
  $('#bkBody').innerHTML = `
    <div class="bk-form">
      <div class="bk-row">
        <label class="label">Дата</label>
        <input class="input" type="date" id="bkDate" value="${tomorrowKey()}" />
      </div>
      <div class="bk-row">
        <label class="label">Время</label>
        <select class="select" id="bkTime">${timeOptions.map((t) => `<option>${t}</option>`).join('')}</select>
      </div>
      <div class="bk-row">
        <label class="label">Гостей</label>
        <select class="select" id="bkGuests">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="bk-row">
        <label class="label">Максимальный бюджет (аукцион найдёт лучшую цену)</label>
        <input class="input" type="number" inputmode="numeric" id="bkBudget" value="${venue.priceFrom * 2}" placeholder="Ваш бюджет, ₽" />
      </div>
      <button class="btn" type="button" id="bkGetQuote">Получить предложения (аукцион) →</button>
      <div id="bkOffers" class="bk-offers"></div>
      <div id="bkResult"></div>
    </div>
  `;
  dlg.showModal();
  dlg.querySelector('#bkGetQuote')?.addEventListener('click', async () => {
    const guests = dlg.querySelector('#bkGuests')?.value || '2';
    const date = dlg.querySelector('#bkDate')?.value || '';
    const time = dlg.querySelector('#bkTime')?.value || '19:00';
    const budget = dlg.querySelector('#bkBudget')?.value || '';
    const zone = dlg.querySelector('#bkOffers');
    if (!zone) return;
    zone.innerHTML = '<div class="muted">Аукцион объявляет цены…</div>';
    try {
      const offers = await apiLocalsBookQuote(venue, guests, date, budget);
      if (!Array.isArray(offers) || !offers.length) throw new Error('Нет предложений');
      zone.innerHTML = `
        <div class="muted" style="margin:10px 0">Выберите предложение:</div>
        ${offers
          .map(
            (o, i) => `
        <label class="bk-offer ${o.available === false ? 'disabled' : ''}">
          <input type="radio" name="bkOffer" value="${i}" ${i === 0 ? 'checked' : ''} ${o.available === false ? 'disabled' : ''} />
          <span class="bk-offer-name">${escapeHtml(o.partner)}</span>
          <span class="pill">${o.discountPct > 0 ? `−${o.discountPct}%` : 'базовая'}</span>
          <span class="bk-offer-price">${o.price} ₽</span>
        </label>
        `
          )
          .join('')}
        <button class="btn" type="button" id="bkConfirm">Подтвердить бронь</button>
      `;
      zone.querySelector('#bkConfirm')?.addEventListener('click', async () => {
        const radio = zone.querySelector('input[name="bkOffer"]:checked');
        const offer = offers[Number(radio?.value)];
        if (!offer) return;
        const btn = zone.querySelector('#bkConfirm');
        if (btn) btn.disabled = true;
        try {
          const booking = await apiLocalsBook(venue, {
            venueId: venue.id,
            guests: Number(guests),
            date,
            time,
            partner: offer.partner,
            price: offer.price
          });
          zone.innerHTML = `
            <div class="bk-success">
              <div class="pill good">✓ Запись подтверждена</div>
              <div class="muted">${escapeHtml(booking.title)} • ${escapeHtml(booking.date)} ${escapeHtml(booking.time)} • ${Number(booking.guests)} гостей • ${booking.partner} — ${Number(booking.price)} ₽</div>
              <div class="muted">Код брони: ${escapeHtml(String(booking.id))}</div>
              <div class="row-inline" style="margin-top:10px">
                <button class="btn" type="button" id="bkAddPlan">Добавить в планы</button>
                <button class="btn ghost" type="button" id="bkDone">Готово</button>
              </div>
            </div>
          `;
          zone.querySelector('#bkAddPlan')?.addEventListener('click', () => {
            addPlan({
              title: booking.title,
              kind: 'venue',
              venueId: venue.id,
              cityKey: venue.city,
              lat: venue.lat,
              lon: venue.lon
            });
            toast(`Добавлено в планы: ${booking.title}`);
            haptic('light');
          });
          zone.querySelector('#bkDone')?.addEventListener('click', () => dlg.close());
          toast('Бронь подтверждена');
          haptic('medium');
        } catch (err) {
          zone.innerHTML = `<div class="bk-error">Не удалось забронировать: ${escapeHtml(err?.message || 'ошибка')}</div>`;
        }
      });
    } catch (err) {
      zone.innerHTML = `<div class="bk-error">Не удалось получить предложения: ${escapeHtml(err?.message || 'ошибка')}</div>`;
    }
  });
}

function renderEvents() {
  const cityKey = currentCityKey();
  const list = filterEventsByCity(cityKey);
  const eventsView = state.ui?.eventsView || 'places';
  const categorized = categorizeEvents(list);

  const venues = cityKey ? VENUES.filter((v) => v.city === cityKey) : VENUES;
  const venuesBody = venues.length
    ? `<div class="card">
        <div class="card-title">Записаться на свидание/досуг</div>
        <div class="muted">Рестораны, кафе, кино, спортзалы, СПА и парки — выберите место, укажите бюджет, и аукцион предложит лучшую цену.</div>
        <div class="venues-grid">
          ${venues
            .map(
              (v) => `
            <div class="venue-card">
              <div class="venue-emoji">${v.imageEmoji || '📍'}</div>
              <div class="venue-title">${escapeHtml(v.title)}</div>
              <div class="muted venue-addr">${escapeHtml(v.address)}</div>
              <div class="venue-meta"><span class="pill">${escapeHtml(venueKindLabel(v.kind))}</span><span class="pill">${v.openHours}</span></div>
              <div class="venue-price">от ${v.priceFrom ? `${v.priceFrom} ₽` : 'бесплатно'}</div>
              <button class="btn" type="button" data-book-venue="${v.id}">Записаться</button>
            </div>
          `
            )
            .join('')}
        </div>
      </div>`
    : '';

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

  $('#view-events').innerHTML = `<div class="grid">${header}${eventsView === 'map' ? mapBody : placesBody}${eventsView === 'places' ? venuesBody : ''}</div>`;

  if (eventsView === 'map') {
    renderEventsMap(list, cityKey);
  }

  $('#view-events').querySelectorAll('[data-book-venue]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const venue = venueById(btn.dataset.bookVenue);
      if (venue) openBookingDialog(venue);
      haptic('light');
    });
  });

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

  const venueMarkers = [];
  const cityKeyHere = currentCityKey();
  const venuesHere = cityKeyHere ? VENUES.filter((v) => v.city === cityKeyHere) : VENUES;
  for (const v of venuesHere) {
    if (typeof v.lat !== 'number' || typeof v.lon !== 'number') continue;
    const m = L.circleMarker([v.lat, v.lon], {
      radius: 8,
      color: '#0d9488',
      fillColor: '#14b8a6',
      fillOpacity: 0.85
    }).addTo(map);
    m.bindPopup(`
      <div style="font-weight:700;margin-bottom:4px">${escapeHtml(v.imageEmoji || '')} ${escapeHtml(v.title)}</div>
      <div style="opacity:.8">${escapeHtml(v.address || '')}</div>
      <div style="opacity:.8;margin-top:4px">${escapeHtml(venueKindLabel(v.kind))} • от ${v.priceFrom ? `${v.priceFrom} ₽` : 'бесплатно'}</div>
      <div style="opacity:.8">Часы: ${escapeHtml(v.openHours || '')}</div>
    `);
    venueMarkers.push(m);
  }

  const combined = [...eventMarkers, ...venueMarkers];
  if (combined.length) {
    const group = L.featureGroup(combined);
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

function renderTreeFilterGroup(catId, label, questions, tree, catKey, treeOpen = []) {
  const qs = questions.filter((q) => (catKey ? q.category === catKey : !q.category));
  const selectedCount = qs.reduce((n, q) => n + ((tree[q.id] || []).length ? 1 : 0), 0);
  const open = treeOpen.includes(catId);
  return `
    <div class="tree-filter-cat">
      <button class="tree-filter-cat-head" type="button" data-tree-filter-cat="${catId}" aria-expanded="${open ? 'true' : 'false'}">
        <span>${escapeHtml(label)}</span>
        ${selectedCount ? `<span class="pill">${selectedCount}</span>` : ''}
        <span class="chevron" aria-hidden="true"></span>
      </button>
      <div class="tree-filter-body" ${open ? '' : 'hidden'}>
        ${qs
          .filter((q) => !q.numeric && !q.search)
          .map((q) => {
            const sel = new Set(tree[q.id] || []);
            const opts = questionOptions(q)
              .map((o) => {
                const active = sel.has(o.id);
                return `<button class="chip ${active ? 'active' : ''}" type="button" data-tree-answer="${q.id}" data-option="${o.id}">${escapeHtml(o.label)}</button>`;
              })
              .join('');
            return `<div class="tree-filter-q"><div class="muted">${escapeHtml(partnerFilterText(q))}</div><div class="chip-row">${opts}</div></div>`;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderTreeFilters(filters = {}) {
  const tree = filters.tree || {};
  const treeOpen = Array.isArray(filters.treeOpen) ? filters.treeOpen : [];
  const cats = CATEGORY_ORDER.map((catId) =>
    renderTreeFilterGroup(catId, CATEGORY_LABELS[catId] || catId, FULL_QUESTIONNAIRE, tree, catId, treeOpen)
  ).join('');
  const psych = renderTreeFilterGroup('psych', 'ПСИХОЛОГИЯ', QUESTIONNAIRE, tree, null, treeOpen);
  const totalActive = Object.values(tree).reduce((n, a) => n + a.length, 0);
  return `
    <div class="filter-group tree-filter-group">
      <div class="label">Анкета (дерево решений)${totalActive ? ` <span class="pill">${totalActive}</span>` : ''}</div>
      <div class="tree-filter">${cats}${psych}</div>
      ${totalActive ? '<button class="btn ghost" type="button" data-tree-filter-reset>Сбросить фильтры анкеты</button>' : ''}
    </div>
  `;
}

function matchesTreeFilters(p, treeFilter = {}) {
  for (const [qid, opts] of Object.entries(treeFilter)) {
    if (!Array.isArray(opts) || !opts.length) continue;
    const q = ALL_QUESTIONS.find((x) => x.id === qid);
    if (!q || q.numeric || q.search) continue;
    if (qid === 'q274') {
      if (!opts.some((optId) => p.city === CITY_ANSWER_TO_KEY[optId])) return false;
      continue;
    }
    const matches = opts.some((optId) => {
      const opt = questionOptions(q).find((o) => o.id === optId);
      if (!opt) return false;
      if (q.category) return p.factual?.[q.category] === opt.value;
      return Object.entries(getOptionTraits(q, opt)).some(([dim, val]) => p.persona?.[dim] === val);
    });
    if (!matches) return false;
  }
  return true;
}

// Категории дерева решений, где несовпадение значений критично для матча.
const TREE_CRITICAL_CATEGORIES = ['family', 'habits', 'relationship', 'extra'];
// Минимальная доля совпавших веток дерева для матча.
const TREE_MATCH_THRESHOLD = 0.4;

function buildUserTree(profile = state.profile) {
  const answers = getQuestionnaireAnswers(profile);
  const factual = {};
  const persona = {};
  for (const q of ALL_QUESTIONS) {
    const answerId = answers[q.id];
    if (!answerId) continue;
    const num = numericAnswerValue(answerId);
    const searched = searchAnswerValue(answerId);
    let traitsList;
    if (num != null) {
      const bucket = numericBucket(q, num);
      traitsList = bucket ? [{ [q.category]: bucket }] : [];
    } else if (searched != null) {
      const cat = (q.searchMap || {})[searched] || '';
      traitsList = cat ? [{ [q.category]: cat }] : [];
    } else {
      traitsList = multiAnswerList(answerId)
        .map((oid) => {
          const opt = questionOptions(q).find((x) => x.id === oid);
          return opt ? getOptionTraits(q, opt) : null;
        })
        .filter(Boolean);
    }
    for (const traits of traitsList) {
      for (const [dim, val] of Object.entries(traits)) {
        if (q.category) factual[dim] = val;
        else persona[dim] = val;
      }
    }
  }
  return { factual, persona };
}

// Совместимость по дереву решений: сравнивает ветки пользователя и кандидата.
// known — ветки, где известны значения обоих; match — совпавшие; conflicts — критичные расхождения.
// Настройки читаются из state.dating.filters: treeEnabled, treeThreshold (%), treeConflicts.
function treeMatchCompatibility(userProfile = state.profile, candidate = {}) {
  const filters = state.dating?.filters || {};
  const enabled = filters.treeEnabled !== false;
  const conflictsEnabled = filters.treeConflicts !== false;
  const threshold = Number.isFinite(Number(filters.treeThreshold)) ? Number(filters.treeThreshold) / 100 : TREE_MATCH_THRESHOLD;
  const me = buildUserTree(userProfile);
  const them = {
    factual: candidate.factual || {},
    persona: candidate.persona || {}
  };
  const known = [];
  const match = [];
  const conflicts = [];
  for (const [dim, myVal] of Object.entries(me.factual)) {
    const theirVal = them.factual[dim];
    if (!theirVal) continue;
    known.push(dim);
    if (myVal === theirVal) match.push(dim);
    else if (conflictsEnabled && TREE_CRITICAL_CATEGORIES.includes(dim)) conflicts.push({ dim, mine: myVal, theirs: theirVal });
  }
  for (const [dim, myVal] of Object.entries(me.persona)) {
    const theirVal = them.persona[dim];
    if (!theirVal) continue;
    known.push(dim);
    if (myVal === theirVal) match.push(dim);
  }
  const pct = known.length ? match.length / known.length : null;
  const compatible = !enabled || !known.length ? true : pct >= threshold && conflicts.length === 0;
  return { known, match, conflicts, pct, compatible, enabled, conflictsEnabled, threshold };
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
  const geoActive = !!(state.consent?.geo && state.lastKnown);
  const distanceMatters = filters.distanceMatters !== false;
  const canMeasure = geoActive || !!cityKey;
  const treeEnabled = filters.treeEnabled !== false;
  const treeConflicts = filters.treeConflicts !== false;
  const treeThresholdPct = Number.isFinite(Number(filters.treeThreshold)) ? Number(filters.treeThreshold) : Math.round(TREE_MATCH_THRESHOLD * 100);

  if (!liveProfilesLoaded && accountInfo?.id && isSupabaseConfigured()) {
    loadLiveProfiles();
  }

  const liveMode = !!accountInfo?.id && isSupabaseConfigured();
  const myGender = String(state.profile?.gender || '');
  const myName = normText(state.profile?.name || '');
  const candidatePool = liveProfiles.length ? liveProfiles : [];
  const baseMatch = (p) => {
    if (myGender) {
      const g = String(p.gender || '');
      if (g === myGender) return false;
    }
    if (myName && normText(p.name || '') === myName) return false;

    if (!matchesTreeFilters(p, filters.tree)) return false;

    if (selectedIntents.size) {
      const intents = new Set(p.meetingIntent || []);
      if (!overlapCount(selectedIntents, intents)) return false;
    }

    if (selectedPlaces.size && !selectedPlaces.has('all')) {
      const places = new Set(p.meetingPlaces || []);
      if (!overlapCount(selectedPlaces, places)) return false;
    }

    if (stepsBucket && !matchesStepBucket(Number(p.stepCount || 0), stepsBucket)) return false;

    return true;
  };
  const inRadius = (p) => {
    if (!(distanceMatters && canMeasure && cityKey && radiusKm > 0)) return true;
    const km = cityDistanceKm(cityKey, p.city);
    return km == null || km <= radiusKm;
  };
  const scored = (p) => ({
    ...p,
    compatibility: buildPairCompatibility(state.profile, p),
    score:
      overlapCount(interests, new Set(p.interests)) +
      overlapCount(comm, new Set(p.communication || [])) +
      overlapCount(values, new Set(p.values || [])) +
      (job && normText(p.jobTitle) === job ? 1 : 0) +
      (zodiac && normText(p.zodiac) === zodiac ? 1 : 0) +
      (edu && normText(p.education) === edu ? 1 : 0)
  });
  const sorter = (a, b) => {
    const ar = (a.compatibility?.support || 0) - (a.compatibility?.tension || 0);
    const br = (b.compatibility?.support || 0) - (b.compatibility?.tension || 0);
    if (br !== ar) return br - ar;
    return b.score - a.score;
  };
  const withinRadius = candidatePool.filter((p) => baseMatch(p) && inRadius(p));
  const pool = (withinRadius.length >= 2 || !canMeasure ? withinRadius : candidatePool.filter((p) => baseMatch(p))).map(scored).sort(sorter);
  const candidates = pool;

  const visible = candidates.filter((p) => !state.dating.likes[p.id]).slice(0, 6);
  const matches = getMutualMatches();
  const seenMatches = state.dating.seenMatches || {};

  $('#view-dating').innerHTML = `
    <div class="grid">
      <div class="card">
        <button class="accordion-head" type="button" data-filter-toggle aria-expanded="${state.ui?.filtersOpen !== false ? 'true' : 'false'}">
          <span class="accordion-title">Фильтры</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="accordion-body" ${state.ui?.filtersOpen !== false ? '' : 'hidden'}>
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
            <div class="label ${!distanceMatters || !canMeasure ? 'muted' : ''}">Дальность: ${radiusKm} км</div>
            <div class="chip-row">
              <button class="chip ${distanceMatters ? 'active' : ''}" type="button" data-filter-distance-toggle>Учитывать дальность</button>
            </div>
            <input class="range" type="range" min="0" max="3000" step="25" value="${radiusKm}" data-filter-range="distanceKm" ${!distanceMatters || !canMeasure ? 'disabled' : ''} />
            <div class="muted">${
              !canMeasure
                ? 'Включите геолокацию или укажите город в анкете, чтобы использовать фильтр по дальности.'
                : distanceMatters
                  ? `От: ${cityKey ? cityLabel(cityKey) : 'вашего города'} • ${geoActive ? 'геолокация активна' : 'город из анкеты'}`
                  : 'Дальность не учитывается — показываем анкеты в любом городе.'
            }</div>
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
          <div class="filter-group">
            <div class="label">Матчинг по дереву решений</div>
            <div class="chip-row">
              <button class="chip ${treeEnabled ? 'active' : ''}" type="button" data-tree-toggle-match>Учитывать дерево при матче</button>
            </div>
            <div class="label ${!treeEnabled ? 'muted' : ''}">Порог совпадений: ${treeThresholdPct}%</div>
            <input class="range" type="range" min="0" max="100" step="5" value="${treeThresholdPct}" data-tree-threshold ${!treeEnabled ? 'disabled' : ''} />
            <div class="chip-row">
              <button class="chip ${treeConflicts ? 'active' : ''}" type="button" data-tree-conflicts-toggle>Блокировать критические конфликты</button>
            </div>
            <div class="muted">Критичные расхождения: семья/дети, привычки, цель отношений, религия — матч не засчитывается.</div>
          </div>
          ${renderTreeFilters(filters)}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Анкета</div>
        ${visible.length ? `<div class="tinder-wrap" id="tinderWrap"></div>` : `<div class="muted">Новых анкет нет.</div>`}
        ${visible.length ? `<div class="tinder-actions"><button class="tbtn nope" type="button" data-tinder="nope">✕</button><button class="tbtn like" type="button" data-tinder="like">❤</button></div>` : ``}
      </div>
    </div>
  `;


  $('#view-dating').querySelectorAll('[data-open-tab]').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.openTab));
  });

  $('#view-dating').querySelector('[data-filter-toggle]')?.addEventListener('click', () => {
    state.ui = state.ui || {};
    state.ui.filtersOpen = !state.ui.filtersOpen;
    save();
    renderAll();
    haptic('light');
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

  $('#view-dating').querySelectorAll('[data-tree-filter-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const body = btn.closest('.tree-filter-cat')?.querySelector('.tree-filter-body');
      if (!body) return;
      state.dating.filters = state.dating.filters || {};
      const open = Array.isArray(state.dating.filters.treeOpen) ? state.dating.filters.treeOpen : [];
      const catId = btn.dataset.treeFilterCat;
      const idx = open.indexOf(catId);
      if (body.hidden) {
        if (idx < 0 && catId) open.push(catId);
        body.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      } else {
        if (idx >= 0) open.splice(idx, 1);
        body.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
      state.dating.filters.treeOpen = open;
      save();
    });
  });

  $('#view-dating').querySelectorAll('[data-tree-answer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qid = btn.dataset.treeAnswer;
      const optId = btn.dataset.option;
      state.dating.filters = state.dating.filters || {};
      state.dating.filters.tree = state.dating.filters.tree || {};
      const cur = new Set(state.dating.filters.tree[qid] || []);
      if (cur.has(optId)) cur.delete(optId);
      else cur.add(optId);
      if (cur.size) state.dating.filters.tree[qid] = [...cur];
      else delete state.dating.filters.tree[qid];
      if (!Object.keys(state.dating.filters.tree).length) delete state.dating.filters.tree;
      save();
      renderAll();
    });
  });

  $('#view-dating').querySelector('[data-tree-filter-reset]')?.addEventListener('click', () => {
    state.dating.filters = state.dating.filters || {};
    delete state.dating.filters.tree;
    save();
    renderAll();
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

  $('#view-dating').querySelectorAll('[data-filter-distance-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.dating.filters = state.dating.filters || {};
      state.dating.filters.distanceMatters = !(state.dating.filters.distanceMatters !== false);
      save();
      renderAll();
      haptic('light');
    });
  });

  $('#view-dating').querySelectorAll('[data-tree-toggle-match]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.dating.filters = state.dating.filters || {};
      state.dating.filters.treeEnabled = state.dating.filters.treeEnabled === false;
      save();
      renderAll();
      haptic('light');
    });
  });

  $('#view-dating').querySelectorAll('[data-tree-conflicts-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.dating.filters = state.dating.filters || {};
      state.dating.filters.treeConflicts = state.dating.filters.treeConflicts === false;
      save();
      renderAll();
      haptic('light');
    });
  });

  $('#view-dating').querySelectorAll('[data-tree-threshold]').forEach((el) => {
    el.addEventListener('input', () => {
      state.dating.filters = state.dating.filters || {};
      state.dating.filters.treeThreshold = Number(el.value || 0);
      const label = el.closest('.filter-group')?.querySelector('.label');
      if (label) label.textContent = `Порог совпадений: ${Number(el.value || 0)}%`;
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
      openMatchChat(matchId);
    });
  });
}

function openMatchChat(matchId) {
  state.dating.seenMatches = state.dating.seenMatches || {};
  state.dating.seenMatches[matchId] = true;
  state.messages = state.messages || { activeThreadId: null, threads: {} };
  state.messages.activeThreadId = matchId;
  state.messages.openChat = matchId;
  state.ui = state.ui || {};
  state.ui.homePanel = 'messages';
  if (accountInfo?.id) supabaseMarkMatchSeen(accountInfo.id, matchId).catch(() => {});
  save();
  switchTab('home');
  renderAll();
  loadRemoteChat(matchId);
}


function renderStats() {
  const name = state.profile?.name || '';
  const description = state.profile?.description || '';
  const gender = String(state.profile?.gender || '');
  const interests = state.profile?.interests || [];
  const interestsText = interests.join(', ');
  const zodiac = state.profile?.zodiac || '';
  const wishlistPlaces = new Set(state.profile?.wishlistPlaces || []);
  const customPlaces = Array.isArray(state.profile?.customPlaces) ? state.profile.customPlaces : [];
  const photos = state.profile?.photos || [];
  const stepsOn = !!state.consent?.steps;
  const stepsRunning = !!stepCounter?.running;
  const allLegalConsentsAccepted = !!(state.consent?.agreement && state.consent?.personalData && state.consent?.newsletters && state.consent?.cookies);
  const portrait = buildQuestionnairePortrait(state.profile?.questionnaireAnswers || {});
  const catsInfo = portrait.categories || {};
  const catsProgress = {
    done: Object.values(catsInfo).filter((c) => c.answered > 0).length,
    total: Object.keys(catsInfo).length
  };
  const recs = Array.isArray(state.circle?.recommendations) ? state.circle.recommendations : [];
  const selfKey = normText(state.profile?.name || 'вы');
  const selfRecs = recs.filter((r) => normText(r.candidateName || r.candidateId || '') === selfKey && r.accepted);

  $('#view-stats').innerHTML = `
    <div class="grid">
      <div class="card profile-editor">
        <div class="card-title">Анкета</div>
        <div class="photo-hero">
          <button class="photo-hero-main ${photos[0] ? '' : 'empty'}" type="button" data-action="pickPhoto" ${photos.length >= 3 ? 'disabled' : ''}>
            ${photos[0] ? `<img alt="profile photo" src="${photos[0]}" />` : `<div class="photo-empty">Фото профиля</div>`}
          </button>
          <div class="photo-hero-actions">
            <button class="btn" type="button" data-action="pickPhoto" ${photos.length >= 3 ? 'disabled' : ''}>Загрузить фото</button>
            <input id="profilePhotoInput" type="file" accept="image/*" hidden />
            <button class="btn ghost" type="button" data-action="clearPhotos">Удалить все</button>
          </div>
          <div id="profilePhotosPreview" class="photo-strip">
            ${photos.length
              ? photos
                  .slice(0, 3)
                  .map((src, idx) => `<button class="photo-thumb" type="button" data-photo-index="${idx}"><img alt="photo ${idx + 1}" src="${src}" /></button>`)
                  .join('')
              : ''}
            ${photos.length < 3 ? '<div class="muted photo-hint" style="text-align:center;font-size:10px">Можно загрузить до 3 фото</div>' : ''}
          </div>
        </div>

      <div class="card">
        <div class="card-title">Анкета совместимости</div>
        ${renderQuestionnaireSummary(state.profile)}
        <button class="accordion-head" type="button" data-tree-toggle aria-expanded="${state.ui?.treeOpen ? 'true' : 'false'}">
          <span class="accordion-title">Вопросы</span>
          <span class="pill">${catsProgress.done}/${CATEGORY_ORDER.length}</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="accordion-body" ${state.ui?.treeOpen ? '' : 'hidden'}>
          ${renderQuestionnaireCategories(state.profile)}
        </div>
      </div>

      <div class="profile-editor">
        <div class="profile-field row-inline">
          <label class="label">Имя</label>
          <input id="profileName" class="input" maxlength="40" value="${escapeHtml(name)}" placeholder="Ваше имя" />
        </div>
        <div class="profile-field row-inline">
          <label class="label">Вы кто</label>
          <select id="profileGender" class="select">
            <option value="" ${!gender ? 'selected' : ''}>Не указано</option>
            <option value="female" ${gender === 'female' ? 'selected' : ''}>Женщина</option>
            <option value="male" ${gender === 'male' ? 'selected' : ''}>Мужчина</option>
          </select>
        </div>
        <div class="muted">От этого зависят формулировки вопросов и варианты ответов в анкете.</div>
        <div class="profile-field">
          <label class="label">Описание</label>
          <textarea id="profileDescription" class="input" maxlength="2000" placeholder="Расскажите о себе (до 2000 символов)">${escapeHtml(description)}</textarea>
        </div>
        <div class="profile-field">
          <label class="label">Интересы</label>
          <input id="profileInterestsText" class="input" value="${escapeHtml(interestsText)}" placeholder="Например: кофе, прогулки, кино" />
        </div>
        <div class="row-inline" style="margin-top:14px">
          <button class="btn" type="button" data-action="saveProfileMini">Сохранить анкету</button>
        </div>
      </div>

      <div class="card" id="accountCard" ${state.ui?.accountExpanded === false ? '' : ''}>
        <button class="accordion-head" type="button" data-toggle-account aria-expanded="${state.ui?.accountExpanded !== false ? 'true' : 'false'}">
          <span class="accordion-title">Аккаунт</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="accordion-body" ${state.ui?.accountExpanded !== false ? '' : 'hidden'}>
        <div class="account-badge" id="accountBadge"></div>
        ${accountInfo
          ? `
          <div class="row-inline" style="margin-top:10px" id="accountSignedIn">
            <button id="btnChangePassword" class="btn" type="button">Сменить пароль</button>
            <button id="btnAccountLogout" class="btn danger" type="button">Выход</button>
          </div>
          <div class="row" id="changePasswordBox" hidden>
            <label class="label">Новый пароль</label>
            <input id="newPassword" class="input" type="password" autocomplete="new-password" placeholder="минимум 6 символов" />
            <div class="row-inline" style="margin-top:8px">
              <button id="btnChangePasswordSave" class="btn" type="button">Сохранить пароль</button>
              <button id="btnChangePasswordCancel" class="btn ghost" type="button">Отмена</button>
            </div>
          </div>
          <div class="muted" style="margin-top:8px"></div>`
          : `
          <form class="auth-form" id="authForm" autocomplete="on">
            <div class="row" style="margin-top:10px">
              <label class="label" for="accountEmail">Email</label>
              <input id="accountEmail" name="email" class="input" type="email" inputmode="email" autocomplete="email" required placeholder="name@example.com" value="${escapeHtml(state.cloud?.email || '')}" />
            </div>
            <div class="row">
              <label class="label" for="accountPassword">Пароль</label>
              <input id="accountPassword" name="password" class="input" type="password" autocomplete="current-password" placeholder="минимум 6 символов" />
            </div>
            <div class="row-inline">
              <button id="btnAccountRegister" class="btn" type="submit" formnovalidate>Регистрация</button>
              <button id="btnAccountLogin" class="btn ghost" type="submit" formnovalidate>Войти</button>
            </div>
            <div class="row-inline" style="margin-top:8px; justify-content:center; gap:12px">
              <button id="btnForgotPassword" class="link-btn" type="button">Забыли пароль?</button>
              <button id="btnResendConfirm" class="link-btn" type="button">Повторить письмо</button>
            </div>
          </form>
          <div class="muted" id="accountHint">Не можете войти по своему паролю? Нажмите «Забыли пароль?» — на почту придёт ссылка для смены пароля.</div>`}
        </div>
      </div>

      <div class="card" id="legalConsentCard" ${allLegalConsentsAccepted && state.ui?.legalConsentExpanded !== true ? 'hidden' : ''}>
        <button class="accordion-head" type="button" data-toggle-legal-consent aria-expanded="${state.ui?.legalConsentExpanded ? 'true' : 'false'}">
          <span class="accordion-title">Согласия</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="accordion-body" ${state.ui?.legalConsentExpanded ? '' : 'hidden'}>
          <div class="consent-inline" style="font-size:12px">
            <div class="muted">Ознакомьтесь с документами по ссылкам и подтвердите согласие.</div>
            <div class="consent-list">
              <div class="consent-doc">
                <a class="consent-doc-link" href="./legal.html#offer" target="_blank" rel="noopener">📄 Публичная оферта</a>
              </div>
              <div class="consent-doc">
                <a class="consent-doc-link" href="./legal.html#agreement" target="_blank" rel="noopener">📄 Пользовательское соглашение</a>
              </div>
              <div class="consent-doc">
                <a class="consent-doc-link" href="./legal.html#privacy" target="_blank" rel="noopener">📄 Обработка персональных данных</a>
              </div>
            </div>
            <div class="row-inline" style="margin-top:8px">
              <button id="btnAcceptAll" class="btn ${allLegalConsentsAccepted ? 'ok' : ''}" type="button">${allLegalConsentsAccepted ? 'Согласие принято ✓' : 'Я согласен со всеми пунктами'}</button>
            </div>
            <div class="muted" style="margin-top:6px">Продолжая пользоваться данным приложением вы даёте согласие с правилами пользования сервиса.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  wireSettings();



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
      if (btn.disabled) return;
      $('#view-stats').querySelector('#profilePhotoInput')?.click();
    });
  });

  $('#view-stats').querySelector('[data-action="clearPhotos"]')?.addEventListener('click', () => {
    if (!confirm('Удалить все фото?')) return;
    syncProfileFormFields();
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

  $('#view-stats').querySelector('[data-add-custom-place]')?.addEventListener('click', () => {
    const input = $('#view-stats').querySelector('#profileCustomPlace');
    const value = String(input?.value || '').trim().slice(0, 80);
    if (!value) return toast('Укажите место');
    const list = Array.isArray(state.profile.customPlaces) ? state.profile.customPlaces : [];
    if (list.some((x) => x.toLowerCase() === value.toLowerCase())) return toast('Такое место уже добавлено');
    state.profile.customPlaces = [...list, value];
    if (input) input.value = '';
    save();
    pushPublicProfileNow().catch(() => {});
    renderAll();
  });

  $('#view-stats').querySelectorAll('[data-del-custom-place]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.delCustomPlace;
      state.profile.customPlaces = (state.profile.customPlaces || []).filter((x) => x !== value);
      save();
      pushPublicProfileNow().catch(() => {});
      renderAll();
    });
  });

  $('#view-stats').querySelector('[data-action="saveProfileMini"]')?.addEventListener('click', () => {
    const nextName = String($('#view-stats').querySelector('#profileName')?.value || '').trim().slice(0, 40);
    const nextGender = String($('#view-stats').querySelector('#profileGender')?.value || '');
    const nextDescription = String($('#view-stats').querySelector('#profileDescription')?.value || '').slice(0, 2000);
    const nextInterestsRaw = String($('#view-stats').querySelector('#profileInterestsText')?.value || '');
    const nextInterests = nextInterestsRaw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30);
    state.profile.name = nextName || state.profile.name;
    state.profile.gender = nextGender;
    state.profile.description = nextDescription;
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

  $('#view-stats').querySelectorAll('[data-open-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openQuestionnaireCategory(btn.dataset.openCat);
      haptic('light');
    });
  });

  $('#view-stats').querySelector('[data-toggle-legal-consent]')?.addEventListener('click', () => {
    state.ui = state.ui || {};
    state.ui.legalConsentExpanded = !state.ui.legalConsentExpanded;
    const card = document.getElementById('legalConsentCard');
    if (card) card.hidden = false;
    save();
    renderAll();
  });

  $('#view-stats').querySelector('[data-toggle-account]')?.addEventListener('click', () => {
    state.ui = state.ui || {};
    state.ui.accountExpanded = state.ui.accountExpanded === false ? true : false;
    save();
    renderAll();
  });

  $('#view-stats').querySelector('[data-tree-toggle]')?.addEventListener('click', () => {
    state.ui = state.ui || {};
    state.ui.treeOpen = !state.ui.treeOpen;
    save();
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
  const p = DATING_PROFILES.find((x) => x.id === id) || liveProfiles.find((x) => x.id === id);
  if (!p) return '';
  const photo = p.photos?.[0] || './assets/profile/avatar-square.jpg';
  const meta = p.city ? cityLabel(p.city) : '—';
  return `
    <div class="match-card ${seen ? 'seen' : 'new'}" data-match-id="${p.id}" role="button" tabindex="0" aria-label="Матч ${escapeHtml(p.name)}">
      <div class="match-photo-wrap">
        <img class="match-photo" alt="${escapeHtml(p.name)}" src="${photo}" />
      </div>
      <div class="match-name">${escapeHtml(p.name)}</div>
      <div class="match-meta">${meta}</div>
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
  const candidate = DATING_PROFILES.find((x) => x.id === id) || liveProfiles.find((x) => x.id === id);
  const tree = treeMatchCompatibility(state.profile, candidate || {});
  const treeOk = tree.compatible;
  const mutual = profileLikesYou(id);
  state.dating.matches = (state.dating.matches || []).filter((x) => x !== id);
  if (mutual && treeOk) state.dating.matches.unshift(id);

  if (mutual && treeOk) {
    if (accountInfo?.id) supabaseEnsureMatch(accountInfo.id, id).catch(() => {});
    haptic('match');
    toast('Есть матч! Вопросы подтвердило совместимость. Переписка — в табе «Сообщение».');
    save();
    renderAll();
    return;
  }

  if (mutual && !treeOk && tree.known.length) {
    toast('Взаимный лайк, но дерево решений не подтверждает совместимость');
    haptic('skip');
    save();
    renderAll();
    return;
  }

  if (accountInfo?.id) {
    supabaseSaveLike(accountInfo.id, id, 'like')
      .then(() => supabaseEnsureMatch(accountInfo.id, id))
      .then((row) => {
        if (!row) return;
        state.dating.matches = (state.dating.matches || []).filter((x) => x !== id);
        state.dating.matches.unshift(id);
        haptic('match');
        toast('Есть матч! Переписка — в табе «Сообщение».');
        save();
        renderAll();
      })
      .catch(() => {});
  }
  haptic('like');
  toast('Лайк отправлен');
  save();
  renderAll();
}

function onSkip(id) {
  state.dating.likes[id] = 'skip';
  if (accountInfo?.id) supabaseSaveLike(accountInfo.id, id, 'skip').catch(() => {});
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

async function apiGetVenues(serverUrl, cityKey) {
  const base = normalizeServerUrl(serverUrl);
  const url = cityKey ? `${base}/api/venues?city=${encodeURIComponent(cityKey)}` : `${base}/api/venues`;
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `HTTP ${res.status}`);
  return data.venues || [];
}

async function apiGetBookingQuote(serverUrl, venueId, guests, date, budget) {
  const base = normalizeServerUrl(serverUrl);
  const url = `${base}/api/book/quote?venueId=${encodeURIComponent(venueId)}&guests=${encodeURIComponent(guests)}&date=${encodeURIComponent(date || '')}&budget=${encodeURIComponent(budget || '')}`;
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `HTTP ${res.status}`);
  return data.offers || [];
}

async function apiBookVenue(serverUrl, body) {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(`${base}/api/book`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `HTTP ${res.status}`);
  return data.booking;
}

// Локальная симуляция аукциона, если сервер не подключён (демо-режим).
function simulateLocalOffers(venue, guests, date, budget) {
  const guestsN = Math.max(1, Number(guests) || 1);
  const budgetN = Number(budget) || venue.priceFrom * guestsN;
  const base = Math.max(venue.priceFrom, 300) * guestsN;
  const seedStr = `${venue.id}|${date}|${guestsN}`;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  const partners = [
    { name: 'Место напрямую', tag: 'direct' },
    { name: 'Партнёрский сервис', tag: 'partner' },
    { name: 'Спецпредложение', tag: 'deal' }
  ];
  return partners.map((p, i) => {
    const jitter = 0.92 + rnd() * 0.12 - i * 0.045;
    let price = Math.round((base * jitter) / 50) * 50;
    if (budgetN > 0 && price > budgetN) price = Math.max(Math.floor(venue.priceFrom / 2 / 50) * 50, Math.round((budgetN * 0.85) / 50) * 50);
    return { partner: p.name, tag: p.tag, price, discountPct: Math.round((1 - price / base) * 100), available: i < 2 || rnd() > 0.15 };
  });
}

async function apiLocalsBookQuote(venue, guests, date, budget) {
  const serverUrl = state.cloud?.serverUrl;
  if (serverUrl) {
    try {
      return await apiGetBookingQuote(serverUrl, venue.id, guests, date, budget);
    } catch {
      // fall through to local simulation
    }
  }
  return simulateLocalOffers(venue, guests, date, budget);
}

async function apiLocalsBook(venue, body) {
  const serverUrl = state.cloud?.serverUrl;
  if (serverUrl) {
    try {
      return await apiBookVenue(serverUrl, body);
    } catch {
      // fall through to local simulation
    }
  }
  const booking = {
    id: `bk-local-${Date.now().toString(36)}`,
    venueId: venue.id,
    title: venue.title,
    city: venue.city,
    guests: body.guests,
    date: body.date,
    time: body.time,
    partner: body.partner,
    price: body.price,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  return booking;
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
  const cityKey = currentCityKey();
  if (!cityKey) throw new Error('Город не определён');
  if (isSupabaseConfigured()) {
    const [locs, profs] = await Promise.all([
      supabaseGetLocations(),
      supabaseListPublicProfiles({ excludeUserId: accountInfo?.id })
    ]);
    const byUser = {};
    for (const l of locs) {
      if (!byUser[l.user_id]) byUser[l.user_id] = [];
      byUser[l.user_id].push(l);
    }
    const users = [];
    for (const p of profs) {
      const l = (byUser[p.id] || [])[0];
      if (!l) continue;
      users.push({
        name: p.name || 'Пользователь рядом',
        communication: p.communication || [],
        interests: p.interests || [],
        values: p.values || [],
        zodiac: p.zodiac || '',
        jobTitle: p.jobTitle || '',
        education: p.education || '',
        lat: l.lat,
        lon: l.lon,
        distKm: haversineKm(
          { lat: state.lastKnown.lat, lon: state.lastKnown.lon },
          { lat: l.lat, lon: l.lon }
        )
      });
    }
    return users;
  }
  if (!state.cloud?.enabled || !state.cloud?.token) throw new Error('Нужен логин (синк)');
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
  // Яндекс-тайлы: компании и POI подписаны на карте. При желании можно вернуть OSM.
  mapLayer = L.tileLayer('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&v=21.02.07&z={z}&x={x}&y={y}&scale=1&lang=ru_RU', {
    maxZoom: 19,
    attribution: '&copy; Яндекс Карты'
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
  if (isSupabaseConfigured()) {
    return supabaseGetPlansToday(day, { city: cityKey });
  }
  if (!state.cloud?.enabled || !state.cloud?.token) throw new Error('Нужен логин (синк)');
  const list = await apiGetPlans(state.cloud.serverUrl, state.cloud.token, { cityKey });
  // Only today's plans.
  return list.filter((x) => x?.day === day);
}

function maybeShareLocation() {
  if (!state.lastKnown) return;
  if (!state.geo?.mapShare) return;
  const hasCloud = state.cloud?.enabled && state.cloud?.token;
  const hasSupabase = !!(accountInfo?.id && isSupabaseConfigured());
  if (!hasCloud && !hasSupabase) return;
  const cityKey = currentCityKey();
  if (!cityKey) return;

  const now = Date.now();
  // Throttle to avoid spamming.
  if (now - lastLocSentAt < 25_000) return;
  lastLocSentAt = now;

  if (hasSupabase) {
    supabaseSaveLocation(accountInfo.id, {
      lat: state.lastKnown.lat,
      lon: state.lastKnown.lon,
      acc: state.lastKnown.acc || null,
      cityKey
    }).catch(() => {});
  }

  if (!hasCloud) return;
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
  if (!state.plans?.day) ensureTodayPlans();
  const day = state.plans.day;
  const plans = Array.isArray(state.plans.items) ? state.plans.items : [];
  if (accountInfo?.id && isSupabaseConfigured()) {
    supabaseSavePlans(accountInfo.id, day, plans).catch(() => {});
  }
  if (state.cloud?.enabled && state.cloud?.token) {
    apiPostPlans(state.cloud.serverUrl, state.cloud.token, day, plans).catch(() => {});
  }
}

function addPlan(partial) {
  ensureTodayPlans();
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    title: String(partial?.title || '').trim().slice(0, 80) || 'План',
    scheduledAt: partial?.scheduledAt || null,
    companyOk: partial?.companyOk != null ? !!partial.companyOk : !!state.plans?.companyPref,
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
  const tags = (p.interests || []).map((t) => `<span class="pill">${interestLabel(t)}</span>`).join(' ');
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
  const tree = treeMatchCompatibility(state.profile, p);
  const treeBadge = !tree.enabled
    ? '<span class="pill muted-pill">дерево: отключено в фильтрах</span>'
    : tree.known.length === 0
      ? '<span class="pill muted-pill">дерево: нет данных</span>'
      : `<span class="pill status-pill ${tree.compatible ? 'good' : 'bad'}">дерево: ${Math.round(tree.pct * 100)}% совпадений${tree.conflicts.length ? ` • ${tree.conflicts.length} конфликт` : ''}</span>`;
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
      <div class="tinder-badges">${treeBadge}</div>
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

const WISHLIST_PLACE_META = {
  cafe: { interests: ['coffee'], places: [] },
  park: { interests: ['walks'], places: [] },
  gallery: { interests: ['art', 'museums'], places: ['culture'] },
  restaurant: { interests: ['food'], places: ['restaurant'] },
  club: { interests: ['night'], places: ['club'] },
  events: { interests: ['theatre', 'cinema', 'music', 'art'], places: ['culture'] }
};

function parseBudgetAmount(s) {
  const digits = String(s || '').replace(/[^\d.,]/g, '').replace(',', '.');
  const n = parseFloat(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normToken(s) {
  return String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();
}

function fmtAmount(n) {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function fmtNumeric(q, n) {
  return `${n.toLocaleString('ru-RU')}${q?.numericSymbol || ' ₽'}`;
}

// Полная совместимость пары: дерево решений + гороскоп, работа, бюджет,
// места для встреч (неограниченный список) и планы на сегодня.
function buildPairCompatibility(user = {}, candidate = {}) {
  const portrait = buildQuestionnairePortrait(user.questionnaireAnswers || {});
  const base = comparePortraits(portrait, candidate.persona || {});
  const out = {
    ...base,
    shared: [...(base.shared || [])],
    differences: [...(base.differences || [])],
    neutral: [...(base.neutral || [])]
  };

  const zodiacA = normToken(user.zodiac);
  const zodiacB = normToken(candidate.zodiac);
  if (zodiacA && zodiacB) {
    if (zodiacA === zodiacB) {
      out.support += 1;
      out.shared.push(`Гороскоп: ${user.zodiac}`);
    } else {
      out.neutral.push(`Гороскоп: ${user.zodiac} ↔ ${candidate.zodiac}`);
    }
  }

  const jobA = normToken(user.jobTitle);
  const jobB = normToken(candidate.jobTitle);
  if (jobA && jobB) {
    if (jobA === jobB) {
      out.support += 1;
      out.shared.push(`Работа: ${user.jobTitle}`);
    } else {
      out.neutral.push(`Работа: ${user.jobTitle} ↔ ${candidate.jobTitle}`);
    }
  }

  const budgetA = parseBudgetAmount(user.budget);
  const budgetB = parseBudgetAmount(candidate.budget);
  if (budgetA != null && budgetB != null) {
    const diff = Math.abs(budgetA - budgetB) / Math.max(budgetA, budgetB);
    if (diff <= 0.2) {
      out.support += 1;
      out.shared.push(`Бюджет: ${fmtAmount(budgetA)} ≈ ${fmtAmount(budgetB)}`);
    } else if (diff <= 0.6) {
      out.neutral.push(`Бюджет: ${fmtAmount(budgetA)} ↔ ${fmtAmount(budgetB)}`);
    } else {
      out.tension += 0.8;
      out.differences.push(`Бюджет: ${fmtAmount(budgetA)} ↔ ${fmtAmount(budgetB)}`);
    }
  }

  const candPlaces = new Set(candidate.meetingPlaces || []);
  const candInterests = new Set(candidate.interests || []);
  const candTokens = normToken(
    `${candidate.about || ''} ${(candidate.interests || []).map((x) => interestLabel(x)).join(' ')}`
  );

  for (const id of new Set(user.wishlistPlaces || [])) {
    const meta = WISHLIST_PLACE_META[id];
    if (!meta) continue;
    const hits = [];
    if (meta.places.some((pl) => candPlaces.has(pl))) hits.push('место встречи');
    for (const it of meta.interests) if (candInterests.has(it)) hits.push(interestLabel(it).toLowerCase());
    if (hits.length) {
      out.support += 0.5;
      out.shared.push(`Место: ${WISHLIST_PLACES.find((x) => x.id === id)?.label || id} — ${hits.join(', ')}`);
    }
  }

  for (const cs of [...(user.customPlaces || []), user.desiredPlace || '']) {
    const t = normToken(cs);
    if (!t) continue;
    const toks = new Set(t.split(' ').filter((w) => w.length > 2));
    if (toks.size && [...toks].some((w) => candTokens.includes(w))) {
      out.support += 0.5;
      out.shared.push(`Место: ${cs}`);
    }
  }

  const plans = Array.isArray(user.plans?.items) ? user.plans.items.filter((p) => p && p.title) : [];
  for (const p of plans) {
    const t = normToken(p.title);
    if (!t) continue;
    const toks = new Set(t.split(' ').filter((w) => w.length > 2));
    const matched = toks.size ? [...toks].some((w) => candTokens.includes(w)) : false;
    const cityMatch = !!p.cityKey && !!candidate.city && normToken(p.cityKey) === normToken(candidate.city);
    if (matched || cityMatch) {
      out.support += 0.5;
      out.shared.push(`Сегодня: ${p.title}${cityMatch ? ` (${cityLabel(p.cityKey)})` : ''}`);
    }
  }

  let label = 'есть отличия, но можно обсудить';
  let tone = 'warn';
  const net = out.support - out.tension;
  if (out.tension >= 3.2) {
    label = 'существенные расхождения';
    tone = 'bad';
  } else if (net >= 5) {
    label = 'много общего';
    tone = 'good';
  }
  out.label = label;
  out.tone = tone;
  return out;
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
