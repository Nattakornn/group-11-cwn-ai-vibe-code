. /Users/natthakorn/my_work_self/teaching_code/us-stock-analysis/pordee/exploration/C7/h.sh
for p in 209.98 210.00 210.02 209.99 190.02 190.00 189.98; do
  echo "== $p"
  curl -s -XPOST $B/api/test/reset >/dev/null
  feed "{\"symbol\":\"ZALR\",\"mode\":\"price\",\"price\":$p,\"clearCache\":true}" >/dev/null
  curl -s $B/api/stocks/ZALR | cut -c1-260; echo
  tick | cut -c1-200
  login ploy
  echo " inbox: $(as ploy $B/api/inbox | cut -c1-300)"
  echo " outbox: $(as ploy $B/api/outbox | cut -c1-300)"
done
