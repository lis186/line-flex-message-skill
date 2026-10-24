# Measures card C5 (scaling on/off) of tests/device/calibration.json: box height, ink height and width per item, in CSS px.
# Run: uv run --with pillow python tools/measure-scaling.py <shot.png>...
import sys
from PIL import Image
def red(p): return p[0]>190 and p[1]<90 and p[2]<90
def dark(p): return sum(p[:3])<3*140
def star(p): return p[0]>200 and p[1]>150 and p[2]<90
def gray(p): return 205<=p[0]<=230 and 205<=p[1]<=232 and 215<=p[2]<=240 and p[2]-p[0]>=3
def pinkish(p): return p[0]>240 and 195<p[1]<230 and 195<p[2]<230
def greenish(p): return p[1]>240 and 200<p[0]<235 and 195<p[2]<230
for path in sys.argv[1:]:
    im=Image.open(path).convert('RGB'); w,h=im.size; px=im.load()
    best=None
    for y in range(0,h,2):
        x=0
        while x<w:
            if red(px[x,y]):
                x0=x
                while x<w and red(px[x,y]): x+=1
                if x-x0>150:
                    c=(abs((x0+x)/2-w/2),x0,x,y)
                    if best is None or c<best: best=c
            x+=1
    _,rx0,rx1,ry=best; s=(rx1-rx0)/200
    bot=ry
    while red(px[(rx0+rx1)//2,bot+1]): bot+=1
    cardL=rx0-int(12*s); cardR=cardL+int(276*s)
    def bbox(pred,x0,x1,y0,y1):
        pts=[(x,y) for y in range(y0,y1) for x in range(x0,x1,1) if pred(px[x,y])]
        if not pts: return None
        xs=[p[0] for p in pts]; ys=[p[1] for p in pts]; return min(xs),min(ys),max(xs),max(ys)
    region=(bot+1,min(h,bot+int(260*s)))
    mid=(cardL+cardR)//2
    res={}
    for name,pred,x0,x1 in [('off box',pinkish,rx0,mid),('on box',greenish,mid,cardR)]:
        b=bbox(pred,x0,x1,*region)
        ink=bbox(dark,b[0],b[2],b[1],b[3]+1)
        res[name]=((b[3]-b[1]+1)/s,(ink[3]-ink[1]+1)/s,(ink[2]-ink[0]+1)/s)
    for name,x0,x1 in [('icon off',rx0,mid),('icon on',mid,cardR)]:
        b=bbox(star,x0,x1,*region); res[name]=((b[3]-b[1]+1)/s,(b[2]-b[0]+1)/s,0)
    # buttons: gray rows down the left inner column
    col=rx0+int(20*s); segs=[]; y=bot
    while y<region[1]:
        if gray(px[col,y]):
            y0=y
            while y<h and (gray(px[col,y])): y+=1
            if y-y0>20: segs.append((y0,y))
        y+=1
    for i,(y0,y1) in enumerate(segs[:2]):
        ink=bbox(dark,rx0,rx0+int(270*s),y0,y1)
        res[f'button {"off" if i==0 else "on"}']=((y1-y0)/s,(ink[3]-ink[1]+1)/s,(ink[2]-ink[0]+1)/s)
    print('==',path.split('/')[-1],f'scale {s:.2f}')
    for k,(a,b,c) in res.items(): print(f'  {k:10} h {a:5.1f}  ink-h {b:5.1f}  ink-w {c:5.1f}')
