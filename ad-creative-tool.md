# Ad Creative Tool — Implementation Plan

**Module:** `ad-creative-tool` (a separate scratch module for testing analytics functionality before deciding what merges into Creative Engine)
**Folder:** `src/components/ad-creative-tool/`
**Hash root:** `#ad-creative-tool/{view}[/{id}]`
**Status:** Net-new module — phase 0 planning
**Audit target:** Conforms to top-level `CLAUDE.md` conventions. See "Audit Checklist" at bottom — paste it to Claude Code at any point to verify compliance.

---

## What this is

An internal replacement for the motionapp.com subscription ($250/mo). Pulls FR's live Meta ads in, AI-tags them across 8 dimensions, surfaces winning patterns, clusters emergent messaging themes, and scrapes competitor/organic inspiration into a swipe file. Everything Motion does, none of the SaaS fluff, scoped to Matias's solo-founder workflow.

Built as a **standalone module first** so the surface can be tested in isolation. Phase 4 (post-test) decides which views graduate into `creative-engine`.

---

## Source truth

Spec derived from analysis of three Loom walkthroughs of motionapp.com (v1: 5 min, v2: 5 min, v3: 2 min). Frame-by-frame review of 76 scene-change extracts confirmed:
- Sidebar nav: Home, Leaderboard, Messaging Themes, Create Report, Reports (12 presets), Creative Patterns (8 comparative reports), From Templates, Inspo (Discover/Trending/Organic/Following brands)
- URL pattern: `/organization/{orgId}/{workspaceId}/top/{reportId}` and `/comparative/{reportId}` and `/inspo/{brand|organic}/{id}`
- Each ad tagged across 8 dimensions: Asset Type, Visual Format, Messaging Angle, Hook Tactic, Headline Tactic, Intended Audience, Seasonality, Offer Type
- Cluster cards show: 2x2 ad thumbnails + cluster name + Spend + ROAS with vs-prior deltas
- AI command bar throughout with canonical chip prompts: "Ask me anything", "Spot patterns in winners", "What should I create next?", "Prep me for my team review", "Analyze this report"
- Hook Tactic example cluster values observed: None, Aspirational, Curiosity, Product Showcase

---

## Scope decision matrix

| Motion feature | Decision | Sprint |
|---|---|---|
| Meta ads ingestion + creative download | MUST | 1 |
| 8-dimension AI tagging | MUST | 1 |
| Home dashboard (this week + top spending creative) | MUST | 1 |
| Top Creatives preset report | MUST | 1 |
| 8 Creative Pattern comparative reports | MUST | 1 |
| AI command bar | MUST | 2 |
| Messaging Themes (emergent clustering) | MUST | 2 |
| Inspo: brand follows + organic scraping | MUST | 2 |
| Landing Page Analysis | DEFER | 3 |
| Video Analysis | DEFER | 3 |
| Boards (user-organized inspo) | DEFER | 3 |
| Week-over-Week Trends report | DEFER | 3 |
| Top Hooks / Top Clicks / Top Copy / All Active Ads / New Launches presets | CUT | — |
| Ad Type Comparison / Ad Length Comparison | CUT | — |
| Static Analysis | CUT | — |
| Leaderboard | CUT (solo use) | — |
| From Templates section | CUT (solo use) | — |
| Folders, Templates, Share Report, multi-workspace switching | CUT (SaaS bloat) | — |
| Discover / Trending inspo (cross-customer) | CUT (irrelevant solo) | — |

Net result: ~50% of Motion's surface area, 100% of its actual signal for FR.

---

## Module conventions (mirror these into `CLAUDE.md` once phase 1 lands)

**Stack:** Plain JavaScript + JSDoc. No TypeScript, no Zustand, no Zod. localStorage primary + Supabase cloud mirror. `getAuthedSupabase()` for every store cloud call.

**Palette:** FR brand (Salt `#F5F0E8` surfaces / Slate `#3A3A3A` text / Sand `#EBE5D5` accent) for all UI. Performance signals use the existing brand stat-delta colors: green `#3B6D11` good / amber `#854F0B` warn / red `#A32D2D` bad. **No new module accent** — this module is experimental and will fold into Creative Engine; introducing a new accent now creates rework later.

**Hash grammar:** `#ad-creative-tool/{view}[/{id}]`
Views: `home | top-creatives | patterns/{dimension} | themes | ad/{adId} | inspo | inspo/brand/{brandId} | inspo/organic | chat/{conversationId}`
Pattern dimensions: `asset-type | visual-format | messaging-angle | hook-tactic | headline-tactic | intended-audience | seasonality | offer-type`
Routing helper: `src/utils/adCreativeToolRouting.js` — mirrors `inventoryRouting.js` exactly (parse, build, migrate).

**Stores (one file per data type in `src/utils/`, mirroring `treatmentStore.js`):**
- `metaAdStore.js` — synced ads + creatives + rolling metrics from Meta
- `adTagStore.js` — 8-dimension tags per ad with confidence + manual-override flag
- `adCommentStore.js` — comments scraped from Meta per ad
- `adMetricSnapshotStore.js` — **append-only** daily metrics snapshots (for WoW)
- `adTagHistoryStore.js` — **append-only** log of every tagging run
- `messagingThemeStore.js` — current set of emergent themes
- `messagingThemeSnapshotStore.js` — **append-only** nightly snapshots
- `inspoBrandStore.js` — followed brands with scrape schedules
- `inspoAdStore.js` — scraped competitor + organic ads
- `inspoBoardStore.js` — Sprint 3 only
- `adCreativeChatStore.js` — chat conversations and messages
- `adCreativeReportStore.js` — saved report configs (filters, metrics, group_by)
- `adCreativeAgentInteractionStore.js` — **append-only** Claude API call log

**Append-only enforcement** (at JS store layer, not DB — reject any update/delete calls on these collections, mirroring the existing `atom_usage` / `state_transition` / `agent_interaction` / `bom_snapshot` / `tracking_audit` pattern):
- `ad_metric_snapshots`
- `ad_tag_history`
- `messaging_theme_snapshots`
- `ad_creative_agent_interactions`

**Types:** JSDoc typedefs in `src/types/adCreativeTool.js`. No file-by-file types.

**Brand-rule reminder:** **Never discount.** Any AI chat tool that surfaces creative/messaging recommendations is forbidden from suggesting "limited-time offer," "sale," "promo code," "X% off," or any markdown framing. The system prompt for the AI command bar must include this constraint verbatim, same way the inventory agent's prompt forbids markdown proposals.

---

## Folder structure

```
src/components/ad-creative-tool/
  AdCreativeTool.jsx               # Module entry + hash router
  HomeView.jsx                     # "What do you want to work on?" + this week at a glance
  TopCreativesView.jsx
  PatternView.jsx                  # Generic; reads dimension from hash
  ThemesView.jsx                   # Messaging Themes
  AdDetailView.jsx
  InspoView.jsx                    # Boards index
  InspoBrandView.jsx
  InspoOrganicView.jsx
  components/
    AdGrid.jsx                     # Used in every analytics view
    AdCard.jsx                     # Single tile with metric overlays
    ClusterCard.jsx                # 2x2 mini-grid + cluster name + metrics (the Motion pattern)
    MetricPills.jsx                # ROAS / Spend / CPA / CTR toggle row
    FilterBar.jsx                  # date range, group by, add filter
    AiChatBar.jsx                  # Floating bottom-center chat (Sprint 2)
    ThisWeekAtAGlance.jsx
    TopSpendingCreativeCard.jsx
    BrandFollowList.jsx
  adCreativeToolTokens.js          # Brand palette + spacing constants for this module
src/utils/
  adCreativeToolRouting.js
  metaAdStore.js
  adTagStore.js
  adCommentStore.js
  adMetricSnapshotStore.js
  adTagHistoryStore.js
  messagingThemeStore.js
  messagingThemeSnapshotStore.js
  inspoBrandStore.js
  inspoAdStore.js
  inspoBoardStore.js
  adCreativeChatStore.js
  adCreativeReportStore.js
  adCreativeAgentInteractionStore.js
  adCreativeToolSync.js            # Manual + scheduled sync triggers (calls edge functions)
src/types/
  adCreativeTool.js                # All JSDoc typedefs
supabase/functions/
  meta-sync/                       # NEW — pulls ads from Meta Marketing API
    index.ts
  ad-tagger/                       # NEW — runs 8 tagging prompts per ad
    index.ts
  inspo-scrape/                    # NEW — Apify-driven scrape of followed brands
    index.ts
  compute-themes/                  # NEW — nightly Messaging Themes clustering
    index.ts
  voyage-proxy/                    # NEW — embeddings proxy (mirrors anthropic-proxy)
    index.ts
  anthropic-proxy/                 # EXISTING — used by AI command bar
docs/mockups/
  ad-creative-tool-v1.html         # Pixel spec to write BEFORE coding (mirrors creative-engine-v5.html / inventory-portal.html)
docs/specs/
  ad-creative-tool.md              # This file
```

---

## Supabase tables (new migration)

```sql
-- All tables have org_id with RLS scoping (Clerk session → org_id), mirroring existing patterns.

create table meta_ads (
  id text primary key,                     -- Meta ad_id
  org_id uuid not null,
  campaign_id text not null,
  ad_set_id text not null,
  name text not null,
  status text not null,
  effective_status text not null,
  created_time timestamptz not null,
  days_active integer not null,
  creative_id text not null,
  format text not null,                    -- VIDEO | IMAGE | CAROUSEL | FLEXIBLE
  media_url text,                          -- Supabase Storage URL
  thumbnail_url text,
  first_frame_url text,                    -- For video ads, first frame as image
  headline text,
  primary_text text,
  cta text,
  landing_page_url text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  atc integer not null default 0,
  purchases integer not null default 0,
  revenue numeric not null default 0,
  roas numeric generated always as (case when spend > 0 then revenue / spend else null end) stored,
  cpa numeric generated always as (case when purchases > 0 then spend / purchases else null end) stored,
  ctr numeric generated always as (case when impressions > 0 then clicks::numeric / impressions else null end) stored,
  aov numeric generated always as (case when purchases > 0 then revenue / purchases else null end) stored,
  last_synced_at timestamptz not null default now()
);

create table ad_tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  ad_id text not null references meta_ads(id) on delete cascade,
  dimension text not null,                 -- ASSET_TYPE | VISUAL_FORMAT | ... (8 total)
  value text not null,
  confidence numeric not null,
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  unique (ad_id, dimension)                -- one current tag per dimension per ad
);

create table ad_tag_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  ad_id text not null,
  dimension text not null,
  value text not null,
  confidence numeric not null,
  manual boolean not null default false,
  created_at timestamptz not null default now()
);  -- append-only

create table ad_comments (
  id text primary key,                     -- Meta comment_id
  org_id uuid not null,
  ad_id text not null references meta_ads(id) on delete cascade,
  text text not null,
  sentiment text,                          -- positive | negative | neutral
  created_at timestamptz not null
);

create table ad_metric_snapshots (
  org_id uuid not null,
  ad_id text not null,
  date date not null,
  spend numeric not null,
  impressions bigint not null,
  clicks bigint not null,
  purchases integer not null,
  revenue numeric not null,
  primary key (org_id, ad_id, date)
);  -- append-only

create table ad_embeddings (
  ad_id text primary key references meta_ads(id) on delete cascade,
  org_id uuid not null,
  embedding vector(1024) not null,         -- voyage-3-lite is 1024-dim
  description text not null,               -- Claude-generated visual+text description embedded above
  updated_at timestamptz not null default now()
);

create table messaging_themes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  description text not null,
  ad_ids text[] not null,
  hit_rate numeric not null,
  centroid vector(1024) not null,
  computed_at timestamptz not null default now()
);

create table messaging_theme_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  themes jsonb not null,                   -- full theme set frozen
  computed_at timestamptz not null default now()
);  -- append-only

create table inspo_brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  meta_page_id text,
  tiktok_handle text,
  ig_handle text,
  active boolean not null default true,
  last_scraped_at timestamptz,
  created_at timestamptz not null default now()
);

create table inspo_ads (
  id text primary key,                     -- hash of brand_id + source + source_id
  org_id uuid not null,
  brand_id uuid references inspo_brands(id) on delete cascade,
  source text not null,                    -- meta_ad_library | tiktok | instagram
  format text not null,
  media_url text not null,
  thumbnail_url text not null,
  caption text,
  landing_page_url text,
  days_active integer,
  scraped_at timestamptz not null default now()
);

create table inspo_ad_tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  inspo_ad_id text not null references inspo_ads(id) on delete cascade,
  dimension text not null,
  value text not null,
  confidence numeric not null,
  created_at timestamptz not null default now(),
  unique (inspo_ad_id, dimension)
);

create table ad_creative_chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  conversation_id uuid not null,
  role text not null,                      -- user | assistant
  content text not null,
  tool_calls jsonb,
  page_context jsonb,                      -- which view + filters were active
  created_at timestamptz not null default now()
);

create table ad_creative_agent_interactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  function text not null,                  -- which prompt: tagger | chat | theme_namer | etc.
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  cost_cents numeric,
  created_at timestamptz not null default now()
);  -- append-only

create table ad_creative_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  type text not null,                      -- top_creatives | comparative | landing_page | etc.
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('ad-creative-media', 'ad-creative-media', false);
```

Enable RLS on every table; policies use `auth.jwt() ->> 'org_id' = org_id`. Existing `getAuthedSupabase()` handles JWT claim wiring per the Creative Engine conventions.

---

## Edge functions

All Deno-based, deployed automatically via the existing `.github/workflows/deploy-functions.yml`.

### `meta-sync`
Triggered: `pg_cron` hourly (`select cron.schedule('meta-sync-hourly', '0 * * * *', $$ select net.http_post(...) $$);`) + manual from the UI ("Resync now" button on Home).

Reads Meta credentials from `user_integrations` (provider `meta`). Pulls ads from `/v18.0/{ad_account_id}/ads` with `time_range` of last 7 days for incremental + last 365 for first run. For each ad:
1. Upsert into `meta_ads`
2. Pull rolling 7-day insights → update aggregate columns
3. Pull yesterday's insights → append row to `ad_metric_snapshots`
4. Download creative media (image or video) → upload to `ad-creative-media` storage bucket → save URLs
5. For video format: extract first frame via `ffmpeg-wasm` (already used for video processing elsewhere — confirm) and save as `first_frame_url`
6. Pull comments for ads with spend > $25 → upsert into `ad_comments`
7. Enqueue tagging job for any ad missing tags in any dimension → calls `ad-tagger`

### `ad-tagger`
Triggered: by `meta-sync` per ad, plus manual "Retag" button on ad detail.

For each ad, runs 8 parallel calls to `anthropic-proxy` with the prompts in the "Tagging prompts" section below. Image input is the still (or first frame for video) — pass via Claude vision. Text input is `headline + primary_text + caption`. Each call returns `{value, confidence, reasoning}`.

Writes to `ad_tags` (upsert per dimension) and appends one row per dimension to `ad_tag_history`.

After tagging, generates a unified description string and calls `voyage-proxy` to embed → writes to `ad_embeddings`.

Logs each Anthropic call to `ad_creative_agent_interactions`.

### `inspo-scrape`
Triggered: `pg_cron` daily at 4am UTC + manual from a brand's page.

For each `inspo_brands.active = true`:
1. If `meta_page_id` set → Apify actor `curious_coder/facebook-ads-library-scraper`
2. If `tiktok_handle` set → Apify actor `clockworks/free-tiktok-scraper`
3. If `ig_handle` set → Apify actor `apify/instagram-scraper`
4. Hash each result to dedupe → if new, download media to `ad-creative-media`, upsert into `inspo_ads`, enqueue tagging

Reuses the same `ad-tagger` flow for tagging inspo ads (same 8 dimensions, same prompts — only difference is the org's brand voice prompt isn't fully applicable, so a `--inspo` flag adjusts the prompt slightly).

Updates `inspo_brands.last_scraped_at`.

### `compute-themes`
Triggered: `pg_cron` nightly at 5am UTC + manual from the Themes view.

1. Load all `ad_embeddings` for org where corresponding `meta_ads.status = 'ACTIVE'` (only cluster active ads)
2. Run HDBSCAN via the `density-clustering` Deno port — `minClusterSize: 5`, `minSamples: 3`
3. For each cluster:
   - Pull the 5 highest-spend ads in the cluster
   - Pull their `primary_text`, `headline`, and AI-generated `description`
   - Call `anthropic-proxy` with the theme-naming prompt → returns `{name, description}`
   - Compute hit rate: % of ads in cluster with ROAS > workspace median ROAS
4. Replace `messaging_themes` rows for the org
5. Append a row to `messaging_theme_snapshots` with the frozen set

### `voyage-proxy`
Mirrors `anthropic-proxy` exactly. Reads Voyage API key from `user_integrations` (provider `voyage`). Single endpoint `/embed` accepting `{model, input}`. Default model `voyage-3-lite` (1024-dim, $0.02/1M tokens, free tier 50M tokens).

---

## The 8 tagging prompts

Each prompt is a separate file in `supabase/functions/ad-tagger/prompts/` to keep iteration cheap. Vocabulary is fixed per dimension to prevent drift across runs. Each returns strict JSON.

System preamble (shared, prepended to all 8):
> You are tagging an advertisement for Foreign Resource Co., a travel lifestyle apparel brand. The brand's mission is "to inspire global travel" with the tagline "Freedom through confidence." Style-conscious 18-25 year olds. Never-discount brand. Logo-forward, story-led. The single creative filter is: "Does this make someone want to travel?"

### 1. ASSET_TYPE
Vocab: `High Production | Lifestyle | Studio | UGC | Flat Lay | Talking Head | Animation | Mixed`

### 2. VISUAL_FORMAT
Vocab: `Vertical Video | Square Video | Horizontal Video | Single Image | Carousel | GIF`

### 3. MESSAGING_ANGLE
Vocab: `Identity & Self-Expression | Versatility | Aesthetic-First | Mission/Story | Quality/Craft | Travel/Freedom | Community | Product Detail | None`

### 4. HOOK_TACTIC
Vocab: `Aspirational | Curiosity | Product Showcase | Social Proof | Problem/Solution | Pattern Interrupt | Authority | None`

### 5. HEADLINE_TACTIC
Vocab: `Question | Statement | Stat | Command | Provocation | Brand Name Only | None`

### 6. INTENDED_AUDIENCE
Vocab: `Streetwear | Travel | Gen Z Urban | Festival/Music | Creative Class | Fashion-Forward | Broad`

### 7. SEASONALITY
Vocab: `Spring | Summer | Fall | Winter | Evergreen | Holiday | Back to School | Travel Season`

### 8. OFFER_TYPE
Vocab: `None | Free Shipping | Bundle | New Drop | Restock | Pre-order | Early Access`
**Hard rule:** never returns `% off`, `BOGO`, `Sale`, or any markdown framing. Prompt must include: "This is a never-discount brand. The value `% off`, `Sale`, `BOGO`, or any markdown is forbidden."

Each prompt outputs:
```json
{"value": "<one of vocab>", "confidence": 0.0-1.0, "reasoning": "<one sentence>"}
```

Bias each prompt toward `None` / `Evergreen` / `Broad` defaults when signal is weak — most paid ads do NOT deploy a strong tactic, and over-tagging produces noise.

Approx cost per ad fully tagged on Sonnet 4.5 with image: $0.04. At 100 ads/mo: $4/mo.

---

## Messaging Themes pipeline (Sprint 2)

The killer feature. Architecture:

1. **Embed every active ad.** During `ad-tagger`, after the 8 dimension calls, run a 9th Claude call to produce a unified description: "Describe this ad in 2-3 sentences capturing visual style, messaging, emotional tone, and product context." Concatenate with `headline + primary_text`. Embed via `voyage-proxy`. Store in `ad_embeddings`.

2. **Cluster nightly.** `compute-themes` runs HDBSCAN. Density-based clustering finds emergent themes without needing to pre-specify cluster count. Tunable parameters: `minClusterSize: 5` (theme must have at least 5 ads), `minSamples: 3`.

3. **Name each cluster.** Single Claude call per cluster with the 5 highest-spend ads' descriptions concatenated. Prompt asks for `{name: "3-6 words", description: "one sentence"}`. Example outputs observed in Motion's own UI: "Distressed & deconstructed aesthetic", "Versatility & modular design", "Design as identity & self-expression", "Urban exploration aesthetic".

4. **Hit rate.** % of ads in cluster with `ROAS > median(account.ROAS)`. Shown as the % in the cluster card.

5. **Surface.** Home page "Messaging themes you're testing right now" carousel (Top / Just Launched tabs). Dedicated `/themes` view with full grid.

Re-cluster nightly. Don't re-cluster on every ad sync — themes need stability to be actionable.

---

## AI command bar (Sprint 2)

The "What do you want to work on?" / "Ask me anything" affordance. Implementation:

- Component: `AiChatBar.jsx` — floating bottom-center on every view, expands to a full chat panel when invoked (mirrors `InventoryAgentChat.jsx` pattern).
- Backend: routes through existing `anthropic-proxy` edge function (no new infra).
- Model: Claude Sonnet 4.5 with **tool use** + extended thinking.

**Tools exposed to the chat agent:**

```js
const tools = [
  {
    name: 'query_ads',
    description: 'Query Meta ads with filters, sorting, and grouping. Returns ad records with metrics + tags.',
    input_schema: { /* filter / sort / group_by / limit */ }
  },
  {
    name: 'get_ad_detail',
    description: 'Fetch one ad including comments and full tag set.',
    input_schema: { ad_id: 'string' }
  },
  {
    name: 'compare_clusters',
    description: 'Get the comparative pattern report for a dimension. Returns clusters with spend/ROAS rollups.',
    input_schema: { dimension: 'enum(8)', metric: 'enum(roas|spend|cpa|ctr)' }
  },
  {
    name: 'find_similar_ads',
    description: 'Vector similarity search. Returns N most similar ads to a given ad.',
    input_schema: { ad_id: 'string', n: 'integer' }
  },
  {
    name: 'search_inspo',
    description: 'Search competitor + organic inspo by text query or visual similarity.',
    input_schema: { query: 'string', limit: 'integer' }
  },
  {
    name: 'get_messaging_themes',
    description: 'Return current emergent themes with hit rates.',
    input_schema: {}
  },
  {
    name: 'get_week_at_a_glance',
    description: 'Aggregate metrics for the last 7 days.',
    input_schema: {}
  }
];
```

**System prompt skeleton** (full version in `supabase/functions/anthropic-proxy/prompts/ad-creative-chat.md`):
```
You are the creative analytics partner for Foreign Resource Co. (FR), a travel lifestyle 
apparel brand. The brand's mission is "to inspire global travel." Tagline: 
"Freedom through confidence." Style-conscious 18-25 year olds. Story-led, never algorithmic.

Hard rules:
- This is a NEVER-DISCOUNT brand. Never propose markdowns, sales, % off, promo codes, or 
  any markdown-adjacent recommendation. Use the never-discount alternatives 
  (early access, bonuses, mission alignment) per inventory module precedent.
- The single creative filter is "Does this make someone want to travel?" — apply it to 
  every recommendation.
- Lead with the answer. No preamble. No restating the question. No emojis.

When the user asks an analytical question, use the tools to pull data, then synthesize 
in operator-to-operator prose. Show specific ad IDs and metrics. When you recommend a 
creative concept, ground it in observed performance patterns from the tools, not 
general best practices.
```

**Canonical chip prompts** (rendered on Home and inside each report):
- "Ask me anything"
- "Spot patterns in winners" → triggers `query_ads(filter=top_20pct_by_roas)` + `compare_clusters` across all 8 dimensions
- "What should I create next?" → identifies under-tested clusters + suggests concepts grounded in inspo similarity
- "Prep me for my team review" → last-7-day exec summary with deltas
- "Analyze this report" → context-aware; reads current page's filter/group state

Stream responses. Render ad cards inline when assistant returns ad IDs.

---

## Inspo (Sprint 2)

**Brand follow flow:**
- New page `#ad-creative-tool/inspo` with Brand Follow list + Add Brand modal
- Add Brand modal accepts: name, Meta Page URL/ID, TikTok @handle, Instagram @handle
- On save, queue an immediate `inspo-scrape` run for that brand to seed data

**Brand page (`#ad-creative-tool/inspo/brand/{brandId}`):**
- Pinterest-style masonry grid (use CSS columns; no library)
- Filter bar: Format, Type, Days active, Status, Ad length
- Each tile: media + brand handle + days ago + bookmark icon

**Organic page (`#ad-creative-tool/inspo/organic`):**
- Same grid pattern, no brand grouping
- Filter by hashtags + handles (configurable per workspace)
- TikTok-style vertical video focus

**Apify cost ceiling:** Cap at $5/mo via free tier and rate-limited scraping (one full brand sweep per brand per day, not per hour).

---

## UI components & design tokens

`src/components/ad-creative-tool/adCreativeToolTokens.js`:

```js
export const tokens = {
  // Surfaces — FR brand
  bg: '#F5F0E8',           // Salt
  card: '#FFFFFF',
  cardBorder: 'rgba(58,58,58,0.15)',
  text: '#3A3A3A',         // Slate
  textMuted: 'rgba(58,58,58,0.6)',
  accent: '#EBE5D5',       // Sand
  soil: 'TBD',             // Soil — 4th brand color, extract exact hex from CONTEXT_FILE_FR_Brand_Guidelines_V3.pdf before first commit

  // Performance deltas (existing brand convention)
  good: '#3B6D11',
  warn: '#854F0B',
  bad: '#A32D2D',

  // Spacing
  cardRadius: '8px',
  cardPad: '20px',
  cardBorderWidth: '0.5px',

  // Status pills (existing brand convention)
  pillRadius: '5px',
  pillFontSize: '11px',
  pillLetterSpacing: '0.06em',
  pillPad: '5px 12px',

  // Type
  display: 'Cormorant Garamond, serif',
  body: '"General Sans", Inter, system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
```

**Pixel mockup first (hard rule per CLAUDE.md):** Before coding any view, write `docs/mockups/ad-creative-tool-v1.html` — a single-page HTML pixel spec of all views, mirroring how `creative-engine-v5.html` (1055 lines) and `inventory-portal.html` (1392 lines) were locked before any JSX. Claude Code will reject UI work that doesn't reference the locked mockup.

**Component invariants** (Claude Code audit will check these):
- No emojis anywhere (including in mockup)
- No deep shadows, no heavy borders
- No bright colors outside Salt/Slate/Sand/Soil/good/warn/bad
- No pop-ups, no banners
- Stat values use `display` font (Cormorant) **except** big KPI numbers which use `body` (General Sans 28px wt500 — same override the inventory module made on 2026-05-09)
- All currency via `Intl.NumberFormat`; all dates via `Intl.DateTimeFormat`

---

## Brand Compliance

This section is non-negotiable. Every visual decision in this module routes through it. If the section conflicts with a screenshot, a Motion reference, or an instinct — this section wins.

### Required reading before any visual work

Before writing a single line of `docs/mockups/ad-creative-tool-v1.html`, Claude Code reads:

1. **`CONTEXT_FILE_FR_Brand_Guidelines_V3.pdf`** — the authoritative FR brand book. Source of truth for logo lockups, type scale, photographic treatment, color exact-hex (including Soil), spacing system, and motion principles. If the PDF says something different from this spec, the PDF wins and we patch this spec.
2. **`docs/mockups/creative-engine-v5.html`** (1055 lines) — see how the brand applies in a complex existing module.
3. **`docs/mockups/inventory-portal.html`** (1392 lines) — see how the brand handles dense data tables, KPI numbers, and operational chrome.

If any of those three files is missing, stop and ask. Don't proceed on memory.

### Design intent: Apple-level design, Steve Jobs-level simplicity

Two phrases that get used loosely and mean nothing without operational definitions. Here is what they mean inside this module:

**Apple-level design means:**
- One primary action per view. The eye finds it in under one second. Everything else is secondary, tertiary, or invisible until invoked.
- Type does the work that decoration usually does. No backgrounds where a font weight change would do. No borders where whitespace would do. No icons where a word would do.
- Whitespace is not absence. It is a feature with a job — establishing hierarchy, giving the user room to think, making the content the protagonist.
- Density only where the user is doing work. Data grids and ad detail panels can be dense. Chrome (nav, headers, dashboards) is generous.
- Hover and focus reveal; the page at rest is calm. No tooltips required to understand what a thing is. If a label needs a tooltip, rename the label.
- Animation has a job (reveal hierarchy, confirm a state change, smooth a transition). Animation that has no job gets cut. No bounces, no fades-for-fades-sake, no Lottie ornaments.
- One color of meaning at a time. If a card shows performance state, it does not also show recency state in another color. Pick the one signal the user came for.
- The interface is invisible. The work is visible. The user remembers their ads, their patterns, their decisions — not the toolbar.

**Steve Jobs-level simplicity means:**
- Remove until you cannot remove anymore. Then remove one more thing. Then ship.
- Every element on a view earns its place by answering: "what question does the user ask that this element answers?" If you cannot finish the sentence, the element is cut.
- No "just in case" features. No "while we're here" additions. No "users might want." Build what gets used in the first session and ignore everything else.
- The mockup is done when there is nothing left to remove, not when there is nothing left to add.
- Defaults are decisions. Every default is the answer to "what does the user almost certainly want?" — chosen, not avoided.
- The interface explains itself in the first three seconds of looking at it. If it does not, the interface is wrong — not the user.

These are not aspirational. Claude Code applies them at the mockup stage and the audit checks for them sprint-by-sprint.

### Motion screenshots: functional reference only — never visual reference

The user (Matias) will provide screenshots of motionapp.com throughout the build. These screenshots define **what features and panels to build** — not **how they should look**.

Motion's visual aesthetic is the opposite of FR's: Motion is dark, dense, information-saturated, neutral-corporate. FR is light, calm, generous, editorial. Replicating Motion's look would violate every brand rule in this section.

**Operational rule:** When Matias hands over a Motion screenshot, Claude Code's job is to:
1. Identify *what's on screen* (which panels, which data, which interaction) — that is the functional spec
2. **Discard the visual treatment entirely** — colors, density, typography, spacing
3. Re-render it through the FR brand system per the PDF and this section
4. Show Matias the FR-version mockup before any JSX

If Claude Code finds itself reaching for `bg-zinc-900`, `text-zinc-300`, dense table rows, or any Motion-derived styling — stop, re-read this section, restart.

### Iconography

- Inherit from the icon set already used by `creative-engine` and `inventory`. Confirm which library (likely Lucide) by reading existing JSX imports before introducing any icon.
- No custom SVG icons unless the brand guide explicitly specifies one.
- Icon weight matches body text weight (stroke-width 1.5 default).
- Icon color is `text` or `textMuted` — never the brand accent, never a performance color.

### Logo placement

FR is logo-forward per brand mission (logo-first over full minimalism — confirmed by revenue data in prior strategic work). In this module:
- FR wordmark or mark appears in the top-left of the module's chrome at all times.
- No logo on report exports or PDFs in Sprint 1 — defer to Sprint 3 when exports ship.
- Logo never appears inside ad cards, cluster cards, or content surfaces — only in chrome.
- The brand guide is the source of truth for clear-space, minimum size, and which lockup applies at which scale.

### State styles

| State | Treatment |
|---|---|
| Default | As specified in `adCreativeToolTokens.js` |
| Hover (interactive) | 1px inset border at `cardBorder`, no background change, no transform, no shadow |
| Focus | 1px outline at `text`, 2px offset, no shadow |
| Loading | Calm shimmer at 6% opacity over the card region. No spinners. No skeletons that mimic content shape (that's Motion's approach — too noisy for FR). |
| Empty | Centered Cormorant heading + General Sans body, no illustration, no icon. Pattern: "No ads yet." / "Connect Meta in Settings to begin." |
| Error | Inline at the top of the affected region in `bad` color. Single sentence. No icon. No retry button — let the user re-trigger via the same action that failed. |
| Disabled | 40% opacity, no interaction, no tooltip explaining why (the parent context should already explain) |

### Microcopy tone

Same operator-to-operator register Matias uses everywhere else:
- Direct. No "Welcome to..." No "Let's get started." No exclamation points anywhere.
- Numbers and proper nouns get prominence.
- No filler verbs ("simply," "easily," "quickly").
- No emoji even in toast messages or success states.
- AI chat responses follow the same rule — system prompt enforces it.

### Brand audit before any code merges

Before any sprint ships, Claude Code runs through the "Brand compliance" subsection of the Audit Checklist (below). Every item must be a yes. If any item is "partial" or "didn't get to it" — sprint doesn't ship.

---

## Sprint breakdown

### Sprint 1 — Analytics core (target: 1 week part-time)
**Goal: see your last 365 days of FR Meta ads as a tagged, queryable visual grid.**

1. Write `docs/mockups/ad-creative-tool-v1.html` first. Lock before any JSX.
2. Run Supabase migration for the 14 new tables + storage bucket.
3. Build `meta-sync` edge function. Verify backfill on real FR ad account.
4. Build `ad-tagger` edge function with the 8 prompts. Tag entire backlog (200-400 ads, ~$10-15 one-time Anthropic spend). Manually eyeball 20 tags before committing — adjust prompts where AI tags drift from intuition.
5. Build stores: `metaAdStore`, `adTagStore`, `adCommentStore`, `adMetricSnapshotStore`, `adTagHistoryStore`, `adCreativeReportStore`.
6. Build `adCreativeToolRouting.js` + module entry `AdCreativeTool.jsx`.
7. Build views: `HomeView`, `TopCreativesView`, `PatternView` (single generic component reading dimension from hash), `AdDetailView`.
8. Build components: `AdGrid`, `AdCard`, `ClusterCard`, `MetricPills`, `FilterBar`, `ThisWeekAtAGlance`, `TopSpendingCreativeCard`.
9. Add to top-level nav (wherever `#plm`, `#inventory`, `#creative-engine` link from).
10. Append "Ad Creative Tool Module Conventions" block to `CLAUDE.md`.

**Done when:** you open `#ad-creative-tool/home` in prod and see real this-week metrics + top spending creative; you open `#ad-creative-tool/patterns/hook-tactic` and see your real ads clustered by Hook Tactic with spend/ROAS rollups matching what Motion shows you.

### Sprint 2 — AI chat + Messaging Themes + Inspo (target: 1.5 weeks part-time)
**Goal: cancel the Motion subscription at end of sprint.**

1. Build `voyage-proxy` edge function. Test with a single ad embedding.
2. Extend `ad-tagger` with the 9th description+embedding step. Backfill embeddings for all existing tagged ads.
3. Build `compute-themes` edge function. Run manually, eyeball clusters, tune `minClusterSize` if needed. Schedule via pg_cron.
4. Build `ThemesView` + Home carousel.
5. Build `AiChatBar` component + chat conversation + page-context awareness + the 7 tools. Test the four chip prompts.
6. Build `inspoBrandStore`, `inspoAdStore`. Build `inspo-scrape` edge function. Add 5 seed brands manually for testing.
7. Build `InspoView`, `InspoBrandView`, `InspoOrganicView` + masonry grid.
8. **Cancel motionapp.com.** Confirm savings start ($250 → ~$20/mo).

**Done when:** the AI chat returns useful answers grounded in your real data for all four chip prompts; Messaging Themes match or beat what Motion's were showing you; Inspo grid renders saved competitor ads filterably.

### Sprint 3 — Polish + edge reports (post-Aug 1 relaunch)
- `landing-page-analyzer` edge function (Playwright via Browserless or Apify) → Landing Page Analysis view
- `video-analyzer` edge function (ffmpeg frame extraction + Claude vision on 4-6 key frames) → Video Analysis view  
- Boards (user-organized inspo collections)
- Week-over-Week Trends view with charts (existing chart approach — confirm what library Creative Engine/Inventory use)
- Phase 4 planning: review every view, decide what graduates into `creative-engine` and what stays standalone

---

## Cost analysis (12 months)

| | motionapp.com | Ad Creative Tool |
|---|---|---|
| Subscription | $3,000 | $0 |
| Vercel | — | $0 (existing GH Pages) |
| Supabase | — | $0 (existing project, free tier covers volume) |
| Storage | — | ~$2/mo = $24 (Supabase Storage) |
| Apify | — | ~$5/mo = $60 |
| Anthropic API | — | ~$15/mo = $180 (tagging + chat) |
| Voyage API | — | $0 (50M-token free tier covers FR scale forever) |
| **Total** | **$3,000** | **~$264** |
| **Annual savings** | | **$2,736** |
| Build time | | ~18 hrs across 2.5 weeks (existing infra) |

Breakeven: month 2. Every month after is pure relaunch capital.

---

## Claude Code kickoff prompt (Sprint 1)

Paste this verbatim into Claude Code from the repo root:

```
We're building the Ad Creative Tool — an internal replacement for the motionapp.com 
subscription. It's a separate scratch module in this repo; after testing we'll decide 
what merges into creative-engine.

READ FIRST, IN THIS ORDER:
1. /CLAUDE.md  — repo-wide conventions; non-negotiable
2. /docs/specs/ad-creative-tool.md  — this module's spec
3. /spec/CONTEXT_FILE_FR_Brand_Guidelines_V3.pdf  — authoritative brand book; the 
   Brand Compliance section of the spec defers to this PDF on any conflict
4. /docs/mockups/creative-engine-v5.html  — see how brand applies in a complex module
5. /docs/mockups/inventory-portal.html  — see how brand handles dense data + KPIs
6. /src/utils/inventoryRouting.js  — pattern to mirror for routing
7. /src/utils/treatmentStore.js  — pattern to mirror for stores
8. /supabase/functions/anthropic-proxy/index.ts  — pattern to mirror for new edge fns

After reading all eight, summarize back to me in 7 bullets: stack, folder rules, 
store pattern, brand palette constraints (including Soil hex extracted from the PDF), 
append-only collections, design intent (Apple-level / Jobs-level — what it operationally 
means here), and how you'll handle Motion screenshots when I share them. If anything 
in the spec contradicts CLAUDE.md or the brand PDF, flag it and stop — we resolve 
before coding.

ABOUT MOTION SCREENSHOTS: I will share screenshots of motionapp.com throughout this 
build. They are FUNCTIONAL reference only (which panels and data to build), never 
VISUAL reference (Motion's dark dense look is the opposite of FR's brand). When I 
share one, your job is: (1) identify what's on screen, (2) discard Motion's visual 
treatment entirely, (3) re-render through the FR brand system, (4) show me the 
FR-version mockup before any JSX. If you find yourself reaching for dark zinc 
backgrounds or dense table rows, stop — that's the failure mode this protocol exists 
to prevent.

SPRINT 1 DELIVERABLE: I can open #ad-creative-tool/home and see real FR Meta ad 
performance grouped by Hook Tactic, Visual Format, etc., with AI tags applied across 
all 8 dimensions.

BUILD ORDER (do not skip):
1. Write docs/mockups/ad-creative-tool-v1.html using FR brand system. Show me. 
   I lock before any JSX. The mockup is done when there is nothing left to remove.
2. Supabase migration for the 14 tables + storage bucket.
3. meta-sync edge function. Test on real account, show me 10 sample synced ads.
4. ad-tagger edge function with 8 prompts. Tag 20 sample ads. Show me the tags. 
   I'll eyeball, you adjust prompts. Then tag full backlog.
5. Stores (6 of them per spec).
6. Routing helper + module entry.
7. Views (4 of them) + components (8 of them).
8. Add to top-level nav.
9. Append Module Conventions block to CLAUDE.md.

CONSTRAINTS:
- No TypeScript, no Zustand, no Zod. Plain JS + JSDoc.
- All Claude calls through anthropic-proxy. No direct Anthropic SDK calls in the app.
- All cloud DB calls through getAuthedSupabase().
- Append-only collections (ad_metric_snapshots, ad_tag_history, 
  messaging_theme_snapshots, ad_creative_agent_interactions) reject update/delete at 
  store layer.
- FR brand palette only (Salt/Slate/Sand/Soil + good/warn/bad). No new accent. 
  No emojis. No pop-ups. No bounces. No tooltips required to understand the UI.
- Apple-level design + Jobs-level simplicity as operationally defined in the Brand 
  Compliance section of the spec. Remove until you cannot remove anymore, then 
  remove one more thing, then ship.
- Motion screenshots are functional reference, never visual reference.
- Never-discount rule applies to all AI prompts. The OFFER_TYPE vocabulary explicitly 
  forbids markdown framing.
- The system prompt for the AI command bar (Sprint 2) must include the never-discount 
  hard rule, like inventoryAgent does.

When ambiguous, ask. Don't guess.
```

---

## Audit Checklist

After Claude Code finishes any sprint, ask it to verify against this list. Each item must be a "yes" before the sprint ships:

**Conventions:**
- [ ] All new code lives under `src/components/ad-creative-tool/` or `src/utils/` or `src/types/` per CLAUDE.md folder rules
- [ ] Stores are one file per data type in `src/utils/`, mirroring `treatmentStore.js`
- [ ] No imports cross module boundaries except through `src/utils/` stores
- [ ] All store cloud calls go through `getAuthedSupabase()`
- [ ] All Anthropic calls go through `anthropic-proxy` edge function
- [ ] All Voyage calls go through `voyage-proxy` edge function
- [ ] Types are JSDoc in `src/types/adCreativeTool.js`, not TypeScript
- [ ] No Zustand, no Zod, no TypeScript anywhere in module
- [ ] Hash routing follows `#ad-creative-tool/{view}[/{id}]` grammar
- [ ] `adCreativeToolRouting.js` exists and mirrors `inventoryRouting.js` shape (parse, build, migrate)

**Append-only:**
- [ ] `ad_metric_snapshots` rejects update/delete at store layer
- [ ] `ad_tag_history` rejects update/delete at store layer
- [ ] `messaging_theme_snapshots` rejects update/delete at store layer
- [ ] `ad_creative_agent_interactions` rejects update/delete at store layer

**Brand — palette & primitives:**
- [ ] No colors outside Salt/Slate/Sand/Soil/good/warn/bad palette
- [ ] Soil hex extracted from `CONTEXT_FILE_FR_Brand_Guidelines_V3.pdf` (not invented) and present in `adCreativeToolTokens.js`
- [ ] No emojis in UI or in mockup
- [ ] No deep shadows, no heavy borders
- [ ] No pop-ups, no cluttered banners
- [ ] No bounces, no fade-for-fade-sake animations
- [ ] Cards: white fill, 0.5px border at rgba(58,58,58,0.15), 8px radius, 18-22px padding
- [ ] Stat values use Cormorant; big KPI numbers use General Sans 28px wt500
- [ ] All currency via Intl.NumberFormat; all dates via Intl.DateTimeFormat
- [ ] Iconography inherited from existing modules (Lucide or equivalent), stroke-width 1.5, color is `text` or `textMuted` only
- [ ] FR wordmark/mark in top-left of module chrome at all times
- [ ] Hover/focus/loading/empty/error states match the table in Brand Compliance section

**Brand — design intent (Apple/Jobs):**
- [ ] Every view has exactly one primary action identifiable in <1 second
- [ ] No element on any view fails the "what question does this answer?" test
- [ ] No tooltips required to understand any label or icon
- [ ] Density only in data grids and ad detail panels; chrome is generous
- [ ] One color of meaning per card (performance OR recency OR status — never two at once)
- [ ] Motion screenshots referenced functionally only; visual treatment is FR throughout
- [ ] Microcopy is operator-direct: no "Welcome to", no "Let's get started", no exclamation points, no "simply/easily/quickly"

**Brand operating rules:**
- [ ] OFFER_TYPE vocabulary contains no "% off", "Sale", "BOGO", or markdown framing
- [ ] AI command bar system prompt includes the never-discount hard rule verbatim
- [ ] No markdown actions or recommendations anywhere in the module

**Mockup-first:**
- [ ] `docs/mockups/ad-creative-tool-v1.html` exists and was locked before any JSX
- [ ] Mockup uses FR brand system from line one (no Motion-derived dark/dense baseline)
- [ ] Every view in the module references a section of the mockup
- [ ] `CONTEXT_FILE_FR_Brand_Guidelines_V3.pdf` was read before the mockup was started (confirm in PR description)

**Infra:**
- [ ] All 14 Supabase tables have RLS enabled with `org_id` scoping
- [ ] Storage bucket `ad-creative-media` exists with proper access policies
- [ ] Edge functions deploy via the existing `.github/workflows/deploy-functions.yml`
- [ ] `pg_cron` jobs scheduled: `meta-sync` (hourly), `inspo-scrape` (daily), `compute-themes` (nightly)

**Performance:**
- [ ] Tag a real ad end-to-end (sync → tag → embed → cluster) and confirm < 30s wall time
- [ ] Cost per ad fully tagged < $0.05 (confirm via `ad_creative_agent_interactions`)
- [ ] Apify monthly spend tracked, capped at $5

---

## Changelog

- 2026-05-17 — initial spec drafted (phase 0)
- 2026-05-17 — Brand Compliance section added: required reading (FR Brand Guidelines V3 PDF + existing mockups), Apple-level/Jobs-level design operational definitions, Motion-screenshots-as-functional-reference-only protocol, iconography rules, logo placement, state styles, microcopy tone. Soil added to tokens as TBD pending PDF extraction. Audit checklist Brand section expanded from 7 to 22 line items.
