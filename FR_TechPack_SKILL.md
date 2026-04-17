---
name: fr-techpack
description: Create, fill, translate, and manage tech packs for Foreign Resource Co. products. Trigger this skill when the user mentions tech pack, techpack, BOM, POM, points of measure, bill of materials, garment spec, factory spec sheet, new product development, product spec, or asks to create/update/translate a tech pack. Also trigger when the user says they have a new product, new style, new colorway, or wants to send specs to factory. This skill handles the full lifecycle from questionnaire intake through PDF generation and Chinese translation.
---

# Foreign Resource Co. — Tech Pack System

## Overview

This skill manages the entire tech pack workflow for Foreign Resource Co., an aspirational lifestyle fashion brand. Tech packs are the single source of truth sent to factories for production. Every tech pack follows the FR template (A4 landscape, 14 pages) and uses the FR brand system.

---

## WORKFLOW ROUTING

When this skill triggers, determine which path the user needs:

### Path A: New Product Tech Pack
Trigger: "new product", "new style", "new tech pack", "start a tech pack"
→ Run the **New Product Questionnaire** (Section 1)
→ Generate the tech pack PDF with prefilled data
→ Offer Chinese translation

### Path B: Variation of Existing Product
Trigger: "new colorway", "variation", "update tech pack", "add color to [style]"
→ Ask: "What's the parent style number?"
→ Ask: "What changed?" (colorway, size extension, trim change, fabric weight, treatment)
→ Pull parent tech pack data, modify only the delta
→ Generate updated tech pack with new revision number

### Path C: Translation
Trigger: "translate to Chinese", "Chinese version", "send to factory"
→ User provides the completed English tech pack (PDF or filled data)
→ Translate all field labels and content to Simplified Chinese
→ Maintain exact same layout and structure
→ Output bilingual reference or Chinese-only PDF

### Path D: Update / Revision
Trigger: "revise tech pack", "update BOM", "change spec"
→ Ask which style and which section
→ Make targeted changes
→ Increment revision number in header

---

## SECTION 1: NEW PRODUCT QUESTIONNAIRE

Run this questionnaire interactively when creating a net-new tech pack. Use the ask_user_input tool for bounded choices. Ask open-ended questions in prose.

### Step 1: Identity & Classification
```
Questions:
1. Style Name: (open text — e.g., "Borderless Basic Hoodie")
2. Product Category: [Hoodie / Sweatpants / T-Shirt / Shorts / Jacket / Bag / Accessory / Other]
3. Product Tier: [Tier 1: Staple / Tier 2: Drop — Destination Designer / Tier 2: Drop — Nomadic Necessities / Tier 2: Drop — Technical Travel]
4. Season: [Core (Evergreen) / SS26 / FW26 / SS27 / etc.]
5. Target Retail Price: (open text — e.g., "$117")
6. Target FOB Price: (open text)
```

### Step 2: SKU & Numbering
```
The SKU system follows this structure (from the FR SKU System):
[BRAND]-[CATEGORY]-[STYLE]-[COLOR]-[SIZE]

Ask:
7. Do you already have a style number? If not, I'll generate one.
8. Colorway(s) for this style: (list all planned colors)
9. Barcode assignment: Confirm using Shopify Retail Barcode Labels app
```

### Step 3: Factory Assignment
```
10. Factory: [Dongguan Shengde Clothing Co., Ltd. / Guangzhou Yuanfuyuan Leather Co., Ltd. / Other (specify)]
11. Fabric Type: 
    - If Shengde: [Cotton Jersey / Denim / Twill Cotton]
    - If Yuanfuyuan: [Waxed Canvas]
    - If Other: (specify)
```

### Step 4: Design & Construction
```
12. Upload or describe the design: (image, sketch, reference)
13. Key design features: (e.g., crossover hood, kangaroo pocket, dropped shoulder)
14. Fit: [Oversized / Relaxed / Regular / Slim]
15. Any special treatments? [Acid Wash / Stone Wash / Enzyme Wash / Garment Dye / Distressing / None]
```

### Step 5: Materials
```
16. Shell fabric weight (GSM): (e.g., 400)
17. Shell fabric composition: (e.g., 100% Cotton French Terry)
18. Rib composition: (e.g., 95% Cotton / 5% Spandex)
19. Any special trims or hardware? (open text)
```

### Step 6: Branding
```
20. Logo placement — Front: [Snowflake Emblem Center Chest / Snowflake Left Chest / None / Custom]
21. Logo placement — Back: [FOREIGN RESOURCE Wordmark Upper Back / None / Custom]
22. Logo method: [Tonal Embroidery / Puff Print / Screen Print / Heat Transfer / Woven Patch]
23. Label type: [Woven Neck Label / Printed Neck Label / Heat Transfer]
```

### Step 7: Packaging
```
24. Packaging: [Standard FR Packaging / Custom / Minimal]
    Standard = Matte Slate poly mailer + Sand dust bag + Salt hang tag + tissue + sticker
25. Any packaging variations? (open text)
```

After questionnaire is complete, confirm all data with user, then generate the tech pack.

---

## SECTION 2: BRAND CONSTANTS (AUTO-FILL)

These values are pre-filled on every tech pack:

### Brand Info
- Brand: Foreign Resource Co.
- Website: foreignresource.com
- Contact: matias@foreignresource.com
- Size Range: S / M / L / XL
- Measurement Unit: Centimeters (cm)
- Sales Channel: Shopify

### Color System (ONLY these colors are used)
**Primary Palette:**
- Slate: #3A3A3A (primary text, dark garments)
- Salt: #F5F0E8 (backgrounds, light garments)
- Sand: #EBE5D5 (warm accent)

**Secondary Palette (Essential Elements — all begin with S):**
- Stone: #716F70
- Soil: #9A816B
- Sea: #B5C7D3
- Sage: #ADBDA3
- Sienna: #D4956A

### Factory Registry
| Factory | Location | Capabilities | Materials |
|---------|----------|-------------|-----------|
| Dongguan Shengde Clothing Co., Ltd. (圣德) | Dongguan, China | Knit, woven, cut & sew | Cotton jersey, denim, twill cotton |
| Guangzhou Yuanfuyuan Leather Co., Ltd. | Guangzhou, China | Leather & canvas goods | Waxed canvas accessories |

New factories are added as needed — user will specify.

### Product Tiers
- **Tier 1: Staples** — Always in stock. 80% of revenue. $37-$117 retail.
  - Borderless Basic Hoodie ($117)
  - Borderless Basic Sweatpants ($117)
  - Borderless Basic Tee ($37)
- **Tier 2: Drops** — Limited edition. Quarterly. 20% of revenue.
  - Destination Designer ($200+)
  - Nomadic Necessities ($50-$150)
  - Technical Travel ($200+)

### Standard Care Instructions
```
Machine wash cold, inside out
Tumble dry low
Do not bleach
Iron low if needed
Do not dry clean
```

### Standard Packaging Components
| Component | Material | Color | Spec |
|-----------|----------|-------|------|
| Poly Mailer | Matte PE | Slate exterior | Salt wordmark centered, snowflake on seal |
| Dust Bag | Cotton drawstring | Sand | Slate snowflake centered, FR on cord tag |
| Hang Tag | Heavy cardstock | Salt | Snowflake front, product + care back |
| Tissue Paper | Tissue | Salt | Tone-on-tone snowflake repeat |
| Sticker | Circle die-cut, 2" | Salt stock | Slate snowflake |

---

## SECTION 3: TECH PACK TEMPLATE STRUCTURE

The template is a 14-page A4 landscape PDF:

| Page | Title | Contents |
|------|-------|----------|
| 1 | Cover | Style name, style #, SKU, tier, season, factory, colorways, sizes, pricing, status, signatures |
| 2 | Design Overview | Front/back/side views in placeholder boxes, factory bar, key design notes table |
| 3 | Technical Flat Lay Diagrams | Maximum white space for annotated flat lay drawings. Center cross-hair guides. |
| 4 | Bill of Materials | Fabrics table, trims & accessories table, labels & branding table |
| 5 | Color & Artwork | Colorway spec with Pantone/hex, artwork placement diagrams, method spec |
| 6 | Construction Details | Seam & stitch spec table, construction notes table |
| 7 | Construction Detail Sketches | Maximum white space with 2x3 grid for seam closeups, pocket assembly, cuff/collar details |
| 8 | Pattern Pieces & Cutting | Pattern pieces layout, piece index table (qty, fabric, grain, fusing), cutting instructions |
| 9 | Points of Measure | POM diagram, graded spec table (S/M/L/XL in cm), measurement method |
| 10 | Garment Treatments | Wash & dye steps, distressing spec, before/after references |
| 11 | Labels & Packaging | Care/main/size label artwork, care instructions, packaging spec table |
| 12 | Order & Delivery | Quantity per size/colorway table, delivery details (address, ship method, incoterm, dates), packing list with carton breakdown |
| 13 | Compliance & Quality | Shipping requirements, quality/testing standards, barcode/SKU matrix |
| 14 | Revision History | Revision log table, final approval signatures (designer, brand owner, factory) |

The Python generator script is at: `/home/claude/build_techpack.py`
Run with: `python build_techpack.py`

---

## SECTION 4: CHINESE TRANSLATION WORKFLOW

When translating a completed tech pack:

1. User provides the filled English tech pack (or the data in conversation)
2. Translate ALL text to Simplified Chinese (简体中文)
3. Key translation reference:

| English | Chinese |
|---------|---------|
| Tech Pack | 技术包 / 工艺单 |
| Bill of Materials | 物料清单 |
| Points of Measure | 量度点 / 尺寸表 |
| Garment Treatment | 服装处理 / 水洗工艺 |
| Construction Details | 缝制工艺 |
| Colorway | 配色方案 |
| Seam Type | 缝型 |
| Stitch Type | 针迹类型 |
| Care Label | 洗水标 / 洗涤标签 |
| Hang Tag | 吊牌 |
| Shipping | 运输 / 出货 |
| Revision | 修订 / 版本 |
| Approved | 已批准 |
| Shell Fabric | 面料 |
| Lining | 里布 |
| Rib | 罗纹 |
| Cotton | 棉 |
| Polyester | 涤纶 |
| Spandex | 氨纶 |
| Tolerance | 公差 |
| Graded Spec | 分码尺寸表 |
| Flat Measurement | 平量 |
| Chest Width | 胸围 |
| Body Length | 衣长 |
| Shoulder Width | 肩宽 |
| Sleeve Length | 袖长 |

4. Generate Chinese PDF with identical layout
5. Output both English and Chinese versions

---

## SECTION 5: VARIATION WORKFLOW

When creating a variation of an existing product:

1. Identify parent style (style number or name)
2. Determine variation type:
   - **New Colorway**: Only change color spec, artwork colors, SKUs, barcodes
   - **Size Extension**: Add sizes to POM table, update SKU matrix
   - **Trim Change**: Update BOM trims section only
   - **Fabric Change**: Update BOM fabric, may affect POM (shrinkage), treatments
   - **Design Modification**: May affect multiple pages — design, construction, POM
3. Copy parent tech pack data
4. Apply changes only to affected sections
5. Set revision to V1.0 (it's a new style) or increment parent revision (if minor update)
6. Generate new PDF

---

## SECTION 6: QUALITY CHECKLIST

Before finalizing any tech pack, verify:

- [ ] All fields filled — no blank required fields
- [ ] SKU follows the FR SKU system structure
- [ ] Colors reference ONLY the FR color system (Slate, Salt, Sand, Stone, Soil, Sea, Sage, Sienna)
- [ ] Measurements in centimeters
- [ ] Size grading is consistent (even increments)
- [ ] Tolerance specified for all POMs
- [ ] Care instructions included
- [ ] Packaging spec matches FR standard
- [ ] Artwork files referenced
- [ ] Factory correctly assigned
- [ ] Revision number set
- [ ] Approval fields present

---

## NOTES

- The tech pack template PDF is generated via Python (reportlab). The script can be re-run to produce blank templates or pre-filled versions.
- For Illustrator editing: the PDF can be opened in Illustrator. All text is editable. Tables can be modified.
- Barcodes are generated via Shopify's Retail Barcode Labels app — not included in tech pack, but SKU matrix references them.
- When in doubt about brand voice, design direction, or product strategy, reference the FR Brand Guidelines (V3.0, March 2026).
