. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
T(){ tick | python3 -c 'import json,sys;[print(" ",j["name"],j["result"]) for j in json.load(sys.stdin)["jobs"] if j["name"] in("renew","purge")]'; }
ME(){ login $1; as $1 $B/api/me | python3 -c 'import json,sys;d=json.load(sys.stdin);u=d.get("user",d);print(" '$1'",{k:v for k,v in u.items() if any(x in k.lower() for x in("tier","pro","renew","period","cancel","until","billing","plan"))})' | cut -c1-500; }
curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d '{"now":"2026-11-09T22:00:00+07:00"}' >/dev/null
echo "9 Nov 22:00"; ME mint; ME nam
clk 2026-11-09T23:59:59+07:00 >/dev/null; T; ME mint; ME nam
clk 2026-11-10T00:00:00+07:00 >/dev/null; echo "10 Nov 00:00 before tick"; ME mint; ME nam; T; echo after; ME mint; ME nam
clk 2026-11-11T22:00:00+07:00 >/dev/null; ME nam
