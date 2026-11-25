#!/usr/bin/env python3
"""Draw the Trafika app icon (a "T." like the wordmark: paper white on safelight dark, red dot).
Writes app-icon.png (1024 px); then `npx tauri icon app-icon.png` makes every size."""
from PIL import Image, ImageDraw

S = 4  # supersample
N = 1024 * S
img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, N - 1, N - 1], radius=200 * S, fill="#000B04")
d.rounded_rectangle([24 * S, 24 * S, N - 1 - 24 * S, N - 1 - 24 * S], radius=180 * S, outline="#1E2A22", width=6 * S)
W = "#F4F1EA"
d.rectangle([232 * S, 250 * S, 712 * S, 380 * S], fill=W)          # T bar
d.rectangle([407 * S, 250 * S, 537 * S, 774 * S], fill=W)          # T stem
d.rectangle([622 * S, 644 * S, 752 * S, 774 * S], fill="#FF4128")  # the dot
img.resize((1024, 1024), Image.LANCZOS).save("app-icon.png")
print("app-icon.png")
