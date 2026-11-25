"""Design-mock only: EAN-13 + EAN-2 add-on as SVG (real app uses bwip-js, M5).
Usage: python mock_barcode.py 049260012003 12 out.svg"""
import sys
L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]
G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"]
R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"]
PAR = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]
def check(d12): s=sum(int(c)*(3 if i%2 else 1) for i,c in enumerate(d12)); return str((10-s%10)%10)
d12, add, out = sys.argv[1], sys.argv[2], sys.argv[3]
assert len(d12)==12 and d12.startswith("04"), "must be 12 digits in GS1 040-049 internal range"
code = d12 + check(d12)
p = PAR[int(code[0])]
bits = "101" + "".join((L if p[i]=="L" else G)[int(c)] for i,c in enumerate(code[1:7])) + "01010" + "".join(R[int(c)] for c in code[7:]) + "101"
guard = set(range(0,3)) | set(range(45,50)) | set(range(92,95))
ap = ["LL","LG","GL","GG"][int(add)%4]
abits = "1011" + (L if ap[0]=="L" else G)[int(add[0])] + "01" + (L if ap[1]=="L" else G)[int(add[1])]
q=11; m=1; h=60; ax = q+95+9
W = ax+len(abits)+7
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {h+12}" shape-rendering="crispEdges"><rect width="{W}" height="{h+12}" fill="#fff"/>']
for i,b in enumerate(bits):
    if b=="1": svg.append(f'<rect x="{q+i}" y="2" width="1" height="{h+(5 if i in guard else 0)}" fill="#000"/>')
for i,b in enumerate(abits):
    if b=="1": svg.append(f'<rect x="{ax+i}" y="11" width="1" height="{h-4}" fill="#000"/>')
t='font-family="monospace" font-size="8.5" fill="#000" text-anchor="middle"'
svg.append(f'<text x="{q-5}" y="{h+10}" {t}>{code[0]}</text>')
for i,c in enumerate(code[1:7]): svg.append(f'<text x="{q+3+7*i+3.5}" y="{h+10}" {t}>{c}</text>')
for i,c in enumerate(code[7:]): svg.append(f'<text x="{q+50+7*i+3.5}" y="{h+10}" {t}>{c}</text>')
svg.append(f'<text x="{ax+len(abits)/2}" y="9" {t}>{add}</text></svg>')
open(out,"w").write("".join(svg)); print(code, add)
