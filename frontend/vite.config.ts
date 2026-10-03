import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5080',
        changeOrigin: true,
      },
      '/paddle-models': {
        target: 'https://paddle-model-ecology.bj.bcebos.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/paddle-models/, ''),
      },
      '/paddle-model-mirror': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        secure: true,
        followRedirects: true,
        rewrite: (path) =>
          path.replace(
            /^\/paddle-model-mirror/,
            '/LunarOilRig/paddleocr-onnx/resolve/main',
          ),
      },
    },
  },
})
