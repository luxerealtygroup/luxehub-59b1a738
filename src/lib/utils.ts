import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as currency: $123,456 (no decimals, rounded) */
export function formatCurrency(value: number | null | undefined): string {
  const num = Number(value) || 0;
  return '$' + Math.round(num).toLocaleString('en-US');
}

/** Format a number with thousands separators, no decimals unless specified */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  const num = Number(value) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format compact currency for chart axes: $150k, $1.2M */
export function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(value) >= 1_000) return '$' + Math.round(value / 1_000) + 'k';
  return '$' + Math.round(value);
}

/** Format a percentage: 45.3% */
export function formatPercent(value: number, decimals = 1): string {
  return value.toFixed(decimals) + '%';
}
