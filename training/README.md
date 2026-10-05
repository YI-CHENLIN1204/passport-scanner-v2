# OCR Training Workspace

This directory is the working area for improving OCR accuracy and latency for all three supported document types:

- Passport
- Taiwan Compatriot Permit
- Taiwan National ID

## Core rule

Do not commit real document images, document crops, labels containing personal data, checkpoints trained on private images, or benchmark exports with personal data.

The repository only stores:

- training code
- configuration
- synthetic-data generators
- benchmark schemas
- evaluation scripts
- documentation

Private material belongs under ignored directories such as:

- `training/data/`
- `training/exports/`
- `training/checkpoints/`
- `training/output/`
- `training/private-models/`
- `training/benchmarks/private/`

## Three-document optimization tracks

### Passport

Primary goals:

1. MRZ recognition
2. Chinese name recognition for Taiwan passports
3. document orientation / crop robustness
4. reduced fallback frequency

Primary exact-match fields:

- Chinese name
- English name
- birth date
- sex
- passport number
- nationality
- issuing country
- expiry date

### Taiwan Compatriot Permit

Primary goals:

1. Chinese name recognition
2. permit number recognition
3. birth date
4. sex
5. expiry date
6. robust MRZ / visual-field fusion

Primary exact-match fields:

- Chinese name
- permit number
- birth date
- sex
- expiry date

### Taiwan National ID

Primary goals:

1. Chinese name recognition
2. national ID recognition with checksum validation
3. birth date
4. sex
5. orientation robustness

Primary exact-match fields:

- Chinese name
- national ID
- birth date
- sex

## Benchmark dimensions

Accuracy and speed are both release criteria.

Per image, record:

- document type
- total OCR milliseconds
- model initialization milliseconds
- model prediction milliseconds
- orientation attempts
- fallback used
- extracted field count
- exact match per field
- all-required-fields exact match

Aggregate at minimum:

- exact-match accuracy per field
- full-document exact-match rate
- median seconds per image
- p90 seconds per image
- mean orientation attempts
- fallback rate
- manual-correction rate

## Data split

Never randomly split near-duplicate photos of the same physical document across train and test.

Use document/person-level separation:

- train: 70%
- validation: 15%
- test: 15%

A physical credential and all of its augmented variants must stay in exactly one split.

## Ground truth source

The production scan flow preserves two versions:

1. `ocrPayloadJson.originalFields`: model output before human review
2. current reviewed `scan_items` fields: corrected values after human review

That makes it possible to calculate benchmark accuracy without guessing what the OCR originally produced.

Training-image retention is a separate explicit process and must not silently extend production image retention.


## Production collection flow

New production scans preserve the model's raw output in `ocrPayloadJson.originalFields`.

After human review:

- reviewed `scan_items` fields are the ground truth used by benchmark aggregation;
- the production image still follows the normal tour return-date + 7-day deletion rule;
- the image is copied into `training_samples` only when the reviewer explicitly enables “保留此樣本供 OCR 改善”;
- the training copy is independent from production photo retention.

## Private dataset export

The internal OCR Quality page can export selected samples as a private ZIP.

The ZIP contains:

- `images/<DOCUMENT_TYPE>/<sample-id>.<ext>`
- `labels/<DOCUMENT_TYPE>/<sample-id>.json`
- `manifest.jsonl`
- `README.txt`

The label JSON contains the original OCR payload and reviewed ground truth. Field-specific recognition crops are intentionally not generated blindly at export time; crop generation belongs to the later model-specific preparation step so that passport MRZ, passport Chinese name, permit fields, and national-ID fields can each use the correct layout strategy.

Never commit the exported ZIP or extracted private data to Git.
