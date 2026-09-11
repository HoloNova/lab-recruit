#!/usr/bin/env bash
# CLI 审核工具的 Docker wrapper —— 消除 docker compose exec 的输入摩擦
#
#   ./deploy/review.sh                     # 列表
#   ./deploy/review.sh --id 12             # 详情
#   ./deploy/review.sh --accept 12
#   ./deploy/review.sh --open-registration "2026-10-08 10:00"
#   ./deploy/review.sh --set-qr ./new-qr.png
set -euo pipefail

cd "$(dirname "$0")/.."

exec docker compose exec -T app node scripts/review.js "$@"
