// ============================================================
// GOAT RADAR — analyze.js v4
// API-Football (api-sports.io) + Groq
// ============================================================

const GROQ_API_KEY      = process.env.GROQ_API_KEY;
const API_FOOTBALL_KEY  = process.env.API_FOOTBALL_KEY;
const BASE              = 'https://v3.football.api-sports.io';

// ── IDs das ligas na API-Football ────────────────────────────
// Brasileirão Série A = 71, Premier League = 39, La Liga = 140,
// Bundesliga = 78, Serie A = 135, Ligue 1 = 61, Champions = 2
const LEAGUE_MAP = {
  'brasileirao': 71, 'brasileirão': 71, 'serie a': 71, 'série a': 71,
  'brasileirao serie b': 72, 'série b': 72,
  'copa do brasil': 73,
  'premier league': 39, 'epl': 39,
  'la liga': 140, 'laliga': 140,
  'bundesliga': 78,
  'serie a italiana': 135, 'serie a italy': 135,
  'ligue 1': 61,
  'champions league': 2, 'ucl': 2,
  'europa league': 3,
  'libertadores': 13, 'copa libertadores': 13,
  'sul-americana': 11,
  'liga mx': 262,
};

// IDs fixos dos times brasileiros na API-Football (evita busca textual para BR)
const BR_TEAM_IDS = {
  'flamengo': 127, 'fla': 127, 'mengao': 127, 'mengão': 127,
  'palmeiras': 121, 'palestra': 121, 'pal': 121,
  'corinthians': 131, 'timao': 131, 'timão': 131,
  'sao paulo': 126, 'são paulo': 126, 'spfc': 126,
  'fluminense': 124, 'flu': 124,
  'vasco': 133, 'vasco da gama': 133,
  'botafogo': 130, 'bota': 130,
  'atletico mineiro': 1062, 'atlético mineiro': 1062, 'galo': 1062,
  'internacional': 119, 'colorado': 119,
  'gremio': 120, 'grêmio': 120,
  'santos': 128, 'peixe': 128,
  'cruzeiro': 140, 'cru': 140,
  'bahia': 118,
  'fortaleza': 132,
  'athletico paranaense': 123, 'athletico pr': 123, 'furacão': 123, 'furacao': 123, 'cap': 123,
  'atletico goianiense': 1193, 'atlético goianiense': 1193, 'dragao': 1193, 'dragão': 1193,
  'red bull bragantino': 2, 'bragantino': 2,
  'america mineiro': 1081, 'coelho': 1081, 'américa mineiro': 1081,
  'vitoria': 138, 'vitória': 138,
  'ceara': 137, 'ceará': 137,
  'sport': 136,
  'coritiba': 122,
  'juventude': 1193,
  'goias': 129, 'goiás': 129,
};

const ALIASES = {
  'fla': 'flamengo', 'mengao': 'flamengo', 'mengão': 'flamengo',
  'flu': 'fluminense',
  'bota': 'botafogo',
  'galo': 'atletico mineiro',
  'furacão': 'athletico paranaense', 'furacao': 'athletico paranaense', 'cap': 'athletico paranaense',
  'timão': 'corinthians', 'timao': 'corinthians',
  'spfc': 'sao paulo', 'tricolor paulista': 'sao paulo',
  'peixe': 'santos',
  'cru': 'cruzeiro',
  'colorado': 'internacional',
  'dragão': 'atletico goianiense', 'dragao': 'atletico goianiense',
  'coelho': 'america mineiro',
  'bragantino': 'red bull bragantino',
  'vitória': 'vitoria',
  'pal': 'palmeiras', 'palestra': 'palmeiras',
  'grêmio': 'gremio',
  'spurs': 'tottenham', 'man city': 'manchester city',
  'man utd': 'manchester united', 'man united': 'manchester united',
  'barca': 'barcelona', 'barça': 'barcelona',
  'bvb': 'borussia dortmund', 'dortmund': 'borussia dortmund',
  'juve': 'juventus',
  'inter': 'inter milan', 'internazionale': 'inter milan',
  'psg': 'paris saint-germain',
};

// ── HELPERS ───────────────────────────────────────────────────
function normalizeStr(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array(n + 1).fill(0).map((_, j) => j === 0 ? i : 0)
  );
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

async function apiFetch(endpoint) {
  const r = await fetch(`${BASE}${endpoint}`, {
    headers: { 'x-apisports-key': API_FOOTBALL_KEY },
  });
  if (!r.ok) throw new Error(`API-Football error: ${r.status} ${endpoint}`);
  return r.json();
}

// ── BUSCA DE TIME ─────────────────────────────────────────────
async function resolveTeam(rawName, knownId) {
  // 1. ID direto do autocomplete — mais confiável
  if (knownId) {
    try {
      const data = await apiFetch(`/teams?id=${knownId}`);
      const t = data.response?.[0];
      if (t) { console.log(`[ID direto] ${t.team.name}`); return t; }
    } catch (e) { console.error('ID lookup error:', e.message); }
  }

  const key = normalizeStr(rawName);
  const alias = ALIASES[key] || key;

  // 2. ID fixo BR
  const brId = BR_TEAM_IDS[alias] || BR_TEAM_IDS[key];
  if (brId) {
    try {
      const data = await apiFetch(`/teams?id=${brId}`);
      const t = data.response?.[0];
      if (t) { console.log(`[ID BR] ${t.team.name}`); return t; }
    } catch (e) { console.error('BR ID lookup error:', e.message); }
  }

  // 3. Busca textual com validação estrita de nome
  const searchName = rawName;
  try {
    const data = await apiFetch(`/teams?search=${encodeURIComponent(searchName)}`);
    const teams = data.response || [];
    if (!teams.length) return null;

    const nKey = normalizeStr(searchName);

    // Filtra times brasileiros primeiro
    const brTeams = teams.filter(t => t.team.country === 'Brazil');

    let pool;
    if (brTeams.length > 0) {
      pool = brTeams;
    } else {
      // Internacional: validação estrita de nome
      pool = teams.filter(t => {
        const tName = normalizeStr(t.team.name);
        return (
          tName === nKey ||
          tName.startsWith(nKey) ||
          nKey.startsWith(tName) ||
          (nKey.length >= 4 && tName.includes(nKey)) ||
          levenshtein(tName, nKey) <= 1
        );
      });
      if (!pool.length) return null;
    }

    // Prioridade: match exato → começa com → contém → levenshtein
    let matched =
      pool.find(t => normalizeStr(t.team.name) === nKey) ||
      pool.find(t => normalizeStr(t.team.name).startsWith(nKey)) ||
      pool.find(t => normalizeStr(t.team.name).includes(nKey)) ||
      (nKey.length >= 4 ? pool.find(t => nKey.includes(normalizeStr(t.team.name))) : null) ||
      pool.find(t => levenshtein(normalizeStr(t.team.name), nKey) <= 1);

    if (matched) console.log(`[Busca textual] ${matched.team.name}`);
    return matched || null;
  } catch (e) {
    console.error('Text search error:', e.message);
    return null;
  }
}

// ── ÚLTIMOS RESULTADOS ────────────────────────────────────────
async function getLastFixtures(teamId) {
  try {
    const data = await apiFetch(`/fixtures?team=${teamId}&last=5`);
    return data.response || [];
  } catch { return []; }
}

// ── TABELA ────────────────────────────────────────────────────
async function getStandings(leagueId, season) {
  try {
    const s = season || getCurrentSeason();
    const data = await apiFetch(`/standings?league=${leagueId}&season=${s}`);
    const standings = data.response?.[0]?.league?.standings?.[0] || [];
    return standings;
  } catch { return []; }
}

function getCurrentSeason() {
  const now = new Date();
  return now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

// ── CÁLCULOS ──────────────────────────────────────────────────
function calcForm(fixtures, teamId) {
  const last5 = fixtures.slice(0, 5);
  let pts = 0;
  const results = [];

  for (const f of last5) {
    const isHome = String(f.teams.home.id) === String(teamId);
    const hg = f.goals.home ?? -1;
    const ag = f.goals.away ?? -1;
    if (hg < 0 || ag < 0) { results.push('?'); continue; }
    if (isHome) {
      if (hg > ag) { pts += 3; results.push('W'); }
      else if (hg === ag) { pts += 1; results.push('D'); }
      else results.push('L');
    } else {
      if (ag > hg) { pts += 3; results.push('W'); }
      else if (hg === ag) { pts += 1; results.push('D'); }
      else results.push('L');
    }
  }

  const validGames = last5.filter(f => (f.goals.home ?? -1) >= 0).length;
  const maxPts = validGames * 3 || 1;
  const score = Math.round((pts / maxPts) * 10);

  let streak = '';
  if (results.length) {
    const cur = results[0];
    let count = 0;
    for (const r of results) { if (r === cur) count++; else break; }
    streak = cur !== '?' ? `${cur}${count}` : '';
  }

  return { score, results, streak, pts };
}

function calcMomentum(fixtures, teamId) {
  const weights = [3, 2, 1];
  let total = 0, max = 0;
  fixtures.slice(0, 3).forEach((f, i) => {
    const w = weights[i];
    const isHome = String(f.teams.home.id) === String(teamId);
    const hg = f.goals.home ?? -1;
    const ag = f.goals.away ?? -1;
    if (hg < 0 || ag < 0) return;
    max += w * 3;
    if (isHome) { total += hg > ag ? w * 3 : hg === ag ? w : 0; }
    else         { total += ag > hg ? w * 3 : hg === ag ? w : 0; }
  });
  return max > 0 ? Math.round((total / max) * 100) : 50;
}

function calcGoalsAvg(fixtures, teamId) {
  let scored = 0, conceded = 0, count = 0;
  for (const f of fixtures.slice(0, 5)) {
    const isHome = String(f.teams.home.id) === String(teamId);
    const hg = f.goals.home ?? -1;
    const ag = f.goals.away ?? -1;
    if (hg < 0 || ag < 0) continue;
    count++;
    scored   += isHome ? hg : ag;
    conceded += isHome ? ag : hg;
  }
  if (!count) return { scored: '0.0', conceded: '0.0' };
  return { scored: (scored / count).toFixed(1), conceded: (conceded / count).toFixed(1) };
}

function calcCornerAndCardEstimate(homeStats, awayStats) {
  const combinedAttack = parseFloat(homeStats.goals.scored) + parseFloat(awayStats.goals.scored);
  const cornerEst = Math.round(8.5 + (combinedAttack - 2.0) * 1.1);
  const cornersOver = cornerEst >= 10;
  const cornersOdd = cornersOver
    ? Math.max(1.40, 1.90 - (cornerEst - 10) * 0.07).toFixed(2)
    : Math.max(1.50, 1.70 + (10 - cornerEst) * 0.08).toFixed(2);
  const cornersContext = cornersOver
    ? `Combinação ofensiva de ${combinedAttack.toFixed(1)} gols/jogo sugere jogo aberto. Tendência de mais de 10 escanteios.`
    : `Perfil mais cauteloso dos dois lados. Estimativa aponta para confronto com menos escanteios.`;

  const formDiff = Math.abs(homeStats.form.score - awayStats.form.score);
  const tensionHigh = formDiff <= 3;
  const cardsOdd = tensionHigh ? '1.85' : '2.10';
  const cardsContext = tensionHigh
    ? `Times de forma similar tendem a disputar mais. Confrontos equilibrados geram mais faltas e cartões.`
    : `Desequilíbrio de forma tende a reduzir a tensão. Menos cartões esperados quando um lado domina.`;

  return {
    cornersMarket: cornersOver ? 'Over 9.5 Escanteios' : 'Under 9.5 Escanteios',
    cornersOdd: String(cornersOdd), cornersContext,
    cardsMarket: 'Over 3.5 Cartões', cardsOdd, cardsContext,
  };
}

function detectRedFlags(homeStats, awayStats) {
  const flags = [];
  if (/^L[3-5]/.test(homeStats.form.streak))
    flags.push({ icon: '🔴', severity: 'high', type: 'form', title: `${homeStats.name} em crise`, text: `${homeStats.form.streak[1]} derrotas consecutivas.` });
  if (/^L[3-5]/.test(awayStats.form.streak))
    flags.push({ icon: '🔴', severity: 'high', type: 'form', title: `${awayStats.name} em crise`, text: `${awayStats.form.streak[1]} derrotas seguidas. Moral em baixa.` });
  if (!homeStats.form.results.filter(r => r !== '?').some(r => r === 'W') && homeStats.form.results.filter(r => r !== '?').length >= 3)
    flags.push({ icon: '⚠️', severity: 'mid', type: 'form', title: `${homeStats.name} sem vencer`, text: `Nenhuma vitória nos últimos jogos registrados.` });
  if (!awayStats.form.results.filter(r => r !== '?').some(r => r === 'W') && awayStats.form.results.filter(r => r !== '?').length >= 3)
    flags.push({ icon: '⚠️', severity: 'mid', type: 'form', title: `${awayStats.name} sem vencer`, text: `Nenhuma vitória recente fora de casa.` });
  if (parseFloat(homeStats.goals.conceded) > 2.0)
    flags.push({ icon: '🛡️', severity: 'mid', type: 'injury', title: `Defesa frágil — ${homeStats.name}`, text: `Média de ${homeStats.goals.conceded} gols sofridos por jogo.` });
  if (parseFloat(awayStats.goals.conceded) > 2.0)
    flags.push({ icon: '🛡️', severity: 'mid', type: 'injury', title: `Defesa frágil — ${awayStats.name}`, text: `Média de ${awayStats.goals.conceded} gols sofridos fora de casa.` });
  if (homeStats.tablePos && awayStats.tablePos) {
    const diff = Math.abs(homeStats.tablePos - awayStats.tablePos);
    if (diff >= 10) {
      const stronger = homeStats.tablePos < awayStats.tablePos ? homeStats.name : awayStats.name;
      flags.push({ icon: '📊', severity: 'low', type: 'table', title: 'Desigualdade na tabela', text: `${stronger} está ${diff} posições acima.` });
    }
  }
  return flags.slice(0, 4);
}

function calcSensorScore(homeStats, awayStats) {
  const homeFormPct = (homeStats.form.score / 10) * 100;
  const awayFormPct = (awayStats.form.score / 10) * 100;
  let homeTableScore = 50, awayTableScore = 50;
  if (homeStats.tablePos && awayStats.tablePos) {
    const total = homeStats.tablePos + awayStats.tablePos;
    homeTableScore = Math.round((awayStats.tablePos / total) * 100);
    awayTableScore = Math.round((homeStats.tablePos / total) * 100);
  }
  const homeGoalScore = Math.min(parseFloat(homeStats.goals.scored) / 3 * 100, 100);
  const awayGoalScore = Math.min(parseFloat(awayStats.goals.scored) / 3 * 100, 100);
  const homeTotal = homeFormPct * 0.40 + homeStats.momentum * 0.30 + homeTableScore * 0.20 + homeGoalScore * 0.10;
  const awayTotal = awayFormPct * 0.40 + awayStats.momentum * 0.30 + awayTableScore * 0.20 + awayGoalScore * 0.10;
  const total = homeTotal + awayTotal || 100;
  const homeWinPct = Math.round((homeTotal / total) * 100);
  const diff = Math.abs(homeTotal - awayTotal);
  const level = diff > 20 ? 'forte' : diff > 8 ? 'moderado' : 'fraco';
  const side = homeTotal >= awayTotal ? 'Casa' : 'Visitante';
  const homeSignals = [
    homeStats.form.score > awayStats.form.score,
    homeStats.momentum > awayStats.momentum,
    (homeStats.tablePos || 99) < (awayStats.tablePos || 99),
    parseFloat(homeStats.goals.scored) > parseFloat(awayStats.goals.scored),
  ];
  const convergence = homeSignals.filter(Boolean).length;
  const confidence = convergence >= 3 ? 'Alta' : convergence === 2 ? 'Média' : 'Baixa';
  const avgGoals = (
    parseFloat(homeStats.goals.scored) + parseFloat(awayStats.goals.conceded) +
    parseFloat(awayStats.goals.scored) + parseFloat(homeStats.goals.conceded)
  ) / 2;
  const bestMarket = avgGoals > 2.5 ? 'Gols' : diff > 20 ? 'Vencer' : 'Escanteios';
  const bestMarketValue = avgGoals > 2.5 ? 'OVER 2.5 GOLS' : side === 'Casa' ? 'VITÓRIA CASA' : 'VITÓRIA VISITANTE';
  const dangerMarket = diff < 10 ? 'Vencer' : 'Cartões';
  return { homeWinPct, level, side, confidence, bestMarket, bestMarketValue, dangerMarket, avgGoals: avgGoals.toFixed(1) };
}

function buildOdds(sensor, homeStats, awayStats) {
  const favName = sensor.side === 'Casa' ? homeStats.name : awayStats.name;
  const favWinPct = sensor.homeWinPct;
  const favOdd = (100 / Math.max(favWinPct, 5) * 1.05).toFixed(2);
  const favEdge = favWinPct > 60 ? 'pos' : favWinPct < 45 ? 'neg' : 'neu';
  const favContext = favWinPct > 60
    ? `${favName} com ${favWinPct}% de vantagem calculada.`
    : favWinPct < 45
    ? `Favorito incerto. Sinal fraco.`
    : `Equilíbrio entre os times. Busque valor em mercados alternativos.`;

  const avgG = parseFloat(sensor.avgGoals);
  const isOver = avgG > 2.5;
  const goalsOdd = isOver
    ? Math.max(1.40, 1.95 - (avgG - 2.5) * 0.18).toFixed(2)
    : Math.max(1.55, 1.60 + (2.5 - avgG) * 0.22).toFixed(2);
  const goalsEdge = isOver && avgG > 3.2 ? 'pos' : !isOver && avgG < 1.6 ? 'pos' : 'neu';
  const goalsContext = isOver
    ? `Média combinada de ${sensor.avgGoals} gols/jogo — acima da linha.`
    : `Média de ${sensor.avgGoals} gols/jogo — Under 2.5 tem respaldo aqui.`;

  const homeScored   = parseFloat(homeStats.goals.scored);
  const awayScored   = parseFloat(awayStats.goals.scored);
  const homeConceded = parseFloat(homeStats.goals.conceded);
  const awayConceded = parseFloat(awayStats.goals.conceded);
  const bttsProb  = homeScored >= 1.0 && awayScored >= 0.8 && homeConceded >= 0.5 && awayConceded >= 0.5;
  const bttsScore = ((homeScored * awayConceded) + (awayScored * homeConceded)) / 2;
  const bttsOdd   = bttsProb
    ? Math.max(1.45, 1.90 - bttsScore * 0.12).toFixed(2)
    : Math.min(2.50, 1.95 + (2.0 - bttsScore) * 0.15).toFixed(2);
  const bttsEdge    = bttsProb && bttsScore > 1.2 ? 'pos' : !bttsProb ? 'neg' : 'neu';
  const bttsContext = bttsProb
    ? `${homeStats.name} marca ${homeScored}/jogo. ${awayStats.name} marca ${awayScored}/jogo.`
    : `Baixa produção ofensiva de um dos lados. Risco elevado para ambas marcam.`;

  return [
    { market: `Vitória ${favName}`, value: favOdd, edge: favEdge, context: favContext },
    { market: isOver ? 'Over 2.5 Gols' : 'Under 2.5 Gols', value: goalsOdd, edge: goalsEdge, context: goalsContext },
    { market: 'Ambas Marcam — Sim', value: bttsOdd, edge: bttsEdge, context: bttsContext },
  ];
}

function buildTags(sensor, redflags) {
  const tags = [
    { cls: sensor.level === 'forte' ? 'safe' : sensor.level === 'moderado' ? 'warn' : 'danger', label: `Sinal ${sensor.level}` },
    { cls: sensor.confidence === 'Alta' ? 'safe' : sensor.confidence === 'Média' ? 'warn' : 'danger', label: `Confiança ${sensor.confidence}` },
  ];
  if (redflags.some(f => f.severity === 'high')) tags.push({ cls: 'danger', label: 'Red Flag Alta' });
  else if (redflags.some(f => f.severity === 'mid')) tags.push({ cls: 'warn', label: 'Risco Moderado' });
  return tags;
}

// ── GROQ com Web Search (compound-beta) ───────────────────────
async function generateWithGroq(prompt) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'compound-beta',          // ← modelo com web search nativo
      temperature: 0.55,
      max_tokens: 1400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    // fallback para llama se compound-beta não estiver disponível
    if (r.status === 404 || r.status === 400) return generateWithGroqFallback(prompt);
    throw new Error(`Groq error: ${err.error?.message || r.status}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

// Fallback sem web search (modelo original)
async function generateWithGroqFallback(prompt) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.65,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`Groq fallback error: ${err.error?.message || r.status}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

function buildGroqPrompt(homeStats, awayStats, sensor, redflags, matchRaw) {
  const flagsList = redflags.map(f => `- ${f.title}: ${f.text}`).join('\n') || 'Nenhuma red flag crítica.';
  return `Você é o Goat Radar, sistema premium de análise de apostas esportivas. Tom: técnico, direto, confiante.

TAREFA PRINCIPAL: Busque na web notícias das últimas 72 horas sobre "${homeStats.name}" e "${awayStats.name}". Procure especificamente: desfalques, lesões, suspensões, escalações, crise no clube, motivação, cansaço por calendário, declarações do técnico.

PARTIDA: ${matchRaw}

DADOS ESTATÍSTICOS JÁ CALCULADOS:
${homeStats.name} (Casa): Forma ${homeStats.form.results.join('-')} | Score ${homeStats.form.score}/10 | Momentum ${homeStats.momentum}% | Gols marcados/jogo: ${homeStats.goals.scored} | sofridos: ${homeStats.goals.conceded} | Tabela: ${homeStats.tablePos ? `${homeStats.tablePos}º, ${homeStats.tablePts}pts` : 'n/d'}
${awayStats.name} (Visitante): Forma ${awayStats.form.results.join('-')} | Score ${awayStats.form.score}/10 | Momentum ${awayStats.momentum}% | Gols marcados/jogo: ${awayStats.goals.scored} | sofridos: ${awayStats.goals.conceded} | Tabela: ${awayStats.tablePos ? `${awayStats.tablePos}º, ${awayStats.tablePts}pts` : 'n/d'}

SENSOR: ${sensor.level.toUpperCase()} | Favorito: ${sensor.side === 'Casa' ? homeStats.name : awayStats.name} | Confiança: ${sensor.confidence} | Vantagem calculada: ${sensor.homeWinPct}%

RED FLAGS ESTATÍSTICAS (já detectadas):
${flagsList}

INSTRUÇÕES:
1. USE a web search para buscar notícias reais das últimas 72h sobre esses dois times
2. Combine as notícias encontradas com os dados estatísticos acima
3. Crie até 3 red flags ADICIONAIS baseadas nas notícias (desfalques reais, suspensões, crises)
4. Responda SOMENTE em JSON válido, sem markdown, sem texto fora do JSON

JSON esperado:
{
  "context": "2-3 frases sobre o confronto usando dados + notícias reais encontradas",
  "summary": "1 frase impactante resumindo o cenário",
  "headline": "MANCHETE EM MAIÚSCULAS, máximo 6 palavras",
  "verdictText": "2-3 frases de veredicto com mercado de maior valor",
  "newsFlags": [
    {
      "icon": "emoji relevante",
      "severity": "high|mid|low",
      "type": "injury|motivation|fatigue|table|calendar|other",
      "title": "Título curto da notícia",
      "text": "Descrição do impacto dessa notícia na aposta (1-2 frases)"
    }
  ]
}
Se não encontrar notícias relevantes, retorne "newsFlags": [].`;
}

// ── HANDLER PRINCIPAL ─────────────────────────────────────────
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) };
  }

  const { match, homeId, awayId } = body;
  if (!match) return { statusCode: 400, body: JSON.stringify({ error: 'Campo match obrigatório' }) };

  const formatMatch = match.trim().match(/^(.+?)\s+(?:x|vs|×)\s+(.+?)(\s*[-—]\s*.+)?$/i);
  if (!formatMatch) return { statusCode: 400, body: JSON.stringify({ error: 'Formato inválido. Use: "Flamengo x Vasco"' }) };

  const homeRaw    = formatMatch[1].trim();
  const awayRaw    = formatMatch[2].trim();
  const leagueHint = (formatMatch[3] || '').replace(/[-—]/g, '').trim().toLowerCase();

  try {
    const [homeData, awayData] = await Promise.all([
      resolveTeam(homeRaw, homeId),
      resolveTeam(awayRaw, awayId),
    ]);

    if (!homeData) return { statusCode: 404, body: JSON.stringify({ error: `Time não encontrado: "${homeRaw}". Tente o nome completo.` }) };
    if (!awayData) return { statusCode: 404, body: JSON.stringify({ error: `Time não encontrado: "${awayRaw}". Tente o nome completo.` }) };

    const [homeFixtures, awayFixtures] = await Promise.all([
      getLastFixtures(homeData.team.id),
      getLastFixtures(awayData.team.id),
    ]);

    // Detecta liga
    let leagueId = null;
    for (const [key, id] of Object.entries(LEAGUE_MAP)) {
      if (leagueHint.includes(key)) { leagueId = id; break; }
    }
    // Tenta inferir pela liga do time (via fixture mais recente)
    if (!leagueId && homeFixtures[0]) {
      leagueId = homeFixtures[0].league?.id || null;
    }

    let table = [];
    if (leagueId) {
      table = await getStandings(leagueId);
    }

    const homeRow = table.find(r => String(r.team.id) === String(homeData.team.id));
    const awayRow = table.find(r => String(r.team.id) === String(awayData.team.id));

    const homeStats = {
      name:      homeData.team.name,
      logo:      homeData.team.logo || null,
      form:      calcForm(homeFixtures, homeData.team.id),
      momentum:  calcMomentum(homeFixtures, homeData.team.id),
      goals:     calcGoalsAvg(homeFixtures, homeData.team.id),
      tablePos:  homeRow ? homeRow.rank : null,
      tablePts:  homeRow ? homeRow.points : null,
    };
    const awayStats = {
      name:      awayData.team.name,
      logo:      awayData.team.logo || null,
      form:      calcForm(awayFixtures, awayData.team.id),
      momentum:  calcMomentum(awayFixtures, awayData.team.id),
      goals:     calcGoalsAvg(awayFixtures, awayData.team.id),
      tablePos:  awayRow ? awayRow.rank : null,
      tablePts:  awayRow ? awayRow.points : null,
    };

    const sensor   = calcSensorScore(homeStats, awayStats);
    const redflags = detectRedFlags(homeStats, awayStats);
    const corners  = calcCornerAndCardEstimate(homeStats, awayStats);
    const odds     = buildOdds(sensor, homeStats, awayStats);

    const groqRaw = await generateWithGroq(buildGroqPrompt(homeStats, awayStats, sensor, redflags, match));
    let groqData = {};
    try {
      const clean = groqRaw.replace(/```json|```/g, '').trim();
      const block = clean.match(/\{[\s\S]*\}/);
      if (block) groqData = JSON.parse(block[0]);
    } catch { /* usa fallbacks */ }

    // Mescla red flags estatísticas + red flags de notícias reais (Groq web search)
    const newsFlags = (groqData.newsFlags || []).slice(0, 3);
    const allRedflags = [...newsFlags, ...redflags].slice(0, 5); // notícias primeiro, máx 5

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        match: {
          home: homeStats.name,
          away: awayStats.name,
          competition: homeFixtures[0]?.league?.name || 'Internacional',
          time: 'Análise pré-jogo',
        },
        logos: { home: homeStats.logo, away: awayStats.logo },
        context: groqData.context || `${homeStats.name} chega com forma ${homeStats.form.score}/10, ${awayStats.name} com ${awayStats.form.score}/10.`,
        sensor: {
          level: sensor.level, side: sensor.side, favorLabel: sensor.side,
          bestMarket: sensor.bestMarket, bestMarketValue: sensor.bestMarketValue,
          bestMarketEdge: 'pos', dangerMarket: sensor.dangerMarket,
          caution: allRedflags.some(f => f.severity === 'high') ? 'alto' : allRedflags.some(f => f.severity === 'mid') ? 'moderado' : 'leve',
          winPct: sensor.homeWinPct,
          winDesc: `${sensor.side === 'Casa' ? homeStats.name : awayStats.name} com ${sensor.homeWinPct}% de vantagem calculada`,
          goalsPct: Math.min(Math.round(parseFloat(sensor.avgGoals) / 4 * 100), 95),
          goalsDesc: `Média combinada de ${sensor.avgGoals} gols por jogo`,
          cornersPct: Math.min(Math.round((parseFloat(homeStats.goals.scored) + parseFloat(awayStats.goals.scored)) / 6 * 100), 90),
          cornersDesc: corners.cornersContext,
          cardsPct: Math.abs(homeStats.form.score - awayStats.form.score) <= 3 ? 65 : 40,
          cardsDesc: corners.cardsContext,
          homeForm: homeStats.form.results,
          awayForm: awayStats.form.results,
          homeTablePos: homeStats.tablePos,
          awayTablePos: awayStats.tablePos,
          homeTablePts: homeStats.tablePts,
          awayTablePts: awayStats.tablePts,
        },
        summary: groqData.summary || `${sensor.side === 'Casa' ? homeStats.name : awayStats.name} parte como favorito.`,
        redflags: allRedflags, odds,
        verdict: {
          headline: groqData.headline || (sensor.level === 'forte' ? `${(sensor.side === 'Casa' ? homeStats.name : awayStats.name).toUpperCase()} DOMINA` : 'JOGO INDEFINIDO'),
          tags: buildTags(sensor, allRedflags),
          text: groqData.verdictText || `Radar aponta ${sensor.side === 'Casa' ? homeStats.name : awayStats.name} com ${sensor.homeWinPct}% de vantagem.`,
        },
      }),
    };

  } catch (e) {
    console.error('Goat Radar error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
