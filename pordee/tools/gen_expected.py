"""คิดค่าที่คาดหวังจากกฎสร้างข้อมูลใน TEST-DATA.md (ใช้ Decimal ทั้งหมด ไม่ใช้ float)"""
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
from datetime import date, timedelta
getcontext().prec = 40
Q4, Q2 = D('0.0001'), D('0.01')
r4 = lambda x: x.quantize(Q4, ROUND_HALF_UP)
r2 = lambda x: x.quantize(Q2, ROUND_HALF_UP)
ANCHOR = date(2026, 11, 5)
CLOSED = {date(2026,11,26), date(2026,12,25), date(2027,1,1)}
def trading_days(a, b):
    d, out = a, []
    while d <= b:
        if d.weekday() < 5 and d not in CLOSED: out.append(d)
        d += timedelta(days=1)
    return out
DAYS = trading_days(date(2015,12,1), date(2026,12,31))
IDX = {d: i - DAYS.index(ANCHOR) for i, d in enumerate(DAYS)}
P = [0, 1, 2, 1, 0, -1, -2, -1]
def generic(A, i):
    if i > 0: return A
    return r4(A * (1 + D('0.0002') * i + D('0.005') * P[i % 8]))
def series(sym, A):
    out = {}
    for d in DAYS:
        i = IDX[d]
        if sym == 'ZUP': c = A if i > 0 else r4(A + D('0.05') * i)          # ขึ้นทุกวัน
        elif sym == 'ZDN': c = A if i > 0 else r4(A - D('0.05') * i)        # ลงทุกวัน
        elif sym in ('ZGC', 'ZEQ', 'ZDC'):
            X = {'ZGC': D(150), 'ZEQ': D(149), 'ZDC': D(50)}[sym]
            mid = D(99) if sym != 'ZDC' else D(101)
            c = D(100) if i <= -50 else (mid if i <= -1 else X)
        else: c = generic(A, i)
        out[d] = c
    if sym == 'PDNW':
        keep = [d for d in DAYS if IDX[d] > -40]; out = {d: out[d] for d in keep}
    if sym == 'OLDC':
        out = {d: c for d, c in out.items() if d <= date(2026,10,2)}
    return out
def closes_until(s, last): return [s[d] for d in sorted(s) if d <= last]
def sma(cl, n): return r4(sum(cl[-n:]) / n) if len(cl) >= n else None
def rsi(cl, n=14):
    if len(cl) < n + 1: return None
    ch = [cl[k] - cl[k-1] for k in range(1, len(cl))]
    g = sum((max(x, D(0)) for x in ch[:n]), D(0)) / n; l = sum((max(-x, D(0)) for x in ch[:n]), D(0)) / n
    for x in ch[n:]:
        g = (g * (n-1) + max(x, D(0))) / n; l = (l * (n-1) + max(-x, D(0))) / n
    if l == 0: return D('100.00')
    return r2(100 - 100 / (1 + g / l))
A = {'AAPL':'240','MSFT':'420','NVDA':'130','BRK.B':'480','KO':'68','JNJ':'155','PG':'165','O':'58','VOO':'500','TSLA':'250','RIVN':'12','PDNW':'20','OLDC':'3.2',
     'ZA01':'130','ZALR':'200','ZUP':'200','ZDN':'200','ZGC':'150','ZEQ':'149','ZDC':'50'}
S = {k: series(k, D(v)) for k, v in A.items()}
print('anchor index check: days in generator', len(DAYS), 'first', DAYS[0])
for k in ['AAPL','VOO','NVDA','KO','ZA01','ZUP','ZDN','PDNW']:
    cl = closes_until(S[k], ANCHOR)
    print(f"{k:5} close5Nov={cl[-1]} prev={cl[-2] if len(cl)>1 else '-'} n={len(cl)} SMA50={sma(cl,50)} SMA200={sma(cl,200)} RSI14={rsi(cl)}")
for k in ['ZGC','ZEQ','ZDC']:
    for last in [date(2026,11,4), ANCHOR]:
        cl = closes_until(S[k], last); print(f"{k} {last} SMA50={sum(cl[-50:])/50:.4f} SMA200={sum(cl[-200:])/200:.4f} diff={(sum(cl[-50:])/50 - sum(cl[-200:])/200):.4f}")
# PDNW day count boundary
pd = sorted(S['PDNW']); print('PDNW first day', pd[0], '| 49th', pd[48], '| 50th', pd[49])
# NVDA split
n = S['NVDA']; d1, d2 = date(2024,6,7), date(2024,6,10)
print('NVDA adj 7 Jun 2024 =', n[d1], 'raw =', n[d1]*10, '| 10 Jun adj = raw =', n[d2])
# weekly candle 26-30 Oct 2026 AAPL
wk = [d for d in DAYS if date(2026,10,26) <= d <= date(2026,10,30)]
a = S['AAPL']; prev = max(d for d in DAYS if d < wk[0])
opens = {d: (a[max(x for x in DAYS if x < d)]) for d in wk}
highs = {d: r4(max(opens[d], a[d]) * D('1.005')) for d in wk}; lows = {d: r4(min(opens[d], a[d]) * D('0.995')) for d in wk}
print('AAPL week 26-30 Oct: open', opens[wk[0]], 'close', a[wk[-1]], 'high', max(highs.values()), 'low', min(lows.values()))
print('AAPL 23 Oct close', a[date(2026,10,23)], '| 30 Oct', a[date(2026,10,30)])
# backtest VOO: Nov 2025 .. Oct 2026 (12 months), 5000 THB? use USD 100/month
v = S['VOO']
firsts = []
for m in range(12):
    y, mo = (2025 + (10 + m) // 12, (10 + m) % 12 + 1)
    firsts.append(min(d for d in DAYS if d.year == y and d.month == mo))
sh = sum(D(100) / v[d] for d in firsts); lump = D(1200) / v[firsts[0]]
last = v[ANCHOR]
print('backtest months', firsts[0], '->', firsts[-1], '| DCA value', r2(sh * last), '| lump value', r2(lump * last), '| diff', r2(sh*last - lump*last))
print('VOO first-day closes', [str(v[d]) for d in firsts])
# Free 1y boundary days
print('2025-11-06 trading?', date(2025,11,6) in IDX, '| 2016-11-06 weekday', date(2016,11,6).weekday())

# ---------- เงิน (ตรวจตัวเลขในตาราง E) ----------
def fee(v, rate=D('0.0015'), mn=D('1.00')): return max(r2(v * rate), mn)
print('\n# money')
for v in ['666.00','666.67','700.00','1000.00','669.00','670.00','671.00','650.00']: print('fee', v, '->', fee(D(v)))
c1 = D(1000) + fee(D(1000)); c2 = D(1400) + fee(D(1400)); cost = c1 + c2
print('ZA01 cost$', cost, 'avg', r2(cost/20), 'cost฿', r2(c1*34) + r2(c2*35), '(', r2(c1*34), r2(c2*35), ')')
for fx in ['33.50','33.60']:
    val = D(20)*130; print(f' fx {fx}: value฿ {r2(val*D(fx))} P/L฿ {r2(val*D(fx)) - (r2(c1*34)+r2(c2*35))} P/L$ {val-cost}')
print('sell 5@130 realized', D(650) - fee(D(650)) - r2(r2(cost/20)*5), '| avg kept', r2((cost - r2(cost/20)*5)/15))
v1 = D(480)+fee(D(480)); v2 = D(490)+fee(D(490))
print('beam VOO cost$', v1+v2, 'avg', r2((v1+v2)/2), 'cost฿', r2(v1*34)+r2(v2*35), 'value฿@33.60', r2(D(1000)*D('33.60')), 'P/L฿', r2(D(1000)*D('33.60'))-(r2(v1*34)+r2(v2*35)))
usd = r2(D(5000)/D(35)); f = fee(usd); inv = usd - f
print('DCA usd', usd, 'fee', f, 'invest', inv, 'shares@500', (inv/D(500)).quantize(Q4, rounding='ROUND_DOWN'),
      '@141.86', (inv/D('141.86')).quantize(Q4, rounding='ROUND_DOWN'), '@141.87', (inv/D('141.87')).quantize(Q4, rounding='ROUND_DOWN'))
tot_net = D(0); tot_thb = D(0)
for sym, sh, dps in [('JNJ',50,'1.30'),('O',200,'0.27'),('KO',100,'0.51')]:
    g = r2(sh*D(dps)); n = r2(g*D('0.85')); t = r2(n*35); tot_net += n; tot_thb += t
    print(f'div {sym} gross {g} net {n} thb {t}')
print('div total net', tot_net, 'thb', tot_thb, '| 1 share O', r2(r2(D('0.27'))*D('0.85')))
pl = D(0)
for sym, sh, buy, now in [('KO',100,60,68),('JNJ',50,150,155),('PG',40,160,165),('O',200,55,58),('VOO',10,450,500)]:
    c = sh*D(buy) + fee(sh*D(buy)); p = sh*D(now) - c; pl += p; print(f'somchai {sym} cost {c} P/L {p}')
print('somchai price P/L', pl, '+ div', tot_net, '=', pl + tot_net)
pdn = sorted(S['PDNW']); cl = [S['PDNW'][d] for d in pdn if d <= date(2026,11,19)]
print('PDNW closes to 19 Nov', len(cl), 'SMA50', sma(cl, 50), '| to 18 Nov', len(cl)-1)
z = S['ZUP']; print('ZUP 30 Oct', z[date(2026,10,30)], 'pct', r2((D(200)/z[date(2026,10,30)] - 1)*100), '| AAPL pct', r2((D(240)/S['AAPL'][date(2026,10,30)] - 1)*100))
print('AAPL +1.00 pct', r2(D(1)/D(240)*100))
