# Fixer

A desktop app for Linux that mocks up **two things side by side from the same photos**: an Instagram post
(3:4 carousel, its own crops, borders and text) and a printed, numbered zine (folded sheet, its own page
layout, borders, cover and back page). The two are linked but not the same: aspect ratios, page order,
borders and text can differ on each side. Nothing is ever posted; it only writes files.

## Run it

Open a terminal and run:

    cd ~/projects/Zine/fixer
    npm run tauri dev

The Fixer window opens. Leave the terminal open while you use it; closing the window (or Ctrl+C in the
terminal) stops it. The first start compiles Rust and takes a few minutes; later starts are quick.

Your work is saved automatically in `~/Zines/`:

    ~/Zines/collection.json          the ledger
    ~/Zines/012-tranzit/issue.json   one issue
    ~/Zines/012-tranzit/assets/      full-res copies of your photos (originals untouched)
    ~/Zines/012-tranzit/exports/ig/      IG JPEGs + caption.txt
    ~/Zines/012-tranzit/exports/print/   print PDFs, test prints
    ~/Zines/fonts/                   fonts you added

## Making a standalone app

    npm run tauri build

builds an optimised AppImage in `src-tauri/target/release/bundle/appimage/`.

## First-time setup (Manjaro / Arch), already done on this machine

    sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool rustup
    rustup default stable
    npm install

## Tests

    npm test        # layout maths, page order, crops, barcode numbers, decodes the generated barcodes

## Layout

- `src/engine/`: the one layout engine (mm). Templates are JSON (`templates/t1.json`).
- `src/render/`: the one Canvas2D renderer used for previews, IG JPEGs and print rasters.
- `src/export/`: IG JPEGs, print PDF (pdf-lib), calibration page.
- `src/ui/`: screens. `src-tauri/`: Rust side (files, photo import + hashing, fonts via fontconfig, `lp`).
- `design/`: the original static mocks.
