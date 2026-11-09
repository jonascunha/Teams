// Recursos comuns aos vídeos do guia: legenda na tela, marcação de toque, cartões de abertura/fechamento
// e ações com ritmo de vídeo (tocar, digitar, rolar suavemente).
const OVERLAY = () => {
  const css = `
    #cap { position: fixed; left: 12px; right: 12px; bottom: 138px; z-index: 3000; background: rgba(10,10,10,.94);
      border: 1.5px solid #c4f82a; border-radius: 16px; padding: 12px 14px; color: #fff; font: 600 16px/1.35 Inter, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,.6); transition: opacity .25s; pointer-events: none; }
    #cap b { color: #c4f82a; font-family: "Barlow Condensed", Impact, sans-serif; font-size: 20px; margin-right: 6px; }
    .tapdot { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; z-index: 3001; pointer-events: none;
      background: rgba(196,248,42,.45); border: 3px solid #c4f82a; animation: tap .7s ease-out forwards; }
    @keyframes tap { 0% { transform: scale(.4); opacity: 1 } 100% { transform: scale(1.5); opacity: 0 } }
    #card { position: fixed; inset: 0; z-index: 4000; background: #0a0a0a; color: #fff; display: flex; flex-direction: column;
      justify-content: center; padding: 32px; font-family: Inter, sans-serif; }
    #card .brand { font: 800 30px "Barlow Condensed", Impact, sans-serif; letter-spacing: 1px; }
    #card .brand span { color: #c4f82a; }
    #card .tag { display: inline-block; align-self: flex-start; margin-top: 60px; background: #c4f82a; color: #0a0a0a; font: italic 800 26px "Barlow Condensed", Impact, sans-serif; padding: 2px 10px; transform: skew(-8deg); }
    #card h1 { font: 800 58px/1 "Barlow Condensed", Impact, sans-serif; text-transform: uppercase; margin: 10px 0 0; }
    #card p { color: #cfcfcf; font-size: 18px; line-height: 1.45; margin-top: 18px; }
    #card p b { color: #c4f82a; }
    #card .motto { margin-top: auto; border: 1.5px solid #c4f82a; border-radius: 999px; padding: 10px; text-align: center; font-weight: 700; font-size: 13px; }
    #card .motto b { color: #c4f82a; }`;
  window.__ensureStyle = () => {
    if (document.getElementById('ov-style')) return;
    const st = document.createElement('style'); st.id = 'ov-style'; st.textContent = css; document.head.appendChild(st);
  };
  window.__caption = (num, text) => {
    window.__ensureStyle();
    let c = document.getElementById('cap');
    if (!c) { c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c); }
    c.innerHTML = (num ? `<b>${num}</b>` : '') + text;
  };
  window.__hideCaption = () => document.getElementById('cap')?.remove();
  window.__tap = (x, y) => {
    window.__ensureStyle();
    const d = document.createElement('div'); d.className = 'tapdot'; d.style.left = x + 'px'; d.style.top = y + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 800);
  };
  window.__card = (html) => {
    window.__ensureStyle();
    let c = document.getElementById('card');
    if (!c) { c = document.createElement('div'); c.id = 'card'; document.body.appendChild(c); }
    c.innerHTML = html;
  };
  window.__hideCard = () => document.getElementById('card')?.remove();
  window.__smoothTo = (y, ms) => new Promise((resolve) => {
    const start = window.scrollY; const dist = y - start; const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, start + dist * e);
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
};

function acoes(page) {
  const wait = (ms) => page.waitForTimeout(ms);
  const caption = (num, text) => page.evaluate(([n, t]) => window.__caption(n, t), [num, text]);
  const scrollToEl = async (sel, offset = 90, ms = 900) => {
    const y = await page.evaluate(([s, o]) => {
      const el = document.querySelector(s); return el.getBoundingClientRect().top + window.scrollY - o;
    }, [sel, offset]);
    await page.evaluate(([yy, m]) => window.__smoothTo(yy, m), [Math.max(0, y), ms]);
    await wait(250);
  };
  const tap = async (sel, after = 900) => {
    const loc = page.locator(sel).first();
    const box = await loc.boundingBox();
    await page.evaluate(([x, y]) => window.__tap(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
    await wait(450);
    await loc.click();
    await wait(after);
  };
  const type = async (sel, text) => { const l = page.locator(sel).first(); await l.click(); await l.pressSequentially(text, { delay: 28 }); };
  return { wait, caption, scrollToEl, tap, type };
}

module.exports = { OVERLAY, acoes };
