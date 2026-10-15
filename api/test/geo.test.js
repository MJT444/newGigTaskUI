import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, randomPointNear } from '../src/mongo/geo.js';

test('simulated pings always land inside the requested radius', () => {
  const origin = { lng: 77.209, lat: 28.6139 };
  for (let i = 0; i < 2000; i += 1) {
    const p = randomPointNear(origin.lng, origin.lat, 4000);
    assert.ok(haversineMeters(origin, p) <= 4000 * 1.01, `point ${i} too far`);
  }
});

test('rand = 1 puts the point on the circle edge', () => {
  const origin = { lng: 77.209, lat: 28.6139 };
  const p = randomPointNear(origin.lng, origin.lat, 1000, () => 1);
  const d = haversineMeters(origin, p);
  assert.ok(Math.abs(d - 1000) < 10, `expected ~1000 m, got ${d}`);
});

test('haversine: 1 degree of latitude is about 111 km', () => {
  const d = haversineMeters({ lng: 78, lat: 17 }, { lng: 78, lat: 18 });
  assert.ok(Math.abs(d - 111_195) < 200);
});
