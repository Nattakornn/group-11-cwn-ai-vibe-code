. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
T(){ tick | python3 -c 'import json,sys;[print(" dca",j["result"]) for j in json.load(sys.stdin)["jobs"] if j["name"]=="dca"]'; }
login beam; as beam $B/api/dca/pending | cut -c1-300
as beam -XPATCH $B/api/dca/plans/1 -H 'content-type: application/json' -d '{"active":true}' | cut -c1-300
T; as beam $B/api/dca/pending | python3 -c 'import json,sys;print([ (i["tradeDate"],i["fxRate"],i["shares"]) for i in json.load(sys.stdin)["items"]])'
