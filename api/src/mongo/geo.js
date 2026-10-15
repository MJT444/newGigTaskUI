// Geometry helpers for simulating fresh driver pings. Pure: unit-tested.

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Random point within `radiusM` metres of (lng, lat), uniformly spread over
 * the disc (sqrt on the random radius; without it points bunch at the centre).
 * `rand` is injectable so tests are deterministic.
 */
export function randomPointNear(lng, lat, radiusM, rand = Math.random) {
  const r = radiusM * Math.sqrt(rand());
  const theta = 2 * Math.PI * rand();
  const dLat = (r * Math.cos(theta)) / METERS_PER_DEGREE_LAT;
  const dLng = (r * Math.sin(theta)) / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return { lng: lng + dLng, lat: lat + dLat };
}

/** Great-circle distance in metres (haversine). Used only by tests/UI checks. */
export function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
