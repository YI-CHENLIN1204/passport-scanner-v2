FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/copy-ort-wasm.mjs ./scripts/copy-ort-wasm.mjs
RUN npm ci

COPY . .

RUN npm run build


# Download the exact PP-OCRv5 ONNX tar archives during image build.
# Keeping them inside the image removes runtime dependency on external DNS,
# CORS, upstream availability, or nginx reverse-proxy behavior.
FROM alpine:3.20 AS paddle-models

RUN apk add --no-cache curl tar

WORKDIR /models/paddlex/official_inference_model/paddle3.0.0

RUN repack_model() { \
      src="$1"; dst="$2"; work="$3"; \
      mkdir -p "$work/extracted" "$work/canonical"; \
      tar -xf "$src" -C "$work/extracted"; \
      onnx="$(find "$work/extracted" -type f -name inference.onnx | head -n 1)"; \
      yml="$(find "$work/extracted" -type f -name inference.yml | head -n 1)"; \
      test -n "$onnx" && test -n "$yml"; \
      cp "$onnx" "$work/canonical/inference.onnx"; \
      cp "$yml" "$work/canonical/inference.yml"; \
      tar --format=ustar -cf "$dst" -C "$work/canonical" inference.onnx inference.yml; \
      tar -tf "$dst" | grep -qx 'inference.onnx'; \
      tar -tf "$dst" | grep -qx 'inference.yml'; \
    }; \
    curl -fL --retry 4 --retry-delay 2 \
      https://huggingface.co/LunarOilRig/paddleocr-onnx/resolve/main/PP-OCRv5_mobile_det_onnx_infer.tar \
      -o /tmp/det-original.tar \
    && echo "781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30  /tmp/det-original.tar" | sha256sum -c - \
    && repack_model \
      /tmp/det-original.tar \
      PP-OCRv5_mobile_det_onnx_infer.tar \
      /tmp/det-model \
    && curl -fL --retry 4 --retry-delay 2 \
      https://huggingface.co/LunarOilRig/paddleocr-onnx/resolve/main/PP-OCRv5_mobile_rec_onnx_infer.tar \
      -o /tmp/rec-original.tar \
    && echo "f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c  /tmp/rec-original.tar" | sha256sum -c - \
    && repack_model \
      /tmp/rec-original.tar \
      PP-OCRv5_mobile_rec_onnx_infer.tar \
      /tmp/rec-model \
    && echo "Detection archive:" \
    && tar -tvf PP-OCRv5_mobile_det_onnx_infer.tar \
    && echo "Recognition archive:" \
    && tar -tvf PP-OCRv5_mobile_rec_onnx_infer.tar

# Review-only Traditional Chinese recognition candidate.
# The ONNX bytes are locked to the exact RapidOCR model used by the
# 2026-10-16 private pilot. Metadata comes from the official PaddlePaddle
# model at a pinned commit so PaddleOCR.js receives the matching v3 CHT
# preprocessing, postprocessing, and character dictionary.
RUN mkdir -p /models/experiments /tmp/cht-v3-model \
    && curl -fL --retry 4 --retry-delay 2 \
      https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv4/rec/chinese_cht_PP-OCRv3_rec_mobile.onnx \
      -o /tmp/cht-v3-model/inference.onnx \
    && echo "779656d044ce388045e02ea9244724616194e63928606436cdfc6dc3c9528cc6  /tmp/cht-v3-model/inference.onnx" | sha256sum -c - \
    && curl -fL --retry 4 --retry-delay 2 \
      https://huggingface.co/PaddlePaddle/chinese_cht_PP-OCRv3_mobile_rec/resolve/083f1a89e8efdedbd748514157e12f5a05b33bc3/inference.yml \
      -o /tmp/cht-v3-model/inference.yml \
    && grep -Eq '^[[:space:]]*model_name:[[:space:]]*chinese_cht_PP-OCRv3_mobile_rec[[:space:]]*$' /tmp/cht-v3-model/inference.yml \
    && grep -q 'character_dict:' /tmp/cht-v3-model/inference.yml \
    && tar --format=ustar -cf \
      /models/experiments/chinese_cht_PP-OCRv3_mobile_rec_rapidocr.tar \
      -C /tmp/cht-v3-model inference.onnx inference.yml \
    && tar -tf /models/experiments/chinese_cht_PP-OCRv3_mobile_rec_rapidocr.tar | grep -qx 'inference.onnx' \
    && tar -tf /models/experiments/chinese_cht_PP-OCRv3_mobile_rec_rapidocr.tar | grep -qx 'inference.yml'


FROM nginx:alpine AS final

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=paddle-models /models /usr/share/nginx/html/paddle-models
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
