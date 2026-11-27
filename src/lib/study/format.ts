import { getWeatherCategory } from './weather';

export function formatDurationHms(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

export function formatDurationHm(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const totalMin = Math.floor(safe / 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatJstTimeHm(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const m = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatJstDateHm(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '----/--/-- --:--';
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const mi = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${y}/${mo}/${d} ${h}:${mi}`;
}

export function formatWeatherLabel(weatherCode: number | null | undefined): string {
  const cat = getWeatherCategory(weatherCode);
  switch (cat) {
    case 'sunny':
      return '晴れ';
    case 'cloudy':
      return '曇り';
    case 'rainy':
      return '雨';
    case 'snowy':
      return '雪';
    default:
      return '不明';
  }
}
