export const CITY_LABELS = {
  Moscow: 'Москва',
  'Saint Petersburg': 'Санкт-Петербург',
  Kazan: 'Казань',
  Novosibirsk: 'Новосибирск'
};

export const INTERESTS = [
  { id: 'coffee', label: 'Кофе' },
  { id: 'walks', label: 'Прогулки' },
  { id: 'museums', label: 'Музеи' },
  { id: 'cinema', label: 'Кино' },
  { id: 'music', label: 'Музыка' },
  { id: 'food', label: 'Еда' },
  { id: 'sport', label: 'Спорт' },
  { id: 'theatre', label: 'Театр' },
  { id: 'boardgames', label: 'Настолки' },
  { id: 'art', label: 'Искусство' },
  { id: 'books', label: 'Книги' },
  { id: 'night', label: 'Ночная жизнь' }
];

// Demo events dataset (local/offline). Replace with your backend / city listings.
export const EVENTS = [
  {
    id: 'msk-park-walk',
    city: 'Moscow',
    title: 'Прогулка в парке + кофе',
    place: 'Парк рядом с центром',
    lat: 55.751244,
    lon: 37.618423,
    tags: ['walks', 'coffee'],
    startsAt: '2026-05-16T18:30:00+03:00'
  },
  {
    id: 'msk-museum-night',
    city: 'Moscow',
    title: 'Вечер в музее',
    place: 'Музей (выберите любимый)',
    lat: 55.758,
    lon: 37.617,
    tags: ['museums', 'art'],
    startsAt: '2026-05-18T19:00:00+03:00'
  },
  {
    id: 'msk-boardgames',
    city: 'Moscow',
    title: 'Настолки для двоих',
    place: 'Кафе с настолками',
    lat: 55.765,
    lon: 37.606,
    tags: ['boardgames', 'food'],
    startsAt: '2026-05-17T16:00:00+03:00'
  },
  {
    id: 'spb-walk',
    city: 'Saint Petersburg',
    title: 'Прогулка у воды',
    place: 'Набережная',
    lat: 59.9386,
    lon: 30.3141,
    tags: ['walks'],
    startsAt: '2026-05-17T18:00:00+03:00'
  },
  {
    id: 'kzn-food',
    city: 'Kazan',
    title: 'Дегустация местной еды',
    place: 'Фуд-маркет',
    lat: 55.7963,
    lon: 49.1088,
    tags: ['food'],
    startsAt: '2026-05-18T14:00:00+03:00'
  },
  {
    id: 'nsk-cinema',
    city: 'Novosibirsk',
    title: 'Кино + обсуждение',
    place: 'Кинотеатр',
    lat: 55.0084,
    lon: 82.9357,
    tags: ['cinema', 'books'],
    startsAt: '2026-05-20T19:30:00+07:00'
  }
];

// Каталог мест для записи (рестораны, кафе, парки, кино, спортзалы, СПА и др.).
// kind — категория: food | coffee | walks | cinema | museums | sport | spa | games | art | night.
export const VENUES = [
  {
    id: 'msk-rest-italia',
    city: 'Moscow',
    kind: 'food',
    title: 'Ресторан итальянской кухни «Trattoria»',
    address: 'ул. Тверская, 12',
    lat: 55.7612,
    lon: 37.6034,
    tags: ['food', 'night'],
    priceFrom: 1500,
    durationMin: 120,
    openHours: '12:00–23:00',
    imageEmoji: '🍝'
  },
  {
    id: 'msk-coffee-loft',
    city: 'Moscow',
    kind: 'coffee',
    title: 'Кофейня Loft Coffee',
    address: 'ул. Арбат, 24',
    lat: 55.7487,
    lon: 37.5902,
    tags: ['coffee', 'walks', 'art'],
    priceFrom: 350,
    durationMin: 60,
    openHours: '08:00–22:00',
    imageEmoji: '☕'
  },
  {
    id: 'msk-cinema-okto',
    city: 'Moscow',
    kind: 'cinema',
    title: 'Кинотеатр «Октябрь»',
    address: 'ул. Новый Арбат, 24',
    lat: 55.7519,
    lon: 37.5835,
    tags: ['cinema'],
    priceFrom: 500,
    durationMin: 150,
    openHours: '10:00–01:00',
    imageEmoji: '🎬'
  },
  {
    id: 'msk-spa-eaze',
    city: 'Moscow',
    kind: 'spa',
    title: 'Массажный салон Eaze SPA',
    address: 'Пятницкая ул., 8',
    lat: 55.7436,
    lon: 37.6259,
    tags: ['spa', 'health'],
    priceFrom: 1800,
    durationMin: 90,
    openHours: '10:00–22:00',
    imageEmoji: '💆'
  },
  {
    id: 'msk-gym-river',
    city: 'Moscow',
    kind: 'sport',
    title: 'Спортзал River Fitness',
    address: 'наб. Тараса Шевченко, 23',
    lat: 55.7501,
    lon: 37.5572,
    tags: ['sport'],
    priceFrom: 600,
    durationMin: 90,
    openHours: '07:00–23:00',
    imageEmoji: '🏋️'
  },
  {
    id: 'msk-park-gorky',
    city: 'Moscow',
    kind: 'walks',
    title: 'Парк Горького — велопрогулка на двоих',
    address: 'ул. Крымский Вал, 9',
    lat: 55.7295,
    lon: 37.6031,
    tags: ['walks', 'sport'],
    priceFrom: 400,
    durationMin: 120,
    openHours: 'Круглосуточно',
    imageEmoji: '🚴'
  },
  {
    id: 'msk-muse-pushkin',
    city: 'Moscow',
    kind: 'museums',
    title: 'ГМИИ им. Пушкина — экскурсия для двоих',
    address: 'ул. Волхонка, 12',
    lat: 55.7447,
    lon: 37.6056,
    tags: ['museums', 'art'],
    priceFrom: 600,
    durationMin: 120,
    openHours: '11:00–20:00',
    imageEmoji: '🖼️'
  },
  {
    id: 'msk-quest-mirror',
    city: 'Moscow',
    kind: 'games',
    title: 'Квест «Зеркальный лабиринт» на двоих',
    address: 'ул. Большая Полянка, 7',
    lat: 55.7374,
    lon: 37.6171,
    tags: ['games', 'boardgames'],
    priceFrom: 1000,
    durationMin: 90,
    openHours: '10:00–23:00',
    imageEmoji: '🗝️'
  },
  {
    id: 'msk-teatro',
    city: 'Moscow',
    kind: 'art',
    title: 'Современный театр «Другой»',
    address: 'Чистопрудный б-р, 12',
    lat: 55.763,
    lon: 37.6416,
    tags: ['theatre', 'art'],
    priceFrom: 800,
    durationMin: 150,
    openHours: 'Спектакли: 19:00',
    imageEmoji: '🎭'
  },
  {
    id: 'msk-jazz-club',
    city: 'Moscow',
    kind: 'night',
    title: 'Джаз-клуб Night Flames',
    address: 'ул. Мясницкая, 15',
    lat: 55.7626,
    lon: 37.6341,
    tags: ['night', 'music'],
    priceFrom: 700,
    durationMin: 180,
    openHours: '19:00–02:00',
    imageEmoji: '🎷'
  },
  {
    id: 'spb-rest-neva',
    city: 'Saint Petersburg',
    kind: 'food',
    title: 'Панорамный ресторан «Нева»',
    address: 'Английская наб., 56',
    lat: 59.9408,
    lon: 30.288,
    tags: ['food', 'night'],
    priceFrom: 1800,
    durationMin: 120,
    openHours: '12:00–01:00',
    imageEmoji: '🍷'
  },
  {
    id: 'spb-spa-royal',
    city: 'Saint Petersburg',
    kind: 'spa',
    title: 'СПА-комплекс «Петровский» для пары',
    address: 'Петровская наб., 6',
    lat: 59.9559,
    lon: 30.3353,
    tags: ['spa', 'health'],
    priceFrom: 2200,
    durationMin: 120,
    openHours: '09:00–23:00',
    imageEmoji: '♨️'
  },
  {
    id: 'spb-cinema-auth',
    city: 'Saint Petersburg',
    kind: 'cinema',
    title: 'Кинотеатр «Аврора»',
    address: 'Невский пр., 60',
    lat: 59.9331,
    lon: 30.3381,
    tags: ['cinema'],
    priceFrom: 450,
    durationMin: 150,
    openHours: '10:00–02:00',
    imageEmoji: '🎥'
  },
  {
    id: 'spb-gym-nevsky',
    city: 'Saint Petersburg',
    kind: 'sport',
    title: 'Фитнес-клуб Nevsky Fitness',
    address: 'Невский пр., 120',
    lat: 59.9287,
    lon: 30.3712,
    tags: ['sport'],
    priceFrom: 550,
    durationMin: 90,
    openHours: '07:00–23:00',
    imageEmoji: '🏃'
  },
  {
    id: 'spb-park-pmg',
    city: 'Saint Petersburg',
    kind: 'walks',
    title: 'Летний сад — прогулка с гидом',
    address: 'Летний сад',
    lat: 59.9432,
    lon: 30.3323,
    tags: ['walks', 'art'],
    priceFrom: 0,
    durationMin: 60,
    openHours: '10:00–22:00',
    imageEmoji: '🌳'
  },
  {
    id: 'kzn-rest-tatar',
    city: 'Kazan',
    kind: 'food',
    title: 'Ресторан татарской кухни «Тюбетей»',
    address: 'ул. Баумана, 8',
    lat: 55.7903,
    lon: 49.1182,
    tags: ['food'],
    priceFrom: 900,
    durationMin: 90,
    openHours: '11:00–23:00',
    imageEmoji: '🍲'
  },
  {
    id: 'kzn-spa-kazan',
    city: 'Kazan',
    kind: 'spa',
    title: 'Хамам и СПА «Казанские мотивы»',
    address: 'ул. Пушкина, 18',
    lat: 55.7861,
    lon: 49.1237,
    tags: ['spa', 'health'],
    priceFrom: 1500,
    durationMin: 120,
    openHours: '10:00–22:00',
    imageEmoji: '🛁'
  },
  {
    id: 'kzn-cinema-mir',
    city: 'Kazan',
    kind: 'cinema',
    title: 'Кинотеатр «Мир»',
    address: 'ул. Астрономическая, 14',
    lat: 55.7923,
    lon: 49.1131,
    tags: ['cinema'],
    priceFrom: 400,
    durationMin: 150,
    openHours: '10:00–01:00',
    imageEmoji: '🎞️'
  },
  {
    id: 'kzn-gym-akts',
    city: 'Kazan',
    kind: 'sport',
    title: 'Спортзал АК БАРС Арена',
    address: 'пр. Хусаина Ямашева, 115',
    lat: 55.8214,
    lon: 49.1606,
    tags: ['sport'],
    priceFrom: 500,
    durationMin: 90,
    openHours: '07:00–00:00',
    imageEmoji: '⛹️'
  },
  {
    id: 'kzn-park-kaban',
    city: 'Kazan',
    kind: 'walks',
    title: 'Озеро Кабан — прогулка на катере',
    address: 'Кабан, набережная',
    lat: 55.7917,
    lon: 49.1297,
    tags: ['walks'],
    priceFrom: 600,
    durationMin: 60,
    openHours: 'Круглосуточно',
    imageEmoji: '🛶'
  },
  {
    id: 'nsk-rest-sibir',
    city: 'Novosibirsk',
    kind: 'food',
    title: 'Ресторан сибирской кухни «Тайга»',
    address: 'Красный пр., 29',
    lat: 55.0349,
    lon: 82.9198,
    tags: ['food'],
    priceFrom: 1100,
    durationMin: 120,
    openHours: '12:00–00:00',
    imageEmoji: '🥩'
  },
  {
    id: 'nsk-spa-termal',
    city: 'Novosibirsk',
    kind: 'spa',
    title: 'Термальный комплекс «Сибирь»',
    address: 'ул. Кирова, 10',
    lat: 55.039,
    lon: 82.9226,
    tags: ['spa', 'health'],
    priceFrom: 1200,
    durationMin: 180,
    openHours: '09:00–23:00',
    imageEmoji: '🧖'
  },
  {
    id: 'nsk-gym-ocean',
    city: 'Novosibirsk',
    kind: 'sport',
    title: 'Фитнес-клуб Ocean Fitness',
    address: 'ул. Вокзальная магистраль, 16',
    lat: 55.0309,
    lon: 82.912,
    tags: ['sport'],
    priceFrom: 450,
    durationMin: 90,
    openHours: '06:00–23:00',
    imageEmoji: '🏊'
  },
  {
    id: 'nsk-cinema-basket',
    city: 'Novosibirsk',
    kind: 'cinema',
    title: 'Кинотеатр «Победа»',
    address: 'ул. Ленина, 7',
    lat: 55.0301,
    lon: 82.9207,
    tags: ['cinema'],
    priceFrom: 420,
    durationMin: 150,
    openHours: '10:00–01:00',
    imageEmoji: '🍿'
  }
];

export function venueById(id) {
  return VENUES.find((v) => v.id === id) || null;
}

export function interestLabel(id) {
  return INTERESTS.find((x) => x.id === id)?.label ?? id;
}

export function cityLabel(cityKey) {
  if (!cityKey) return '—';
  return CITY_LABELS[cityKey] ?? cityKey;
}
