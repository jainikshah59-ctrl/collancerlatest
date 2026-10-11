/* Business role shared context — avoids prop-drilling across business pages.
   Provided by BusinessApp; consumed via useBiz(). */
import React, { createContext, useContext } from 'react';

export const BizContext = createContext(null);

export function useBiz() {
  const ctx = useContext(BizContext);
  if (!ctx) throw new Error('useBiz must be used inside BizContext.Provider');
  return ctx;
}

export function BizProvider({ value, children }) {
  return <BizContext.Provider value={value}>{children}</BizContext.Provider>;
}

/** Firestore Timestamp | Date | number -> ms epoch. */
export function tsMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds) return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Is the business currently Pro (flag on and not expired)? */
export function isBizPro(biz) {
  if (!biz) return false;
  const active = biz.isPro && biz.proActive;
  if (!active) return false;
  const exp = tsMs(biz.proExpiresAt);
  if (exp && exp < Date.now()) return false;
  return true;
}
