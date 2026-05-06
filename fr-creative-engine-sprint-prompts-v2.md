# FR Creative Engine — Sprint Prompts (v0)

**Branch:** `feature/creative-engine-v0`
**Module location:** `src/modules/creative/`
**Route:** `/creative`
**Total chunks:** 27
**Estimated calendar time:** 2 weeks at 2-3 chunks/day
**Session model:** Fresh chat per chunk, Sonnet 4.6 default, escalate to Opus only on architectural decisions
**Design reference:** `docs/mockups/creative-engine-v5.html` — V5 is the final locked design

---

## OVERVIEW

The Creative Engine is the first agent layer of cashmodel. It runs the 4-week creative testing sprint defined in the diagram (Constraint → Hypothesis → Sprint Goal → Brief → Production → Encoder → Testing → Evaluation → Kill/Scale → Learning).

It compounds creative knowledge the same way PLM compounds physical product knowledge: every sprint writes back to a structured learnings database. Every brief generated queries that database before the LLM call. The system gets smarter every sprint because the context gets richer — not because the model changes.

**Four-layer intelligence architecture:**
```
Layer 1: Knowledge Files     → static brand context (Avatar, Brand, Product, Models)
Layer 2: Learnings table     → structured outcomes from every closed sprint
Layer 3: Visual attributes   → image tags tied to CPA performance (Phase 2)
Layer 4: Discussion logs     → how Matias refined weekly syntheses over time
```

**Sprint lifecycle:**
```
Constraint → Hypothesis → Brief (agent) → Approve (human)
→ Render (agent) → Approve (human)
→ Meta upload (agent, PAUSED) → Launch (human, first 4 sprints)
→ Evaluate daily (agent) → Kill or Scale rec (agent, human executes)
→ Weekly synthesis (agent) → Discuss (human) → Learning banked
→ Next sprint seeded → repeat
```

**Four lanes:**
- `ai` → fal.ai Nano Banana 2 (stills + video)
- `high_production` → Higgsfield Marketing Studio
- `creator` → Higgsfield Soul Character (creator-trained) + brief auto-sent
- `founder` → Higgsfield Soul Character (Matias soul) or real footage

**External services:**
- Claude API (brief generation with learnings injection, evaluation reasoning, weekly synthesis)
- fal.ai (Nano Banana 2 stills, video)
- Higgsfield (Soul Characters, Marketing Studio)
- Meta Marketing API (paused ad creation, daily metrics pull, kill/scale execution)
- Slack (Today briefing, approval buttons, daily digest, weekly synthesis draft)
- FFmpeg / Transloadit (encoder pass — strip metadata, normalize for Meta)

**Existing patterns to reuse:**
- Supabase + RLS — same as PLM
- Clerk auth — same as PLM
- Vite/React/Tailwind — same as PLM
- Zustand stores — same pattern as `treatmentStore`
- Edge functions — same pattern as PLM writeback

---

## PRE-FLIGHT (do before Chunk 01)

**1. Branch creation:**
```bash
git checkout main
git pull
git checkout -b feature/creative-engine-v0
```

**2. Copy design reference:**
```bash
mkdir -p docs/mockups
# Copy creative-engine-v5.html to docs/mockups/creative-engine-v5.html
# This is the locked V5 design — all UI must match it exactly
```

**3. CLAUDE.md addendum** — append a `## Creative Module Conventions` section:

```markdown
## Creative Module Conventions

Module path: `src/modules/creative/`
Route: `/creative`
Design reference: `docs/mockups/creative-engine-v5.html` — match exactly

**Sub-routes:**
- `/creative` → Today view (default landing)
- `/creative/knowledge` → Knowledge Files
- `/creative/pulse` → System Pulse
- `/creative/sprints` → Kanban board
- `/creative/brief/:id` → Brief detail + approval
- `/creative/jobs` → Job Queue
- `/creative/production` → Active production by lane
- `/creative/queue` → Render approval queue
- `/creative/ads` → Live Ads dashboard
- `/creative/library` → Competitor + Inspiration library
- `/creative/learnings` → Learning archive

**Tables:**
sprints, briefs, renders, ads, metrics_daily, learnings, discussions, budget_config, creative_library

**Stores:**
creativeStore (split): useSprintStore, useBriefStore, useRenderStore, useAdStore, useLearningStore, useJobStore

**Edge functions:**
generate-brief, dispatch-render, encoder-pass, upload-meta-ad, evaluate-daily, synthesize-weekly, slack-actions

**Enums:**
Lane: 'ai' | 'creator' | 'founder' | 'high_production'
SprintStatus: 'drafting' | 'brief_ready' | 'rendering' | 'in_queue' | 'live' | 'evaluating' | 'closed'
RenderStatus: 'pending' | 'rendering' | 'complete' | 'encoding' | 'encoded' | 'approved' | 'rejected'
AdStatus: 'paused' | 'live' | 'killed' | 'scaled'

**Naming convention for ads in Meta:** `S{sprint}_{lane}_{hypothesis-slug}_v{n}`
All Meta ads created in PAUSED state. Human launches manually for first 4 sprints.

**Budget guardrail:** `budget_config` table stores weekly_cap. Agent checks remaining budget before dispatching any new render or Meta upload. At 90% of weekly cap, agent pauses new launches and posts Slack alert.

**Knowledge files location:** `src/modules/creative/knowledge/`
Avatar, Brand, Product, Models as separate markdown files. `getKnowledgeForLane(lane)` returns correct subset.

**Past learnings injection:** Before every `generate-brief` call, query learnings table for:
- Winning patterns that apply to this lane
- Losing patterns that match this hypothesis type
- Inject structured summary into Claude API prompt as `past_learnings_context`
```

**4. Environment variables** — add to `.env.local`:
```
VITE_FAL_API_KEY=
VITE_HIGGSFIELD_API_KEY=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
SLACK_WEBHOOK_URL=
SLACK_BOT_TOKEN=
ANTHROPIC_API_KEY=
```

**5. Knowledge file links** — confirm these context files are accessible:
- `Customer Avatar` (four avatars: Destination Designer, Borderless Basic, Technical Traveler, Dream Lifestyle)
- `Brand Guidelines V3`
- `FR Master Context`
- `Product Strategy` (hero: Snowflake Staple Hoodie, $117, Aug 1 launch)

Mirror to `src/modules/creative/knowledge/` as markdown if they're in Notion.

---

## PHASE 1 — FOUNDATION (Chunks 01-06)

Goal: schema, types, route, store skeleton, design reference. No business logic yet.

---

### Chunk 01 — Supabase Schema + RLS

**Branch:** `feature/creative-engine-v0`
**Estimated session:** 45 min

**Deliverables:**
- Migration file: `supabase/migrations/{timestamp}_creative_schema.sql`

**Schema:**
```sql
-- Core sprint tables
sprints (
  id uuid PK,
  sprint_number integer UNIQUE NOT NULL,
  constraint_text text NOT NULL,
  hypothesis text NOT NULL,
  sprint_goal text,
  lane text NOT NULL CHECK (lane IN ('ai','creator','founder','high_production')),
  status text NOT NULL DEFAULT 'drafting',
  started_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  learning_summary text,
  updated_at timestamptz DEFAULT now()
)

briefs (
  id uuid PK,
  sprint_id uuid FK → sprints,
  lane text NOT NULL,
  brief_content jsonb NOT NULL,  -- {hook, payoff, shot_list, caption, success_metrics}
  knowledge_refs jsonb,          -- which knowledge files were used
  past_learnings_consulted jsonb, -- learnings injected before generation
  prompt_blueprint text,         -- production-ready prompt for render dispatch
  version integer DEFAULT 1,
  approval_state text DEFAULT 'pending',  -- pending | approved | rejected
  approved_at timestamptz,
  updated_at timestamptz DEFAULT now()
)

renders (
  id uuid PK,
  brief_id uuid FK → briefs,
  sprint_id uuid FK → sprints,
  source text NOT NULL,          -- 'fal' | 'higgsfield_marketing' | 'higgsfield_soul'
  asset_url text,
  encoded_url text,
  encoder_passed boolean DEFAULT false,
  status text DEFAULT 'pending', -- pending | rendering | complete | encoding | encoded | approved | rejected
  metadata jsonb,
  updated_at timestamptz DEFAULT now()
)

ads (
  id uuid PK,
  render_id uuid FK → renders,
  sprint_id uuid FK → sprints,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  status text DEFAULT 'paused',
  naming text NOT NULL,          -- S{n}_{lane}_{slug}_v{n}
  utms jsonb,
  recommendation text,           -- 'kill' | 'scale' | 'watch' | null
  launched_at timestamptz,
  killed_at timestamptz,
  updated_at timestamptz DEFAULT now()
)

metrics_daily (
  id uuid PK,
  ad_id uuid FK → ads,
  date date NOT NULL,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  spend numeric(10,2) DEFAULT 0,
  conversions integer DEFAULT 0,
  ctr numeric(6,4),
  cpa numeric(10,2),
  roas numeric(6,2),
  UNIQUE(ad_id, date)
)

learnings (
  id uuid PK,
  sprint_id uuid FK → sprints,
  sprint_number integer NOT NULL,
  lane text NOT NULL,
  outcome text NOT NULL,                   -- 'winner' | 'losing'
  final_cpa numeric(10,2),
  hypothesis_tested text NOT NULL,
  principle_won text,                      -- concise learning for winners
  principle_lost text,                     -- concise learning for losers
  visual_tags_winning jsonb,               -- ['handheld','golden_hour',...]
  visual_tags_losing jsonb,
  brand_filter_match boolean,              -- did it pass "makes someone want to travel"
  applies_to jsonb,                        -- ['creator_lane','founder_lane']
  does_not_apply_to jsonb,
  discussion_log_ref uuid,                 -- FK → discussions
  finalized_at timestamptz DEFAULT now()
)

discussions (
  id uuid PK,
  learning_id uuid FK → learnings,
  sprint_id uuid FK → sprints,
  synthesis_draft text NOT NULL,           -- agent's initial synthesis
  discussion_turns jsonb DEFAULT '[]',     -- [{role, content, timestamp}]
  final_learning_text text,                -- committed after discussion
  finalized boolean DEFAULT false,
  finalized_at timestamptz,
  created_at timestamptz DEFAULT now()
)

-- Budget guardrail
budget_config (
  id uuid PK,
  weekly_cap numeric(10,2) NOT NULL DEFAULT 2000.00,
  alert_threshold numeric(4,2) DEFAULT 0.90,  -- pause at 90% of cap
  updated_at timestamptz DEFAULT now()
)

-- Creative library (competitor + inspiration)
creative_library (
  id uuid PK,
  source_url text,
  platform text,                   -- 'instagram' | 'facebook_ad_library' | 'pinterest' | 'tiktok'
  brand text,
  folder text,
  tags jsonb DEFAULT '[]',
  sprint_link uuid,                -- optional FK → sprints
  asset_type text,                 -- 'image' | 'video'
  thumbnail_url text,
  notes text,
  saved_at timestamptz DEFAULT now()
)
```

**RLS:**
- Admin role: full access to all tables
- Standard user: read-only on all tables
- Service role (edge functions): write access to all tables

**Triggers:**
- `updated_at` auto-update on all tables that have it
- `budget_config` seed: insert one row with `weekly_cap = 2000.00`

**Acceptance:**
- [ ] Migration runs cleanly on local Supabase
- [ ] RLS verified with two test users
- [ ] All FKs cascade correctly
- [ ] `budget_config` has exactly one seeded row

**Commit:** `feat(creative): supabase schema + RLS`

---

### Chunk 02 — TypeScript Types + Zod Schemas

**Estimated session:** 30 min

**Deliverables:**
- `src/modules/creative/types.ts` — TS interfaces matching DB schema exactly
- `src/modules/creative/schemas.ts` — Zod schemas for runtime validation
- Enum types: `Lane`, `SprintStatus`, `RenderStatus`, `AdStatus`
- Type-safe helpers: `isValidLane`, `parseSprintStatus`, `buildAdNaming`

**Acceptance:**
- [ ] All types compile with zero `any`
- [ ] Zod schemas validate against test DB rows
- [ ] `buildAdNaming(sprint, lane, hypothesis)` returns correctly formatted string

**Commit:** `feat(creative): types + zod schemas`

---

### Chunk 03 — Route + Sidebar Nav

**Estimated session:** 25 min

**Deliverables:**
- `/creative` top-level route added to router → renders `CreativeShell.tsx`
- Sub-routes registered: today, knowledge, pulse, sprints, brief/:id, jobs, production, queue, ads, library, learnings
- Sidebar nav item with `Sparkles` icon
- `CreativeShell.tsx` — header + metric strip + tabs component, empty view placeholders
- Default route: `/creative` → Today view

**Design reference:** V5 header, metric strip layout, tab bar exactly as in mockup

**Acceptance:**
- [ ] All routes navigate correctly with no console errors
- [ ] Sidebar highlights when on `/creative/*`
- [ ] Tabs switch views correctly, Today is default

**Commit:** `feat(creative): routing + nav shell`

---

### Chunk 04 — Zustand Stores + Seed Data

**Estimated session:** 45 min

**Deliverables:**
- `src/modules/creative/stores/sprintStore.ts` (Zustand, mirrors `treatmentStore` pattern)
- `src/modules/creative/stores/briefStore.ts`
- `src/modules/creative/stores/renderStore.ts`
- `src/modules/creative/stores/adStore.ts`
- `src/modules/creative/stores/learningStore.ts`
- `src/modules/creative/stores/jobStore.ts` — aggregates active jobs from all other stores for Job Queue view
- `src/modules/creative/seed.ts` — 3 dummy sprints (one closed/winner, one live, one at brief-ready), 18 seeded learnings (12 W + 6 L)

**Acceptance:**
- [ ] All stores hydrate from Supabase on mount
- [ ] Seed runs cleanly, all UI views populate
- [ ] `jobStore` correctly derives from other stores

**Commit:** `feat(creative): stores + seed data`

---

### Chunk 05 — Knowledge Files + Lane Routing

**Estimated session:** 35 min

**Deliverables:**
- `src/modules/creative/knowledge/` directory:
  - `avatar.md` — all four avatars (Destination Designer, Borderless Basic, Technical Traveler, Dream Lifestyle)
  - `brand.md` — Brand Guidelines V3 summary (tone, visual system, mission, never-do list)
  - `product.md` — Hero product spec (Snowflake Staple, $117, colorways, features, Aug 1 launch)
  - `models.md` — fal NB2 config, Higgsfield presets, Soul IDs, negative prompts
- `src/modules/creative/knowledge/index.ts`:
  - `getKnowledgeForLane(lane: Lane): KnowledgeContext` — returns correct subset per lane routing matrix
  - Lane routing: AI/High Prod use all 4; Creator/Founder use Avatar + Brand + Product only (no Models)
- Knowledge Files view wired to display file content + lane routing matrix from V5 design

**Acceptance:**
- [ ] Knowledge Files view renders exactly as V5 mockup (banner, routing grid, 2×2 cards)
- [ ] `getKnowledgeForLane('creator')` correctly excludes Models file
- [ ] Update timestamps visible in UI

**Commit:** `feat(creative): knowledge files + lane routing`

---

### Chunk 06 — Today View (Agent Daily Briefing)

**Estimated session:** 45 min

**Deliverables:**
- `src/modules/creative/views/TodayView.tsx`
- Three sections from V5 design:
  1. **Decisions needed** — derived from store state: briefs with `approval_state='pending'`, renders with `status='encoded'` awaiting approval, ads at kill threshold
  2. **Agent ran overnight · No action needed** — last 24h completed jobs from all stores
  3. **Budget · This week** — fetches `budget_config` weekly cap, computes current week spend from `metrics_daily`, renders progress bar
- Each decision item has a CTA that navigates to the correct view
- Kill threshold alert: any ad where `cpa > budget_config.kill_threshold * cpa_target` surfaces here in red

**Design reference:** V5 Today view exactly. Date is dynamic. Budget bar is live.

**Acceptance:**
- [ ] Decisions section populates from real store data
- [ ] Budget bar reflects current week's actual spend vs weekly cap
- [ ] Kill threshold alerts appear when CPA exceeds threshold
- [ ] All CTAs navigate correctly

**Commit:** `feat(creative): today view — agent daily briefing`

---

## PHASE 2 — BRIEF GENERATION (Chunks 07-11)

Goal: User can create a sprint, define constraint + hypothesis, and Claude auto-generates the brief with past learnings injected.

---

### Chunk 07 — Sprint List View + Create Flow

**Estimated session:** 45 min

**Deliverables:**
- `SprintList.tsx` at `/creative/sprints` — kanban from V5 design
- Columns: Drafting, Brief Ready, Rendering, In Queue, Live, Closed
- `NewSprintDialog.tsx` — form: sprint number (auto-incremented), constraint, hypothesis, lane selector
- Live sprint cards show CPA, ROAS, days live metrics
- Closed sprint cards show winner/loser badge

**Acceptance:**
- [ ] Create new sprint → appears in Drafting column
- [ ] Live sprint cards show metrics from `metrics_daily`
- [ ] Kanban matches V5 design exactly

**Commit:** `feat(creative): sprint kanban + create flow`

---

### Chunk 08 — Learnings Retrieval Query

**Estimated session:** 35 min

**Deliverables:**
- `src/modules/creative/lib/getLearningsForBrief.ts`:
  ```typescript
  async function getLearningsForBrief(
    lane: Lane,
    hypothesisType: string,
    limit = 8
  ): Promise<LearningsSummary>
  ```
  - Queries `learnings` table:
    - Winners: `WHERE outcome='winner' AND applies_to CONTAINS lane ORDER BY finalized_at DESC LIMIT {limit}`
    - Losers: `WHERE outcome='losing' AND hypothesis_tested SIMILAR TO hypothesisType LIMIT 4`
  - Returns structured summary: `{ winners: Learning[], losers: Learning[], count: number }`
- Unit test: `getLearningsForBrief('creator', 'hook')` returns seeded data correctly

**Note:** This function is called by `generate-brief` BEFORE the Claude API call. It's the mechanism by which the system gets smarter every sprint. Do not skip this chunk.

**Acceptance:**
- [ ] Function queries DB correctly, returns typed data
- [ ] Empty results handled gracefully (no learnings yet = no injection)
- [ ] Unit test passes

**Commit:** `feat(creative): learnings retrieval for brief injection`

---

### Chunk 09 — generate-brief Edge Function

**Estimated session:** 60 min — most complex chunk in Phase 2

**Deliverables:**
- `supabase/functions/generate-brief/index.ts` — Deno edge function
- Flow:
  1. Receive `sprint_id` trigger
  2. Fetch sprint row (constraint, hypothesis, lane)
  3. Call `getKnowledgeForLane(lane)` → knowledge context
  4. Call `getLearningsForBrief(lane, hypothesisType)` → past learnings context
  5. Build Claude API prompt with all context injected
  6. Call Claude API (claude-sonnet-4-6)
  7. Parse response JSON
  8. Write `briefs` row with `past_learnings_consulted` populated
  9. Post Slack message: "Brief ready for Sprint {n} · Tap to review" with [Open Brief] button

**Prompt template:**
```
You are the creative director for Foreign Resource Co., a travel lifestyle apparel brand.

BRAND CONTEXT:
{brand_knowledge}

CUSTOMER AVATAR FOR THIS LANE ({lane}):
{avatar_knowledge}

PRODUCT:
{product_knowledge}

CONSTRAINT: {constraint}
HYPOTHESIS: {hypothesis}
LANE: {lane}
SPRINT: {sprint_number}

PAST LEARNINGS — APPLY THESE BEFORE GENERATING:
Winners to reinforce:
{winners_formatted}

Losers to avoid:
{losers_formatted}

Generate a creative brief in JSON format:
{
  "hook": "first-frame hook line",
  "payoff": "brand payoff line",
  "shot_list": [{"n": 1, "title": "", "description": ""}],
  "caption": "ad caption text",
  "success_metrics": {"ctr_target": "", "cpa_target": "", "min_impressions": 100},
  "prompt_blueprint": "production-ready render prompt for {lane} lane"
}

The prompt_blueprint must be production-ready:
- AI lane: fal.ai Nano Banana 2 format with shot type, subject, clothing, mood, lighting, negative prompts
- High Production: Higgsfield Marketing Studio brief with preset, scene, product details
- Creator/Founder: Higgsfield Soul Character brief with scene, wardrobe, camera direction
```

**Acceptance:**
- [ ] Calling function with test sprint returns valid brief JSON in <30s
- [ ] `past_learnings_consulted` field in DB shows which learnings were used
- [ ] Slack message posts with [Open Brief] button
- [ ] Empty learnings handled gracefully

**Commit:** `feat(creative): generate-brief edge function`

---

### Chunk 10 — Brief Detail View + Approval UI

**Estimated session:** 45 min

**Deliverables:**
- `BriefDetail.tsx` at `/creative/brief/:id`
- Matches V5 brief view exactly:
  - Left rail: sprint list (active + recent)
  - Right: brief doc with crumbs, hypothesis, KF indicators, **Past Learnings Consulted block**, hook, payoff, shot list, caption, prompt blueprint
- Approve / Revise / Reject buttons
- Revise: opens inline edit on any field, creates new version on save (`version + 1`)
- Reject: sprint back to `drafting`

**Past Learnings Consulted block:** Reads `briefs.past_learnings_consulted` and renders each learning with sprint ref, ✓ or ✗ badge, and one-line explanation of how it was applied.

**Acceptance:**
- [ ] Past learnings block shows correctly for briefs that have learnings injected
- [ ] Brief revisions create new version rows (history preserved)
- [ ] Approval transitions sprint to `rendering` status

**Commit:** `feat(creative): brief detail + approval UI`

---

### Chunk 11 — System Pulse + Job Queue Views

**Estimated session:** 50 min

**Deliverables:**
- `SystemPulse.tsx` at `/creative/pulse`:
  - Pipeline diagram with stage nodes from V5 design
  - Stage counts derived from store state (not hardcoded)
  - Sprint table below pipeline
  - Activity feed (last 20 log entries from a new `activity_log` table or derived from store events)
- `JobQueue.tsx` at `/creative/jobs`:
  - Four sections from V5: Waiting on you · Agent running · Waiting on creator · Scheduled
  - "Waiting on you" pulls from: pending brief approvals, pending render approvals, ads at kill threshold
  - "Agent running" pulls from: active renders with `status='rendering'` or `status='encoding'`
  - "Waiting on creator" pulls from: creator lane renders with no footage submitted (no asset_url after 48h)
  - "Scheduled" shows next cron run times (hardcoded: 9:30am daily, Sunday 6pm weekly)
  - Progress bars on active renders (use metadata.progress if Higgsfield provides it)

**Acceptance:**
- [ ] Pipeline stage counts match store state
- [ ] Job Queue sections populate from real data
- [ ] Clicking items in either view navigates to correct action view

**Commit:** `feat(creative): system pulse + job queue views`

---

## PHASE 3 — PRODUCTION DISPATCH (Chunks 12-15)

Goal: Approved briefs auto-render via fal or Higgsfield, output queued for human approval.

---

### Chunk 12 — dispatch-render (fal.ai route)

**Estimated session:** 60 min

**Deliverables:**
- `supabase/functions/dispatch-render/index.ts`
- For `lane='ai'`:
  - Submit `brief.prompt_blueprint` to fal.ai Nano Banana 2
  - Create 4 render variants (A/B/C/D) in parallel
  - Poll status, write `renders` rows with `asset_url` on completion
  - On each complete: post Slack with thumbnail + "Render {n} ready"
- Error handling + retry (3× exponential backoff)
- Update sprint status to `rendering`

**Acceptance:**
- [ ] Test brief renders via fal within 10 min
- [ ] 4 render rows created in DB
- [ ] Failed renders marked with error, don't block other variants

**Commit:** `feat(creative): fal.ai render dispatcher`

---

### Chunk 13 — dispatch-render (Higgsfield routes)

**Estimated session:** 60 min

**Deliverables:**
- Extend `dispatch-render` for `high_production`, `creator`, `founder` lanes:
  - `high_production` → Higgsfield Marketing Studio with `product-hero-v3` preset
  - `creator` → Higgsfield Soul Character with creator Soul ID from `models.md`
  - `founder` → Higgsfield Soul Character with `matias-soul-01`
- Lane `creator`: after soul render, also auto-send brief to any configured creator emails
- Polls Higgsfield job status, writes `asset_url` on complete

**Acceptance:**
- [ ] All three Higgsfield routes render successfully
- [ ] Creator brief auto-send fires for `creator` lane
- [ ] Correct Soul ID used per lane

**Commit:** `feat(creative): higgsfield render dispatcher`

---

### Chunk 14 — Render Queue View + Approval UI

**Estimated session:** 45 min

**Deliverables:**
- `RenderQueue.tsx` at `/creative/queue`
- 3-column grid of render cards from V5 design
- Each card: preview thumbnail, sprint/lane badge, description, ✓/↻/✕ buttons, encode badge
- Approve → triggers encoder pass (Chunk 15)
- Revise → reopen brief, kick new render
- Reject → mark rejected, sprint stays in `rendering`
- Slack approval flow: [Approve] button in Slack message updates DB + triggers encoder

**Production view** at `/creative/production`:
- 4 lane sections (AI, High Prod, Creator, Founder) as cards
- Each shows active/queued/complete jobs with progress bars
- Matches V5 production view exactly

**Acceptance:**
- [ ] Queue populates from renders with `status='encoded'`
- [ ] Production view shows active renders in real-time
- [ ] Slack approval buttons work end-to-end

**Commit:** `feat(creative): render queue + production views`

---

### Chunk 15 — Encoder Pass

**Estimated session:** 45 min

**Deliverables:**
- `supabase/functions/encoder-pass/index.ts`
- Triggered when render is approved
- Downloads asset, runs through FFmpeg (use Transloadit for v0 — no self-hosting)
- Strips metadata, normalizes codec + bitrate for Meta spec
- Writes `encoded_url`, sets `encoder_passed=true`, updates status to `encoded`

**v0 escape hatch:** If Transloadit setup is time-consuming, set `encoder_passed=true` automatically and add note to run Shutter Encoder manually. Document clearly. Auto-encoder can ship in v1.

**Acceptance:**
- [ ] Approved renders pass through encoder
- [ ] Encoded files stored separately from raw
- [ ] Failures don't block pipeline

**Commit:** `feat(creative): encoder pass`

---

## PHASE 4 — META PUBLISHING (Chunks 16-18)

Goal: Approved + encoded renders auto-upload to Meta as paused ads with budget guardrail.

---

### Chunk 16 — Meta API Client + Auth

**Estimated session:** 45 min

**Deliverables:**
- Meta access token stored in Supabase secrets
- Token refresh logic (Meta tokens expire — cron weekly refresh)
- `lib/meta-client.ts` — wrapper with retry + rate limiting
- Budget check before any Meta API call:
  ```typescript
  async function checkBudgetGuardrail(): Promise<{ allowed: boolean; remaining: number }>
  // Reads budget_config.weekly_cap, computes current week spend from metrics_daily
  // Returns false + posts Slack alert if spend >= weekly_cap * alert_threshold
  ```
- Test endpoint: lists ad accounts (sanity check)

**Acceptance:**
- [ ] Token refresh works without manual intervention
- [ ] Budget guardrail returns correct remaining budget
- [ ] Rate limits respected

**Commit:** `feat(creative): meta API client + budget guardrail`

---

### Chunk 17 — upload-meta-ad Edge Function

**Estimated session:** 60 min

**Deliverables:**
- `supabase/functions/upload-meta-ad/index.ts`
- Triggered when render is approved + encoded
- Calls `checkBudgetGuardrail()` first — abort + Slack alert if at cap
- Creates Meta campaign (if not exists for sprint), ad set, ad — all PAUSED
- Ad naming: `S{sprint}_{lane}_{hypothesis-slug}_v{n}`
- UTMs: `?utm_source=meta&utm_medium=paid&utm_campaign=S{sprint}&utm_content={ad_id}`
- Writes `ads` row
- Posts Slack: "Ad ready in Meta · S{n} · {lane} · Tap to launch when ready"

**Acceptance:**
- [ ] Approved render appears in Meta Ads Manager as paused ad within 60s
- [ ] Budget guardrail blocks upload if at weekly cap
- [ ] Naming convention enforced
- [ ] UTMs correct on landing URL

**Commit:** `feat(creative): meta ad upload`

---

### Chunk 18 — Live Ads Dashboard

**Estimated session:** 45 min

**Deliverables:**
- `LiveAds.tsx` at `/creative/ads`
- From V5 design exactly:
  - Budget guardrail bar (weekly spend / weekly cap with amber progress bar + alert text)
  - Table: ad name, lane badge, CPA (color-coded by threshold), ROAS, CTR, spend, kill/scale actions
  - Navy table header
  - Kill/Scale buttons fire Meta API calls (pause ad / increase budget +30%)
- Kill threshold alert styling: CPA > `weekly_cap * kill_multiplier` → red row
- Kill/Scale rule summary below table

**Acceptance:**
- [ ] Budget bar reflects real spend
- [ ] CPA color coding works (green < $30, amber $30-45, red > $45)
- [ ] Kill button pauses ad in Meta
- [ ] Scale button increases ad set budget by 30%

**Commit:** `feat(creative): live ads dashboard`

---

## PHASE 5 — EVALUATION + LEARNING (Chunks 19-22)

Goal: System pulls performance daily, executes kill/scale, synthesizes learnings weekly with human discussion loop.

---

### Chunk 19 — evaluate-daily Cron

**Estimated session:** 45 min

**Deliverables:**
- `supabase/functions/evaluate-daily/index.ts`
- Cron: 9am ET daily via Supabase pg_cron
- Pulls yesterday's metrics via Meta API for all live ads
- Writes `metrics_daily` rows (idempotent)
- Applies threshold rules:
  - Kill: `cpa > cpa_target * 1.5` after 100 impressions
  - Scale: `cpa < cpa_target * 0.7` after 200 impressions
- Writes `ads.recommendation` field
- Posts Slack daily digest at 9:30am: list of recommendations with ✅ scale / 🔴 kill / 👀 watch per ad + [View in ERP] link

**Acceptance:**
- [ ] Cron runs at 9am ET reliably
- [ ] Recommendations match threshold rules exactly
- [ ] Idempotent: re-running same day doesn't duplicate metrics

**Commit:** `feat(creative): daily evaluation cron`

---

### Chunk 20 — Slack Interactive Integration

**Estimated session:** 60 min

**Deliverables:**
- Slack app setup documented (you configure Slack app separately — bot token + signing secret)
- `lib/slack-client.ts` — wrapper for posting messages with action buttons
- Slack message types:
  - Brief ready: "S{n} brief ready for review · {lane}" + [Open Brief] button
  - Render complete: thumbnail preview + [✓ Approve] [↻ Revise] [✕ Reject] buttons
  - Daily digest: recommendations list + [View in ERP] button
  - Weekly synthesis draft: full synthesis text + [Discuss] button
  - Budget alert: "Budget at 90% · $X of $Y used this week" + [View Ads] button
- `supabase/functions/slack-actions/index.ts` — handles button callbacks:
  - Approve brief → update `briefs.approval_state`, trigger dispatch-render
  - Approve render → trigger encoder-pass
  - Reject render → update status

**Acceptance:**
- [ ] All 5 message types post correctly
- [ ] Approval buttons update DB within 3s of tap
- [ ] Errors handled (Slack's 3s timeout is strict — respond immediately, process async)

**Commit:** `feat(creative): slack interactive integration`

---

### Chunk 21 — synthesize-weekly Cron + Discussion Loop

**Estimated session:** 60 min — critical for the learning system

**Deliverables:**
- `supabase/functions/synthesize-weekly/index.ts`
- Cron: Sunday 6pm ET
- For each sprint closed in past 7 days with qualifying ad data:
  1. Aggregate all metrics for the sprint
  2. Read last 10 discussion logs (for voice consistency)
  3. Call Claude API → generate `synthesis_draft` including:
     - `hypothesis_tested`
     - `outcome` (winner/loser based on final CPA vs target)
     - `principle_won` / `principle_lost` (one sentence each)
     - `visual_tags_winning` / `visual_tags_losing`
     - `applies_to` / `does_not_apply_to` (lane scope)
     - `brand_filter_match` (did it pass the content filter?)
     - `next_constraint_seed` (seeded constraint for next sprint)
  4. Write `discussions` row with `synthesis_draft`, `finalized=false`
  5. Post Slack: "Weekly synthesis draft ready · S{n} · Tap [Discuss] to refine it"
  6. [Discuss] button → opens deep-link to `/creative/learnings/{discussion_id}/discuss`
- `DiscussionView.tsx` at `/creative/learnings/:id/discuss`:
  - Shows synthesis draft on left
  - Chat interface on right (user types refinements, Claude iterates)
  - "Finalize Learning" button → commits final text to `learnings` table, sets `discussions.finalized=true`
  - Seeds next sprint with `next_constraint_seed` pre-populated
  - Final learning immediately available for injection in future briefs

**Acceptance:**
- [ ] Weekly cron runs Sunday 6pm ET
- [ ] Synthesis draft is readable and brand-accurate
- [ ] [Discuss] Slack button navigates to discussion view
- [ ] Finalized learning appears in future `getLearningsForBrief` queries
- [ ] Next sprint auto-seeded with constraint pre-filled

**Commit:** `feat(creative): weekly synthesis + discussion loop`

---

### Chunk 22 — Learning Archive View

**Estimated session:** 40 min

**Deliverables:**
- `LearningArchive.tsx` at `/creative/learnings`
- From V5 design:
  - Summary bar: 2 cards showing top winning pattern + top losing pattern
  - Searchable, filterable list of all learnings
  - Each row: sprint ref, lane pill, winner/loser badge, date, final CPA, hypothesis, principle won/lost, "Seed as starting point" CTA
- Filters: lane, outcome, hypothesis type
- Search: full-text on `hypothesis_tested + principle_won + principle_lost`

**Acceptance:**
- [ ] Archive loads in <500ms even with 100+ learnings
- [ ] Search works correctly
- [ ] "Seed as starting point" creates new sprint with constraint pre-populated from learning

**Commit:** `feat(creative): learning archive`

---

## PHASE 6 — LIBRARY + POLISH (Chunks 23-25)

---

### Chunk 23 — Competitor Library + Chrome Extension Spec

**Estimated session:** 45 min

**Deliverables:**
- `CreativeLibrary.tsx` at `/creative/library`:
  - Left sidebar: Library / Inspiration / Chrome Extension sub-views
  - Competitor Ads tab: brand filter pills, Meta Ad Library API pull per brand (Apify or direct), insight block, 4-col grid
  - Inspiration tab: masonry grid from `creative_library` table
  - Chrome Extension tab: build spec display from V5 design
- Meta Ad Library pull: use Apify actor `apify/meta-ads-library-scraper` — no auth needed for public ad library
- Competitor insight block: any brand running 5+ new video ads in 7 days → flag as "pattern detected"
- `creative_library` table CRUD: add, tag, folder, sprint-link

**Chrome Extension spec** (build separately in v1 — this chunk just shows the design):
- `manifest.json` (MV3)
- `popup.html` — detect current page, show save form
- `content.js` — platform detection (Instagram, Pinterest, Facebook, TikTok)
- `background.js` — service worker
- Supabase SDK → `creative_library` table
- Clerk auth token passthrough

**Acceptance:**
- [ ] Competitor tab shows ads for COMFRT by default
- [ ] Insight block surfaces correctly
- [ ] Creative library CRUD works
- [ ] Chrome Extension tab displays spec correctly

**Commit:** `feat(creative): creative library + competitor view`

---

### Chunk 24 — Metric Strip + Live Data

**Estimated session:** 35 min

**Deliverables:**
- Metric strip below header in `CreativeShell.tsx` — 6 persistent cards:
  - Active Sprints (count `sprints WHERE status NOT IN ('closed')`)
  - Rendering (count `renders WHERE status IN ('pending','rendering')`)
  - Queue Pending (count `renders WHERE status='encoded' AND approval_state='pending'`)
  - Live Ads (count `ads WHERE status='live'`)
  - Avg CPA (avg of today's `metrics_daily.cpa WHERE ad.status='live'`)
  - Learnings Banked (count `learnings WHERE finalized=true`, split winner/loser)
- All 6 values poll Supabase every 60s via `useInterval`
- Matches V5 metric strip exactly (cream-light cards, Cormorant Garamond numbers, DM Mono subs)

**Acceptance:**
- [ ] All 6 metrics show real data
- [ ] 60s polling works without memory leaks
- [ ] Zero flicker on update

**Commit:** `feat(creative): persistent metric strip`

---

### Chunk 25 — Seed Data + End-to-End Test

**Estimated session:** 45 min

**Deliverables:**
- Expanded seed script that walks one sprint through complete lifecycle
- Three seeded sprints in different states (closed/winner, live, brief-ready)
- 18 seeded learnings (12 winner, 6 losing) across all lanes
- Manual E2E test checklist in `docs/creative-e2e-test.md`

**Acceptance:**
- [ ] Seed runs cleanly on fresh DB
- [ ] All UI views populate correctly from seed
- [ ] E2E checklist passes manually

**Commit:** `feat(creative): seed + e2e test`

---

## PHASE 7 — DOCUMENTATION (Chunks 26-27)

---

### Chunk 26 — CLAUDE.md Final Update

**Estimated session:** 20 min

**Deliverables:**
- Final Creative Module Conventions section in `CLAUDE.md`
- Confirm all conventions from pre-flight are accurately reflected
- Add: how to add a new lane, how to add a new knowledge file, how to change kill/scale thresholds

**Commit:** `docs(creative): CLAUDE.md final update`

---

### Chunk 27 — Documentation

**Estimated session:** 35 min

**Deliverables:**
- `docs/creative-engine-overview.md` — architecture narrative (4-layer intelligence model, sprint lifecycle, how learnings compound)
- `docs/creative-engine-runbook.md` — operational runbook covering:
  1. How to rotate Meta access token
  2. How to add a new lane
  3. How to change kill/scale thresholds
  4. How to add a new knowledge file
  5. What to do when a render fails
  6. How to manually trigger weekly synthesis
  7. How to recover a stuck sprint
- README updates

**Commit:** `docs(creative): architecture + runbook`

---

## FULL SYSTEM ACCEPTANCE TEST (run after all chunks)

1. Create new sprint: constraint "$30 CPA", hypothesis "Arrival shots outperform vista shots for cold traffic on the AI lane."
2. Brief auto-generates within 30s — check that past learnings are consulted if any exist.
3. Brief appears in Slack with [Open Brief] button.
4. Approve brief.
5. fal.ai render completes within 10 min.
6. Approve render in Slack from mobile.
7. Budget guardrail check passes — ad uploads to Meta as paused within 60s.
8. Manually launch ad in Meta with $20 budget.
9. Wait 24h — daily digest appears in Slack at 9:30am with recommendation.
10. Sunday 6pm — weekly synthesis draft posts to Slack as DRAFT.
11. Tap [Discuss] — discussion view opens, refine synthesis in 2-3 turns.
12. Tap "Finalize Learning" — learning commits to DB.
13. Create new sprint — verify finalized learning appears in "Past Learnings Consulted" block of next brief.

If all 13 steps pass, v0 is shipped.

---

## DEFERRED TO V1

- Auto-launch ads (currently human launches paused ads in Meta — first 4 sprints intentional)
- Chrome Extension build (spec documented in Chunk 23, build in own repo)
- Visual analysis layer: `analyze-render-vision` edge function + `render_visual_attributes` table — Claude vision tags every approved render, attributes tied to CPA, becomes queryable pattern layer
- Auto-budget allocation across sprints based on portfolio CPA
- Multi-platform (TikTok Ads, Pinterest Ads)
- LoRA training pipeline for Founder Soul
- Real-time ad performance during business hours (currently daily pull only)
- Direct creator network integration for auto-brief dispatch

---

## SESSION DISCIPLINE (read at the start of every chunk)

1. `git branch --show-current` — confirm `feature/creative-engine-v0`
2. Read `CLAUDE.md` Creative Module Conventions section
3. Open `docs/mockups/creative-engine-v5.html` in browser — UI must match it
4. Read this file's chunk description fully before writing any code
5. If chunk feels >60 min, stop and split it
6. Commit with specified message at end
7. Push branch
8. Post in chat: "Chunk N complete. Next: Chunk N+1 — {title}."

---

## ESCALATION PROTOCOL

- If chunk fails twice on Sonnet 4.6 → escalate to Opus 4 standard context
- Do NOT use 1M context — too expensive for chunked work
- If Opus also fails → stop and ask Matias to redesign the chunk
- If external service (fal, Higgsfield, Meta) isn't responding → add mock/stub and leave TODO comment

---

## KICKOFF COMMAND (paste into Claude Code to start)

```
Execute Phase 1 of prompts/fr-creative-engine-sprint-prompts.md (Chunks 01-06) 
sequentially on branch feature/creative-engine-v0. 

For each chunk: read the description fully, implement, verify, run 
npm run build + typecheck, commit with the specified message, push, 
move to next. 

Stop only if: acceptance criterion fails twice with different approaches, 
an architectural decision requires Matias input, an env var is missing, 
or a file path conflicts with existing code.

When all 6 complete, post a summary of what was built and any decisions made.
Default model: claude-sonnet-4-6.
Design reference: docs/mockups/creative-engine-v5.html — match it exactly.
```
