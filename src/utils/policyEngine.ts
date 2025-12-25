import type { CustomerTagRecord, Settings } from '../types';

export type PolicyTier = 'NORMAL' | 'OVER_TYPICAL' | 'LATE' | 'DO_NOT_ADVANCE';

export interface PolicyResult {
  tier: PolicyTier;
  holdbackPct: number;
  depositMinPct: number;
  canAdvance: boolean;
  tierReason: string;
}

export interface DeliverNowResult {
  deliverNowGrams: number;
  deliverNowUnits: number;
  withheldGrams: number;
  withheldUnits: number;
  depositMinCents: number;
  meetsDepositMin: boolean;
}

// Determine the active policy tier
export function determinePolicy(
  tags: CustomerTagRecord[],
  isOverTypical: boolean,
  settings: Settings
): PolicyResult {
  const now = Date.now();
  const activeTags = tags.filter(
    (t) => !t.expiresAt || t.expiresAt > now
  );

  // Priority 1: DO_NOT_ADVANCE
  if (activeTags.some((t) => t.tag === 'DO_NOT_ADVANCE')) {
    return {
      tier: 'DO_NOT_ADVANCE',
      holdbackPct: 1.0, // 100% holdback = no advance
      depositMinPct: 1.0, // Must pay full
      canAdvance: false,
      tierReason: 'Customer marked as Do Not Advance',
    };
  }

  // Priority 2: LATE
  if (activeTags.some((t) => t.tag === 'LATE')) {
    return {
      tier: 'LATE',
      holdbackPct: settings.holdbackPctLate,
      depositMinPct: settings.depositMinPctLate,
      canAdvance: true,
      tierReason: 'Customer has overdue balance',
    };
  }

  // Priority 3: Over typical
  if (isOverTypical) {
    return {
      tier: 'OVER_TYPICAL',
      holdbackPct: settings.holdbackPctOverTypical,
      depositMinPct: settings.depositMinPctOverTypical,
      canAdvance: true,
      tierReason: 'Order exceeds typical amount',
    };
  }

  // Default: Normal
  return {
    tier: 'NORMAL',
    holdbackPct: settings.holdbackPctNormal,
    depositMinPct: settings.depositMinPctNormal,
    canAdvance: true,
    tierReason: 'Standard terms',
  };
}

// Compute deliver-now amount based on payment and policy
export function computeDeliverNow(
  paidNowCents: number,
  orderSubtotalCents: number,
  requestedGrams: number,
  requestedUnits: number,
  pricePerGramCents: number | undefined,
  pricePerUnitCents: number | undefined,
  policy: PolicyResult
): DeliverNowResult {
  const depositMinCents = Math.ceil(orderSubtotalCents * policy.depositMinPct);
  const meetsDepositMin = paidNowCents >= depositMinCents;

  // If can't advance, deliver nothing
  if (!policy.canAdvance) {
    return {
      deliverNowGrams: 0,
      deliverNowUnits: 0,
      withheldGrams: requestedGrams,
      withheldUnits: requestedUnits,
      depositMinCents,
      meetsDepositMin,
    };
  }

  // Calculate effective paid after holdback
  const effectivePaidCents = Math.floor(paidNowCents * (1 - policy.holdbackPct));

  let deliverNowGrams = 0;
  let deliverNowUnits = 0;

  // Weight-based calculation
  if (pricePerGramCents && pricePerGramCents > 0 && requestedGrams > 0) {
    const rawGrams = effectivePaidCents / pricePerGramCents;
    deliverNowGrams = Math.min(rawGrams, requestedGrams);
  }

  // Unit-based calculation
  if (pricePerUnitCents && pricePerUnitCents > 0 && requestedUnits > 0) {
    const rawUnits = effectivePaidCents / pricePerUnitCents;
    deliverNowUnits = Math.min(rawUnits, requestedUnits);
  }

  // Calculate withheld amounts
  let withheldGrams = 0;
  let withheldUnits = 0;

  if (pricePerGramCents && pricePerGramCents > 0) {
    const rawCoveredGrams = paidNowCents / pricePerGramCents;
    withheldGrams = Math.max(0, rawCoveredGrams - deliverNowGrams);
  }

  if (pricePerUnitCents && pricePerUnitCents > 0) {
    const rawCoveredUnits = paidNowCents / pricePerUnitCents;
    withheldUnits = Math.max(0, rawCoveredUnits - deliverNowUnits);
  }

  return {
    deliverNowGrams,
    deliverNowUnits,
    withheldGrams,
    withheldUnits,
    depositMinCents,
    meetsDepositMin,
  };
}

// Get policy tier display info
export function getPolicyTierDisplay(tier: PolicyTier): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (tier) {
    case 'DO_NOT_ADVANCE':
      return {
        label: 'No Advance',
        color: 'text-red-700',
        bgColor: 'bg-red-100',
      };
    case 'LATE':
      return {
        label: 'Late',
        color: 'text-orange-700',
        bgColor: 'bg-orange-100',
      };
    case 'OVER_TYPICAL':
      return {
        label: 'Over Typical',
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-100',
      };
    case 'NORMAL':
      return {
        label: 'Normal',
        color: 'text-green-700',
        bgColor: 'bg-green-100',
      };
  }
}
