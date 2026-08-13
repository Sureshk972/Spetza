# Testimonial Refresh System

## Problem

The Spetza welcome page shows hardcoded testimonials. Repeat visitors see the same names and quotes every time. The dates already auto-compute relative to today, so they never look stale — but the content does.

## Solution

Expand the testimonial pool from 12 to ~30 entries. Use a deterministic week-number seed to select which 12 to display, rotating automatically every ~7 days. No database, no cron, no edge function.

## Changes

**Single file:** `/src/pages/Welcome.jsx`

### 1. Expand TESTIMONIALS array to ~30 entries

Content direction:
- **Courier quotes** lead with tangible earnings and flexibility ("$80 on my commute", "three pickups between meetings")
- **Sender quotes** lead with speed and convenience ("faster than any shipping service", "no lines, no depots")
- Roughly equal mix of sender and courier entries

### 2. Add seeded shuffle function

```js
function seededShuffle(arr, seed) {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647
    const j = s % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
```

Uses a linear congruential generator seeded by week number — deterministic, no external dependency.

### 3. Compute weekly selection

```js
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const weekNumber = Math.floor(Date.now() / WEEK_MS)
const weeklyTestimonials = seededShuffle(TESTIMONIALS, weekNumber).slice(0, 12)
```

Everyone sees the same 12 testimonials during the same week. The first 3 are shown by default; "See all reviews" reveals all 12.

### 4. Guarantee role mix

After selecting 12, verify at least 3 of each role (sender/courier) are present. If not, swap from the remainder of the shuffled pool. Ensures every rotation has a balanced mix.

## What stays the same

- `daysAgo` field and `reviewDate()` function — dates continue to auto-compute
- `Stars` component — all testimonials remain 5 stars
- "See all reviews" toggle behavior
- Visual layout and styling

## Out of scope

- Database-backed testimonials (future: pull from `ratings` table when real reviews exist)
- Per-role segmentation (mixed is intentional — sender quotes signal demand to couriers, courier quotes signal supply to senders)
- Any UI/layout changes
