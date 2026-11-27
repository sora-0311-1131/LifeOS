import { isValidCoordinate } from './geo';

export interface WeatherSnapshot {
  weather_code: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
  pressure_diff_3h: number | null;
  pressure_diff_6h: number | null;
}

export type WeatherCategory = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'unknown';

const DEFAULT_TIMEOUT_MS = 2000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function computePressureDiffs(
  currentPressure: number | null,
  currentTime: unknown,
  hourly: { time?: unknown; surface_pressure?: unknown } | undefined
): { pressure_diff_3h: number | null; pressure_diff_6h: number | null } {
  if (
    currentPressure === null ||
    !hourly ||
    !Array.isArray(hourly.surface_pressure) ||
    hourly.surface_pressure.length === 0
  ) {
    return { pressure_diff_3h: null, pressure_diff_6h: null };
  }

  const pressures = hourly.surface_pressure;
  let anchorIdx = pressures.length - 1;

  if (typeof currentTime === 'string' && currentTime.length >= 13 && Array.isArray(hourly.time)) {
    const hourKey = `${currentTime.slice(0, 13)}:00`;
    const foundIdx = hourly.time.findIndex((t) => t === hourKey);
    if (foundIdx >= 0) {
      anchorIdx = foundIdx;
    }
  }

  const diffAt = (hoursAgo: number): number | null => {
    const idx = anchorIdx - hoursAgo;
    if (idx < 0 || idx >= pressures.length) return null;
    const prev = pressures[idx];
    if (typeof prev !== 'number' || !Number.isFinite(prev)) return null;
    return round1(currentPressure - prev);
  };

  return {
    pressure_diff_3h: diffAt(3),
    pressure_diff_6h: diffAt(6),
  };
}

/**
 * Fetches current weather snapshot (plus 3h / 6h pressure deltas) from Open-Meteo
 * (free, no API key required).
 * Non-blocking by design: returns null on timeout, HTTP error, or invalid payload
 * so study session check-in never fails due to upstream weather outages.
 */
export async function fetchWeatherSnapshot(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<WeatherSnapshot | null> {
  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'weather_code,temperature_2m,surface_pressure',
      hourly: 'surface_pressure',
      past_hours: '7',
      forecast_hours: '1',
      timezone: 'Asia/Tokyo',
    });

    const response = await fetchFn(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      {
        signal: controller.signal,
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      current?: {
        time?: unknown;
        weather_code?: unknown;
        temperature_2m?: unknown;
        surface_pressure?: unknown;
      };
      hourly?: {
        time?: unknown;
        surface_pressure?: unknown;
      };
    };

    if (!data.current || typeof data.current !== 'object') {
      return null;
    }

    const weather_code =
      typeof data.current.weather_code === 'number' && Number.isFinite(data.current.weather_code)
        ? Math.round(data.current.weather_code)
        : null;
    const temperature_c =
      typeof data.current.temperature_2m === 'number' &&
      Number.isFinite(data.current.temperature_2m)
        ? data.current.temperature_2m
        : null;
    const pressure_hpa =
      typeof data.current.surface_pressure === 'number' &&
      Number.isFinite(data.current.surface_pressure)
        ? data.current.surface_pressure
        : null;

    if (weather_code === null && temperature_c === null && pressure_hpa === null) {
      return null;
    }

    const { pressure_diff_3h, pressure_diff_6h } = computePressureDiffs(
      pressure_hpa,
      data.current.time,
      data.hourly
    );

    return {
      weather_code,
      temperature_c,
      pressure_hpa,
      pressure_diff_3h,
      pressure_diff_6h,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Groups WMO weather codes into simplified analytics categories.
 */
export function getWeatherCategory(weatherCode: number | null | undefined): WeatherCategory {
  if (typeof weatherCode !== 'number' || !Number.isFinite(weatherCode)) {
    return 'unknown';
  }
  if (weatherCode === 0 || weatherCode === 1) {
    return 'sunny';
  }
  if (weatherCode === 2 || weatherCode === 3 || weatherCode === 45 || weatherCode === 48) {
    return 'cloudy';
  }
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    weatherCode >= 95
  ) {
    return 'rainy';
  }
  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    return 'snowy';
  }
  return 'unknown';
}
