import { describe, expect, it } from 'vitest';
import { applyAnnualVolume, distributeAnnualVolume } from '../src/lib/goalVolume';

describe('volume goals', () => {
  it('allocates a dollar-volume goal across all 12 months without rounding loss', () => {
    const months = distributeAnnualVolume(5000000);
    expect(months).toHaveLength(12);
    expect(months.reduce((sum, value) => sum + value, 0)).toBe(5000000);
    expect(months[0]).toBe(416667);
  });

  it('keeps existing transaction and GCI goals when adding volume', () => {
    const months = Array.from({ length: 12 }, () => ({ deals: 2, gci: 12500, focus: 'Sphere' }));
    const updated = applyAnnualVolume(months, 6000000);
    expect(updated[0]).toEqual({ deals: 2, gci: 12500, focus: 'Sphere', volume: 500000 });
    expect(months[0]).not.toHaveProperty('volume');
  });
});