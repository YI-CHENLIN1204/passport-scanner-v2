#!/usr/bin/env python3
"""Private TRAIN-only model comparison; prints counts, never OCR text or identifiers.

Compare independently configured RapidOCR v6 Small against v3 CHT recognition.
Do not train/tune from the fixed Validation/Test cohort.
"""
import argparse
import json
import statistics
import sys
import time
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath


def member(z, path):
    if (not isinstance(path, str) or not path or
            PurePosixPath(path).is_absolute() or
            '..' in PurePosixPath(path).parts or path not in z.namelist()):
        raise ValueError('invalid archive member')
    info = z.getinfo(path)
    if info.file_size > 26 * 1024 * 1024:
        raise ValueError('archive member too large')
    return z.read(path)


def image_and_truth(z, record, cv2, np):
    label = json.loads(member(z, record['label']).decode('utf-8-sig'))
    truth = ''.join(str((label.get('groundTruth') or {}).get('nameZh') or '').split())
    if not (2 <= len(truth) <= 4):
        return None
    img = cv2.imdecode(
        np.frombuffer(member(z, record.get('ocrInputImage') or record['image']), dtype=np.uint8),
        cv2.IMREAD_COLOR,
    )
    if img is None:
        raise ValueError('image decode failed')
    h, w = img.shape[:2]
    roi = img[int(h * .12):int(h * .70),int(w * .24):int(w * .98)]
    if roi.size == 0:
        raise ValueError('empty ROI')
    return roi, truth


def recognize(engine, roi, truth, propose):
    start = time.monotonic()
    prediction = engine(roi)
    duration_ms = int((time.monotonic()-start)*1000)
    texts = [''.join(str(x).split()) for x in (getattr(prediction,'txts',None) or [])]
    boxes = getattr(prediction,'boxes',None)
    scores = getattr(prediction,'scores',None)
    candidates = propose(texts, boxes, scores, roi.shape[0])
    unique = len(candidates) == 1
    return dict(
        duration_ms=duration_ms,
        raw_exact=truth in texts,
        unique_correct=int(unique and candidates[0].text == truth),
        unique_wrong=int(unique and candidates[0].text != truth),
        abstained=int(not unique),
    )


def main(zip_path, limit):
    import cv2
    import numpy as np
    from rapidocr import RapidOCR, EngineType, ModelType, OCRVersion, LangRec
    from v6_name_gate import propose_names

    engines = {
        'ppocrv6_small': RapidOCR(params={'Global.use_cls':False}),
        'ppocrv3_cht': RapidOCR(params={
            'Global.use_cls':False,
            'Rec.engine_type':EngineType.ONNXRUNTIME,
            'Rec.lang_type':LangRec.CHINESE_CHT,
            'Rec.model_type':ModelType.MOBILE,
            'Rec.ocr_version':OCRVersion.PPOCRV4,
        }),
    }
    totals = {name:Counter() for name in engines}
    durations = {name:[] for name in engines}
    paired = Counter()
    visited = 0
    with zipfile.ZipFile(zip_path) as z:
        entries = member(z, 'splits/train.jsonl').decode('utf-8-sig').splitlines()
        for line in entries:
            if visited >= limit:
                break
            if not line.strip():
                continue
            record = json.loads(line.strip().lstrip('\ufeff'))
            if record.get('split') != 'train' or record.get('documentType') != 'PASSPORT':
                continue
            sample = image_and_truth(z, record, cv2, np)
            if sample is None:
                continue
            roi, truth = sample
            results = {}
            for name, engine in engines.items():
                result = recognize(engine, roi, truth, propose_names)
                durations[name].append(result.pop('duration_ms'))
                totals[name].update(result)
                results[name] = result['raw_exact']
            paired['both_exact' if all(results.values()) else
                   'neither_exact' if not any(results.values()) else
                   'v6_only' if results['ppocrv6_small'] else 'v3_only'] += 1
            visited += 1
    if visited == 0:
        raise ValueError('no private train passport samples')
    return dict(
        experiment='private_train_recognition_model_comparison',
        cohort='TRAIN only; excludes fixed Validation and Test',
        compared=visited,
        results={
            name:{**dict(totals[name]),'median_ms':round(statistics.median(durations[name]))}
            for name in engines
        },
        paired_exact=dict(paired),
        warning='This is offline RapidOCR candidate evidence, not browser OCR or production accuracy. No private strings exported.'
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset_zip',type=Path)
    parser.add_argument('--limit',type=int,default=200)
    args=parser.parse_args()
    try:
        if not (1 <= args.limit <= 1000):
            raise ValueError('limit out of range')
        print(json.dumps(main(args.dataset_zip,args.limit),ensure_ascii=False))
    except Exception as e:
        print('TRAIN_AB_FAILED: '+type(e).__name__,file=sys.stderr)
        sys.exit(1)
