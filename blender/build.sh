#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIRECTORY="$(dirname "$SCRIPT_DIRECTORY")"
BLENDER_BINARY="${BLENDER:-$(command -v blender || true)}"

if [[ -z "$BLENDER_BINARY" || ! -x "$BLENDER_BINARY" ]]; then
  echo "Blender not found. Set BLENDER=/path/to/Blender (Blender 4.2 or newer)." >&2
  exit 1
fi

ASSETS_DIRECTORY="$PROJECT_DIRECTORY/vehicles/bmw/e60/assets"
mkdir -p "$ASSETS_DIRECTORY"

"$BLENDER_BINARY" --background --factory-startup --python "$SCRIPT_DIRECTORY/build_e60.py" -- \
  --glb "$ASSETS_DIRECTORY/e60-525i-n52.glb" \
  --manifest "$PROJECT_DIRECTORY/vehicles/bmw/e60/model.build.json" \
  "$@"

node "$SCRIPT_DIRECTORY/sync_model_map.mjs" "$PROJECT_DIRECTORY/vehicles/bmw/e60"
