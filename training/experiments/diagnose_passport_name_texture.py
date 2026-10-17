#!/usr/bin/env python3
"""Private, diagnostic-only passport name texture/glare A/B. Never prints PII."""
import argparse
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath


def safe_read(archive, member):
    if not isinstance(member, str) or not member or '..' in PurePosixPath(member).parts:
        raise ValueError('invalid member')
    if member not in archive.namelist():
        raise ValueError('missing member')
    return archive.read(member)


def mask_variant(roi, cv2, variant):
    if variant == 'original':
        return roi
    lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    if variant == 'local_luminance':
        l = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8)).apply(l)
        return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    if variant == 'reduced_chroma':
        # Diagnostic hypothesis: red security ink may have high chroma.
        # Blend colour channels toward neutral while preserving luminance.
        neutral = cv2.merge((l, l * 0 + 128, l * 0 + 128))
        return cv2.cvtColor(neutral, cv2.COLOR_LAB2BGR)
    if variant == 'grayscale':
        return cv2.cvtColor(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    raise ValueError('unknown variant')


def evidence(result, truth, roi_height):
    texts = [''.join(str(t).split()) for t in (getattr(result, 'txts', None) or [])]
    boxes = getattr(result, 'boxes', None)
    scores = getattr(result, 'scores', None)
    nboxes = len(boxes) if boxes is not None else 0
    possible = [i for i, text in enumerate(texts) if 2 <= len(text) <= 4 and all(
        '\u4e00' <= c <= '\u9fff' for c in text)]
    accurate = [i for i, text in enumerate(texts) if text == truth]
    # This is geometry availability, NOT proof that the ground-truth name
    # was detected. A genuine detection/recognition attribution needs
    # annotated text-region boxes independent from OCR itself.
    upper_boxes = 0
    for i in possible:
        if boxes is None or i >= len(boxes) or boxes[i] is None:
            continue
        box = boxes[i]
        try:
            if sum(float(p[1]) for p in box) / len(box) < roi_height * 0.66:
                upper_boxes += 1
        except (TypeError, ValueError, ZeroDivisionError, IndexError):
            pass
    return {
        'exact': bool(accurate),
        'substring': not accurate and any(truth in t for t in texts),
        'plausible_han_boxes': len(possible),
        'upper_han_boxes': upper_boxes,
        'box_count': nboxes,
        'scores_available': scores is not None,
    }


def evaluate(dataset_zip, index_path, rec_model):
    import cv2
    import numpy as np
    from rapidocr import RapidOCR, EngineType, ModelType, OCRVersion, LangRec
    index = json.loads(index_path.read_text(encoding='utf-8-sig'))
    if index.get('pipelineVersion') != '2026.10.11.29':
        raise ValueError('index version mismatch')
    groups = index.get('missingCandidateSampleIds')
    if not isinstance(groups, list) or len(groups) != 4:
        raise ValueError('expected four missing-candidate samples')
    keys = {value.replace('-', '').lower() for value in groups if isinstance(value, str)}
    if len(keys) != 4 or any(len(k) != 32 for k in keys):
        raise ValueError('invalid sample index')
    options = {'Global.use_cls': False}
    if rec_model == 'v3-cht':
        options.update({
            'Rec.engine_type': EngineType.ONNXRUNTIME,
            'Rec.lang_type': LangRec.CHINESE_CHT,
            'Rec.model_type': ModelType.MOBILE,
            'Rec.ocr_version': OCRVersion.PPOCRV4,
        })
    engine = RapidOCR(params=options)
    variants = ('original', 'local_luminance', 'reduced_chroma', 'grayscale')
    counts = {variant: Counter() for variant in variants}
    present = set()
    with zipfile.ZipFile(dataset_zip) as archive:
        for line in safe_read(archive, 'splits/validation.jsonl').decode('utf-8-sig').splitlines():
            if not line.strip():
                continue
            record = json.loads(line.strip().lstrip('\ufeff'))
            key = str(record.get('sampleId', '')).replace('-', '').lower()
            if key not in keys or record.get('documentType') != 'PASSPORT':
                continue
            present.add(key)
            label = json.loads(safe_read(archive, record['label']).decode('utf-8-sig'))
            truth = ''.join(str((label.get('groundTruth') or {}).get('nameZh') or '').split())
            raw = safe_read(archive, record.get('ocrInputImage') or record['image'])
            if not truth or len(raw) > 25 * 1024 * 1024:
                raise ValueError('invalid private sample')
            image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError('image decode failure')
            h, w = image.shape[:2]
            roi = image[int(h * .12):int(h * .70), int(w * .24):int(w * .98)]
            if roi.size == 0:
                raise ValueError('empty ROI')
            for variant in variants:
                result = engine(mask_variant(roi, cv2, variant))
                item = evidence(result, truth, roi.shape[0])
                bucket = counts[variant]
                bucket['processed'] += 1
                bucket['exact_candidate'] += int(item['exact'])
                bucket['substring_only'] += int(item['substring'])
                bucket['no_exact_candidate'] += int(not item['exact'])
                bucket['has_plausible_han_box'] += int(item['plausible_han_boxes'] > 0)
                bucket['has_upper_han_box'] += int(item['upper_han_boxes'] > 0)
                bucket['no_boxes'] += int(item['box_count'] == 0)
                bucket['scores_available'] += int(item['scores_available'])
    if present != keys:
        raise ValueError('not all indexed private samples were located')
    return {
        'experiment': 'passport-local-colour-luminance-diagnostic',
        'source_index_version': '2026.10.11.29',
        'cohort_count': len(present),
        'model': rec_model,
        'variants': {name: dict(counts[name]) for name in variants},
        'interpretation': 'OCR-derived box counts cannot conclusively distinguish missed detection from recognition failure.',
        'restriction': 'Diagnostic only. The four selected Validation failures must not be used to tune production or claim improved held-out accuracy.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset_zip', type=Path)
    parser.add_argument('--production-index', type=Path, required=True)
    parser.add_argument('--rec-model', choices=('v6-small', 'v3-cht'), default='v3-cht')
    args = parser.parse_args()
    try:
        print(json.dumps(evaluate(args.dataset_zip, args.production_index, args.rec_model), ensure_ascii=False))
    except Exception as error:
        print('DIAGNOSTIC_FAILED: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
