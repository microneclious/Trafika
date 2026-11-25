# Fixer — Instagram + Zine Planner (Spec v2)

Personal Linux desktop app (Fedora KDE). One **Issue** = one Instagram post (single or carousel) = one printed, numbered, serialized zine that goes into a physical collection.

**Hard rules**
- **Nothing is ever posted automatically.** No Instagram API, no Meta/Business account, no network. The app exports image files; you post them yourself from your phone.
- **No photo editing.** You edit elsewhere. The app does layout, crop windows, borders, text, covers, back pages, mockups, print files.
- **No metadata auto-fill.** Camera, lens, settings, location are never read from files. Every text field is typed by you. (Mixed-camera issues are normal.) IG exports strip all metadata.
- Offline, local, no account, no telemetry.

---

## 1. Research summary

### Instagram (Nov 2026)
- Feed accepts 1.91:1 → 3:4. **3:4 = 1080 × 1440** is native.
- **Profile grid shows every post as a 3:4 tile.** 3:4 posts aren't cropped in the grid.
- Carousels: up to **20 slides**, and **all slides take the first slide's ratio**. Slides can't be reordered after posting.
- **Decision: every slide is 3:4, 1080 × 1440, sRGB JPEG.**

### dirtylittlezine.com — features to match
One-sheet 8-page mini (Letter/A4/A3) · photo per panel · **contain/cover** fit · per-panel captions · drag-to-reorder panels · preview · export 300 DPI JPG + PDF · auto rotation/panel order · fold instructions · "start over" with confirm · offline, no upload.

### Other zine formats researched
Electric Zine Maker (8-page + square accordion), itch.io template packs (8-fold, tri-fold, half-page, quarter-page, 1/8 booklet), library zine guides (8-page, quarto/French fold, saddle-stitch), 16-page one-sheet minis (T-cut and cut-and-staple versions), 16-panel mini imposers, accordion/leporello, poster zines.

---

## 2. Zine aspect ratios (and why A4 never gives you 3:4)

On ISO paper, **every fold keeps the 1 : √2 shape (0.707)**: A4 → A5 → A6 → A7. So every standard A-series zine page is 0.707. US Letter halves alternate between 0.647 and 0.773.

| Format | Page size | Ratio w/h | vs IG 3:4 (0.75) |
|---|---|---|---|
| 8-page mini on A4 | 74.25 × 105 mm (A7) | 0.707 | 6 mm too tall |
| 8-page mini on A3 | 105 × 148.5 mm (A6) | 0.707 | 8.5 mm too tall |
| Half-fold booklet on A4 | 148.5 × 210 mm (A5) | 0.707 | |
| Quarter-size booklet on A4 | 105 × 148.5 mm (A6) | 0.707 | |
| 16-page mini on A4 | 52.5 × 74.25 mm (A8) | 0.707 | |
| 8-page mini on Letter | 2.75 × 4.25 in | 0.647 | 15 mm too tall |
| Digest / half-letter | 5.5 × 8.5 in | 0.647 | |
| Quarter-letter / 8-page on 11×17 | 4.25 × 5.5 in | 0.773 | closest standard size |
| Square accordion | any | 1.0 | square posts get grid-cropped |
| Landscape booklet (A4 folded top-to-bottom) | 210 × 148.5 mm | 1.414 | landscape-photo zines |
| **Trimmed 3:4 (this app's default)** | **74.25 × 99 mm** (A4 mini) | **0.750** | **exact** |

### The trim trick (default for everything)
Cut the A4 sheet down to **297 × 198 mm (3:2)** before folding (one cut with a trimmer, using printed crop marks). All the folds still work on any rectangle, and now:
- 8-page mini page = **74.25 × 99 mm = exactly 3:4** = one IG slide, no crop
- mini spread = 148.5 × 99 = **exactly 3:2** = a 2-slide split carousel = a full camera frame (Fuji/Sony are 3:2)
- **wraparound cover** (back + front) = exactly 3:2 = one landscape frame, uncropped
- half-fold booklet on trimmed A4 = 148.5 × 198 mm pages, also exactly 3:4
- the 6 mm trimmed off top and bottom is where the printer couldn't print anyway, so those edges become **true full bleed**

Optional "bleed all round": also trim the side margins (printer margin m, e.g. 4 mm): sheet = (297 − 2m) × (297 − 2m)/1.5 → 289 × 192.7 mm, pages 72.25 × 96.3 mm (still 3:4). Every page edge is then full bleed.

A3 trimmed: 420 × 280 → mini pages 105 × 140 mm. Letter trimmed: 279.4 × 186.3 mm → 69.85 × 93.1 mm.

Untrimmed templates stay available (no-cut, faster). There, the app uses border presets to absorb the mismatch: on the untrimmed A4 mini, a 3:4 photo fitted to width leaves a 6 mm strip, placed at the page bottom where the printer margin is.

### Resolution
At 300 DPI: trimmed A4 mini page = 877 × 1169 px (even a 1080 px IG file covers this). A3 mini page = 1240 × 1654 px. A5 booklet page = 1754 × 2339 px, which needs full-res exports. Warn under 200 effective DPI.

---

## 3. Template library

Every template is a JSON data file (§7). Each one ships with a **numbered test print** (big page numbers, "TOP ↑" arrows, a line drawn across every spread, fold/cut/trim guides). You fold it on scrap paper once; only then is it marked `verified: true`. Page orders below come from common published templates and are **not trusted until folded**.

### T1 · 8-page mini, one cut (MVP)
- **Sheet:** A4 / A3 / Letter, landscape, trimmed 3:2 (default) or untrimmed. **Printed on one side only.**
- **Layout:** 4 × 2 grid. Top row upside down: 5 · 4 · 3 · 2. Bottom row upright: 6 · 7 · back · front.
- **Spreads:** 2–3, 4–5, 6–7 and back+front are all **next to each other on the sheet**, so one image can run across the fold seamlessly.
- **Make it:** (1) fold in half long way, unfold (2) fold in half short way, unfold (3) fold both short ends to the centre crease, unfold, giving 8 panels (4) fold in half short way, cut along the centre crease from the folded edge to the middle (5) unfold, fold in half long way, push the ends together so the slit opens into a + (6) flatten into a booklet, cover on top.
- **Fits:** single post or carousel of up to 6 slides + cover + back.

### T2 · 8-page mini + poster back
- Same as T1 but **printed on both sides.** The reverse of the sheet is completely hidden inside the folds when the zine is closed. Print one full-sheet image there, and when you unfold the zine it's an A4/A3 poster.
- Caveat: the poster has fold creases and the **centre slit cuts through its middle** (half the sheet width, along the horizontal centre). The app shows the slit on the poster preview so you don't put a face there.

### T3 · 16-page mini, one sheet
- **Version A (T-cut, duplex):** 4 × 2 panels per side. Fold in half and in quarters, cut a slit along the middle vertical fold from the edge to the horizontal centre (a "T"), then collapse the folds into a booklet. No staples.
- **Version B (cut + staple, duplex):** fold into eighths, cut the sheet in half, stack the halves, 2 staples in the spine, fold.
- Pages: A8 on A4 (52.5 × 74 mm), A7 on A3. Good for 10–14 slide photo dumps. Trim trick applies.

### T4 · Saddle-stitch booklet (half-fold)
- Sheets folded in half and nested, stapled (long-arm stapler) or 3-hole pamphlet stitch. **Duplex.** Pages in multiples of 4: 8 / 12 / 16 / 20 / 24 (a 20-slide carousel + cover + back + 2 = 24).
- **Imposition** for N pages, sheet s (0 = outermost): outside = [N − 2s | 1 + 2s], inside = [2 + 2s | N − 1 − 2s].
- **Only the centre spread is on a single sheet.** Every other spread is split across two sheets and can misalign, so the app warns and offers to move split pairs to the centre spread.
- Sizes: A5 (A4 sheet), A4 (A3 sheet), trimmed 3:4 variants (148.5 × 198 on A4).

### T5 · Quarter-size booklet
- A4 printed duplex, cut in half, each half folded, nested, stapled. A6 pages, multiples of 8. Pocket size.

### T6 · French fold (quarto)
- **Single-sided**: fold the sheet in half, then in half again. The folded edges become the page tops and outer edges, so the back of the print never shows. Stack several, staple or stitch the spine.
- Best for thin paper and inkjet (no show-through). A6 pages on A4.

### T7 · Accordion / leporello
- Strips of panels folded back and forth. **Every neighbouring panel is a continuous image**, so it's ideal for panorama carousels.
- Trimmed A4 gives two strips of 4 × (74.25 × 99 mm) 3:4 panels. Strips join with a 10 mm glue tab (the app adds it). Single-sided, or duplex for a second image on the back.
- Square variant (Electric Zine Maker style) for square photos.

### T8 · Tri-fold pamphlet
- Duplex, 6 panels. A quick "one photo + story" issue.

### T9 · Landscape booklet
- Spine on the short edge, pages wider than tall (A5 landscape 210 × 148.5, or trimmed 4:3). For landscape-only issues. Feed side uses split pairs.

### T10 · Yearly volume
- Saddle-stitch (T4) built automatically from a year's issues: contents page (issue no., title, date), one or more chosen pages per issue, volume cover, volume barcode.

---

## 4. Main screen: split view

```
┌ ISSUES / PHOTOS ┬──────── FEED //  ────────┬──────── ZINE // ─────────┬ INSPECTOR ┐
│ issue list      │ [Post] [Grid]            │ [Flip] [Sheet] [Fold]    │ CRP crop   │
│ photo tray      │  phone mockup            │  interactive booklet     │ BRD border │
│ slide order     │  or 3-col grid           │  or printed sheet        │ TXT text   │
│                 │  ◀ slide 3/7 ▶           │  ◀ spread 2–3 ▶          │ CVR cover  │
│                 │  border: [none|mat|...]  │  border: [none|mat|...]  │ BCK back   │
│                 │                          │                          │ TPL format │
│                 │                          │                          │ SER serial │
└─────────────────┴──────────────────────────┴──────────────────────────┴────────────┘
 status: A4 TRIM 3:2 · 300 DPI · PRINTER CALIBRATED · 7 SLIDES → 8 PAGES · ISSUE 012
```
- **Both sides live and linked.** Select a slide on the left and its page lights up on the right (and the reverse). Swiping the carousel turns the booklet to that spread.
- **Borders are set per side:** Feed border and Zine border are independent (none / mat / film frame / letterbox / caption strip), with a "link" toggle to make them match. You can post full-bleed and print with a mat, or the other way round.
- Either side can go full-screen. A divider resizes them.

### Feed side
- **Post:** phone frame, swipeable carousel, dots, caption with "more", your handle.
- **Grid:** 3 columns of 3:4 tiles. The new post is on top, past issues underneath (built from the app's own history, plus an optional folder of older posts). Drag upcoming issues to plan the order.
- Export: `exports/ig/012_01.jpg …` at 1080 × 1440, sRGB, q≈92, metadata stripped. Caption saved to `caption.txt` and copied to the clipboard. Posting stays manual.

### Zine side
- **Flip:** interactive 3D booklet. Drag a page corner or use the arrow keys to turn, double-click to zoom a spread, closed-cover view, back view, paper texture and fold shading. Mouse and keyboard both work.
- **Sheet:** the real printed sheet(s), both sides if duplex. Rotated panels, fold lines (dashed), cut (solid + ✂), trim marks, hatched unprintable margins, poster side.
- **Fold:** animated step-by-step instructions for the selected template, from flat sheet to booklet.

---

## 5. Pages, photos, text (dirtylittlezine features + more)

- Photo per page/panel. Fit: **cover** (fill), **contain** (fit inside), or **custom**: drag to pan, scroll to zoom, with a focal point.
- **Feed and print crops are linked by one focal point.** Overlays on the original show both windows and what % each loses. Unlink to adjust separately. With trim templates they're usually identical.
- **Split pairs:** mark 2 neighbouring slides as one 3:2 photo. It lands on a contiguous spread; the app warns if the template can't keep it contiguous.
- Drag to reorder pages; slides auto-flow onto pages, then override by hand. Empty-page fillers: text page, solid colour, detail crop of another photo.
- **Text anywhere:** captions per page plus free text boxes. Font, size, weight, colour, alignment, tracking, line height, rotation, position presets. Text-only pages.
- Border presets (each side independently):

| Preset | Look |
|---|---|
| None / full bleed | edge to edge |
| Mat | even border, white / black / paper / sampled from photo |
| Caption strip | thin top/side mat, thicker bottom with caption or page number |
| Film frame | thin mat + frame number / issue code in mono |
| Letterbox | landscape photo centred with bars |

- Safe zones: 3 mm each side of every fold and trim, plus printer margins. Text or barcodes inside them get flagged.
- "Start over" with confirm, and undo/redo for everything.

## 6. Cover, back page, serials

### Cover
- Title, subtitle, issue no., date. Fonts: bundled OFL fonts (verified Cyrillic incl. Ѓ Ќ Ѕ Љ Њ Џ Ј, `lang="mk"` on Macedonian text) + your installed fonts.
- Title layouts: top band, bottom band, centred, vertical along the spine, giant number.
- Title/cover effects (title and cover elements only, not your photos): knockout band, halftone, xerox/threshold, riso duotone, stamped/rotated, outline.
- **Wraparound cover:** one photo across back + front. On trimmed templates a landscape frame fits with zero crop. Preview shows the spine line and where the title and barcode sit.

### Back page
- **"What I was doing" note**: a short message from you in that period. Free text, your font.
- Issue no., date (or date range) you type, title, optional location, optional song (title + artist printed, QR to your link, ≥ 18 mm with quiet zone).
- Any extra fields you define (stored per issue, nothing auto-filled).
- **Barcode block** (below).

### Numbering, serials and barcodes (your collection)
- **Issue number:** auto-increments per issue (editable), shown as `No. 012`.
- **Copy serial:** each printed copy is unique: `012 · 03/05`. A print run of 5 makes 5 different print pages, identical except for the back-page serial and barcode.
- **Barcode:** magazine-style **EAN-13 + 2-digit add-on**, like the ones on newsstand magazines.
  - Real magazines use ISSN-based 977 codes. Don't use those. Use the GS1 **040–049 range, which is reserved for company-internal numbers**, so it can never clash with a real product.
  - Number layout: `049` + `YY` + `IIII` (issue) + `CCC` (copy) + check digit = 13 digits. Add-on = issue no. last 2 digits (that's what magazines use it for).
  - Human-readable line under it: `FIXER // No. 012 // 23.11.2026 // 03/05`.
  - Printed pure black on white, never through effects, at ≥ 80% nominal size (~30 mm wide + add-on). Test that a phone scanner reads it.
- **Print log:** every print run is recorded (date, copies, serials, template, paper). Reprints continue the serial count.

### Collection view (the archive)
- A ledger table of every issue: No. · title · date · format · pages · copies printed · serials. Covers shown on a shelf, grouped by year. Open any issue to flip through it.
- Search by typing (or scanning) a barcode number to jump to that issue and copy.
- Printable **collection index card** per year (list of issues + barcodes), for the box you keep them in.
- **Yearly volume** builder (T10).

## 7. Template schema

```jsonc
{
  "id": "mini-8-onecut",
  "name": "8-page mini, one cut",
  "sheet": { "sizes": ["A4","A3","Letter"], "orientation": "landscape",
             "trim": { "mode": "ratio", "ratio": 1.5, "edgeMarginFromPrinter": false } },
  "sides": 1,
  "grid": { "cols": 4, "rows": 2 },
  "panels": [
    { "page": 5, "side": 0, "col": 0, "row": 0, "rot": 180 },
    { "page": 4, "side": 0, "col": 1, "row": 0, "rot": 180 },
    { "page": 3, "side": 0, "col": 2, "row": 0, "rot": 180 },
    { "page": 2, "side": 0, "col": 3, "row": 0, "rot": 180 },
    { "page": 6, "side": 0, "col": 0, "row": 1, "rot": 0 },
    { "page": 7, "side": 0, "col": 1, "row": 1, "rot": 0 },
    { "page": 8, "side": 0, "col": 2, "row": 1, "rot": 0, "role": "back" },
    { "page": 1, "side": 0, "col": 3, "row": 1, "rot": 0, "role": "front" }
  ],
  "spreads": [[2,3,"contiguous"],[4,5,"contiguous"],[6,7,"contiguous"],[8,1,"wrap-cover"]],
  "folds": [], "cuts": [], "trims": [], "glueTabs": [],
  "posterSide": null,
  "pageCountRule": "fixed:8",
  "instructions": [ { "step": 1, "text": "...", "anim": "..." } ],
  "verified": false
}
```

## 8. Print
- PDF at 300 DPI (600 for text-heavy pages), one page per sheet side, one sheet set per serialized copy.
- Guides toggle: fold, cut, trim/crop marks, 3 mm bleed past trim lines.
- **Printer profile:** unprintable margins + duplex x/y offset, measured from a **calibration page** (edge rulers + duplex crosshair). Hatched in every preview.
- **Print-only brightness lift** slider (prints come out darker than screens). Never touches IG exports.
- Print through the system dialog or `lp`. Paper notes per template (e.g. 100–120 gsm matte for duplex).

## 9. Architecture
- **Tauri 2** + Vite + React + TypeScript. Web UI so the hallmark skill can design and check the real screens.
- **One layout engine** (pure TS, mm): issue + template + printer profile → RenderList per page, sheet side and IG slide.
- **One renderer** (Canvas2D) at any DPI for previews, IG JPEGs and print rasters. PDF via pdf-lib embeds the rasters + vector guides. What you see is what prints.
- Flip view: CSS 3D transforms on the same rendered page images.
- Libraries: pdf-lib, bwip-js (barcodes incl. EAN-13+2, and QR), zustand, vitest. Permissive licences only.
- Storage: `~/Zines/012-slug/` → `issue.json`, `assets/` (copied full-res, hashed), `exports/ig/`, `exports/print/`, `printlog.json`. `~/Zines/collection.json` for the ledger. Plain JSON.
- Packaging: AppImage.

## 10. Drawbacks & how they're handled

| Problem | Handling |
|---|---|
| A-series pages never match 3:4 | trim-to-3:2 default; untrimmed templates use border presets |
| Printer can't print to the edge | trimming removes it; calibrated margins hatched in previews |
| Duplex misalignment | calibration offset; warnings on hairline borders in duplex templates |
| Spreads split across sheets in booklets | continuity flags + warnings + "move to centre spread" |
| Wrong page order after folding | data templates + unit tests + physical numbered test print before `verified` |
| Trimming adds a step | crop marks printed; untrimmed option always available |
| Low-res images | effective-DPI check per page |
| Poster back has a slit + creases | slit and creases shown on the poster preview |
| Barcode won't scan | no effects on it, min size, quiet zone, phone-scan test in the test print |
| Thin paper show-through | French fold / heavier paper suggestion on duplex templates |
| Carousel ratio locked / can't reorder after posting | 3:4 locked; plan in split view before exporting |
| Scope creep | milestones; MVP first |

## 11. MVP vs later
**MVP:** issues, photos, split view (Post/Grid + Flip/Sheet/Fold), per-side borders, text, cover + wraparound, back note, issue no. + serial + barcode, T1 (trimmed + untrimmed), IG export, print PDF with serialized copies, printer calibration, collection ledger.
**Then:** T2 poster back, T4 booklets, T3 16-page, T7 accordion, T6 French fold, T5, T8, T9, yearly volume, collection index cards.

## 12. Extra ideas
- **Close the loop:** photograph the printed zine and add it as the last carousel slide ("No. 012, in print").
- **Panorama issues:** an N-slide seamless carousel that prints as an accordion.
- **Cover system:** keep one title layout and font across a year so the shelf looks like a series. Volume colour changes yearly.
- **Index card + box:** a yearly index printed on card with every issue's barcode, kept in the box with the zines.
- **Bilingual back notes** (MK/EN) on the same page.
- **Rhythm strip** under the grid: average tone of each upcoming post, to spot three dark posts in a row.
