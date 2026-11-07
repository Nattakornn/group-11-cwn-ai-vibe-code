#!/usr/bin/env bash
# ทีมแก้เว็บ: build image ของตัวเองจาก web/ แล้วเปิดเว็บชุด N ด้วย image นั้น · ใช้: scripts/fix-shard.sh N
set -euo pipefail
n=$1; cd "$(dirname "$0")"
docker build -q -t pordee-web:fix$n ../../web >/dev/null
IMAGE=pordee-web:fix$n ./shards.sh up "$n" 0
