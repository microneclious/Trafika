"""Verify bundled fonts cover Macedonian Cyrillic. Usage: python check_fonts.py <font files...>
Exits 1 if any font is missing a required glyph."""
import sys
from fontTools.ttLib import TTFont

REQUIRED = "ЃЌЅЉЊЏЈѓќѕљњџјАБВГДЕЖЗИКЛМНОПРСТУФХЦЧШабвгдежзиклмнопрстуфхцчш"
bad = 0
for path in sys.argv[1:]:
    cmap = TTFont(path).getBestCmap()
    missing = [c for c in REQUIRED if ord(c) not in cmap]
    print(("FAIL " if missing else "ok   ") + path + (" missing: " + "".join(missing) if missing else ""))
    bad += bool(missing)
sys.exit(1 if bad else 0)
