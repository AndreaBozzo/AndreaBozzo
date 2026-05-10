#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if command -v wasm-pack >/dev/null 2>&1; then
    wasm-pack build rust/site_engine --target web --out-dir ../../assets/wasm --release
    rm -f assets/wasm/.gitignore
    exit 0
fi

required_files=(
    assets/wasm/site_engine.js
    assets/wasm/site_engine_bg.wasm
    assets/wasm/site_engine.d.ts
    assets/wasm/site_engine_bg.wasm.d.ts
)

missing_files=0
for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "Missing prebuilt WASM artifact: $file" >&2
        missing_files=1
    fi
done

if [[ "$missing_files" -ne 0 ]]; then
    echo "wasm-pack is not installed and the committed WASM artifacts are incomplete." >&2
    echo "Install wasm-pack to rebuild rust/site_engine, or restore the generated assets under assets/wasm/." >&2
    exit 1
fi

echo "wasm-pack not found; reusing committed assets/wasm artifacts from assets/wasm/."