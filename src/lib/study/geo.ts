import type { StudySpotRow } from '@/types/study';

const EARTH_RADIUS_M = 6_371_000;

export function isValidCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return false;
  }
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/**
 * Computes great-circle distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface SpotMatch {
  spot: StudySpotRow;
  distance_m: number;
  matched_by: 'wifi' | 'gps';
}

/**
 * Splits a spot's comma-separated `wifi_ssid` field into trimmed non-empty SSIDs.
 */
export function parseSpotWifiSsids(wifiSsid: string | null | undefined): string[] {
  if (!wifiSsid) return [];
  return wifiSsid
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Matches a session against registered spots.
 * Priority:
 * 1. Exact Wi-Fi SSID match (if `wifiSsid` is provided and matches any comma-separated SSID on a spot).
 *    When multiple spots share the same SSID, the spot with the smallest `radius_m` wins.
 * 2. Coordinate geofence match: when multiple spots contain the coordinate (nested spots such as
 *    a library inside a campus), the spot with the smallest `radius_m` wins; ties are broken by
 *    shortest center distance.
 */
export function findMatchingSpot(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  spots: StudySpotRow[],
  wifiSsid?: string | null
): SpotMatch | null {
  if (spots.length === 0) {
    return null;
  }

  const trimmedSsid = typeof wifiSsid === 'string' ? wifiSsid.trim() : '';
  const hasValidCoord = isValidCoordinate(latitude, longitude);

  if (trimmedSsid.length > 0) {
    let bestWifiMatch: SpotMatch | null = null;
    for (const spot of spots) {
      const ssids = parseSpotWifiSsids(spot.wifi_ssid);
      if (ssids.includes(trimmedSsid)) {
        const distance = hasValidCoord
          ? haversineDistanceMeters(
              latitude as number,
              longitude as number,
              spot.latitude,
              spot.longitude
            )
          : 0;
        if (
          !bestWifiMatch ||
          spot.radius_m < bestWifiMatch.spot.radius_m ||
          (spot.radius_m === bestWifiMatch.spot.radius_m && distance < bestWifiMatch.distance_m)
        ) {
          bestWifiMatch = { spot, distance_m: distance, matched_by: 'wifi' };
        }
      }
    }
    if (bestWifiMatch) {
      return bestWifiMatch;
    }
  }

  if (!hasValidCoord) {
    return null;
  }

  const lat = latitude as number;
  const lng = longitude as number;

  let bestMatch: SpotMatch | null = null;

  for (const spot of spots) {
    const distance = haversineDistanceMeters(lat, lng, spot.latitude, spot.longitude);
    if (distance <= spot.radius_m) {
      if (
        !bestMatch ||
        spot.radius_m < bestMatch.spot.radius_m ||
        (spot.radius_m === bestMatch.spot.radius_m && distance < bestMatch.distance_m)
      ) {
        bestMatch = { spot, distance_m: distance, matched_by: 'gps' };
      }
    }
  }

  return bestMatch;
}
