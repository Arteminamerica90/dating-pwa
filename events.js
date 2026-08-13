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

export function interestLabel(id) {
  return INTERESTS.find((x) => x.id === id)?.label ?? id;
}

export function cityLabel(cityKey) {
  if (!cityKey) return '—';
  return CITY_LABELS[cityKey] ?? cityKey;
}
