#!/usr/bin/env bash
# Publishes the latest world build (dist/builds) into the content-addressed R2/S3 blob store
# (blobs/<sha256>, pre-compressed with Brotli/gzip and immutable cache headers) plus a small
# <buildId>/manifest.json uploaded last as the atomic commit marker. Only blobs not already in
# the bucket are uploaded, so incremental builds upload only changed files.
#
#   CLOUDFLARE_API_TOKEN   a token with Workers R2 Storage: Edit on the account
#   CLOUDFLARE_ACCOUNT_ID  the account the bucket is in
#   (or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL for any S3-compatible store)
#   BUILD_BUCKET           the bucket name
#   BUILD_STORE            the public URL the bucket is served at, ending in a slash
#   BLOB_ENCODING          optional: br (default), gzip, or none
set -euo pipefail
: "${BUILD_BUCKET:?}" "${BUILD_STORE:?}"

id=$(node -p "JSON.parse(require('fs').readFileSync('dist/builds/index.json', 'utf8')).latest")
dir="dist/builds/$id"
[ -f "$dir/tileset.json" ] || { echo "::error::$dir has no tileset.json: build the world first"; exit 1; }
[ -f "$dir/manifest.json" ] || { echo "::error::$dir has no manifest.json: rebuild the world to emit the content-addressed manifest"; exit 1; }

npx tsx tools/world/src/cli.ts publish-build --id "$id" --bucket "$BUILD_BUCKET" "$@"

# The site is published only if the store serves both the build manifest and its blobs with CORS.
tileset_sha=$(node -p "JSON.parse(require('fs').readFileSync('$dir/manifest.json', 'utf8')).files['tileset.json']")
for check_url in "${BUILD_STORE}${id}/manifest.json" "${BUILD_STORE}blobs/${tileset_sha}"; do
  if ! curl --compressed -fsS -o /dev/null -H 'Origin: https://wikiworldmodel.org' -D - "$check_url" | grep -qi '^access-control-allow-origin:'; then
    echo "::error::$check_url is not served, or not to other origins: check the bucket's custom domain and CORS (site/README.md)"
    exit 1
  fi
done
echo "served at ${BUILD_STORE}${id}/ (blobs at ${BUILD_STORE}blobs/)"
