#!/usr/bin/env python3
"""Local only PP-OCRv6 Small test on PRIVATE ZIP; never prints PII."""
import argparse, json, statistics, sys, time, zipfile
from pathlib import Path, PurePosixPath

def safe(z, name):
    if not isinstance(name,str) or not name or '..' in PurePosixPath(name).parts or name not in z.namelist(): raise ValueError('invalid archive path')
    return z.read(name)

def evaluate(zip_path,limit):
    import cv2, numpy as np
    from rapidocr import RapidOCR
    begin=time.monotonic()
    # Model vocabulary and preprocessing both controlled by RapidOCR,
    # unlike swapping a v6 ONNX into the browser v5 SDK.
    engine=RapidOCR(params={
      'Det.ocr_version':'PP-OCRv6','Det.model_type':'small',
      'Rec.ocr_version':'PP-OCRv6','Rec.model_type':'small',
      'Rec.lang_type':'ch','Global.use_cls':False})
    startup=round((time.monotonic()-begin)*1000)
    total=exact=substring=failed=0
    timings=[]
    with zipfile.ZipFile(zip_path) as z:
      records=safe(z,'splits/validation.jsonl').decode('utf-8').splitlines()
      for line in records:
        if total+failed>=limit: break
        if not line.strip(): continue
        row=json.loads(line)
        if row.get('documentType')!='PASSPORT' or row.get('split')!='validation':continue
        label=json.loads(safe(z,row['label']))
        truth=''.join(str((label.get('groundTruth') or {}).get('nameZh') or '').split())
        if not truth: failed+=1;continue
        try:
          raw=safe(z,row.get('ocrInputImage') or row['image'])
          if len(raw)>25*1024*1024: raise ValueError('image too big')
          image=cv2.imdecode(np.frombuffer(raw,dtype=np.uint8),cv2.IMREAD_COLOR)
          if image is None: raise ValueError('image invalid')
          h,w=image.shape[:2]
          roi=image[int(h*.12):int(h*.70),int(w*.24):int(w*.98)]
          if roi.size==0: raise ValueError('empty crop')
          started=time.monotonic()
          result=engine(roi)
          timings.append(round((time.monotonic()-started)*1000))
          texts=[''.join(t.split()) for t in (getattr(result,'txts',None) or [])]
          total+=1
          if truth in texts: exact+=1
          elif any(truth in text for text in texts):substring+=1
        except Exception:
          failed+=1
    return dict(cohort='Validation PASSPORT only',model='RapidOCR PP-OCRv6 Small',
      processed=total,standalone_exact=exact,substring_only=substring,failures=failed,
      init_ms=startup,median_roi_ms=round(statistics.median(timings)) if timings else 0,
      disclaimer='Exploratory ROI candidate results, not production accuracy')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('dataset_zip',type=Path)
    p.add_argument('--limit',type=int,default=19)
    args=p.parse_args()
    if not args.dataset_zip.is_file() or not 1<=args.limit<=19: p.error('Private ZIP required; limit 1..19')
    try: print(json.dumps(evaluate(args.dataset_zip,args.limit),ensure_ascii=False))
    except Exception:
      print('PP-OCRv6 experiment failed; no private records printed.',file=sys.stderr)
      sys.exit(1)
