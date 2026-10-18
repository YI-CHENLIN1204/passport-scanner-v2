#!/usr/bin/env python3
"""One-shot, anonymous offline v6 candidate evaluation on frozen Validation.
Not the browser inference runtime; never prints labels or model output.
Do not use this cohort to tune selectors.
"""
import argparse
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath


def member(z, path):
    if (not isinstance(path, str) or not path or
            PurePosixPath(path).is_absolute() or
            '..' in PurePosixPath(path).parts or path not in z.namelist()):
        raise ValueError('invalid private archive member')
    info = z.getinfo(path)
    if info.file_size > 26 * 1024 * 1024:
        raise ValueError('private archive member too large')
    return z.read(path)


def evaluate(archive):
    import cv2
    import numpy as np
    from rapidocr import RapidOCR
    from v6_name_gate import propose_names

    engine = RapidOCR(params={'Global.use_cls':False})
    counts = Counter()
    with zipfile.ZipFile(archive) as z:
        records = member(z, 'splits/validation.jsonl').decode('utf-8-sig').splitlines()
        for line in records:
            if not line.strip():
                continue
            record = json.loads(line.strip().lstrip('\ufeff'))
            if record.get('documentType') != 'PASSPORT' or record.get('split') != 'validation':
                continue
            label = json.loads(member(z,record['label']).decode('utf-8-sig'))
            truth = ''.join(str((label.get('groundTruth') or {}).get('nameZh') or '').split())
            if not truth:
                raise ValueError('missing private ground truth; abort without partial score')
            raw = member(z,record.get('ocrInputImage') or record['image'])
            image = cv2.imdecode(np.frombuffer(raw,dtype=np.uint8),cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError('image decode failed')
            h,w = image.shape[:2]
            roi = image[int(h*.12):int(h*.70),int(w*.24):int(w*.98)]
            if roi.size == 0: raise ValueError('empty crop')
            result = engine(roi)
            texts = [''.join(str(x).split()) for x in (getattr(result,'txts',None) or [])]
            props = propose_names(
                texts, getattr(result,'boxes',None), getattr(result,'scores',None),
                roi.shape[0], require_label=True, upper_only=True, passport_label=True
            )
            counts['total'] += 1
            counts['raw_exact'] += int(truth in texts)
            if len(props) == 0:
                counts['abstained'] += 1
            elif len(props) > 1:
                counts['ambiguous'] += 1
            elif props[0].text == truth:
                counts['unique_correct'] += 1
            else:
                counts['unique_wrong'] += 1
    if counts['total'] != 19:
        raise ValueError('unexpected frozen passport validation count; expected 19')
    if sum(counts[k] for k in ('abstained','ambiguous','unique_correct','unique_wrong')) != 19:
        raise AssertionError('candidate partitions invalid')
    return {
        'cohort':'fixed Validation / 19 passports, read-only',
        'engine':'offline RapidOCR default v6 small; not browser PaddleOCR.js',
        'metrics':{key:counts[key] for key in
          ('total','raw_exact','unique_correct','unique_wrong','ambiguous','abstained')},
        'warning':'Do not use this fixed cohort for tuning; no production OCR score change. No personally identifying output.'
    }


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('dataset_zip',type=Path)
    args=parser.parse_args()
    try:
        print(json.dumps(evaluate(args.dataset_zip),ensure_ascii=False))
    except Exception as exc:
        print('V6_FROZEN_EVAL_FAILED: '+type(exc).__name__,file=sys.stderr)
        sys.exit(1)
