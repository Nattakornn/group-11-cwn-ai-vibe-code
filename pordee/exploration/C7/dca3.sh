. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
R(){ curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d "{\"now\":\"$1+07:00\"}" >/dev/null; login beam; }
T(){ tick | python3 -c 'import json,sys;[print(" dca",j["result"]) for j in json.load(sys.stdin)["jobs"] if j["name"]=="dca"]'; }
echo "== E126"; R 2026-12-29T04:00:00; T; as beam $B/api/dca/pending | cut -c1-600
echo "== X1 pause 20 Nov -> 29 Dec resume"; R 2026-11-20T12:00:00
as beam -XPATCH $B/api/dca/plans/1 -H 'content-type: application/json' -d '{"active":false}' | cut -c1-300
clk 2026-12-29T04:00:00+07:00 >/dev/null; T; as beam $B/api/dca/pending | cut -c1-300
as beam -XPATCH $B/api/dca/plans/1 -H 'content-type: application/json' -d '{"active":true}' | cut -c1-300
T; as beam $B/api/dca/pending | cut -c1-700
clk 2026-12-29T05:00:00+07:00 >/dev/null; T; as beam $B/api/dca/pending | python3 -c 'import json,sys;print([ (i["tradeDate"],i["fxRate"],i["shares"]) for i in json.load(sys.stdin)["items"]])'
