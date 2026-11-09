// Turma de exemplo usada no guia e no vídeo das personais: 2 personais, 6 alunos no dia 5,
// com desafios marcados, desafio individual, respostas, bônus, recado no mural e fotos no feed.
// montarTurma(B, browser) devolve { carol, clients }, onde cada cliente faz chamadas à API logado.
async function montarTurma(B, browser) {
  // fotos de exemplo geradas no navegador
  const ph = await browser.newPage({ viewport: { width: 800, height: 800 } });
  async function photo(emoji, c1, c2, label) {
    await ph.setContent(`<body style="margin:0"><div style="width:800px;height:800px;background:linear-gradient(135deg,${c1},${c2});display:grid;place-items:center;font-family:sans-serif;color:#fff">
      <div style="text-align:center"><div style="font-size:260px">${emoji}</div><div style="font-size:56px;font-weight:800;letter-spacing:2px">${label}</div></div></div></body>`);
    return 'data:image/jpeg;base64,' + (await ph.screenshot({ type: 'jpeg', quality: 80 })).toString('base64');
  }

  const mk = () => {
    let cookie = '';
    const f = async (m, u, b) => {
      const r = await fetch(B + '/api' + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: b && JSON.stringify(b) });
      const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
      return r.json();
    };
    f.sid = () => cookie.split('=')[1];
    return f;
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const start = new Date(Date.parse(today + 'T12:00:00Z') - 4 * 86400000).toISOString().slice(0, 10); // hoje = dia 5

  const carol = mk(); await carol('POST', '/register', { name: 'Carol (Personal)', email: 'carol@mooh.com', password: '123456', code: 'MOOH21' });
  await carol('PUT', '/admin/settings', { start_date: start });
  const pat = mk(); await pat('POST', '/register', { name: 'Patrícia (Personal)', email: 'pat@mooh.com', password: '123456', code: 'MOOH21' });
  let ov = await carol('GET', '/admin/overview');
  await carol('PUT', `/admin/users/${ov.users.find((u) => u.email === 'pat@mooh.com').id}/role`, { role: 'admin' });

  const alunos = [
    ['Ana Souza', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], 'Beber 2 litros de água por dia', 'Quero ter mais disposição e não faltar nos treinos.'],
    ['Bruno Lima', [1, 2, 4], [1, 2], 'Dormir antes das 23h', 'Quero dormir melhor e acordar com energia.'],
    ['Fernanda Costa', [1, 2, 3, 4, 5], [1, 2, 3, 5], 'Zero refrigerante', ''],
    ['Juliana Reis', [1, 2, 3, 5], [2, 3, 4, 5], 'Caminhar 30 minutos por dia', 'Quero voltar a gostar de me exercitar.'],
    ['Marcos Tavares', [1, 2], [], '', ''],
    ['Rafael Nunes', [1, 2, 3, 4], [1, 3, 4], 'Comer fruta no café da manhã', ''],
  ];
  const clients = {};
  for (const [name, days, pers, chal, commit] of alunos) {
    const a = mk(); clients[name] = a;
    await a('POST', '/register', { name, email: name.split(' ')[0].toLowerCase() + '@exemplo.com', password: '123456', code: 'MOOH21' });
    await a('PUT', '/profile', { personal_challenge: chal, commitment: commit });
    for (const d of days) await a('PUT', `/challenge/${d}`, { done: true, note: d === 1 && commit ? commit : '' });
    for (const d of pers) await a('PUT', `/personal/${d}`, { done: true });
  }
  await clients['Ana Souza']('POST', '/goals', { text: 'Treinar 3x por semana' });
  ov = await carol('GET', '/admin/overview');
  const id = (n) => ov.users.find((u) => u.name === n).id;
  await carol('POST', `/admin/users/${id('Ana Souza')}/bonus`, { points: 2, reason: 'Treino realizado' });
  await carol('POST', `/admin/users/${id('Fernanda Costa')}/bonus`, { points: 2, reason: 'Ajudar / incentivar outro aluno' });
  await carol('POST', '/notices', { title: 'Bem-vindos ao Desafio 21 Dias! 💪', body: 'Não buscamos perfeição, buscamos constância. Marquem o desafio de cada dia e postem fotos no feed: cada dia com foto vale +1 ponto!', pinned: true });
  await clients['Fernanda Costa']('POST', '/posts', { image: await photo('🥗', '#1b3a0a', '#0a0a0a', 'PRATO COLORIDO'), caption: 'Almoço com 5 cores hoje! 🥗' });
  await clients['Ana Souza']('POST', '/posts', { image: await photo('🏋️', '#0a2a3a', '#0a0a0a', 'SEM DESCULPA'), caption: 'Treino feito mesmo cansada. Dia 5 ✅' });
  let posts = await clients['Ana Souza']('GET', '/posts');
  await clients['Bruno Lima']('POST', `/posts/${posts[0].id}/like`);
  await carol('POST', `/posts/${posts[0].id}/like`);
  await carol('POST', `/posts/${posts[0].id}/comments`, { body: 'Isso aí, Ana! Constância é tudo 👏' });

  await ph.close();
  return { carol, clients };
}

module.exports = { montarTurma };
