// Derive 4 weekly G&A "buckets" from OPEX_SUBSCRIPTIONS by billingDate.
// Excel mirrors this with OPEX!O5..O8 — one bucket per week-of-month based on
// when each subscription bills.
//
//   bucket 0 → days 1..7   (1st week of month)
//   bucket 1 → days 8..14  (2nd week)
//   bucket 2 → days 15..22 (3rd week)
//   bucket 3 → days 23..31 (4th week)

export function getWeeklyBucket(dayOfMonth) {
  if (dayOfMonth <= 7) return 0;
  if (dayOfMonth <= 14) return 1;
  if (dayOfMonth <= 22) return 2;
  return 3;
}

/** Sums active subscription costs into 4 weekly buckets keyed by billingDate. */
export function buildOpexBuckets(subscriptions) {
  const buckets = [0, 0, 0, 0];
  for (const sub of subscriptions) {
    if (!sub.active) continue;
    if (sub.billingDate == null) continue;
    const i = getWeeklyBucket(sub.billingDate);
    buckets[i] += sub.cost || 0;
  }
  return buckets;
}

/** Returns this week's G&A bucket value given a Monday date and the buckets array. */
export function gaForWeek(mondayDate, buckets) {
  const day = new Date(mondayDate + 'T00:00:00').getDate();
  return buckets[getWeeklyBucket(day)];
}
