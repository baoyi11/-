#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing Node.js dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Installing Python dependencies..."
pip3 install fastapi>=0.110.0 uvicorn[standard]>=0.29.0 python-multipart>=0.0.9 pandas>=2.2.0 numpy>=1.26.0 scipy>=1.12.0 pydantic>=2.6.0 scikit-learn>=1.4.0 || true
pip3 install torch>=2.2.0 || echo "[WARN] torch install failed, AI model will be disabled"

echo "Building the Next.js project..."
pnpm next build

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"
