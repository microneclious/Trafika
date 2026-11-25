// Layout grids for snapping (values are % of the page/slide). Classic editorial structures:
// rule of thirds, golden section, margin frames, Müller-Brockmann-style modular grids, column grids, baseline.
export interface GridDef { id: string; name: string; xs: number[]; ys: number[]; /** module rects for drawing */ cells?: { x: number; y: number; w: number; h: number }[] }

function modular(id: string, name: string, cols: number, rows: number, margin: number, gutter: number): GridDef {
  const xs: number[] = [], ys: number[] = [], cells: GridDef["cells"] = [];
  const cw = (100 - 2 * margin - (cols - 1) * gutter) / cols;
  const rh = (100 - 2 * margin - (rows - 1) * gutter) / rows;
  for (let c = 0; c < cols; c++) { const x = margin + c * (cw + gutter); xs.push(x, x + cw); }
  for (let r = 0; r < rows; r++) { const y = margin + r * (rh + gutter); ys.push(y, y + rh); }
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) cells.push({ x: margin + c * (cw + gutter), y: margin + r * (rh + gutter), w: cw, h: rh });
  return { id, name, xs, ys, cells };
}

export const GRIDS: GridDef[] = [
  { id: "none", name: "No grid", xs: [], ys: [] },
  { id: "thirds", name: "Rule of thirds", xs: [33.333, 66.667], ys: [33.333, 66.667] },
  { id: "golden", name: "Golden section", xs: [38.197, 61.803], ys: [38.197, 61.803] },
  { id: "margins", name: "Margins 8%", xs: [8, 92], ys: [8, 92] },
  { id: "centre", name: "Centre + margins", xs: [8, 50, 92], ys: [8, 50, 92] },
  modular("mod3", "3 × 3 modules", 3, 3, 8, 3),
  modular("mod4", "4 × 4 modules", 4, 4, 7, 2.5),
  modular("swiss", "Swiss 4 × 6", 4, 6, 7, 2),
  modular("col6", "6 columns", 6, 1, 7, 2),
  modular("col12", "12 columns", 12, 1, 6, 1.5),
  { id: "baseline", name: "Baseline 4%", xs: [8, 92], ys: Array.from({ length: 24 }, (_, i) => 6 + i * 4) },
];
export const gridById = (id: string) => GRIDS.find((g) => g.id === id) ?? GRIDS[0];

/** Snap a value to the nearest candidate within `tol`; returns [value, snapped-to or null]. */
export function snap1(v: number, cands: number[], tol: number): [number, number | null] {
  let best: number | null = null, d = tol;
  for (const c of cands) { const dd = Math.abs(c - v); if (dd <= d) { d = dd; best = c; } }
  return best === null ? [v, null] : [best, best];
}

/** Snap a box (in %) by its left/centre/right and top/middle/bottom edges. */
export function snapBox(x: number, y: number, w: number, h: number, g: GridDef, tol = 1.6) {
  const xs = [0, 50, 100, ...g.xs], ys = [0, 50, 100, ...g.ys];
  let bx = x, by = y, gx: number | null = null, gy: number | null = null, dx = tol + 1, dy = tol + 1;
  for (const [off, k] of [[0, 0], [w / 2, 1], [w, 2]] as const) {
    const [v, s] = snap1(x + off, xs, tol);
    if (s !== null && Math.abs(v - (x + off)) < dx) { dx = Math.abs(v - (x + off)); bx = v - off; gx = s; void k; }
  }
  for (const off of [0, h / 2, h]) {
    const [v, s] = snap1(y + off, ys, tol);
    if (s !== null && Math.abs(v - (y + off)) < dy) { dy = Math.abs(v - (y + off)); by = v - off; gy = s; }
  }
  return { x: bx, y: by, gx, gy };
}
