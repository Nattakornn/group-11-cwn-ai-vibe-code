async page => {
  const paths = ['/portfolio', '/dividends?month=2026-12', '/account', '/watchlist', '/alerts', '/inbox', '/study/backtest'];
  const out = [];
  for (const w of [375, 1280]) {
    await page.setViewportSize({ width: w, height: 812 });
    for (const lang of ['th', 'en']) for (const p of paths) {
      const url = 'http://localhost:3300/' + lang + p;
      let st = 0; try { const r = await page.goto(url, { waitUntil: 'networkidle' }); st = r.status(); } catch (e) { st = 'ERR'; }
      const res = await page.evaluate(() => {
        const t = document.body.innerText;
        const thai = (t.match(/[฀-๿]/g) || []).length;
        const thaiTitle = (document.title.match(/[฀-๿]/g) || []).length;
        const sample = (t.match(/[^\n]*[฀-๿][^\n]*/g) || []).slice(0, 3).map(s => s.slice(0, 60));
        const disTh = t.includes('ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน');
        const disEn = t.includes('For educational purposes only. Not investment advice.');
        const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const els = [...document.querySelectorAll('button,input,select,a[href]')];
        const noId = els.filter(e => !e.dataset.testid).length;
        const ids = els.map(e => e.dataset.testid).filter(Boolean);
        const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
        const bad = ['รับประกัน', 'ต้องซื้อ', 'ควรซื้อ', 'กำไรแน่นอน', 'guarantee', 'must buy', 'sure profit', 'should buy', 'risk-free'].filter(k => t.toLowerCase().includes(k));
        const fs=[...document.querySelectorAll('body *')].filter(e=>e.offsetParent!==null && ([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||/INPUT|SELECT|BUTTON/.test(e.tagName))).map(e=>[parseFloat(getComputedStyle(e).fontSize),e.tagName+'.'+(e.dataset.testid||e.className).toString().slice(0,30)+':'+(e.innerText||e.value||'').slice(0,20)]).sort((a,b)=>a[0]-b[0]); const small=fs.filter(x=>x[0]<20); const minfs=fs.length?fs[0][0]:0; return { minfs, nsmall: small.length, small: small.slice(0,5).map(x=>x.join(' ')), thai, thaiTitle, title: document.title, sample, disTh, disEn, over, noId, dup: dup.slice(0, 4), bad };
      });
      out.push({ w, lang, p, st, ...res });
    }
  }
  return JSON.stringify(out);
}
