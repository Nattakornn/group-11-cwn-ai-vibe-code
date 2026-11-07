async()=>{const J=async(u,m,b)=>{const r=await fetch(u,{method:m||'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined});return [r.status,await r.json().catch(()=>null)]};
const o=[];const d='2026-11-05';
o.push(await J('/api/transactions','POST',{symbol:'ZA07',side:'buy',tradeDate:d,shares:'10',price:'50'}));
const s={symbol:'ZA07',side:'sell',tradeDate:'2026-11-06',shares:'10',price:'55'};
const rs=await Promise.all([J('/api/transactions','POST',s),J('/api/transactions','POST',s),J('/api/transactions','POST',s)]);
o.push(rs.map(x=>[x[0],x[1]?.error||x[1]?.holding]));
for(const f of [{feeRatePct:'0',feeMinUsd:'0'},{feeRatePct:'0.12345',feeMinUsd:'1'},{feeRatePct:'100',feeMinUsd:'1'},{feeRatePct:'-1',feeMinUsd:'1'},{feeRatePct:'0.15',feeMinUsd:'1.005'},{feeRatePct:'abc',feeMinUsd:''}]) o.push([JSON.stringify(f),await J('/api/me/fees','PATCH',f)]);
o.push(await J('/api/transactions','POST',{symbol:'ZA07',side:'buy',tradeDate:d,shares:'10',price:'100'}));
o.push(await J('/api/me/fees','PATCH',{feeRatePct:'0.15',feeMinUsd:'1'}));
o.push(await J('/api/me/fees'));
return JSON.stringify(o)}
