# FR Tech Pack Build — Full Conversation Context

*Conversation date: March–April 2026*

---

## WHAT THIS CONVERSATION WAS ABOUT

Extended working session building out the FR tech pack system — 14-page A4 landscape template with English + Chinese versions, SVG export for Illustrator editing, interactive React builder with persistent storage, and an installed skill file for future tech pack generation. Also covered fashion industry concepts (spec sheets, OTB) and began (but did not complete) SKU system design.

---

## KEY DECISIONS MADE

- **14-page A4 landscape structure** finalized: Cover / Design Overview / Flat Lay Diagrams / BOM / Color & Artwork / Construction Details / Construction Sketches / Pattern Pieces & Cutting / POM / Garment Treatments / Labels & Packaging / Order & Delivery / Compliance & Quality / Revision History
- **Typography locked**: Cormorant Garamond (titles), Helvetica (body)
- **Chinese translations** use STSong-Light CID font (not TrueType). Every text draw must use CJK font — Helvetica silently fails on Chinese characters
- **SVG format preferred over PDF** for Illustrator editing — no font embedding issues, no clipping masks to release, no embedding needed
- **Photos cannot be transferred** from the builder artifact to backend — browser sandbox limitation. Builder has in-artifact photo upload, but photos stay in browser storage
- **Page 12 restructured**: Order & Delivery now includes Quantity Per Size (with total row), Delivery Details (ship address, incoterm, ship date, forwarder, special instructions), Packing List (carton breakdown, dims, gross/net weight)

---

## DETAILED CONTEXT

### FR Brand Constants (reference)
- Colors: Slate #3A3A3A, Salt #F5F0E8, Sand #EBE5D5, Stone #716F70, Soil #9A816B, Sea #B5C7D3, Sage #ADBDA3, Sienna #D4956A
- Factories: Dongguan Shengde Clothing Co., Ltd. (东莞圣德服装有限公司) — cotton jersey/denim/twill; Guangzhou Yuanfuyuan Leather Co., Ltd. — waxed canvas
- Product lines: Borderless Basics (active), Snowflake Staples, + 2 TBD
- Core products: Hoodie $117, Sweatpants $117, Tee $37
- Size range: S–XL; measurements in cm
- Sales: Shopify only; barcodes via Retail Barcode Labels app

### Borderless Basic Zip-Up Hoodie — Tech Pack Data
- **Style #**: FR-BB-ZH-001
- **SKU Prefix**: FR-BB-ZH
- **Target retail**: $117, Target FOB: $22.19
- **Fabric**: 400 GSM French Terry, 100% cotton
- **Rib**: 95% Cotton / 5% Spandex
- **Zipper**: YKK #5 Coil, Nylon, Slate, full length, custom FR metal pull
- **Drawstring**: Round cord, cotton, Slate
- **Logo placement**: Snowflake emblem center chest (3.8x3.8cm, 8cm from collar) + FOREIGN RESOURCE wordmark upper back (2cm H, 3cm from collar), both tonal embroidery
- **Construction**: 8-row seam spec (side/shoulder/sleeve/hood/zipper/pocket/hem rib/cuff rib), all flatlock 301, tonal thread
- **SKUs**: FR-BB-ZH-SLT-S / -M / -L / -XL

### Files Delivered (in /mnt/user-data/outputs/)
- `FR_TechPack_Template_Blank.pdf` — 14-page blank template
- `FR_BB_ZipHoodie_EN.pdf` — filled English version
- `FR_BB_ZipHoodie_CN.pdf` — filled Chinese version (STSong-Light CID font, all text properly rendered)
- `FR_BB_ZipHoodie_TechPack_SVG.zip` — 14 individual SVG files for Illustrator editing
- `FR_TechPack_SKILL.md` — downloadable copy of the active skill

### Interactive Builder Artifact
- React artifact: `fr-techpack-builder.jsx`
- 14-step wizard with persistent storage via `window.storage`
- Features: FR color dropdowns, BOM library (trims saved across tech packs), photo uploads (drag-drop, auto-resize to 1200px JPEG), cross-session persistence
- User tested: 66% completion / 18 photos / 8 library items on test run

### Skill File (Active)
- Location: `/mnt/skills/user/fr-techpack/SKILL.md`
- 290 lines covering: new product questionnaire, variation flow, Chinese translation dictionary, factory registry, color system, 14-page structure
- Triggers automatically when tech pack / BOM / POM / new product mentioned

### Fashion Industry Concepts Explained

**Spec sheet vs. tech pack**: A spec sheet is a subset of the tech pack focused on POM + construction specs (pages 6, 9 in FR template). In industry practice, the spec sheet often travels separately because it revises every fitting iteration, while BOM/branding/packaging stay stable. If Shengde asks for "the spec sheet," they want pages 6 + 9, not the full 14-page document.

**OTB (Open To Buy)**: Inventory budget formula — `Planned Sales + Planned Markdowns + Planned EOM Inventory − Current Inventory − On Order`. An OTB calculator covers:
- Sales planning by style by month
- Inventory position (on-hand, on-order, in-transit)
- Margin targets (FR is at ~81% gross margin: $117 retail / $22.19 FOB)
- Size ratios (industry standard ~15/30/35/20 for S/M/L/XL, but actual sell-through should drive this)
- Weeks of supply (more for staples like Borderless Basics, fixed quantity with no reorder for Tier 2 drops)
- Cash flow timing (Shengde 30/70 payment terms vs. Shopify revenue timing)

### Key Technical Learnings
- **CID fonts required for Chinese** — TTC files fail in reportlab with "postscript outlines not supported" error. Use `UnicodeCIDFont('STSong-Light')` instead
- **Mixed font rendering bug** — when switching to CN mode, EVERY text draw (labels, values, table data, care instructions) must use STSong-Light, not just section titles. Helvetica silently renders nothing for Chinese characters
- **SVG for Illustrator editing** solves: font embedding issues (fonts referenced by name, editable as live text), clipping mask releases (no masks in SVG), embedded file problems (single-file format)
- **SKILL files are active in-session** once placed in `/mnt/skills/user/{name}/SKILL.md`

---

## WHAT'S NEXT / OPEN ITEMS

### Pending — SKU System
Matias confirmed requirements:
- Size embedded in SKU
- 8-12 character length
- Encode line identifier (BB = Borderless Basics, SS = Snowflake Staples)
- 1-2 colorways per style

Still needed from Matias before building:
- List of all planned product line names (3-4 total)
- Whether Tier 2 drops restock or are one-run
- Who reads SKUs (3PL? Wholesale buyers? Internal only?)
- Current live Shopify SKU example for reference
- Existing work location: Figma board `KH59OkYDpshtQdZa4pl7EX`

### Pending — Builder v2 Updates
Discussed but not yet built:
- BOM image uploads + supplier contact per item
- Label design detail section (separate from labels list)
- Packaging diagram section
- Split Order & Delivery into sample order + sample address + bulk order + bulk address with SKU breakdown
- Packing list breakdown by SKU
- "Manufacturer decides packing list" checkbox
- ShipHero PO automation (Matias has ShipHero account — can push POs directly)

### Pending — OTB Calculator
Offered but not built. Next step pending Matias's go-ahead. Would integrate with Page 12 of tech pack (Order & Delivery) as the upstream decision tool.

---

## REFERENCE LINKS

- Website: foreignresource.com
- SKU system board: Figma `KH59OkYDpshtQdZa4pl7EX`
- Font: Cormorant Garamond from fontsource CDN (jsdelivr)

### Working Files (in /home/claude)
- `build_techpack.py` — FR blank template generator
- `gen_filled_techpack.py` — FR filled EN+CN generator
- `gen_svg_techpack.py` — FR SVG generator
- `CormorantGaramond-Regular.ttf` and `-Bold.ttf` — FR title font
