# FR PLM — Sprint 1 chunked prompts

Each `.md` file = one Claude Code chat session. Run in order. Start a fresh chat for each.

## Why chunks

Claude Code times out on long file writes (~400+ lines in one stream). Each chunk here is sized to finish without timing out.

## Rules

- **Read `CLAUDE.md` at the start of every chat.** Tell Claude Code to do this in the first line.
- **One chunk per chat.** When the chunk is done, commit, push, start a new chat for the next.
- **If Claude Code times out mid-chunk:** start a fresh chat, tell it which chunk you were on, what got written, and ask it to finish ONLY what's missing.

## Execution order

### P1 — Foundation
- `01-p1-rename-vendor.md`
- `02-p1-add-library-tabs.md`
- `03-p1-create-stubs-and-types.md`
- `04-p1-routing.md`

### P2 — Treatments
- `05-p2-treatment-library-and-store.md`
- `06-p2-treatment-list.md`
- `07-p2-treatment-builder-header.md`
- `08-p2-treatment-builder-twin-columns.md`
- `09-p2-treatment-builder-production-log.md`
- `10-p2-treatment-builder-drift-and-usage.md`
- `11-p2-seed-data.md`
- `12-p2-techpack-bom-picker.md`

### P3 — Production
- `13-p3-production-store.md`
- `14-p3-production-list.md`
- `15-p3-production-detail-header-bom.md`
- `16-p3-production-detail-usage-drift.md`
- `17-p3-writeback-engine.md`
- `18-p3-wire-treatment-rollups.md`
- `19-p3-seed-po.md`

19 chunks total. Most take 5-10 minutes per chat.
