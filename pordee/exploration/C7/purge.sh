. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
T(){ tick | python3 -c 'import json,sys;[print(" ",j["name"],j["result"]) for j in json.load(sys.stdin)["jobs"] if j["name"] in("purge",)]'; }
L(){ curl -s -XPOST $B/api/auth/login -H 'content-type: application/json' -d "{\"email\":\"$1@pordee.test\",\"password\":\"Pordee#2569\"}" | cut -c1-150; echo; }
echo "E156"; curl -s -XPOST $B/api/test/reset >/dev/null; L del2; T; L del2
curl -s -XPOST $B/api/auth/signup -H 'content-type: application/json' -d '{"email":"del2@pordee.test","password":"Pordee#2569","displayName":"del2 ใหม่","acceptTerms":true,"lang":"th"}' | cut -c1-250; echo
for d in 2026-12-03T22:00:00 2026-12-04T00:00:00 2026-12-05T00:00:00; do echo "X3 $d"; curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d "{\"now\":\"$d+07:00\"}" >/dev/null; T; L del1; done
