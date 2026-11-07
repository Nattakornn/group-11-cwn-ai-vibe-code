. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
S(){ clk $3 >/dev/null; feed "{\"symbol\":\"$1\",\"mode\":\"price\",\"price\":$2,\"clearCache\":true}" >/dev/null; curl -s $B/api/stocks/$1 | python3 -c 'import json,sys;q=json.load(sys.stdin)["quote"];print(" quote",q["price"],q["stale"])'; tick | python3 -c 'import json,sys;[print(" ",j["result"]["fired"],j["result"]["emailed"]) for j in json.load(sys.stdin)["jobs"] if j["name"]=="alerts"]'; }
curl -s -XPOST $B/api/test/reset >/dev/null
S AAPL 249.99 2026-11-06T22:00:00+07:00; S AAPL 250.00 2026-11-06T22:02:00+07:00
login ploy; login beam; as ploy $B/api/inbox | cut -c1-250; as beam $B/api/inbox | cut -c1-200
as ploy $B/api/alerts | python3 -c 'import json,sys;d=json.load(sys.stdin);print([a for a in d["items"] if a["symbol"]=="AAPL"], d["used"], d["limit"])'
S AAPL 251.00 2026-11-06T22:04:00+07:00; as ploy $B/api/inbox | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["items"]))'
S AAPL 251.00 2026-11-09T22:00:00+07:00; as ploy $B/api/inbox | python3 -c 'import json,sys;print("next session",len(json.load(sys.stdin)["items"]))'
