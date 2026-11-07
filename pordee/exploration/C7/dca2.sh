. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
R(){ curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d "{\"now\":\"$1+07:00\"}" >/dev/null; login beam; }
echo "== E125 03:59:59"; R 2026-11-26T03:59:59; tick | python3 -c 'import json,sys;[print(j) for j in json.load(sys.stdin)["jobs"] if j["name"]=="dca"]'; as beam $B/api/dca/pending
echo "== E122 04:00:00"; clk 2026-11-26T04:00:00+07:00 >/dev/null; tick | python3 -c 'import json,sys;[print(j) for j in json.load(sys.stdin)["jobs"] if j["name"]=="dca"]'; as beam $B/api/dca/pending; as beam $B/api/dca/plans
ID=$(as beam $B/api/dca/pending | python3 -c 'import json,sys;print(json.load(sys.stdin)["items"][0]["id"])')
echo "== E128 double confirm id=$ID"
( as beam -s -o /dev/null -w "A %{http_code}\n" -XPOST $B/api/dca/pending/$ID/confirm & sleep 0.05; as beam -s -w " B %{http_code}\n" -XPOST $B/api/dca/pending/$ID/confirm ; wait )
as beam $B/api/portfolio | python3 -c 'import json,sys;d=json.load(sys.stdin);[print(x["symbol"],x["shares"]) for x in d["holdings"]]'
as beam $B/api/transactions | cut -c1-900
