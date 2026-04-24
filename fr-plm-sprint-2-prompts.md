# FR PLM — Sprint 2 prompts (Collaboration, Vendor Portal, Agent)

Execute AFTER Sprint 1 (Prompts 1–3) has shipped and been used for ~2–3 real POs.

**Repo:** `matasmillion/cashmodel`
**Prereqs:** Library/Styles/Production IA live · Treatments atom working · Production writeback loop closing · Factory→Vendor rename merged

---

## GLOBAL RULES — SAME AS SPRINT 1

1. **ADDITIVE ONLY. NO DELETIONS.**
2. **PRESERVE EXISTING WORKFLOWS.** Don't refactor `TechPackBuilder.jsx`, `ComponentPackBuilder.jsx`, or `TreatmentBuilder.jsx` except where explicitly allowed.
3. **RENAMES ARE NOT DELETIONS** when atomic.
4. **WHEN IN DOUBT, STOP AND ASK.**

### New Sprint 2 rule

5. **VENDOR-FACING SURFACES MUST NEVER EXPOSE INTERNAL COST DATA.** No cost fields, no vendor ratings, no internal notes, no competitor vendor names on any `/vendor/*` route. Enforce at the query layer, not just the UI. This is a trust commitment to vendors and a competitive firewall for you.

---

## Prompt 4 — DAM + Collaboration layer

**Estimate: 3–4 days.** Sprint 1 must be merged + used for ≥2 real POs so you have real comment anchors in mind.

### Context files

- `src/components/techpack/TechPackBuilder.jsx` — anchor points for comments
- `src/components/techpack/ComponentPackBuilder.jsx` — same
- `src/components/techpack/TreatmentBuilder.jsx` — atom-level comments
- `src/components/production/ProductionDetail.jsx` — PO-scoped comments
- `src/utils/techPackStore.js`, `treatmentStore.js`, `productionStore.js`
- `src/types/atoms.js`

### Goal
Add a collaboration layer across the entire PLM: anchored comments, approval state machines, notification routing, and a unified DAM grid. Internal teams and (later) vendors use the same comment primitive — scoped by visibility.

### Tasks

1. **`src/utils/commentStore.js` — comment schema:**

   ```js
   /**
    * @typedef {Object} Comment
    * @property {string} id
    * @property {CommentAnchor} anchor
    * @property {string=} parent_comment_id        // threading
    * @property {string} author_id
    * @property {'internal'|'vendor'} author_type
    * @property {string} body                       // markdown
    * @property {string[]} mentions                 // user_ids
    * @property {string[]} attachment_urls
    * @property {'open'|'resolved'} status
    * @property {'internal_only'|'external'} visibility
    * @property {Date} created_at
    * @property {Date=} resolved_at
    * @property {string=} resolved_by
    */

   /**
    * @typedef {Object} CommentAnchor
    * @property {'techpack_bom_row'|'techpack_pom_cell'|'techpack_section'|'trimpack_item'|'trimpack_section'|'atom'|'po_bom_row'|'po_atom_usage'|'document'} anchor_type
    * @property {string} document_id                // techpack_id, trimpack_id, po_id, or atom_id
    * @property {string=} sub_id                    // bom_row_id, pom_cell_id, atom_id
    */
   ```

   Comments are **append-only for the body field** — edits produce a new revision row, original is preserved. Deletion is soft (status=archived, never DB delete).

2. **`src/utils/approvalStore.js` — approval state machine:**

   ```js
   /**
    * @typedef {Object} ApprovalState
    * @property {string} document_type              // 'techpack' | 'trimpack' | 'po'
    * @property {string} document_id
    * @property {DocumentState} state
    * @property {Date} state_since
    * @property {string=} assigned_approver_id
    */

   /** @typedef {'draft'|'internal_review'|'approved'|'sent_to_factory'|'sampling'|'production_ready'|'archived'} DocumentState */

   /**
    * @typedef {Object} StateTransition
    * @property {string} id
    * @property {string} document_type
    * @property {string} document_id
    * @property {DocumentState} from_state
    * @property {DocumentState} to_state
    * @property {string} actor_id
    * @property {string} note
    * @property {Date} timestamp
    */
   ```

   Legal transitions: `draft → internal_review`, `internal_review → approved` OR `internal_review → draft` (rejected), `approved → sent_to_factory`, `sent_to_factory → sampling`, `sampling → production_ready`, `production_ready → archived`. Illegal transitions throw.

   Every transition logs a `StateTransition` row. Append-only.

3. **`src/components/collab/CommentSidebar.jsx` — reusable comment sidebar:**
   - Slides in from right, 340px wide, overlay not push (don't disturb the underlying layout).
   - Shows threads filtered to current document. Tabs: All · Open · Resolved.
   - Each thread: anchor preview ("BOM row: fabric_id=FB-CTN-007"), comments, inline reply, resolve button.
   - Mention picker: `@` triggers autocomplete against internal users (Sprint 2) and vendor users (Sprint 2 Prompt 5).
   - Attachment upload: stores via Supabase Storage, attaches URLs to comment body.
   - Keyboard: `Cmd/Ctrl+Enter` to submit, `Esc` to close.

4. **Anchor integration — additive overlays on existing components:**
   - `TechPackBuilder`: hover any BOM row, POM cell, or section header → comment icon appears in margin. Click → opens CommentSidebar with that anchor preselected.
   - Same for `ComponentPackBuilder` and `TreatmentBuilder`.
   - **Do not modify the existing layout.** Overlay the comment affordance absolutely positioned. If this is awkward, stop and flag.

5. **`src/components/collab/ApprovalBar.jsx`** — state machine UI:
   - Horizontal stepper showing all states; current state highlighted.
   - Right-side "Advance to..." dropdown limited to legal next states.
   - Transition dialog: note field + optional approver assignment + submit.
   - Mount at top of `TechPackBuilder`, `ComponentPackBuilder`, `ProductionDetail`.

6. **`src/utils/notificationStore.js` + `src/components/collab/NotificationBell.jsx`:**

   ```js
   /**
    * @typedef {Object} Notification
    * @property {string} id
    * @property {string} user_id
    * @property {'comment_reply'|'mention'|'state_transition'|'approval_request'|'tracking_submitted'} type
    * @property {object} payload                    // anchor_id, actor_name, etc
    * @property {Date=} read_at
    * @property {Date=} sent_at
    * @property {Date} created_at
    */
   ```

   - Bell icon top-right of PLM chrome. Badge = unread count.
   - Panel: grouped by day, most recent first. Click = navigate to anchor.
   - Email dispatch (stub for now — wire to Resend in Prompt 5).

7. **`src/components/dam/DAMView.jsx`** — unified digital asset grid:
   - New top-level tab in PLM: add "DAM" as a fourth top tab (Library, Styles, Production, DAM).
   - Grid view of every `DigitalAsset` across every atom type.
   - Filters: atom_type, asset_type (zfab/ztrm/dxf/lora/ase/etc), status, last_synced.
   - Each tile: thumbnail, atom name + code, asset type badge, download button (signed URL via Supabase Storage).
   - Bulk download as ZIP for selected assets.
   - Secondary view: "By Style" — pick a style, see every digital asset its BOM references.
   - Secondary view: "By PO" — pick a PO, see every digital asset its BOM snapshot references (uses BOM snapshot, not current style BOM).

8. **Notification routing rules:**
   - New comment on thread you authored or were mentioned in → notify.
   - @mention → priority notification.
   - State transition on document you approved → notify.
   - Approval request assigned to you → notify.
   - Email + in-app for all of the above; per-user preferences table (stub — default all on).

### Design constraints

- Same FR brand. No new colors introduced.
- Comments sidebar: white card, 0.5px border, 14px body font, 11px meta.
- State stepper: mono for state names, Slate active / Sand inactive, 5×12px pills.
- DAM tiles: 180×180px, same card chrome as atoms, thumbnail fallback = atom's base color swatch.
- Notification panel: compact, 11px timestamps, mono for IDs.

### Non-goals

- No vendor-visible comments yet (visibility='external' threads render internal-only until Prompt 5 grants vendor access).
- No real-time collaboration (OT/CRDT) — comments are request-response.
- No PDF-pixel-coordinate anchoring — comments anchor to structured data only.

### Acceptance

- Can comment on a BOM row, POM cell, atom, or PO from its respective builder.
- Threading works. @mentions autocomplete. Resolution flips status.
- Can advance a TechPack through its state machine. Illegal transitions fail loudly.
- Notification bell shows unread count and routes to anchor on click.
- DAM grid shows every digital asset, filterable and downloadable.
- "By Style" DAM view shows assets from current BOM; "By PO" shows assets from BOM snapshot (tests the snapshot immutability from Sprint 1).

---

## Prompt 5 — Vendor Portal

**Estimate: 1–1.5 weeks.** Prompt 4 must be merged. Email service (Resend) provisioned.

### Context files

- All Sprint 1 + Prompt 4 files
- `src/utils/vendorLibrary.js`
- `src/utils/productionStore.js`
- `src/utils/commentStore.js`

### Goal
Build a separate, scoped, i18n-aware application surface for vendors. Vendors authenticate via magic link, see only their own POs in English or Simplified Chinese, can advance PO status, submit tracking, download inherited assets, and comment on their POs.

### Tasks

1. **Vendor auth layer:**

   ```js
   /**
    * @typedef {Object} VendorUser
    * @property {string} id
    * @property {string} vendor_id                  // FK → vendorLibrary
    * @property {string} email
    * @property {string=} name
    * @property {'en'|'zh-CN'} language_pref
    * @property {'admin'|'operator'} role
    * @property {Date=} last_login_at
    * @property {Date} created_at
    */

   /**
    * @typedef {Object} MagicLinkToken
    * @property {string} token                      // hashed server-side
    * @property {string} vendor_user_id
    * @property {Date} expires_at                   // 15 minutes from issue
    * @property {Date=} used_at
    */
   ```

   - Login page at `/vendor/login`: email input → sends magic link via Resend → vendor clicks link → exchanges token for session cookie → lands on `/vendor/dashboard`.
   - Session cookie: HTTP-only, SameSite=Lax, 30-day expiry, stores `vendor_user_id` + `vendor_id`.
   - Row-level security helper: every vendor-scoped query goes through `scopedQuery(vendorId, tableName, filters)` which injects `WHERE vendor_id = $1`. No raw queries from vendor routes.

2. **Internal admin for vendor users:**
   - Add to `VendorManager` (internal view only): a "Users" subsection on each vendor. Invite new vendor user by email → sends initial magic link. Revoke access. Set role. Non-destructive additive edit to `VendorManager`.

3. **i18n infrastructure:**
   - Install `react-intl` (or equivalent).
   - Translation keys in `src/i18n/en.json` and `src/i18n/zh-CN.json`. Structure: `vendor.dashboard.title`, `vendor.po.status.shipped`, etc.
   - Language toggle top-right on all `/vendor/*` pages. Persists to `VendorUser.language_pref`.
   - **Every** user-facing string on vendor routes goes through the i18n layer. No string literals.
   - Dates: locale-aware formatting via `Intl.DateTimeFormat`.
   - Numbers/currency: `Intl.NumberFormat`.

4. **Route namespace `/vendor/*`:**
   - `/vendor/login`
   - `/vendor/dashboard` — two tabs: Samples · Production
   - `/vendor/po/:code` — PO detail
   - `/vendor/settings` — language, name, password-less (they can update email, resend link)
   - Middleware: anything `/vendor/*` except `/vendor/login` requires valid session; redirect otherwise.

5. **`src/components/vendor/VendorDashboard.jsx`:**
   - Header: FR wordmark (subtly differentiated — add "Vendor Portal" subline), language toggle, user name, logout.
   - Two tabs: Samples (POs where `style.type='sample'` or `units_ordered < 50`) · Production (everything else).
   - Table: PO code, style name (i18n-safe), units, current status pill, expected date, open-comments count. Row click → `/vendor/po/:code`.
   - Empty state per tab: localized copy.

6. **`src/components/vendor/VendorPODetail.jsx`:**
   - Header: PO code, style name, units, current status.
   - **Status stepper**: horizontal, clickable where legal. States the vendor controls: `received → in_progress → qc → ready_to_ship → shipped → delivered`. Clicking a state opens a transition dialog with:
     - Optional note (markdown textarea).
     - Optional photo upload (multiple, stored in Supabase Storage).
     - Submit → writes `StateTransition` + `POStatusUpdate` rows.
   - **Asset inheritance panel** — "Files you'll need":
     - Pulls every `DigitalAsset` from the PO's BOM snapshot.
     - Grouped by atom type: Pattern files · Fabric specs · Trim files · Logos & embellishments · Wash references · LoRA renders.
     - Each row: thumbnail, filename, file size, download button (signed URL).
     - Bulk "Download all" ZIP.
   - **Comments section**: scoped comments on this PO. Vendor sees only `visibility='external'` threads. Can create new threads (anchored to PO or to specific BOM rows). @mentions limited to internal users on the PO's style.
   - **Tracking submission** (only visible when status ≥ `ready_to_ship`):
     - Free-text tracking number field.
     - Carrier auto-detection via regex:
       - DHL: `^\d{10,11}$`
       - FedEx: `^\d{12,15}$`
       - UPS: `^1Z[A-Z0-9]{16}$`
       - China Post: `^[A-Z]{2}\d{9}CN$`
       - SF Express: `^SF\d{10,12}$`
       - Fall back to "Unknown" — internal user can correct.
     - On submit: advances status to `shipped`, stores `TrackingInfo`, fires notification to internal team.

7. **`src/utils/trackingStore.js`:**

   ```js
   /**
    * @typedef {Object} TrackingInfo
    * @property {string} po_id
    * @property {string} tracking_number
    * @property {string} carrier                    // auto-detected or 'unknown'
    * @property {string} submitted_by_vendor_user_id
    * @property {Date} submitted_at
    * @property {Date=} delivered_at                // filled when received_at on PO is set
    */

   /**
    * @typedef {Object} POStatusUpdate
    * @property {string} id
    * @property {string} po_id
    * @property {string} status
    * @property {string} updated_by_vendor_user_id
    * @property {string} note
    * @property {string[]} photo_urls
    * @property {Date} timestamp
    */
   ```

8. **Internal-side visibility:**
   - On `ProductionDetail.jsx` (internal view), add an "External activity" panel showing all `POStatusUpdate` rows + `TrackingInfo` for this PO. Read-only. Additive — do not refactor existing layout.
   - Notifications fire on: status update by vendor, tracking submitted, new external comment.

9. **Visual differentiation for /vendor/:**
   - Keep FR brand 100% — same colors, type, tone.
   - Add one subtle cue this is the vendor portal: wordmark subtitle "Vendor Portal" in 10px tracked-out caps.
   - Chrome/header is slightly simpler: no top nav beyond dashboard/settings. Everything else is inside PO detail.

### Design constraints

- Same FR brand. i18n'd copy only.
- Chinese typography: ensure line-height ≥ 1.6 for CJK, fonts fall back cleanly. Use `font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;` for zh-CN.
- Forms: labels always above inputs (safer for CJK line-wrapping than inline labels).
- Dates: "2026年2月18日" format for zh-CN, "Feb 18, 2026" for en.
- Status pill colors consistent with internal side for cognitive transfer.

### Non-goals

- No machine translation of user-authored content (tech pack notes, comment bodies). UI only.
- No vendor-to-vendor comments. No vendor seeing other vendors' POs (ever — this is a hard line).
- No payment portal. No invoice generation.
- No mobile app — responsive web only.

### Acceptance

- Vendor receives magic link, logs in, lands on their dashboard.
- Language toggle flips entire UI without page reload.
- Vendor sees ONLY their POs. Attempts to access another vendor's PO via URL return 404.
- Vendor can advance PO status with note + photos.
- Tracking auto-detects DHL/FedEx/UPS/China Post/SF correctly; unknown falls back gracefully.
- Asset inheritance panel pulls from BOM snapshot, not current style (verify with a post-placement style edit — vendor still sees snapshot assets).
- Vendor comments visible to internal team; internal `visibility='internal_only'` comments invisible to vendor.
- No cost fields, vendor ratings, or internal notes render on any `/vendor/*` route — verify with grep of rendered HTML.

---

## Prompt 6 — Agent layer: follow-ups, tracking parsing, notifications

**Estimate: 3 days.** Prompt 5 must be merged. Anthropic API key provisioned.

### Context files

- All Sprint 1 + 2 files
- `src/utils/trackingStore.js`
- `src/utils/notificationStore.js`

### Goal
Add a proactive agentic layer that follows up with vendors every 3 days on open POs, parses natural-language replies for tracking info, and pings the internal team on key events. Always human-in-loop: the agent drafts, humans confirm.

### Tasks

1. **`src/utils/agentStore.js`:**

   ```js
   /**
    * @typedef {Object} AgentTask
    * @property {string} id
    * @property {'followup_3day'|'tracking_reminder'|'status_stall_check'|'po_close_nudge'} type
    * @property {string} target_po_id
    * @property {string} target_vendor_user_id
    * @property {Date} scheduled_for
    * @property {Date=} sent_at
    * @property {Date=} responded_at
    * @property {string=} response_body
    * @property {object=} parsed_response            // extracted tracking, status, etc
    * @property {'scheduled'|'sent'|'responded'|'cancelled'|'human_review'} status
    */

   /**
    * @typedef {Object} AgentInteraction
    * @property {string} id
    * @property {string} task_id
    * @property {string} claude_model                // 'claude-opus-4-7' etc
    * @property {object} input
    * @property {object} output
    * @property {number} tokens_used
    * @property {Date} timestamp
    */
   ```

2. **Scheduled job runner:**
   - Use Supabase `pg_cron` or a lightweight worker on Railway (your existing stack preference).
   - Job: every hour, scan `agent_task` for rows where `scheduled_for <= now() AND status = 'scheduled'`. Process each.
   - Per-PO rate limit: max 1 agent message per 48 hours regardless of task type.

3. **Task: `followup_3day`:**
   - Trigger: for every PO in state `in_progress` or `qc` with no `POStatusUpdate` in last 3 days, schedule a task.
   - Action: send email to vendor user in their language.
   - Email template (composed via Claude API for tone calibration, not canned):
     - Subject (en): "Quick check-in on {po_code}"
     - Subject (zh-CN): "关于 {po_code} 的进度询问"
     - Body asks 1 question: "How's production going? Reply with a status update or any blockers."
     - Links back to `/vendor/po/:code` with auto-login token (single-use, 24hr expiry).

4. **Task: `tracking_reminder`:**
   - Trigger: PO in state `ready_to_ship` for >2 days without tracking.
   - Action: email nudge specifically asking for tracking number.

5. **Natural language tracking parser:**
   - When vendor replies to any agent email, route reply to `/api/agent/ingest` webhook.
   - Send reply body + PO context to Claude API.
   - Extract: `{ status_update?: string, tracking_number?: string, carrier?: string, blockers?: string, requires_human: boolean }`
   - If `tracking_number` found AND high confidence → auto-create `TrackingInfo`, advance PO to `shipped`, notify internal team.
   - If `requires_human` OR low confidence → queue to notification bell as "Agent needs review" with draft parsing for internal user to confirm/reject.

6. **Task: `status_stall_check`:**
   - Trigger: PO in same state for >7 days.
   - Action: internal notification only ("PO-0024 has been in 'in_progress' for 8 days — want me to follow up?"). Human approves before agent sends anything to vendor.

7. **`src/components/collab/AgentReviewPanel.jsx`:**
   - New panel inside `NotificationBell` for tasks with `status='human_review'`.
   - Shows: original vendor reply, agent's parsed interpretation, suggested action (e.g., "Create tracking: DHL 1234567890").
   - Buttons: Approve & Apply · Edit · Reject.
   - On approve: agent action executes. On edit: user modifies then applies. On reject: task dismissed, no state change.

8. **`src/utils/claudeAgent.js`** — single Claude API integration module:
   - Reads `ANTHROPIC_API_KEY` from env.
   - Functions: `composeFollowupEmail(po, vendorUser, language)`, `parseVendorReply(replyBody, poContext)`, `draftStallNudge(po)`.
   - All calls logged to `AgentInteraction`. Token usage tracked for cost monitoring.
   - Model: `claude-opus-4-7` for nuanced tasks (email composition, reply parsing), `claude-haiku-4-5` for simple classification.

9. **Email infrastructure:**
   - Use Resend (or your existing provider).
   - From address: `ops@foreignresource.com`.
   - Reply-to: unique per-task address like `po-0024-followup-{task_id}@reply.foreignresource.com` → routes to webhook.
   - Track opens and clicks for agent tuning.

10. **Agent dashboard for internal users:**
    - New route `/plm/agent` (internal only).
    - Shows: scheduled tasks, recent sent messages, response rates, tasks needing human review.
    - Stats: average response time per vendor, tracking-auto-capture success rate, cost per month (tokens × price).

### Design constraints

- Agent review cards: identifiable at-a-glance as "agent output" with a subtle leading dot or icon. Never pretend output is from a human.
- Email templates: plain text first, HTML fallback. Warm, short, on-brand — not corporate. Same voice as the brand guidelines: "Quiet confidence is louder than shouting."
- All agent-drafted content clearly labeled "Draft by Claude" inside internal UI — vendor-facing emails signed from the internal team name (e.g., "The FR Production Team").

### Non-goals

- No autonomous purchase decisions. No autonomous PO placement. No autonomous payment release. Agent suggests; humans approve.
- No learning/fine-tuning on vendor replies in Sprint 2. Just prompt engineering.
- No voice or WhatsApp integration (maybe Sprint 3).
- No multi-turn agent conversations with vendors — one question, one reply, parsed, done. Complex cases escalate to humans.

### Acceptance

- For every open PO with no update in 3 days, a `followup_3day` task is scheduled and sent.
- Vendor replies to an agent email; system parses correctly in both English and Chinese.
- When tracking is parsed with high confidence, PO auto-advances to `shipped` and internal team is notified.
- Low-confidence parses surface in Agent Review panel with approve/edit/reject flow.
- Rate limit holds: no vendor receives >1 agent message per 48hrs regardless of task pile-up.
- `AgentInteraction` log captures every Claude API call with token counts.
- Agent dashboard shows cost-to-date for the month.

---

## Sprint 2 total

**~2–2.5 weeks of Claude Code work.** Gated on Sprint 1 shipping and running for real for ~1 week first.

## Commits

- Prompt 4: `feat(plm): collaboration layer — anchored comments, approvals, DAM grid`
- Prompt 5: `feat(plm): vendor portal with magic-link auth, i18n en+zh-CN, asset inheritance`
- Prompt 6: `feat(plm): agent layer — 3-day followups, tracking parser, human-in-loop review`

## What's deliberately deferred to Sprint 3+

- CLO-SET Open API integration (atoms already carry the envelope — this is a connect-the-pipes job)
- Real-time collaboration (CRDT/OT) on documents
- Mobile vendor app
- WhatsApp / voice integration for the agent
- Multi-region auth (EU vendors, data residency)
- Automated quality-inspection photo analysis via vision models
- Self-service vendor onboarding
