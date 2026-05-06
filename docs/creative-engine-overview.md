# Creative Engine — overview

The Creative Engine is the agent layer that runs Foreign Resource's
4-week creative ad-testing sprint loop:

```
Constraint → Hypothesis → Brief (agent) → Render (agent) → Encoder
  → Meta upload (PAUSED) → Daily evaluation → Weekly synthesis
  → Banked learning → next sprint seeded
```

It mirrors how the PLM module compounds physical product knowledge:
every closed sprint writes a structured learning, every new brief
queries past learnings before the LLM call. The system gets smarter as
the corpus grows, not as the model changes.

---

## 4-layer intelligence model

1. **Knowledge files** (DB-backed, structured per-org questionnaires
   for `avatar`, `brand`, `product`, `models`). Editable in
   `Creative Engine → Knowledge`. AI auto-fill via uploaded PDFs /
   product photos. Always injected into every brief generation.
2. **Past learnings** (append-only `learnings` table). Filtered into
   the brief prompt: recent winners for the lane, recent losers for
   the hypothesis type.
3. **Per-sprint constraint** (the `constraint_text` you set when
   creating a sprint). Drives the specific hypothesis being tested.
4. **Live ad metrics** (`metrics_daily`, append-only). Aggregated into
   the weekly synthesis prompt to write the next learning.

---

## Data model

| Table | Append-only? | Purpose |
|---|---|---|
| `sprints` | no | one row per 4-week test sprint |
| `briefs` | no | versioned brief docs per sprint |
| `renders` | no | per-variant render records (provider job ids, raw + encoded URLs, status) |
| `ads` | no | one row per published Meta ad |
| `metrics_daily` | **yes** | one row per (ad, date), inserted by `evaluate-daily` |
| `learnings` | **yes** | finalized brand-voice synthesis, the compounding corpus |
| `discussions` | no | weekly synthesis sessions (draft → final → committed to `learnings`) |
| `budget_config` | no | one row per org — weekly cap, kill-switch |
| `creative_library` | no | inspiration / competitor / brand asset catalog |
| `creative_knowledge` | no | structured per-kind brand knowledge (jsonb, versioned) |
| `agent_interactions` | yes | audit log for slack-actions (and future agent calls) |

All tables RLS-scoped via `public.jwt_org_id()`.

---

## Sprint lifecycle (status transitions)

```
drafting    → user creates sprint, fills constraint
brief_ready → generate-brief produces a brief; user approves
rendering   → dispatch-render fires; renders polled until done
in_queue    → renders approved; encoder-pass runs; ready to publish
live        → upload-meta-ad publishes to Meta (PAUSED); user resumes
closed      → sprint ended; synthesis-weekly writes a discussion
```

---

## Edge function map

| Function | Auth model | Purpose |
|---|---|---|
| `anthropic-proxy` | user JWT (RLS) | generic Claude API forwarder |
| `generate-brief` | user JWT (RLS) | brief orchestrator (knowledge + learnings → Claude → brief row) |
| `analyze-knowledge-upload` | user JWT (RLS) | reads uploaded files, suggests knowledge fields |
| `fal-proxy` | user JWT (RLS) | generic fal.ai forwarder |
| `higgsfield-proxy` | user JWT (RLS) | generic Higgsfield forwarder |
| `dispatch-render` | user JWT (RLS) | submits renders to fal/Higgsfield based on lane |
| `check-render-status` | user JWT (RLS) | polls upstream provider, updates render row |
| `encoder-pass` | user JWT (RLS) | re-encodes render to Meta spec via Transloadit |
| `meta-proxy` | user JWT (RLS) | Graph API forwarder for write ops |
| `upload-meta-ad` | user JWT (RLS) | publishes encoded render as PAUSED ad |
| `evaluate-daily` | cron-secret OR user JWT | pulls Meta insights, writes metrics_daily, applies thresholds |
| `synthesize-weekly` | cron-secret OR user JWT | aggregates closed sprints, writes discussion drafts |
| `slack-proxy` | user JWT (RLS) | generic Slack API forwarder |
| `slack-actions` | Slack signing secret | webhook for interactive button clicks |
| `apify-proxy` | user JWT (RLS) | generic Apify API forwarder for competitor scraping |

---

## Credential storage

All third-party credentials live in `user_integrations` keyed on
`(org_id, provider)`:

| provider | token field | metadata |
|---|---|---|
| `anthropic` | API key | `{}` |
| `fal` | API key | `{}` |
| `higgsfield` | API key | `{}` |
| `transloadit` | auth secret | `{ auth_key: 'public-key' }` |
| `meta` | access token | `{ account_id: 'act_…', page_id: '…' }` |
| `slack` | bot token | `{}` |
| `apify` | API token | `{}` |

The browser only ever sees a "connected: true" flag — actual tokens
travel only between the proxy edge function and the upstream API.

---

## Hash routing

`#creative-engine/{view}[/{id}]`

Views: `today | knowledge | pulse | sprints | brief | jobs |
production | queue | ads | library | learnings`

Mirrors the PLM module's hash convention. Helpers in
`src/utils/creativeRouting.js`.

---

## Brand palette (hybrid)

- FR brand (Salt `#F5F0E8` / Slate `#3A3A3A` / Sand `#EBE5D5`) for all
  surfaces.
- Navy `#1B2741` reserved for two accent surfaces:
  - `<LiveAds />` table `<thead>`
  - `<TodayView />` budget guardrail bar (under-threshold state)
