import type { WeightUnit } from '../types';

// Conversion constants (to grams)
const CONVERSION_TO_GRAMS: Record<WeightUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

// Convert from any unit to grams
export function toGrams(value: number, unit: WeightUnit): number {
  return value * CONVERSION_TO_GRAMS[unit];
}

// Convert from grams to any unit
export function fromGrams(grams: number, unit: WeightUnit): number {
  return grams / CONVERSION_TO_GRAMS[unit];
}

// Format weight for display
export function formatWeight(
  grams: number,
  unit: WeightUnit,
  decimalPlaces: number = 1
): string {
  const value = fromGrams(grams, unit);
  const decimals = unit === 'g' ? decimalPlaces : Math.max(2, decimalPlaces);
  return `${value.toFixed(decimals)}${unit}`;
}

// Format money (cents to dollars)
export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Parse money string to cents
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[$,]/g, '');
  const dollars = parseFloat(cleaned) || 0;
  return Math.round(dollars * 100);
}

// Unit display names
export const UNIT_LABELS: Record<WeightUnit, string> = {
  g: 'grams',
  kg: 'kilograms',
  oz: 'ounces',
  lb: 'pounds',
};

// Format date for display
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format date/time for display
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Format relative time
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(timestamp);
}

// Get due date (default days from now)
export function getDefaultDueDate(daysFromNow: number): number {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}
