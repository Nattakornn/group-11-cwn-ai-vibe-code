B=http://localhost:3300
D=/Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7
reset(){ curl -s -XPOST $B/api/test/reset -H 'content-type: application/json' -d "${1:-{\}}"; echo; }
clk(){ curl -s -XPOST $B/api/test/clock -H 'content-type: application/json' -d "{\"now\":\"$1\"}"; echo; }
feed(){ curl -s -XPOST $B/api/test/feed -H 'content-type: application/json' -d "$1"; echo; }
tick(){ curl -s -XPOST $B/api/test/tick; echo; }
login(){ curl -s -c $D/$1.jar -XPOST $B/api/auth/login -H 'content-type: application/json' -d "{\"email\":\"$1@pordee.test\",\"password\":\"Pordee#2569\"}" >/dev/null; }
as(){ u=$1; shift; curl -s -b $D/$u.jar "$@"; echo; }
