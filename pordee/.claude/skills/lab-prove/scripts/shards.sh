#!/usr/bin/env bash
# เปิด/ปิดเว็บชุดเพิ่มสำหรับรันขนาน · ใช้: scripts/shards.sh up "1 2 3 4" [BUG_MODE] | down "1 2 ..." | wait "1 2 ..."
set -euo pipefail
cmd=$1; ids=$2; bug=${3:-0}
INIT="$(cd "$(dirname "$0")/../../db/init" && pwd)"
case $cmd in
  up)
    for n in $ids; do
      docker rm -f pordee-web-$n pordee-db-$n >/dev/null 2>&1 || true
      docker run -d --name pordee-db-$n --network pordee-net \
        -e POSTGRES_USER=pordee -e POSTGRES_PASSWORD=pordee -e POSTGRES_DB=pordee -e TZ=Asia/Bangkok \
        -p 127.0.0.1:31${n}1:5432 -v "$INIT":/docker-entrypoint-initdb.d:ro \
        --tmpfs /var/lib/postgresql/data postgres:16-alpine >/dev/null
    done
    for n in $ids; do
      until docker exec pordee-db-$n pg_isready -h 127.0.0.1 -U pordee -d pordee >/dev/null 2>&1; do sleep 1; done
    done
    for n in $ids; do
      docker run -d --name pordee-web-$n --network pordee-net -p 31${n}0:3300 \
        -e PORT=3300 -e HOSTNAME=0.0.0.0 -e TZ=Asia/Bangkok -e ALLOW_TEST_API=1 -e BUG_MODE=$bug \
        -e SESSION_SECRET=pordee-dev-secret -e DATABASE_URL=postgres://pordee:pordee@pordee-db-$n:5432/pordee \
        pordee-web:latest >/dev/null
    done
    "$0" wait "$ids" ;;
  wait)
    for n in $ids; do
      for i in $(seq 1 90); do
        if curl -sf localhost:31${n}0/api/health | grep -q '"db":true'; then echo "shard $n ok :31${n}0 (db :31${n}1)"; break; fi
        sleep 1; [ $i = 90 ] && echo "shard $n NOT READY"
      done
    done ;;
  down)
    for n in $ids; do docker rm -f pordee-web-$n pordee-db-$n >/dev/null 2>&1 || true; done; echo removed ;;
esac
