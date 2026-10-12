#!/usr/bin/env python3
"""Local only PP-OCRv6 Small test on PRIVATE ZIP; never prints PII."""
import argparse, json, statistics, sys, time, zipfile
from pathlib import Path, PurePosixPath

STAGE = 'startup'

def safe(z, name):
    if not isinstance(name,str) or not name or '..' in PurePosixPath(name).parts or name not in z.namelist(): raise ValueError('invalid archive path')
    return z.read(name)

def evaluate(zip_path,limit):
    global STAGE
    STAGE = 'dependencies'
    import cv2, numpy as np
    from rapidocr import RapidOCR
    STAGE = 'model-initialization'
    begin=time.monotonic()
    # Model vocabulary and preprocessing both controlled by RapidOCR,
    # unlike swapping a v6 ONNX into the browser v5 SDK.
    # RapidOCR >= 3.9 already defaults to PP-OCRv6 Small for Det/Rec.
    # Keep model defaults instead of fragile string-valued overrides.
    engine=RapidOCR(params={'Global.use_cls': False})
    startup=round((time.monotonic()-begin)*1000)
    total=exact=substring=failed=0
    timings=[]
    anonymous_rows=[]
    passport_ordinal=0
    STAGE = 'zip-manifest'
    with zipfile.ZipFile(zip_path) as z:
      records=safe(z,'splits/validation.jsonl').decode('utf-8-sig').splitlines()
      for line in records:
        if total+failed>=limit: break
        if not line.strip(): continue
        STAGE = 'manifest-row-json'
        row=json.loads(line.strip().lstrip('\ufeff'))
        if row.get('documentType')!='PASSPORT' or row.get('split')!='validation':continue
        passport_ordinal += 1
        STAGE = 'ground-truth-json'
        label=json.loads(safe(z,row['label']).decode('utf-8-sig'))
        truth=''.join(str((label.get('groundTruth') or {}).get('nameZh') or '').split())
        if not truth: failed+=1;continue
        try:
          STAGE = 'roi-prediction'
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
          status = 'absent'
          if truth in texts:
            exact+=1
            status='standalone-exact'
          elif any(truth in text for text in texts):
            substring+=1
            status='substring-only'
          # No sample key, name, raw OCR text or document number printed.
          # The original OCR payload may be historical, never call it .29.
          old=label.get('originalOcr') or {}
          fields=(old.get('originalFields') or old.get('fields') or {}) if isinstance(old,dict) else {}
          old_name=fields.get('nameZh') if isinstance(fields,dict) else None
          old_status=('exact' if isinstance(old_name,str) and ''.join(old_name.split())==truth
                      else 'different' if isinstance(old_name,str) and old_name.strip()
                      else 'unknown')
          anonymous_rows.append({'validation_passport_index':passport_ordinal,
            'v6_roi_candidate':status,'exported_original_ocr_proxy':old_status})
        except Exception:
          failed+=1
    return dict(cohort='Validation PASSPORT only',model='RapidOCR PP-OCRv6 Small',
      processed=total,standalone_exact=exact,substring_only=substring,failures=failed,
      anonymous_by_validation_order=anonymous_rows,
      init_ms=startup,median_roi_ms=round(statistics.median(timings)) if timings else 0,
      disclaimer='Original OCR in export is historical, NOT .29. Do not infer true rescue from this table. Validation ordering is not a stable sample identity.')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('dataset_zip',type=Path,nargs='?')
    p.add_argument('--limit',type=int,default=19)
    p.add_argument('--check',action='store_true',
      help='Check local packages and v6 config without reading the private ZIP')
    args=p.parse_args()
    if args.check:
      from importlib.util import find_spec
      print(json.dumps({
        'rapidocr':find_spec('rapidocr') is not None,
        'opencv':find_spec('cv2') is not None,
        'onnxruntime':find_spec('onnxruntime') is not None,
        'numpy':find_spec('numpy') is not None,
      }))
      sys.exit(0)
    if not args.dataset_zip or not args.dataset_zip.is_file() or not 1<=args.limit<=19: p.error('Private ZIP required; limit 1..19')
    try:
      print(json.dumps(evaluate(args.dataset_zip,args.limit),ensure_ascii=False))
    except ImportError as error:
      # Package name only: don't echo private paths or image contents.
      print('IMPORT_ERROR: '+str(error).split(':')[0][:100],file=sys.stderr)
      print('Try: .\\.venv\\Scripts\\python.exe -m pip install onnxruntime',file=sys.stderr)
      sys.exit(2)
    except Exception as error:
      # Exception class only: error messages may contain sensitive ZIP paths.
      print('EXPERIMENT_STAGE: '+STAGE,file=sys.stderr)
      print('EXPERIMENT_ERROR_TYPE: '+type(error).__name__,file=sys.stderr)
      print('Only stage/type are printed; no labels or images.',file=sys.stderr)
      sys.exit(1)
