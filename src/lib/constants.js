/* Domain constants — plans, categories, promo types, statuses. */

export const TAGLINE = 'WHERE INFLUENCE MEETS INDUSTRY';

/* Receiving UPI ID for manual wallet deposits (placeholder — replace with real Collancer UPI ID). */
export const COLLANCER_UPI_ID = 'collancer@upi';

export const PLATFORM_FEE_PCT = 12; // % added on creator price (brand side)
export const PRO_DISCOUNT_PCT = 5;  // % business-Pro discount on creator price
export const CREATOR_SHARE_PCT = 93; // % of creatorPrice the creator earns (7% platform cut)
export const MIN_FOLLOWERS = 10000;
export const MIN_PAYOUT = 100;
export const MIN_DEPOSIT = 100;

export const BUSINESS_PRO_PLANS = [
  { id: 'monthly', label: 'Monthly', months: 1, perMonth: 799, total: 799, tag: null },
  { id: 'halfyearly', label: '6 Months', months: 6, perMonth: 649, total: 3894, tag: 'Save 19%' },
  { id: 'annual', label: 'Annual', months: 12, perMonth: 499, total: 5988, tag: 'Best value' },
];

export const CREATOR_PRO_PLANS = [
  { id: 'monthly', label: 'Monthly', days: 30, total: 599, tag: null },
  { id: 'quarterly', label: 'Quarterly', days: 90, total: 1499, tag: 'Save 17%' },
  { id: 'yearly', label: 'Yearly', days: 365, total: 4999, tag: 'Best value' },
];

export const AD_PLANS = [
  { id: 'ad1', days: 1, price: 249 },
  { id: 'ad2', days: 2, price: 449 },
  { id: 'ad3', days: 3, price: 649 },
  { id: 'ad4', days: 4, price: 799 },
  { id: 'ad5', days: 5, price: 999 },
  { id: 'ad6', days: 6, price: 1199 },
  { id: 'ad7', days: 7, price: 1399 },
];

/* Paid promotion package keys (business booking + creator rate card). */
export const PROMO_TYPES = [
  { key: 'story', label: 'Instagram Story', desc: '24-hr story with swipe-up/link' },
  { key: 'reel', label: 'Instagram Reel', desc: 'Short-form video post' },
  { key: 'video', label: 'Video Post', desc: 'In-feed video collaboration' },
  { key: 'personalvideo', label: 'Personal Video', desc: 'Personalized video shoutout' },
  { key: 'personalad', label: 'Personal Ad Shoot', desc: 'Premium dedicated ad shoot' },
  { key: 'ytshorts', label: 'YouTube Short', desc: 'Short-form YouTube video' },
];

export const promoLabel = (key) => (PROMO_TYPES.find((p) => p.key === key) || {}).label || key;

export const CATEGORIES = [
  'Fashion', 'Beauty', 'Fitness', 'Food', 'Travel', 'Tech', 'Lifestyle',
  'Finance', 'Education', 'Gaming', 'Health', 'Home', 'Automobile', 'Parenting',
];

export const NICHES = CATEGORIES;

export const PLATFORMS = ['Instagram', 'YouTube', 'Both'];

export const CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata',
  'Jaipur', 'Pune', 'Kochi', 'Ahmedabad', 'Rajkot', 'Surat', 'Vadodara', 'Other',
];

export const BOOKING_STATUS = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  PENDING_COMPLETION: 'PendingCompletion',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
};

export const DEMO_TYPES = ['Product Review', 'Unboxing', 'Tutorial', 'Lifestyle Vlog', 'Ad Shoot', 'Testimonial'];
export const DEMO_FORMATS = ['Video', 'Image'];
export const MAX_DEMO_UPLOADS = 6;

export const INDUSTRIES = [
  'Fashion & Apparel', 'Beauty & Cosmetics', 'Food & Beverage', 'Technology',
  'Health & Fitness', 'Travel & Hospitality', 'Finance', 'Education',
  'Real Estate', 'Automobile', 'Home & Living', 'Other',
];

/** Pricing math for a paid booking. Returns { creatorPrice, fee, discount, total }. */
export function priceBreakup(creatorPrice, isPro) {
  const fee = Math.round((creatorPrice * PLATFORM_FEE_PCT) / 100);
  const discount = isPro ? Math.round((creatorPrice * PRO_DISCOUNT_PCT) / 100) : 0;
  const total = creatorPrice + fee - discount;
  return { creatorPrice, fee, discount, total };
}

/** Creator's 95% share. */
export function creatorShareOf(booking) {
  const base = Number(booking.creatorPrice ?? booking.amount ?? 0);
  return Math.round((base * CREATOR_SHARE_PCT) / 100);
}
