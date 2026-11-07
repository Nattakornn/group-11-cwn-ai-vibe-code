. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
S(){ feed "{\"symbol\":\"$1\",\"mode\":\"price\",\"price\":$2,\"clearCache\":true}" >/dev/null; curl -s $B/api/stocks/$1 >/dev/null; tick >/dev/null; }
C(){ login $1; as $1 $B/api/inbox | python3 -c 'import json,sys;d=json.load(sys.stdin);print(" inbox",len(d["items"]),"unread",d["unread"],[(i["symbol"],i["price"],i["triggeredAt"],i["inQuietHours"]) for i in d["items"]])'; as $1 $B/api/outbox | python3 -c 'import json,sys;d=json.load(sys.stdin);print(" outbox",len(d["items"]),[(i["subject"],i["sentAt"]) for i in d["items"]])'; }
echo "== E98/E99"; curl -s -XPOST $B/api/test/reset >/dev/null
S ZALR 210.00; clk 2026-11-06T23:30:00+07:00 >/dev/null; S ZALR 216.00; clk 2026-11-07T01:00:00+07:00 >/dev/null; S ZALR 216.00; C ploy
clk 2026-11-09T22:00:00+07:00 >/dev/null; S ZALR 210.00; C ploy; curl -s $B/api/stocks/ZALR | python3 -c 'import json,sys;q=json.load(sys.stdin)["quote"];print(" 9nov prevClose",q["prevClose"],q["changePct"][:6])'
echo "== E100-E102 AAPL"; curl -s -XPOST $B/api/test/reset >/dev/null
S AAPL 249.99; C ploy; S AAPL 250.00; C ploy; C beam; as ploy $B/api/alerts | python3 -c 'import json,sys;d=json.load(sys.stdin);print(" ploy alerts keys",list(d.keys()) if isinstance(d,dict) else "", [a for a in (d.get("items") or d.get("alerts") or []) if a.get("symbol")=="AAPL"], {k:v for k,v in d.items() if k not in("items","alerts")})'; S AAPL 251.00; C ploy
echo "== E103 01:59"; curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d '{"now":"2026-11-07T01:59:00+07:00"}' >/dev/null; S ZALR 210.00; C ploy
echo "== E104 02:00"; curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d '{"now":"2026-11-07T02:00:00+07:00"}' >/dev/null; S ZALR 210.00; C ploy; clk 2026-11-07T03:00:00+07:00 >/dev/null; S ZALR 220.00; C ploy
