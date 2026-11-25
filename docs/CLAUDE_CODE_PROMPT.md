# Claude Code kickoff: Fixer v2 (IG + zine planner)

## Setup (do this yourself first)

1. Make the repo in your git folder: `mkdir fixer && cd fixer && git init && mkdir docs`
2. Put `ZINE_SPEC.md` in `docs/`.
3. Check hallmark is installed: `npx skills list -g`. If it's missing: `npx skills add nutlope/hallmark -g --agent claude-code`, then restart Claude Code.
4. Start `claude` in the repo and paste everything below the line.

---

You're building **Fixer**, a personal Linux desktop app (Fedora KDE) for planning a photography Instagram post and turning it into a printed, numbered, serialized zine. One "Issue" = one IG post (single or carousel) = one physical zine in my collection. The full spec is `docs/ZINE_SPEC.md`. Read all of it before writing any code. It's the source of truth. If something in it is wrong or impossible, say so and propose a fix. Don't silently deviate.

## Non-negotiables

- **Never post anything.** No Instagram/Meta API, no accounts, no network calls at all. Export files only. I post manually.
- **No photo editing tools.** Allowed: crop windows, focal point, fit modes, borders/mats, text, cover/title effects, the print-only brightness lift.
- **No metadata auto-fill.** Don't read EXIF for anything. Every text field is typed by me. Strip metadata from IG exports.
- **3:4 (1080×1440) for every IG slide.** Split pairs = one 3:2 image across two slides.
- **Split view is the core screen:** Feed (Post/Grid) and Zine (Flip/Sheet/Fold) side by side, live and linked, with **independent border settings per side** plus a link toggle.
- **Trim-to-3:2 is the default** for templates (spec §2), so zine pages are exactly 3:4. Untrimmed variants must also work.
- **One layout engine (mm) → RenderList → one Canvas2D renderer** for previews, IG JPEGs and print rasters. Preview must equal export.
- **Templates are JSON data**, never hard-coded. Page orders in the spec are unverified until I fold a test print.
- **Barcodes:** EAN-13 + EAN-2 add-on using the GS1 049 company-internal prefix, number layout per spec §6. Never the 977/978/979 ranges. Barcode never goes through effects.
- Permissive licences only. Tell me before adding any dependency, with its licence.
- Text must support Macedonian Cyrillic (Ѓ Ќ Ѕ Љ Њ Џ Ј). Verify bundled fonts with fontTools and drop any that fail. Use `lang="mk"` on Macedonian runs.

## Stack

Tauri 2 + Vite + React + TypeScript, zustand, pdf-lib, bwip-js (EAN-13+2 and QR), vitest. Rust side: file dialogs, asset copy + hashing, font list via fontconfig, `lp` printing. Check the current Tauri 2 Fedora prerequisites in the official docs and give me the exact `dnf` command. Don't guess package names.

## Design

Use the **hallmark** skill for all UI design and checks. hallmark works on HTML/CSS, which this UI is.

Direction: mix my two references.
- **pilotlight.download**: fetch it and look for yourself. What I saw: near-black base with a green cast (`#000B04`), a console/case-file feel, a data table as the hero, uppercase mono micro-labels, `//` separators in eyebrows ("Fixer // issue 012"), three-letter section codes (CRP, BRD, TXT, CVR, BCK, TPL, SER), a status footer line, a blinking live indicator. Use those motifs. Don't copy its text, illustrations or layout wholesale.
- **dirtylittlezine.com**: black-and-white film-photo feel, informal DIY tone in the copy.
- Photos and paper must look true. Everything representing print sits on paper-white; chrome stays dark and quiet. One accent colour: give me two options in M0 (safelight red vs phosphor green) and I'll pick.
- The **Collection view** is where the pilotlight "case file" table fits best: the ledger of issues, serials and print runs.

## Milestones (stop after each and wait for me)

**M0 – Scaffold + design**
Tauri + React + TS running on Fedora. With hallmark, make static HTML mocks with fake data of: the split view (spec §4), the cover editor, the collection ledger. Both accent options. Show screenshots. No logic yet.

**M1 – Layout engine + T1**
Template schema, T1 8-page mini for A4/A3/Letter in trimmed 3:2 and untrimmed modes, layout engine, renderer, PDF export with fold/cut/trim marks and 3 mm bleed. Generate **numbered test prints** (huge page numbers, "TOP ↑", a line across each spread and the wraparound cover) and a **printer calibration page** (edge rulers + duplex crosshair). Unit tests for page→panel mapping, rotation and trim maths. Stop: I'll print, trim, fold and confirm.

**M2 – Issues, photos, split view**
Issue folders + collection.json, import (full-res copy + hash), slide order, split pairs, auto page-flow + drag reassignment, fit modes (cover/contain/custom pan-zoom + focal point), linked feed/print crop overlays with % lost, per-side border presets + link toggle, printer profile, DPI warnings. Split view with Post/Grid on the left and Sheet on the right, linked selection.

**M3 – Flip + Fold views**
Interactive 3D booklet (drag corners, arrow keys, zoom spread, closed/back view), animated fold guide per template. Flip view stays linked to the carousel position.

**M4 – Text, cover, back page**
Free text boxes + captions everywhere, font picker (bundled + system), title layouts and effects (knockout, halftone, xerox/threshold, riso duotone) on cover/title only, wraparound cover, back page note, song + QR, custom fields.

**M5 – Serials + collection**
Issue numbering, print-run dialog producing per-copy serialized pages, EAN-13+2 barcode (spec §6) with a scan test on the test print, print log, collection ledger + shelf + search by barcode number, yearly index card.

**M6 – Exports**
IG JPEGs 1080×1440 sRGB with metadata stripped + caption.txt + clipboard. Final print PDF with serialized copies. Print-only brightness lift. Print through the system dialog or `lp`.

**M7 – More templates**
In order: T2 poster back (show the slit and creases on the poster preview), T4 saddle-stitch 8–24 with continuity warnings, T3 16-page (both versions), T7 accordion with glue tabs, T6 French fold, T5, T8, T9, then T10 yearly volume. Each gets its own numbered test print and stays `verified: false` until I fold it.

**M8 – Polish + AppImage.**

## Verification rules

- Nothing is done until you've run it. For visual work, render to PNG and look at the image yourself before reporting.
- Check exports with a script (pixel size, DPI, colour space, no metadata, page count, barcode check digit), not by eye.
- Decode the generated barcode with a decoder library in a test and assert the number matches.
- If you couldn't test something, say so plainly.

## Report at the end of each milestone

1. What I can do now (3–6 lines)
2. Screenshots / sample export paths
3. Tests run + results
4. Not verified, and why
5. My test checklist (≤ 8 steps with expected results)
6. Decisions you made + open questions

Start with M0. Read `docs/ZINE_SPEC.md` fully first.
