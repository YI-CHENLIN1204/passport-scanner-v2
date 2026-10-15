"""Conservative truth-blind PP-OCRv6 name proposals for offline analysis only."""
import math
import re
from dataclasses import dataclass

HAN = re.compile(r'^[\u3400-\u9fff]{2,4}$')
LABEL = re.compile(r'^(?:姓名|中文姓名)(?:[：:])?$')
INLINE = re.compile(r'^(?:姓名|中文姓名)[：:]([\u3400-\u9fff]{2,4})$')

@dataclass(frozen=True)
class NameProposal:
    text: str
    score: float
    anchored: bool

def propose_names(texts, boxes, scores, roi_height):
    """No ground truth or MRZ input. Ambiguous proposals are never auto-applied."""
    if boxes is None or scores is None or len(texts)!=len(boxes) or len(texts)!=len(scores):
        return []
    def geometry(box):
        try:
            coords=[(float(p[0]),float(p[1])) for p in box]
            if len(coords)<4 or any(not math.isfinite(x) or not math.isfinite(y) for x,y in coords):
                return None
            xs,ys=zip(*coords)
            return min(xs),max(xs),(min(ys)+max(ys))/2,max(ys)-min(ys)
        except (TypeError, ValueError, IndexError):
            return None
    entries=[]
    for text,box,score in zip(texts,boxes,scores):
        norm=''.join(str(text).split()).replace('：',':')
        geo=geometry(box)
        try: conf=float(score)
        except (TypeError,ValueError): continue
        if geo and math.isfinite(conf):
            entries.append((norm,geo,conf))
    anchors=[geo for text,geo,_ in entries if LABEL.fullmatch(text)]
    proposals={}
    for text,(x1,x2,cy,h),score in entries:
        if score<.75 or cy>roi_height*.66 or h<=0:
            continue
        inline=INLINE.fullmatch(text)
        if inline:
            # Explicit prefix provides a stronger anchor than anonymous Han.
            name=inline.group(1)
            proposals[name]=max(score,proposals.get(name,0.0))
            continue
        if not HAN.fullmatch(text):
            continue
        anchored=any(
            x1>=ax2-max(h,ah) and x1-ax2<=10*max(h,ah)
            and abs(cy-acy)<=.65*max(h,ah)
            for ax1,ax2,acy,ah in anchors if ah>0
        )
        if anchored:
            proposals[text]=max(score,proposals.get(text,0.0))
    # Repeated boxes with identical normalized names are not ambiguity;
    # genuinely distinct candidates still remain ambiguous to the caller.
    return [NameProposal(text,score,True) for text,score in proposals.items()]
