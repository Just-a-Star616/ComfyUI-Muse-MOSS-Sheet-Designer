from fractions import Fraction as F
from math import ceil, floor
from .catalog import CONTRACT, VIEWS
from .state import fail

G, M = F(1,25), F(1,14)
TARGETS = {'portrait': (256,256), 'body': (256,640), 'clothing': (256,512), 'detail': (256,192)}

def groups(views, h3=False):
    result = []
    for kind in TARGETS:
        ids = [v for v in views if CONTRACT['views'][v]['kind'] == kind]
        n = len(ids)
        if not n:
            continue
        cells = []
        if kind == 'portrait':
            columns = min(2,n) if h3 else (1 if n <= 2 else 2)
            rows = ceil(F(n, columns))
            a = (1 - (rows-1)*G)/rows
            cw = F(1,2) if h3 or n == 1 else a
            width = columns*cw + (columns-1)*G
            for i, v in enumerate(ids):
                x, y = (i % columns)*(cw+G), (i // columns)*(a+G)
                cells.append((v,x,y,x+cw,y+a))
        elif kind in ('body','clothing'):
            a = F(2,5) if h3 or kind == 'body' else F(1,2)
            width = n*a+(n-1)*G
            cells = [(v,i*(a+G),F(0),i*(a+G)+a,F(1)) for i,v in enumerate(ids)]
        else:
            a = (1-(n-1)*G)/n
            width = F(1,2) if h3 else F(3,2)*a
            cells = [(v,F(0),i*(a+G),width,i*(a+G)+a) for i,v in enumerate(ids)]
        result.append((kind,width,cells))
    return result

def compute_layout(state, runtime_max_resolution=16384):
    size = state['size']
    extended = any(v not in ('face_front','face_left','body_front','body_left','body_back','hands','feet') for v in state['views'])
    gs = groups(state['views'], h3=extended and size['mode']=='auto')
    candidates = []
    for mask in range(1 if size['mode']=='auto' else 1 << (len(gs)-1)):
        rows = [[]]
        for i, group in enumerate(gs):
            if i and mask & (1 << (i-1)):
                rows.append([])
            rows[-1].append(group)
        widths = [sum(g[1] for g in row)+(len(row)-1)*G for row in rows]
        iw, ih = max(widths)+2*M, len(rows)+(len(rows)-1)*G+2*M
        if size['mode'] == 'auto':
            low, high = 0, size['body_height']
            while low < high:
                b = (low+high+1)//2
                w,h = max(256,16*ceil(iw*b/16)),max(256,16*ceil(ih*b/16))
                if w*h <= size['pixel_budget'] and max(w,h) <= runtime_max_resolution:
                    low = b
                else:
                    high = b-1
            if not low:
                continue
            scale = F(low)
            w,h = max(256,16*ceil(iw*scale/16)),max(256,16*ceil(ih*scale/16))
        else:
            w,h = size['manual_width'],size['manual_height']
            scale = min(F(w)/iw,F(h)/ih)
        ox,oy = (w-iw*scale)/2,(h-ih*scale)/2
        boxes, quality, area = {}, [], F(0)
        for row_index, row in enumerate(rows):
            x = M+(max(widths)-widths[row_index])/2
            y = M+row_index*(1+G)
            for kind, width, cells in row:
                for v,x0,y0,x1,y1 in cells:
                    tw,th = TARGETS[kind]
                    quality.append(min((x1-x0)*scale/tw,(y1-y0)*scale/th))
                    area += (x1-x0)*(y1-y0)*scale*scale
                    boxes[v] = [floor(ox+(x+x0)*scale),floor(oy+(y+y0)*scale),ceil(ox+(x+x1)*scale),ceil(oy+(y+y1)*scale)]
                x += width+G
        score = (min(quality),area/(w*h),-len(rows),-mask)
        candidates.append((score,w,h,scale,rows,boxes))
    if not candidates:
        fail('E_LAYOUT', 'size')
    score,w,h,scale,rows,boxes = max(candidates,key=lambda item:item[0])
    panels = [{'id':v,'bbox_px':boxes[v],'kind':CONTRACT['views'][v]['kind']} for v in VIEWS if v in boxes]
    for i,p in enumerate(panels):
        a,b,c,d = p['bbox_px']
        if not (0 <= a < c <= w and 0 <= b < d <= h):
            fail('E_BBOX','layout_plan.panels')
        for q in panels[:i]:
            e,f,g,k = q['bbox_px']
            if max(a,e) < min(c,g) and max(b,f) < min(d,k):
                fail('E_BBOX','layout_plan.panels')
    return dict(canvas=[w,h],rows=[[g[0] for g in row] for row in rows],panels=panels,requested_body_height=size['body_height'],actual_body_height=float(scale),density_score=float(score[0]))
