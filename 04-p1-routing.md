# 04 · P1 · Routing — new hash routes + backwards compatibility

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 03 merged.

## Goal
Update `src/utils/plmRouting.js` to support new IA. Old routes redirect, no broken bookmarks.

## Steps

1. Add new hash routes:
   - `#plm/library/patterns`
   - `#plm/library/fabrics`
   - `#plm/library/colors`
   - `#plm/library/trims`
   - `#plm/library/treatments`
   - `#plm/library/embellishments`
   - `#plm/library/vendors`
   - `#plm/styles`
   - `#plm/styles/:id`
   - `#plm/production`
   - `#plm/production/:poId`

2. Add backwards compatibility redirects:
   - `#plm/colors` → `#plm/library/colors`
   - `#plm/trims` → `#plm/library/trims`
   - `#plm/factories` → `#plm/library/vendors`
   - Any other old route → corresponding new route

3. Wire the routes to actually navigate to the right component within `PLMView.jsx`. Clicking a Library sub-tab updates the hash. Reloading the page on a deep route lands on the right tab.

4. Default landing route: `#plm/library/colors` (we have data there) or `#plm/library/patterns` (empty stub) — your call. Pick one and document the choice in a comment.

## Acceptance

- Visit `#plm/library/treatments` directly in the URL bar → page loads on Treatments tab.
- Visit `#plm/factories` → automatically redirected to `#plm/library/vendors`, no broken state.
- Visit `#plm/trims` → redirected to `#plm/library/trims`.
- All seven Library sub-tabs are reachable by URL.
- Browser back/forward buttons work.

## Stop after

Commit message: `feat(plm): add hash routing for library/styles/production with legacy redirects`. Push. Done.

**P1 (Foundation) is now complete.** Verify in browser before starting P2.
