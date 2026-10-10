/* Shared creator helpers — profile completion + live state.
   Moved out of DashboardPage.jsx so ProfilePageH (and others) don't
   import from a sibling page module. */

export function completionItems(creator) {
  const c = creator || {};
  const prices = c.prices || {};
  const igUsername = c.instagram?.username || c.instagram?.userName || '';
  return [
    { key: 'name', label: 'Display name', done: !!(c.name && c.name.trim()) },
    { key: 'handle', label: 'Creator handle', done: !!((c.handle && c.handleLower) || igUsername) },
    { key: 'bio', label: 'Bio', done: !!(c.bio && c.bio.trim().length >= 10) },
    { key: 'platform', label: 'Platform', done: !!c.platform },
    { key: 'niche', label: 'Niche', done: !!c.niche },
    { key: 'city', label: 'City', done: !!c.city },
    { key: 'price', label: 'At least one rate-card price', done: Object.values(prices).some((v) => Number(v) > 0) },
  ];
}

export function completionPct(creator) {
  const items = completionItems(creator);
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

export function isLive(creator) {
  if (!creator) return false;
  // All creators follow the same manual admin-review gate. Instagram is optional.
  return !!(creator.verified && creator.addedToCollancer);
}
