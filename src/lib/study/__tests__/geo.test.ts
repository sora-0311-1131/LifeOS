import { describe, expect, it } from 'vitest';
import type { StudySpotRow } from '@/types/study';
import { findMatchingSpot, haversineDistanceMeters, isValidCoordinate } from '../geo';

const makeSpot = (overrides: Partial<StudySpotRow>): StudySpotRow => ({
  id: 'spot-id',
  user_id: 'user-1',
  name: 'Spot',
  spot_group: 'Other',
  latitude: 35.0262,
  longitude: 135.7808,
  radius_m: 50,
  wifi_ssid: null,
  created_at: '2026-11-25T00:00:00.000Z',
  ...overrides,
});

describe('geo utilities', () => {
  it('validates coordinates correctly', () => {
    expect(isValidCoordinate(35.0, 135.7)).toBe(true);
    expect(isValidCoordinate(91, 135.7)).toBe(false);
    expect(isValidCoordinate(35.0, -181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 135.7)).toBe(false);
    expect(isValidCoordinate(null, 135.7)).toBe(false);
  });

  it('computes Haversine distance accurately', () => {
    expect(haversineDistanceMeters(35.0, 135.0, 35.0, 135.0)).toBe(0);
    const dist = haversineDistanceMeters(35.0, 135.0, 35.001, 135.0);
    expect(dist).toBeGreaterThan(105);
    expect(dist).toBeLessThan(115);
  });

  it('prefers the smallest-radius spot when nested spots overlap', () => {
    const campus = makeSpot({
      id: 'campus',
      name: '大学キャンパス',
      spot_group: 'Univ',
      latitude: 35.0262,
      longitude: 135.7808,
      radius_m: 300,
    });
    const library = makeSpot({
      id: 'library',
      name: '大学図書館',
      spot_group: 'Univ',
      latitude: 35.0264,
      longitude: 135.781,
      radius_m: 40,
    });

    const match = findMatchingSpot(35.02635, 135.78095, [campus, library]);
    expect(match?.spot.id).toBe('library');
  });

  it('breaks radius ties by shortest distance to spot center', () => {
    const cafeA = makeSpot({
      id: 'cafe-a',
      name: 'カフェA',
      spot_group: 'Cafe',
      latitude: 35.0,
      longitude: 135.0,
      radius_m: 50,
    });
    const cafeB = makeSpot({
      id: 'cafe-b',
      name: 'カフェB',
      spot_group: 'Cafe',
      latitude: 35.0002,
      longitude: 135.0,
      radius_m: 50,
    });

    const match = findMatchingSpot(35.00018, 135.0, [cafeA, cafeB]);
    expect(match?.spot.id).toBe('cafe-b');
  });

  it('returns null when outside all spot radii or given invalid coordinates', () => {
    const home = makeSpot({ id: 'home', name: 'Home', radius_m: 50 });
    expect(findMatchingSpot(35.1, 135.9, [home])).toBeNull();
    expect(findMatchingSpot(null, null, [home])).toBeNull();
  });

  it('matches spot by Wi-Fi SSID (comma-separated) with higher priority than GPS', () => {
    const campus = makeSpot({
      id: 'campus',
      name: '大学キャンパス',
      spot_group: 'Univ',
      latitude: 35.0262,
      longitude: 135.7808,
      radius_m: 300,
    });
    const circleRoom = makeSpot({
      id: 'circle',
      name: 'サークル部屋',
      spot_group: 'Univ',
      latitude: 35.03,
      longitude: 135.79,
      radius_m: 30,
      wifi_ssid: 'A4-WiFi-5G, A4-WiFi-2.4G',
    });

    const matchWithGps = findMatchingSpot(35.0262, 135.7808, [campus, circleRoom], 'A4-WiFi-2.4G');
    expect(matchWithGps?.spot.id).toBe('circle');
    expect(matchWithGps?.matched_by).toBe('wifi');

    const matchWithoutGps = findMatchingSpot(null, null, [campus, circleRoom], 'A4-WiFi-5G');
    expect(matchWithoutGps?.spot.id).toBe('circle');
    expect(matchWithoutGps?.matched_by).toBe('wifi');

    const fallback = findMatchingSpot(35.0262, 135.7808, [campus, circleRoom], 'Other-WiFi');
    expect(fallback?.spot.id).toBe('campus');
    expect(fallback?.matched_by).toBe('gps');
  });
});
