import type { Platform } from "./types";

/**
 * Default posting windows per platform (local time), from widely published
 * engagement studies. Used until the account has its own analytics.
 */
const WINDOWS: Record<Platform, { hours: number[]; weekdaysOnly?: boolean }> = {
  x: { hours: [8, 12, 17] },
  threads: { hours: [9, 13, 19] },
  facebook: { hours: [9, 13, 19] },
  instagram: { hours: [11, 14, 19] },
  linkedin: { hours: [8, 10, 12], weekdaysOnly: true },
  tiktok: { hours: [12, 19, 21] },
  whatsapp: { hours: [7, 12, 18] },
  telegram: { hours: [8, 12, 18] },
};

/** Next suggested slot at least 15 minutes from `from`. */
export function nextBestTime(platform: Platform, from = new Date()): Date {
  const w = WINDOWS[platform];
  const earliest = new Date(from.getTime() + 15 * 60_000);
  for (let day = 0; day < 8; day++) {
    for (const h of w.hours) {
      const d = new Date(earliest);
      d.setDate(d.getDate() + day);
      d.setHours(h, 0, 0, 0);
      const dow = d.getDay();
      if (w.weekdaysOnly && (dow === 0 || dow === 6)) continue;
      if (d >= earliest) return d;
    }
  }
  return earliest;
}
