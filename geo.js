const CITY_CENTERS = [
  { key: 'Moscow', lat: 55.7558, lon: 37.6173, radiusKm: 70 },
  { key: 'Saint Petersburg', lat: 59.9311, lon: 30.3609, radiusKm: 70 },
  { key: 'Kazan', lat: 55.7961, lon: 49.1064, radiusKm: 60 },
  { key: 'Novosibirsk', lat: 55.0084, lon: 82.9357, radiusKm: 80 }
];

// Simple geofences (bounding boxes) to improve accuracy vs. just city-center circles.
// For production, replace with proper polygons (GeoJSON) or a trusted reverse-geocoding provider.
const CITY_GEOFENCES = [
  // Moscow (approx). Covers Moscow + some surrounding area.
  { key: 'Moscow', bbox: { minLat: 55.142, maxLat: 56.021, minLon: 36.803, maxLon: 38.541 } },
  // Saint Petersburg (approx).
  { key: 'Saint Petersburg', bbox: { minLat: 59.633, maxLat: 60.267, minLon: 29.421, maxLon: 31.514 } },
  // Kazan (approx).
  { key: 'Kazan', bbox: { minLat: 55.627, maxLat: 55.918, minLon: 48.827, maxLon: 49.383 } },
  // Novosibirsk (approx).
  { key: 'Novosibirsk', bbox: { minLat: 54.858, maxLat: 55.216, minLon: 82.742, maxLon: 83.229 } }
];

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function guessCityKeyFromCoords(lat, lon) {
  // 1) Geofence bbox check (fast, decent).
  for (const f of CITY_GEOFENCES) {
    const b = f.bbox;
    if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) return f.key;
  }

  // 2) Fallback to city-center radius.
  const here = { lat, lon };
  let best = null;
  for (const c of CITY_CENTERS) {
    const km = haversineKm(here, c);
    if (km <= c.radiusKm) {
      if (!best || km < best.km) best = { key: c.key, km };
    }
  }
  return best?.key ?? null;
}

export function formatLatLon(lat, lon) {
  const f = (n) => (Math.round(n * 100000) / 100000).toFixed(5);
  return `${f(lat)}, ${f(lon)}`;
}
