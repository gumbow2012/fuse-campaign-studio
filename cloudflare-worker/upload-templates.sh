#!/bin/bash
# Upload all template JSONs to Cloudflare R2 via wrangler
# Run from the cloudflare-worker directory after deploying the worker.
#
# Usage: bash upload-templates.sh

set -e

TEMPLATES_DIR="./templates"

echo "Uploading templates to R2 bucket: fuse-templates"
echo ""

for file in "$TEMPLATES_DIR"/*_template.json; do
  key=$(basename "$file")
  echo "  → $key"
  wrangler r2 object put "fuse-templates/$key" --file="$file" --content-type="application/json"
done

echo ""
echo "Done! Templates uploaded."
echo ""
echo "List of uploaded templates:"
wrangler r2 object list fuse-templates
