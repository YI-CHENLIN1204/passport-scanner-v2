#!/usr/bin/env python3
"""Local/private PP-OCRv3 per-sample candidate gate audit. Never prints names."""
import argparse
import json
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath

def read_member(z, name):
    if not isinstance(name, str) or not name or '..' in PurePosixPath(name).parts or name not in z.namelist():
        raise ValueError('invalid zip member')
    return z.read(name)

def key(value):
    return str(value or '').replace('-', '').lower()

def run(dataset, index_file):
    import cv2
    import numpy as np
    from rapidocr import RapidOCR, EngineType, LangRec, ModelType, OCRVersion
    index = json.loads(index_file.read_text(encoding='utf-8-sig'))
    if index.get('pipelineVersion') != '2026.10.11.29':
        raise ValueError('incorrect production index')
    keys = {key(x) for x in index.get('missingCandidateSampleIds', [])}
    if len(keys) != 4 or any(len(k) != 32 for k in keys):
        raise ValueError('expected exactly four distinct missing-candidate keys')
    mrz_map = {key(k):v for k,v in index.get('productionMrzEnglishBySampleId', {}).items()}
    engine = RapidOCR(params={
        'Global.use_cls':False,
        'Rec.engine_type':EngineType.ONNXRUNTIME,
        'Rec.lang_type':LangRec.CHINESE_CHT,
        'Rec.model_type':ModelType.MOBILE,
        'Rec.ocr_version':OCRVersion.PPOCRV4,
    })
    rows = []
    ordinal = 0
    with zipfile.ZipFile(dataset) as z:
        for line in read_member(z,'splits/validation.jsonl').decode('utf-8-sig').splitlines():
            if not line.strip(): continue
            rec = json.loads(line.strip().lstrip('\ufeff'))
            if rec.get('documentType') != 'PASSPORT' or rec.get('split') != 'validation':
                continue
            ordinal += 1
            sid = key(rec.get('sampleId'))
            if sid not in keys: continue
            label = json.loads(read_member(z,rec['label']).decode('utf-8-sig'))
            truth = ''.join(str((label.get('groundTruth') or {}).get('nameZh') or '').split())
            raw = read_member(z,rec.get('ocrInputImage') or rec['image'])
            if len(raw)>25*1024*1024 or not truth: raise ValueError('invalid sample')
            image = cv2.imdecode(np.frombuffer(raw,dtype=np.uint8), cv2.IMREAD_COLOR)
            if image is None: raise ValueError('invalid image')
            h,w = image.shape[:2]
            roi = image[int(h*.12):int(h*.70),int(w*.24):int(w*.98)]
            if roi.size == 0: raise ValueError('empty roi')
            result = engine(roi)
            texts = [''.join(str(t).split()) for t in (getattr(result,'txts',None) or [])]
            # Same basic standalone 2-4 Han gate as the frontend, without
            # claiming Python RapidOCR detector is browser PP-OCRv5 detector.
            candidates = sorted(set(t for t in texts if 2 <= len(t) <= 4 and all('\u4e00' <= c <= '\u9fff' for c in t)))
            rows.append({'ordinal':ordinal,'truth':truth,'candidates':candidates,
                         'ocrEnglish':mrz_map.get(sid,''),'confirmedMiss':True,
                         'raw_row_exact':truth in texts,
                         'raw_row_substring':truth not in texts and any(truth in t for t in texts),
                         'standalone_candidates':len(candidates)})
    if len(rows)!=4 or any(not row['ocrEnglish'] for row in rows):
        raise ValueError('missing local samples or MRZ evidence; rerun current .29 export')
    bridge = Path(__file__).resolve().parents[2]/'frontend'/'scripts'/'eval-v6-mrz-candidates.mjs'
    request = [{k:row[k] for k in ('truth','candidates','ocrEnglish','confirmedMiss')} for row in rows]
    proc = subprocess.run(['node',str(bridge)],input=json.dumps(request),
                          text=True,capture_output=True,timeout=90,check=False)
    if proc.returncode: raise RuntimeError('production comparator unavailable')
    aggregate = json.loads(proc.stdout)
    return {
        'cohort':'four .29 missing-candidate passports',
        'model':'RapidOCR observed PP-OCRv3 CHT recognition + v6 detector',
        'anonymous_validation_order':[{
            'passport_ordinal':r['ordinal'],
            'standalone_candidate_count':r['standalone_candidates'],
            'exact_raw_row_present':r['raw_row_exact'],
            'exact_raw_row_substring_only':r['raw_row_substring'],
            'mrz_available':bool(r['ocrEnglish']),
        } for r in rows],
        'production_comparator_aggregate':aggregate,
        'warning':'Python detector is different from browser D-103 detector. No identity output. No production accuracy claim.',
    }

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('dataset_zip',type=Path)
    p.add_argument('--production-index',type=Path,required=True)
    args=p.parse_args()
    try:
        print(json.dumps(run(args.dataset_zip,args.production_index),ensure_ascii=False))
    except Exception as error:
        print('AUDIT_FAILED: '+type(error).__name__,file=sys.stderr)
        sys.exit(1)
