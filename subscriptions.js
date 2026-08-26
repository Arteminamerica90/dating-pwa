export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    price: 0,
    period: null,
    features: {
      maxLikesPerMonth: 100,
      canUseFilters: false,
      canSuperLike: false,
      canSeeWhoLiked: false,
      canPromote: false,
      maxIncomeFilter: 50000
    }
  },
  standard: {
    id: 'standard',
    label: 'Стандарт',
    price: 299,
    priceFormatted: '299 ₽/мес',
    period: 'month',
    features: {
      maxLikesPerMonth: -1,
      canUseFilters: true,
      canSuperLike: true,
      canSeeWhoLiked: false,
      canPromote: false,
      maxIncomeFilter: 200000
    }
  },
  premium: {
    id: 'premium',
    label: 'Премиум',
    price: 999,
    priceFormatted: '999 ₽/мес',
    period: 'month',
    features: {
      maxLikesPerMonth: -1,
      canUseFilters: true,
      canSuperLike: true,
      canSeeWhoLiked: true,
      canPromote: true,
      maxIncomeFilter: 1000000
    }
  },
  vip: {
    id: 'vip',
    label: 'VIP',
    price: 2999,
    priceFormatted: '2 999 ₽/мес',
    period: 'month',
    features: {
      maxLikesPerMonth: -1,
      canUseFilters: true,
      canSuperLike: true,
      canSeeWhoLiked: true,
      canPromote: true,
      maxIncomeFilter: -1
    }
  }
};

export const INCOME_ADDONS = [
  { id: 'income_200k', label: 'Доход 200к+', minIncome: 200000, price: 199, priceFormatted: '199 ₽' },
  { id: 'income_500k', label: 'Доход 500к+', minIncome: 500000, price: 499, priceFormatted: '499 ₽' },
  { id: 'income_1m',   label: 'Доход 1М+',   minIncome: 1000000, price: 999, priceFormatted: '999 ₽' },
  { id: 'income_5m',   label: 'Доход 5М+',   minIncome: 5000000, price: 2999, priceFormatted: '2 999 ₽' }
];

export function getActivePlanId(sub) {
  if (!sub || !sub.planId) return 'free';
  const plan = PLANS[sub.planId];
  if (!plan) return 'free';
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return 'free';
  return sub.planId;
}

export function getActivePlan(sub) {
  return PLANS[getActivePlanId(sub)] || PLANS.free;
}

export function getFeatures(sub) {
  return getActivePlan(sub).features;
}

export function canLike(sub) {
  const f = getFeatures(sub);
  if (f.maxLikesPerMonth < 0) return true;
  const used = sub?.likesThisMonth || 0;
  return used < f.maxLikesPerMonth;
}

export function likesLeft(sub) {
  const f = getFeatures(sub);
  if (f.maxLikesPerMonth < 0) return Infinity;
  return Math.max(0, f.maxLikesPerMonth - (sub?.likesThisMonth || 0));
}

export function hasIncomeAccess(sub, incomeThreshold) {
  if (!incomeThreshold || incomeThreshold <= 50000) return true;
  const f = getFeatures(sub);
  if (f.maxIncomeFilter < 0) return true;
  if (f.maxIncomeFilter >= incomeThreshold) return true;
  if (sub?.incomeAddons) {
    return sub.incomeAddons.some((a) => {
      const addon = INCOME_ADDONS.find((x) => x.id === a);
      return addon && incomeThreshold <= addon.minIncome;
    });
  }
  return false;
}

export function maxIncomeForPlan(sub) {
  const plan = getActivePlan(sub);
  let max = plan.features.maxIncomeFilter;
  if (sub?.incomeAddons) {
    for (const a of sub.incomeAddons) {
      const addon = INCOME_ADDONS.find((x) => x.id === a);
      if (addon && (max < 0 || addon.minIncome > max)) max = addon.minIncome;
    }
  }
  return max;
}

export function checkPaywall(sub, feature) {
  const f = getFeatures(sub);
  switch (feature) {
    case 'likes':
      return f.maxLikesPerMonth >= 0 && (sub?.likesThisMonth || 0) >= f.maxLikesPerMonth;
    case 'filters':
      return !f.canUseFilters;
    case 'superLike':
      return !f.canSuperLike;
    case 'seeWhoLiked':
      return !f.canSeeWhoLiked;
    case 'promote':
      return !f.canPromote;
    default:
      return false;
  }
}

export function incrementLikes(sub) {
  if (!sub) sub = {};
  sub.likesThisMonth = (sub.likesThisMonth || 0) + 1;
  return sub;
}

export function resetMonthlyLikes(sub) {
  if (!sub) sub = {};
  sub.likesThisMonth = 0;
  sub.likesResetAt = new Date().toISOString();
  return sub;
}

export function nextPlanUpgrade(currentPlanId) {
  const order = ['free', 'standard', 'premium', 'vip'];
  const idx = order.indexOf(currentPlanId);
  if (idx < 0 || idx >= order.length - 1) return null;
  return PLANS[order[idx + 1]];
}

export function renderPlanBadge(sub) {
  const planId = getActivePlanId(sub);
  if (planId === 'free') return '';
  const plan = PLANS[planId];
  return `<span class="pill" style="background:linear-gradient(135deg,#b8860b,#ffd700);color:#000;font-weight:700">${plan.label}</span>`;
}
