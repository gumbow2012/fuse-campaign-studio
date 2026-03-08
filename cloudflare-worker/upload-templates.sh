#!/bin/bash
# Upload all template JSONs + reference images to Cloudflare R2 via wrangler
# Run from the cloudflare-worker directory after deploying the worker.
#
# Usage: bash upload-templates.sh

set -e

TEMPLATES_DIR="./templates"
ASSETS_DIR="../src/assets/templates"

echo "=== Uploading template JSONs to fuse-templates ==="
for file in "$TEMPLATES_DIR"/*_template.json; do
  key=$(basename "$file")
  echo "  → $key"
  npx wrangler r2 object put "fuse-templates/$key" --file="$file" --content-type="application/json"
done

echo ""
echo "=== Uploading reference images to fuse-assets ==="
for file in "$ASSETS_DIR"/*.png; do
  key="references/$(basename "$file")"
  echo "  → $key"
  npx wrangler r2 object put "fuse-assets/$key" --file="$file" --content-type="image/png"
done

echo ""
echo "Done! Templates and reference images uploaded."
