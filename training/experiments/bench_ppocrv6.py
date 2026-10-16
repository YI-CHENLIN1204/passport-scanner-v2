#!/usr/bin/env python3
"""Local only PP-OCRv6 Small test on PRIVATE ZIP; never prints PII."""
import argparse, json, statistics, sys, time, zipfile, subprocess
from pathlib import Path, PurePosixPath
from v6_name_gate import propose_names
from v6_romanization_gate import corroborate_candidates, pypinyin_romanize

STAGE = 'startup'

def safe(z, name):
    if not isinstance(name,str) or not name or '..' in PurePosixPath(name).parts or name not in z.namelist(): raise ValueError('invalid archive path')
    return z.read(name)

def evaluate(zip_path,limit,production_index=None,production_comparator=False,rec_model='v6-small'):
    global STAGE
    STAGE = 'dependencies'
    import cv2, numpy as np
    from rapidocr import RapidOCR, EngineType, ModelType, OCRVersion, LangRec
    STAGE = 'model-initialization'
    begin=time.monotonic()
    # Model vocabulary and preprocessing both controlled by RapidOCR,
    # unlike swapping a v6 ONNX into the browser v5 SDK.
    # RapidOCR >= 3.9 already defaults to PP-OCRv6 Small for Det/Rec.
    # Keep model defaults instead of fragile string-valued overrides.
    params={'Global.use_cls': False}
    if rec_model=='v4-traditional':
      # Only recognition changes: same v6 Small detector and broad VIZ crop.
      # RapidOCR v3.10 model list explicitly supports traditional Chinese rec.
      params.update({
        'Rec.engine_type': EngineType.ONNXRUNTIME,
        'Rec.lang_type': LangRec.CHINESE_CHT,
        'Rec.model_type': ModelType.MOBILE,
        'Rec.ocr_version': OCRVersion.PPOCRV4,
      })
    engine=RapidOCR(params=params)
    startup=round((time.monotonic()-begin)*1000)
    total=exact=substring=failed=0
    timings=[]
    anonymous_rows=[]
    production_comparator_rows=[]
    overlap={'confirmed_missing_candidates':0,'v6_standalone_rescue':0,'v6_substring_potential':0,'v6_absent':0,'confirmed_selector_blocked':0}
    indexed_seen=set()
    candidate_evidence={'matched_exact_with_geometry':0,'matched_exact_no_geometry':0,'matched_exact_low_confidence':0,'matched_exact_upper_roi':0,'matched_exact_lower_roi':0}
    verified_missing_evidence={'standalone_with_geometry':0,'standalone_confident':0,'standalone_upper_roi':0}
    passport_ordinal=0
    romanization_gate={'ocr_english_available':0,'single_match':0,'single_correct':0,'single_wrong':0,'ambiguous':0,'no_match':0,'no_ocr_english':0,'missing_candidate_single_correct':0,'missing_candidate_single_wrong':0}
    gate_ablation={'no_anchor_any_roi':{'unique_correct':0,'unique_wrong':0,'ambiguous':0,'none':0},'no_anchor_upper_roi':{'unique_correct':0,'unique_wrong':0,'ambiguous':0,'none':0},'label_any_roi':{'unique_correct':0,'unique_wrong':0,'ambiguous':0,'none':0}}
    missing_gate_ablation={'no_anchor_any_roi':{'unique_correct':0,'unique_wrong':0,'ambiguous':0,'none':0},'no_anchor_upper_roi':{'unique_correct':0,'unique_wrong':0,'ambiguous':0,'none':0},'label_any_roi':{'unique_correct':0,'unique_wrong':0,'ambiguous':0,'none':0}}
    blind_gate={'unique_proposed':0,'unique_correct':0,'unique_wrong':0,'ambiguous':0,'no_proposal':0,
      'missing_candidate_unique_correct':0,'missing_candidate_unique_wrong':0}
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
          boxes=getattr(result,'boxes',None)
          scores=getattr(result,'scores',None)
          proposals=propose_names(texts,boxes,scores,roi.shape[0])
          variants={
            'no_anchor_any_roi':propose_names(texts,boxes,scores,roi.shape[0],require_label=False,upper_only=False),
            'no_anchor_upper_roi':propose_names(texts,boxes,scores,roi.shape[0],require_label=False,upper_only=True),
            'label_any_roi':propose_names(texts,boxes,scores,roi.shape[0],require_label=True,upper_only=False),
          }
          for key,candidates in variants.items():
            bucket=gate_ablation[key]
            if len(candidates)>1:bucket['ambiguous']+=1
            elif not candidates:bucket['none']+=1
            elif candidates[0].text==truth:bucket['unique_correct']+=1
            else:bucket['unique_wrong']+=1
          if len(proposals)==1:
            blind_gate['unique_proposed']+=1
            if proposals[0].text==truth: blind_gate['unique_correct']+=1
            else: blind_gate['unique_wrong']+=1
          elif len(proposals)>1:blind_gate['ambiguous']+=1
          else: blind_gate['no_proposal']+=1
          matched_indices=[i for i,t in enumerate(texts) if t==truth]
          # Diagnostic only. Geometry/score MAY be absent depending on RapidOCR output.
          # Do not reject a valid candidate because metadata is missing.
          evidence=[]
          for idx in matched_indices:
            box=boxes[idx] if boxes is not None and idx<len(boxes) else None
            score=float(scores[idx]) if scores is not None and idx<len(scores) else None
            has_geometry=box is not None and len(box)>0
            upper=False
            if has_geometry:
              center_y=sum(float(point[1]) for point in box)/len(box)
              upper=center_y<roi.shape[0]*0.66
            evidence.append((has_geometry,score is not None and score>=0.75,upper))
          total+=1
          status = 'absent'
          if truth in texts:
            exact+=1
            status='standalone-exact'
            if any(item[0] for item in evidence): candidate_evidence['matched_exact_with_geometry']+=1
            else: candidate_evidence['matched_exact_no_geometry']+=1
            if not any(item[1] for item in evidence):candidate_evidence['matched_exact_low_confidence']+=1
            if any(item[2] for item in evidence):candidate_evidence['matched_exact_upper_roi']+=1
            elif any(item[0] for item in evidence):candidate_evidence['matched_exact_lower_roi']+=1
          elif any(truth in text for text in texts):
            substring+=1
            status='substring-only'
          # No sample key, name, raw OCR text or document number printed.
          # The original OCR payload may be historical, never call it .29.
          old=label.get('originalOcr') or {}
          fields=(old.get('originalFields') or old.get('fields') or {}) if isinstance(old,dict) else {}
          old_name=fields.get('nameZh') if isinstance(fields,dict) else None
          observed_english=fields.get('nameEn') if isinstance(fields,dict) else None
          if production_comparator:
            sample_key=str(row.get('sampleId','')).replace('-','').lower()
            # Never use exported historical OCR English for this experiment.
            current_mrz=(production_index or {}).get('productionMrzEnglishBySampleId',{}).get(sample_key,'')
            production_comparator_rows.append({'candidates':[p.text for p in variants['no_anchor_any_roi']],
              'ocrEnglish':current_mrz, 'truth':truth,
              'confirmedMiss':bool(production_index and sample_key in production_index['missingCandidateSampleIds'])})
          # Historical OCR-derived English is used ONLY as exploratory evidence;
          # NEVER use groundTruth English or treat old OCR as current .29 MRZ.
          roman_status,roman_matches=corroborate_candidates(
            variants['no_anchor_any_roi'], observed_english, pypinyin_romanize)
          if roman_status=='no-ocr-english':romanization_gate['no_ocr_english']+=1
          else:
            romanization_gate['ocr_english_available']+=1
            if roman_status=='single-exact-romanization':
              romanization_gate['single_match']+=1
              if roman_matches[0].text==truth:romanization_gate['single_correct']+=1
              else:romanization_gate['single_wrong']+=1
            elif roman_status=='ambiguous':romanization_gate['ambiguous']+=1
            else:romanization_gate['no_match']+=1
          old_status=('exact' if isinstance(old_name,str) and ''.join(old_name.split())==truth
                      else 'different' if isinstance(old_name,str) and old_name.strip()
                      else 'unknown')
          if production_index is not None:
            key=str(row.get('sampleId','')).replace('-','').lower()
            if key in production_index['missingCandidateSampleIds']:
              indexed_seen.add(key)
              overlap['confirmed_missing_candidates']+=1
              if roman_status=='single-exact-romanization':
                if roman_matches[0].text==truth:romanization_gate['missing_candidate_single_correct']+=1
                else:romanization_gate['missing_candidate_single_wrong']+=1
              for variant,candidates in variants.items():
                bucket=missing_gate_ablation[variant]
                if len(candidates)>1:bucket['ambiguous']+=1
                elif not candidates:bucket['none']+=1
                elif candidates[0].text==truth:bucket['unique_correct']+=1
                else:bucket['unique_wrong']+=1
              if len(proposals)==1:
                if proposals[0].text==truth:blind_gate['missing_candidate_unique_correct']+=1
                else:blind_gate['missing_candidate_unique_wrong']+=1
              if status=='standalone-exact':
                overlap['v6_standalone_rescue']+=1
                if any(item[0] for item in evidence):verified_missing_evidence['standalone_with_geometry']+=1
                if any(item[1] for item in evidence):verified_missing_evidence['standalone_confident']+=1
                if any(item[2] for item in evidence):verified_missing_evidence['standalone_upper_roi']+=1
              elif status=='substring-only':overlap['v6_substring_potential']+=1
              else:overlap['v6_absent']+=1
            if key in production_index['selectorBlockedSampleIds']:
              overlap['confirmed_selector_blocked']+=1
          anonymous_rows.append({'validation_passport_index':passport_ordinal,
            'v6_roi_candidate':status,'exported_original_ocr_proxy':old_status})
        except Exception:
          failed+=1
    official_comparator_result='not_requested'
    if production_comparator:
      STAGE='local-production-romanization-comparator'
      script=Path(__file__).resolve().parents[2] / 'frontend' / 'scripts' / 'eval-v6-mrz-candidates.mjs'
      proc=subprocess.run(['node',str(script)],input=json.dumps(production_comparator_rows),
        text=True,capture_output=True,timeout=90,check=False)
      if proc.returncode!=0:
        raise RuntimeError('Local comparator failed')
      official_comparator_result=json.loads(proc.stdout)
    if production_index is not None:
      overlap['index_complete']=indexed_seen==set(production_index['missingCandidateSampleIds'])
    return dict(cohort='Validation PASSPORT only',model=('RapidOCR PP-OCRv4 Traditional Chinese Mobile Rec + PP-OCRv6 Small Det' if rec_model=='v4-traditional' else 'RapidOCR PP-OCRv6 Small'),
      processed=total,standalone_exact=exact,substring_only=substring,failures=failed,
      anonymous_by_validation_order=anonymous_rows,
      truth_blind_spatial_gate=blind_gate,
      historical_ocr_english_romanization=romanization_gate,
      production_comparator_on_current_29_mrz=official_comparator_result,
      truth_blind_ablation=gate_ablation,
      confirmed_missing_ablation=missing_gate_ablation if production_index is not None else 'not_provided',
      v6_exact_candidate_evidence=candidate_evidence,
      production_missing_candidate_evidence=verified_missing_evidence if production_index is not None else 'not_provided',
      production_29_overlap=overlap if production_index is not None else 'not_provided',
      init_ms=startup,median_roi_ms=round(statistics.median(timings)) if timings else 0,
      disclaimer='Original OCR in export is historical, NOT .29. Do not infer true rescue from this table. Validation ordering is not a stable sample identity.')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('dataset_zip',type=Path,nargs='?')
    p.add_argument('--limit',type=int,default=19)
    p.add_argument('--rec-model',choices=('v6-small','v4-traditional'),default='v6-small',
      help='Same v6 detector and ROI, compare only recognition; traditional model may download on first run')
    p.add_argument('--production-index',type=Path,
      help='Local anonymous index exported from the same-page complete production Validation')
    p.add_argument('--production-comparator',action='store_true',
      help='Use existing frontend comparator with current production .29 MRZ (local index required)')
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
      index=None
      if args.production_index:
        index=json.loads(args.production_index.read_text(encoding='utf-8-sig'))
        if index.get('pipelineVersion')!='2026.10.11.29': raise ValueError('wrong index version')
        for group in ('missingCandidateSampleIds','selectorBlockedSampleIds'):
          if not isinstance(index.get(group),list) or any(not isinstance(x,str) or len(x.replace('-',''))!=32 for x in index[group]):
            raise ValueError('invalid local index')
          index[group]=[x.replace('-','').lower() for x in index[group]]
        raw_mrz=index.get('productionMrzEnglishBySampleId')
        if args.production_comparator and not isinstance(raw_mrz,dict):
          raise ValueError('Missing current-page .29 MRZ map: re-export after updated full production Validation')
        index['productionMrzEnglishBySampleId']={k.replace('-','').lower():v for k,v in (raw_mrz or {}).items()
          if isinstance(k,str) and isinstance(v,str) and len(v)<256}
      print(json.dumps(evaluate(args.dataset_zip,args.limit,index,args.production_comparator,args.rec_model),ensure_ascii=False))
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
