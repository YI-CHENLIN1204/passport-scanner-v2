FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build


# Download the exact PP-OCRv5 ONNX tar archives during image build.
# Keeping them inside the image removes runtime dependency on external DNS,
# CORS, upstream availability, or nginx reverse-proxy behavior.
FROM alpine:3.20 AS paddle-models

RUN apk add --no-cache curl

WORKDIR /models/paddlex/official_inference_model/paddle3.0.0

RUN validate_model_tar() { \
      tar -tf "$1" | grep -Eq '(^|/)inference\.onnx

FROM nginx:alpine AS final

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=paddle-models /models /usr/share/nginx/html/paddle-models
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
 \
      && tar -tf "$1" | grep -Eq '(^|/)inference\.yml

FROM nginx:alpine AS final

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=paddle-models /models /usr/share/nginx/html/paddle-models
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
; \
    }; \
    curl -fL --retry 4 --retry-delay 2 \
      https://huggingface.co/LunarOilRig/paddleocr-onnx/resolve/main/PP-OCRv5_mobile_det_onnx_infer.tar \
      -o PP-OCRv5_mobile_det_onnx_infer.tar \
    && echo "781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30  PP-OCRv5_mobile_det_onnx_infer.tar" | sha256sum -c - \
    && validate_model_tar PP-OCRv5_mobile_det_onnx_infer.tar \
    && curl -fL --retry 4 --retry-delay 2 \
      https://huggingface.co/LunarOilRig/paddleocr-onnx/resolve/main/PP-OCRv5_mobile_rec_onnx_infer.tar \
      -o PP-OCRv5_mobile_rec_onnx_infer.tar \
    && echo "f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c  PP-OCRv5_mobile_rec_onnx_infer.tar" | sha256sum -c - \
    && validate_model_tar PP-OCRv5_mobile_rec_onnx_infer.tar


FROM nginx:alpine AS final

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=paddle-models /models /usr/share/nginx/html/paddle-models
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
