/** Distribute whole-dollar annual volume without losing rounding remainders. */
export function distributeAnnualVolume(annualVolume: number): number[] {
  const total = Math.max(0, Math.round(annualVolume));
  const base = Math.floor(total / 12);
  return Array.from({ length: 12 }, (_, month) => base + (month < total % 12 ? 1 : 0));
}

export function applyAnnualVolume<T extends { volume?: number }>(months: T[], annualVolume: number): (T & { volume: number })[] {
  const volumes = distributeAnnualVolume(annualVolume);
  return months.map((month, index) => ({ ...month, volume: volumes[index] ?? 0 }));
}