. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
T(){ tick | python3 -c 'import json,sys;[print(" div",j["result"]) for j in json.load(sys.stdin)["jobs"] if j["name"]=="dividends"]'; }
curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d '{"now":"2026-12-03T22:00:00+07:00"}' >/dev/null; login fon; login somchai
for d in 2026-11-30 2026-12-01 2026-12-02; do as fon -XPOST $B/api/transactions -H 'content-type: application/json' -d "{\"symbol\":\"KO\",\"side\":\"buy\",\"tradeDate\":\"$d\",\"shares\":\"10\",\"price\":\"68\"}" | cut -c1-200; done
clk 2026-12-08T22:00:00+07:00 >/dev/null; T; as somchai $B/api/dividends/received | cut -c1-500
clk 2026-12-15T22:00:00+07:00 >/dev/null; T; login somchai; login fon
echo SOMCHAI; as somchai "$B/api/dividends/received" | cut -c1-1500
echo FON; as fon "$B/api/dividends/received" | cut -c1-800
clk 2026-12-16T22:00:00+07:00 >/dev/null; login somchai; as somchai $B/api/portfolio | python3 -c 'import json,sys;print(json.load(sys.stdin)["totals"])'
