# Claude Code prompt v3: rename, web version, GitHub Pages, README

## Before you paste this

1. Do the GitHub login steps from the chat (`gh auth login` etc.) and check `gh auth status` says you're logged in.
2. Commit everything you have now so there's a clean restore point: `git add -A && git commit -m "checkpoint before web port"`.
3. Put 6–10 photos you're happy to show publicly in `docs/demo-photos/` (exported JPEGs). They're used for the README screenshots and the demo issue. Any GPS/camera data gets stripped.
4. Replace `<NAME>` and `<name>` below with the name you picked (display name / lowercase repo name).
5. Paste everything below the line.

---

We're taking the app public as a web app on GitHub Pages, renaming it, and giving it a proper README. Read `docs/ZINE_SPEC.md` and the current codebase first. Then work through the phases below and **stop after each phase** with the usual report (what works, screenshots, tests, not verified, my checklist, decisions/questions).

## Phase 1 – Rename to `<NAME>`

Rename everything: package names, Tauri product name + identifier, window title, UI copy, barcode human-readable prefix (`<NAME> // No. 012 …`), docs, folder names in code, test names. The barcode **number scheme stays the same** (049 prefix), so already-printed barcodes still resolve. `grep -ri trafika` must come back empty (except git history). Show me the diff summary.

## Phase 2 – Web version (same codebase)

Goal: the full app runs as a static site in the browser (Firefox-based Zen first, then Chromium), with the Tauri desktop build still working from the same code.

- Add a **platform adapter** (`src/platform/`): `web.ts` and `tauri.ts` behind one interface (storage, import files, export/download files, fonts, print). UI code never calls Tauri or browser file APIs directly.
- **Web storage:** the Origin Private File System (OPFS) for images and issue files, IndexedDB if needed for indexes. Don't use `showDirectoryPicker` / File System Access API as a requirement: Firefox doesn't have it. Call `navigator.storage.persist()` and show whether it was granted.
- **Backups (the browser can wipe its storage):** "Export issue" and "Export whole collection" as a `.zip` (issue.json + assets + printlog), plus import. Show a quiet reminder when the last backup is older than 14 days. The `.zip` format must be the same one the desktop version reads, so I can move between them.
- **Fonts:** bundled OFL fonts (self-hosted, no Google Fonts CDN) + "add font file" (.ttf/.otf/.woff2) stored locally. System font listing stays desktop-only.
- **Print:** generate the PDF in the browser and download/open it. `lp` stays desktop-only.
- **Offline:** make it a PWA (service worker + manifest) so it works offline after the first visit.
- **Privacy, enforced and stated:** no network requests after load (no analytics, no CDNs, no external fonts). Add a strict Content-Security-Policy (`connect-src 'self'`, no remote scripts). Photos never leave the device. Add a test that fails if the built bundle contains requests to external hosts.
- Desktop-only features hide cleanly in the web build (no dead buttons).
- Test in Firefox and Chromium with Playwright: create an issue, import photos, change borders on each side, flip the booklet, export IG JPEGs and the print PDF, export/import a `.zip`, reload and check everything persisted.

## Phase 3 – GitHub repo + Pages

- Vite `base` set for `https://<my-username>.github.io/<name>/`.
- GitHub Actions workflow `.github/workflows/pages.yml`: on push to `main`, install, run tests, build web, deploy with the official `actions/upload-pages-artifact` + `actions/deploy-pages`. Pin action versions.
- `.gitignore`: build output, `node_modules`, `src-tauri/target`, any `Zines/` or `exports/` folders, `.env*`, OS junk.
- **Before anything is public:** run `gitleaks` (or `trufflehog`) on the **full git history**, and check no personal photos or files with EXIF/GPS are committed (`exiftool -r -gps:all docs/ public/`). Strip metadata from `docs/demo-photos/` and anything in the README. Report findings to me. Don't fix history without asking.
- Create the repo **private first**: `gh repo create <name> --private --source=. --remote=origin --push`. Then stop and tell me. I'll flip it to public myself once I've checked it, because Pages on a free account needs a public repo. Then I'll set Settings → Pages → Source → GitHub Actions.
- Add Dependabot for npm + GitHub Actions, and enable secret scanning / push protection if `gh` lets you.

## Phase 4 – README + docs that look clean

Ask me which licence I want before writing it (suggest MIT for code; bundled fonts keep their OFL licence files).

`README.md`:
1. Name + one-line description + **Live app** link (Pages URL) + badges (deploy status, licence). Nothing else above the hero image.
2. Hero image: the split view (feed + zine) with the demo issue, in the dark UI.
3. A short GIF (≤ 8 s, ≤ 3 MB) of the booklet flip-through, and one of the fold animation.
4. "Why": 2–3 sentences in my voice. Every post becomes a numbered physical zine.
5. Features with small screenshots: split view + per-side borders, flip/sheet/fold views, cover + wraparound, back page note, serials + barcodes, collection ledger, templates.
6. **The 3:4 trim trick** as a small diagram (SVG you draw): A4 → trim to 297×198 → pages 3:4 = IG slide, spreads 3:2 = 2-slide carousel = camera frame.
7. Template table with a fold diagram per template (SVG) + paper notes.
8. Privacy: offline, no uploads, no tracking, nothing posted for you.
9. Run locally (web) / build the desktop AppImage (Fedora deps) / project structure.
10. Credits: inspired by dirtylittlezine.com and other one-sheet zine traditions; fonts and their licences.

Images:
- Generate screenshots **automatically** with a Playwright script (`scripts/screenshots.ts`) that loads the demo issue built from `docs/demo-photos/` and saves to `docs/images/`, so they can be regenerated after UI changes. Fixed viewport (1600×1000, 2× DPR), consistent naming.
- Optimise: PNG through `oxipng` or WebP, GIFs through `gifsicle`. Keep the repo light.
- Check every image renders on GitHub (relative paths) and reads well in both GitHub light and dark mode (add a subtle border/background where needed).

Also add `docs/USER_GUIDE.md` (one page: first issue in 10 steps, printer calibration, trimming and folding) and `CHANGELOG.md` starting at v1.0.0.

## Git rules

- Small commits with clear messages (`feat:`, `fix:`, `docs:`, `ci:`, `refactor:`).
- Work on a branch per phase, merge to `main` when I approve.
- **Ask me before every `git push`**, before making anything public, and before rewriting history.

Start with Phase 1.
