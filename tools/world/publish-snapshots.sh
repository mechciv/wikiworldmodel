#!/usr/bin/env bash
# Uploads any missing raw snapshot blobs pinned as `blob:<sha256>` in world/manifest.yaml
# to the content-addressed R2/S3 blob store (`blobs/<sha256>`), pre-compressed where helpful.
#
#   CLOUDFLARE_API_TOKEN   a token with Workers R2 Storage: Edit on the account
#   CLOUDFLARE_ACCOUNT_ID  the account the bucket is in
#   (or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL for any S3-compatible store)
#   BUILD_BUCKET           the bucket name (or SNAPSHOT_BUCKET)
#
# Optional flags forwarded to `cli.ts publish-snapshots`:
#   --from-git <rev>       extract missing snapshots from a git revision that still had world/snapshots/
#   --encoding br|gzip|none
#   --concurrency <n>
set -euo pipefail

npx tsx tools/world/src/cli.ts publish-snapshots "$@"
