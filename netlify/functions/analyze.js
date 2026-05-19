// ============================================================
// GOAT RADAR — analyze.js v3
// Arquitetura: ID direto (sem depender de busca) → TheSportsDB → Groq
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SPORTSDB_KEY = process.env.SPORTSDB_KEY || "123";
const BASE = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;

// ── DICIONÁRIO DE IDs TheSportsDB ────────────────────────────
// APENAS times brasileiros com IDs verificados.
// Times internacionais usam busca textual com validação de nome (mais confiável
// do que IDs que conflitam entre ligas diferentes da TheSportsDB).
const TEAM_IDS = {
  // Brasileirão Série A
  'flamengo': '133612', 'fla': '133612',
  'palmeiras': '133616', 'palestra': '133616',
  'atletico mineiro': '133614', 'atlético mineiro': '133614', 'galo': '133614',
  'sao paulo': '133622', 'são paulo': '133622', 'spfc': '133622', 'tricolor paulista': '133622',
  'fluminense': '133613', 'flu': '133613',
  'corinthians': '133610', 'timao': '133610', 'timão': '133610',
  'cruzeiro': '133611', 'cru': '133611',
  'vasco': '133624', 'vasco da gama': '133624',
  'botafogo': '133607', 'bota': '133607',
  'internacional': '133615', 'inter gaúcho': '133615', 'colorado': '133615',
  'gremio': '133618', 'grêmio': '133618',
  'santos': '133621', 'peixe': '133621',
  'bahia': '133606',
  'fortaleza': '133619',
  'athletico paranaense': '133617', 'athletico pr': '133617', 'athletico': '133617', 'furacão': '133617', 'furacao': '133617', 'cap': '133617',
  'atletico goianiense': '133608', 'atlético goianiense': '133608', 'dragao': '133608', 'dragão': '133608',
  'red bull bragantino': '133620', 'bragantino': '133620',
  'cuiaba': '144139', 'cuiabá': '144139',
  'goias': '133609', 'goiás': '133609',
  'america mineiro': '133605', 'coelho': '133605', 'américa mineiro': '133605',
  'coritiba': '145355',
  'juventude': '145219',
  'vitoria': '145175', 'vitória': '145175',
  'criciuma': '145220', 'criciumá': '145220',
  'mirassol': '145222',
  'ceara': '145172', 'ceará': '145172',
  'sport': '145173',
};

// Mapa de ligas
const LEAGUE_MAP = {
  "brasileirao": "4351", "brasileirão": "4351", "serie a": "4351", "série a": "4351",
  "brasileirao serie b": "4352", "série b": "4352",
  "copa do brasil": "4353",
  "premier league": "4328", "epl": "4328",
  "la liga": "4335", "laliga": "4335",
  "bundesliga": "4331",
  "serie a italiana": "4332", "serie a italy": "4332",
  "ligue 1": "4334",
  "champions league": "4480", "ucl": "4480",
  "europa league": "4481",
  "libertadores": "4482", "copa libertadores": "4482",
  "sul-americana": "4484",
};

// ── HELPERS API ──────────────────────────────────────────────

async function sportsDBGet(endpoint) {
  const url = `${BASE}/${endpoint}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TheSportsDB error: ${r.status}`);
  return r.json();
}

// Distância de Levenshtein para validar similaridade de nomes
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => j === 0 ? i : 0));
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// Normaliza string: minúsculo + sem acentos + sem espaços extras
function normalizeStr(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Apelidos BR — foco total no Brasil
const ALIASES = {
  'fla': 'Flamengo', 'mengao': 'Flamengo', 'mengão': 'Flamengo',
  'flu': 'Fluminense',
  'bota': 'Botafogo',
  'galo': 'Atletico Mineiro',
  'furacão': 'Athletico Paranaense', 'furacao': 'Athletico Paranaense', 'cap': 'Athletico Paranaense',
  'timão': 'Corinthians', 'timao': 'Corinthians',
  'spfc': 'Sao Paulo', 'tricolor paulista': 'Sao Paulo',
  'peixe': 'Santos',
  'cru': 'Cruzeiro',
  'colorado': 'Internacional',
  'dragão': 'Atletico Goianiense', 'dragao': 'Atletico Goianiense',
  'coelho': 'America Mineiro',
  'bragantino': 'Red Bull Bragantino',
  'vitória': 'Vitoria', 'vitoria': 'Vitoria',
  'pal': 'Palmeiras', 'palestra': 'Palmeiras',
  'grêmio': 'Gremio',
};

// Busca time: tenta ID local primeiro (100% confiável), depois busca textual restrita a BR
async function findTeam(rawName) {
  const key = normalizeStr(rawName);

  // 1. Tenta todas as variações normalizadas contra o TEAM_IDS
  //    (cobre "Grêmio", "gremio", "GREMIO" etc.)
  const localId = TEAM_IDS[key];
  if (localId) {
    try {
      const data = await sportsDBGet(`lookupteam.php?id=${localId}`);
      const team = data.teams?.[0];
      if (team) { console.log(`[ID direto] ${team.strTeam}`); return team; }
    } catch (e) {
      console.error('ID lookup error:', e.message);
    }
  }

  // 2. Tenta via alias → ID
  const aliasName = ALIASES[key];
  if (aliasName) {
    const aliasKey = normalizeStr(aliasName);
    const aliasId = TEAM_IDS[aliasKey];
    if (aliasId) {
      try {
        const data = await sportsDBGet(`lookupteam.php?id=${aliasId}`);
        const team = data.teams?.[0];
        if (team) { console.log(`[ID via alias] ${team.strTeam}`); return team; }
      } catch (e) {
        console.error('Alias ID lookup error:', e.message);
      }
    }
  }

  // 3. Busca textual — usa alias se existir, senão rawName
  const searchName = aliasName || rawName;
  try {
    const data = await sportsDBGet(`searchteams.php?t=${encodeURIComponent(searchName)}`);
    const teams = (data.teams || []);
    if (!teams.length) return null;

    const nKey = normalizeStr(searchName);

    // Filtra APENAS times brasileiros para evitar Arsenal, etc.
    const brTeams = teams.filter(t => t.strCountry === 'Brazil' || t.strCountry === 'Brasil');

    // Se não achou times BR, faz validação rigorosa de nome antes de usar times internacionais
    let pool;
    if (brTeams.length > 0) {
      pool = brTeams;
    } else {
      // Validação estrita: só aceita se o nome do time bate razoavelmente com a busca
      pool = teams.filter(t => {
        const tName = normalizeStr(t.strTeam);
        const tAlt  = normalizeStr(t.strAlternate || '');
        return (
          tName === nKey ||
          tAlt  === nKey ||
          tName.startsWith(nKey) ||
          nKey.startsWith(tName) ||
          (nKey.length >= 4 && tName.includes(nKey)) ||
          levenshtein(tName, nKey) <= 1
        );
      });
      // Se mesmo assim vazio, retorna null em vez de pegar qualquer resultado
      if (!pool.length) return null;
    }

    // Prioridade 1: match exato
    let matched = pool.find(t => normalizeStr(t.strTeam) === nKey);

    // Prioridade 2: match exato no nome alternativo
    if (!matched) matched = pool.find(t => normalizeStr(t.strAlternate) === nKey);

    // Prioridade 3: nome começa com o termo buscado
    if (!matched) matched = pool.find(t => normalizeStr(t.strTeam).startsWith(nKey));

    // Prioridade 4: nome contém o termo (mínimo 4 chars)
    if (!matched && nKey.length >= 4) {
      matched = pool.find(t => normalizeStr(t.strTeam).includes(nKey) || nKey.includes(normalizeStr(t.strTeam)));
    }

    // Prioridade 5: Levenshtein ≤ 1 apenas (muito restrito para não pegar Arsenal)
    if (!matched) {
      matched = pool.find(t => levenshtein(normalizeStr(t.strTeam), nKey) <= 1);
    }

    if (matched) console.log(`[Busca textual] ${matched.strTeam}`);
    return matched || null;
  } catch (e) {
    console.error('Text search error:', e.message);
    return null;
  }
}

async function getLastResults(teamId) {
  const data = await sportsDBGet(`eventslast.php?id=${teamId}`);
  return data.results || [];
}

async function getLeagueTable(leagueId, season) {
  const s = season || getCurrentSeason();
  const data = await sportsDBGet(`lookuptable.php?l=${leagueId}&s=${s}`);
  return data.table || [];
}

function getCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// ── CÁLCULOS ─────────────────────────────────────────────────

function calcForm(events, teamId) {
  const last5 = events.slice(0, 5);
  let pts = 0;
  const results = [];

  for (const e of last5) {
    const isHome = String(e.idHomeTeam) === String(teamId);
    const hg = parseInt(e.intHomeScore ?? -1);
    const ag = parseInt(e.intAwayScore ?? -1);
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

  const validGames = last5.filter(e => parseInt(e.intHomeScore ?? -1) >= 0).length;
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

function calcMomentum(events, teamId) {
  const weights = [3, 2, 1];
  let total = 0, max = 0;
  events.slice(0, 3).forEach((e, i) => {
    const w = weights[i];
    const isHome = String(e.idHomeTeam) === String(teamId);
    const hg = parseInt(e.intHomeScore ?? -1);
    const ag = parseInt(e.intAwayScore ?? -1);
    if (hg < 0 || ag < 0) return;
    max += w * 3;
    if (isHome) { total += hg > ag ? w * 3 : hg === ag ? w : 0; }
    else { total += ag > hg ? w * 3 : hg === ag ? w : 0; }
  });
  return max > 0 ? Math.round((total / max) * 100) : 50;
}

function calcGoalsAvg(events, teamId) {
  let scored = 0, conceded = 0, count = 0;
  for (const e of events.slice(0, 5)) {
    const isHome = String(e.idHomeTeam) === String(teamId);
    const hg = parseInt(e.intHomeScore ?? -1);
    const ag = parseInt(e.intAwayScore ?? -1);
    if (hg < 0 || ag < 0) continue;
    count++;
    scored += isHome ? hg : ag;
    conceded += isHome ? ag : hg;
  }
  if (!count) return { scored: '0.0', conceded: '0.0' };
  return { scored: (scored / count).toFixed(1), conceded: (conceded / count).toFixed(1) };
}

// Estima escanteios e cartões com base nos dados disponíveis
function calcCornerAndCardEstimate(homeStats, awayStats) {
  const homeAttack = parseFloat(homeStats.goals.scored);
  const awayAttack = parseFloat(awayStats.goals.scored);
  const combinedAttack = homeAttack + awayAttack;

  // Escanteios: mais ataque → mais escanteios (base 9, sobe com ataque)
  const cornerEst = Math.round(8.5 + (combinedAttack - 2.0) * 1.1);
  const cornersOver = cornerEst >= 10;
  const cornersMarket = cornersOver ? 'Over 9.5 Escanteios' : 'Under 9.5 Escanteios';
  const cornersOdd = cornersOver
    ? Math.max(1.40, (1.90 - (cornerEst - 10) * 0.07)).toFixed(2)
    : Math.max(1.50, (1.70 + (10 - cornerEst) * 0.08)).toFixed(2);
  const cornersContext = cornersOver
    ? `Combinação ofensiva de ${combinedAttack.toFixed(1)} gols/jogo sugere jogo aberto. Tendência de mais de 10 escanteios.`
    : `Perfil mais cauteloso dos dois lados. Estimativa aponta para confronto com menos escanteios.`;

  // Cartões: jogo equilibrado → mais disputado → mais cartões
  const formDiff = Math.abs(homeStats.form.score - awayStats.form.score);
  const tensionHigh = formDiff <= 3;
  const cardsOdd = tensionHigh ? '1.85' : '2.10';
  const cardsMarket = 'Over 3.5 Cartões';
  const cardsContext = tensionHigh
    ? `Times de forma similar tendem a disputar mais. Confrontos equilibrados geram mais faltas e cartões.`
    : `Desequilíbrio de forma tende a reduzir a tensão. Menos cartões esperados quando um lado domina.`;

  return {
    cornersMarket, cornersOdd: String(cornersOdd), cornersContext,
    cardsMarket, cardsOdd, cardsContext,
  };
}

function detectRedFlags(homeStats, awayStats) {
  const flags = [];

  if (/^L[3-5]/.test(homeStats.form.streak)) {
    flags.push({ icon: '🔴', severity: 'high', title: `${homeStats.name} em crise`, text: `${homeStats.form.streak[1]} derrotas consecutivas. Momento crítico antes do jogo.` });
  }
  if (/^L[3-5]/.test(awayStats.form.streak)) {
    flags.push({ icon: '🔴', severity: 'high', title: `${awayStats.name} em crise`, text: `${awayStats.form.streak[1]} derrotas seguidas. Moral em baixa.` });
  }

  const homeWins = homeStats.form.results.filter(r => r === 'W').length;
  const awayWins = awayStats.form.results.filter(r => r === 'W').length;
  if (homeWins === 0 && homeStats.form.results.filter(r => r !== '?').length >= 3) {
    flags.push({ icon: '⚠️', severity: 'mid', title: `${homeStats.name} sem vencer`, text: `Nenhuma vitória nos últimos ${homeStats.form.results.length} jogos registrados.` });
  }
  if (awayWins === 0 && awayStats.form.results.filter(r => r !== '?').length >= 3) {
    flags.push({ icon: '⚠️', severity: 'mid', title: `${awayStats.name} sem vencer`, text: `Nenhuma vitória recente fora de casa. Dificuldade como visitante.` });
  }

  if (parseFloat(homeStats.goals.conceded) > 2.0) {
    flags.push({ icon: '🛡️', severity: 'mid', title: `Defesa frágil — ${homeStats.name}`, text: `Média de ${homeStats.goals.conceded} gols sofridos por jogo. Linha defensiva vulnerável.` });
  }
  if (parseFloat(awayStats.goals.conceded) > 2.0) {
    flags.push({ icon: '🛡️', severity: 'mid', title: `Defesa frágil — ${awayStats.name}`, text: `Média de ${awayStats.goals.conceded} gols sofridos fora de casa.` });
  }

  if (homeStats.tablePos && awayStats.tablePos) {
    const diff = Math.abs(homeStats.tablePos - awayStats.tablePos);
    if (diff >= 10) {
      const stronger = homeStats.tablePos < awayStats.tablePos ? homeStats.name : awayStats.name;
      flags.push({ icon: '📊', severity: 'low', title: 'Desigualdade na tabela', text: `${stronger} está ${diff} posições acima. Desequilíbrio técnico relevante.` });
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
    parseFloat(homeStats.goals.scored) +
    parseFloat(awayStats.goals.conceded) +
    parseFloat(awayStats.goals.scored) +
    parseFloat(homeStats.goals.conceded)
  ) / 2;

  const bestMarket = avgGoals > 2.5 ? 'Gols' : diff > 20 ? 'Vencer' : 'Escanteios';
  const bestMarketValue = avgGoals > 2.5 ? 'OVER 2.5 GOLS' : side === 'Casa' ? 'VITÓRIA CASA' : 'VITÓRIA VISITANTE';
  const dangerMarket = diff < 10 ? 'Vencer' : 'Cartões';

  return { homeWinPct, level, side, confidence, bestMarket, bestMarketValue, dangerMarket, avgGoals: avgGoals.toFixed(1) };
}

// ── GROQ ─────────────────────────────────────────────────────

async function generateWithGroq(prompt) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada no Netlify');
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
    throw new Error(`Groq error: ${err.error?.message || r.status}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

function buildGroqPrompt(homeStats, awayStats, sensor, redflags, matchRaw) {
  const flagsList = redflags.map(f => `- ${f.title}: ${f.text}`).join('\n') || 'Nenhuma red flag crítica.';
  return `Você é o Goat Radar, sistema premium de análise de apostas esportivas. Tom: técnico, direto, confiante.
IMPORTANTE: Os times da partida são EXATAMENTE "${homeStats.name}" (casa) e "${awayStats.name}" (visitante). Use esses nomes e somente esses.

PARTIDA: ${matchRaw}

${homeStats.name} (Casa):
- Forma últimos 5: ${homeStats.form.results.join('-')} | Score: ${homeStats.form.score}/10 | Momentum: ${homeStats.momentum}%
- Gols/jogo: marcados ${homeStats.goals.scored} | sofridos ${homeStats.goals.conceded}
- Tabela: ${homeStats.tablePos ? `${homeStats.tablePos}º lugar, ${homeStats.tablePts} pts` : 'não disponível'}

${awayStats.name} (Visitante):
- Forma últimos 5: ${awayStats.form.results.join('-')} | Score: ${awayStats.form.score}/10 | Momentum: ${awayStats.momentum}%
- Gols/jogo: marcados ${awayStats.goals.scored} | sofridos ${awayStats.goals.conceded}
- Tabela: ${awayStats.tablePos ? `${awayStats.tablePos}º lugar, ${awayStats.tablePts} pts` : 'não disponível'}

SENSOR: ${sensor.level.toUpperCase()} | Favorito: ${sensor.side} (${sensor.side === 'Casa' ? homeStats.name : awayStats.name}) | Confiança: ${sensor.confidence} | Vantagem: ${sensor.homeWinPct}%
RED FLAGS:
${flagsList}

Responda SOMENTE em JSON válido, sem markdown, sem texto fora do JSON:
{
  "context": "2-3 frases diretas sobre o confronto usando os dados acima. Use os nomes corretos dos times. Destaque forma recente e o que o sensor indica.",
  "summary": "1 frase curta e impactante sobre o jogo.",
  "headline": "MANCHETE EM MAIÚSCULAS, máximo 6 palavras, cite o time favorito pelo nome correto",
  "verdictText": "2-3 frases de veredicto final. Use os nomes corretos. Diga em qual mercado há mais valor e por quê, com base nos dados."
}`;
}

// ── ODDS ─────────────────────────────────────────────────────

function buildOdds(sensor, homeStats, awayStats) {
  const favName = sensor.side === 'Casa' ? homeStats.name : awayStats.name;
  const favWinPct = sensor.homeWinPct;

  // Odd 1: Vitória do favorito — derivada do winPct
  const favOdd = (100 / Math.max(favWinPct, 5) * 1.05).toFixed(2);
  const favEdge = favWinPct > 60 ? 'pos' : favWinPct < 45 ? 'neg' : 'neu';
  const favContext = favWinPct > 60
    ? `${favName} com ${favWinPct}% de vantagem calculada. Forma e momentum convergem para o mesmo lado.`
    : favWinPct < 45
    ? `Favorito incerto. Sinal fraco — não entre apenas na vitória sem confirmação de outros mercados.`
    : `Equilíbrio entre os times. Odd moderada; busque valor em mercados alternativos.`;

  // Odd 2: Over/Under 2.5 gols — derivada da média de gols
  const avgG = parseFloat(sensor.avgGoals);
  const isOver = avgG > 2.5;
  const goalsOdd = isOver
    ? Math.max(1.40, 1.95 - (avgG - 2.5) * 0.18).toFixed(2)
    : Math.max(1.55, 1.60 + (2.5 - avgG) * 0.22).toFixed(2);
  const goalsEdge = isOver && avgG > 3.2 ? 'pos' : !isOver && avgG < 1.6 ? 'pos' : 'neu';
  const goalsContext = isOver
    ? `Média combinada de ${sensor.avgGoals} gols/jogo — acima da linha. Ambos os ataques produzem com regularidade.`
    : `Média de ${sensor.avgGoals} gols/jogo — abaixo da linha. Under 2.5 tem mais respaldo estatístico aqui.`;

  // Odd 3: Ambas marcam — derivada do potencial ofensivo vs defensivo
  const homeScored = parseFloat(homeStats.goals.scored);
  const awayScored = parseFloat(awayStats.goals.scored);
  const homeConceded = parseFloat(homeStats.goals.conceded);
  const awayConceded = parseFloat(awayStats.goals.conceded);
  const bttsProb = homeScored >= 1.0 && awayScored >= 0.8 && homeConceded >= 0.5 && awayConceded >= 0.5;
  const bttsScore = ((homeScored * awayConceded) + (awayScored * homeConceded)) / 2;
  const bttsOdd = bttsProb
    ? Math.max(1.45, 1.90 - bttsScore * 0.12).toFixed(2)
    : Math.min(2.50, 1.95 + (2.0 - bttsScore) * 0.15).toFixed(2);
  const bttsEdge = bttsProb && bttsScore > 1.2 ? 'pos' : !bttsProb ? 'neg' : 'neu';
  const bttsContext = bttsProb
    ? `${homeStats.name} marca ${homeScored}/jogo e sofre ${homeConceded}. ${awayStats.name} marca ${awayScored}/jogo. Defesas permeáveis dos dois lados.`
    : `Baixa produção ofensiva de um dos lados (${homeStats.name}: ${homeScored}/jogo | ${awayStats.name}: ${awayScored}/jogo). Risco elevado para ambas marcam.`;

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

function buildFallbackContext(homeStats, awayStats, sensor) {
  return `${homeStats.name} chega com forma ${homeStats.form.score}/10 e momentum de ${homeStats.momentum}%, enquanto ${awayStats.name} registra ${awayStats.form.score}/10 e ${awayStats.momentum}% de momentum. O Sensor aponta vantagem para ${sensor.side === 'Casa' ? homeStats.name : awayStats.name} com confiança ${sensor.confidence.toLowerCase()}.`;
}

function buildFallbackHeadline(sensor, homeStats, awayStats) {
  const fav = (sensor.side === 'Casa' ? homeStats.name : awayStats.name).toUpperCase();
  if (sensor.level === 'forte') return `${fav} DOMINA`;
  if (sensor.level === 'moderado') return `VANTAGEM PARA ${fav}`;
  return 'JOGO INDEFINIDO — CAUTELA';
}

function buildFallbackVerdict(sensor, homeStats, awayStats, redflags) {
  const fav = sensor.side === 'Casa' ? homeStats.name : awayStats.name;
  const warning = redflags.some(f => f.severity === 'high') ? ' Atenção às red flags de alto risco antes de entrar.' : '';
  return `Radar aponta ${fav} com ${sensor.homeWinPct}% de vantagem calculada. Melhor entrada: ${sensor.bestMarketValue}.${warning}`;
}

// ── HANDLER PRINCIPAL ────────────────────────────────────────

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) };
  }

  const { match, homeId, awayId } = body;
  if (!match) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Campo match obrigatório' }) };
  }

  const formatMatch = match.trim().match(/^(.+?)\s+(?:x|vs|×)\s+(.+?)(\s*[-—]\s*.+)?$/i);
  if (!formatMatch) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Formato inválido. Use: "Flamengo x Vasco" ou "Liverpool vs Arsenal"' }) };
  }

  const homeRaw = formatMatch[1].trim();
  const awayRaw = formatMatch[2].trim();
  const leagueHint = (formatMatch[3] || '').replace(/[-—]/g, '').trim().toLowerCase();

  // Função que busca por ID direto (autocomplete) ou por nome (digitação livre)
  async function resolveTeam(rawName, knownId) {
    if (knownId) {
      try {
        const data = await sportsDBGet(`lookupteam.php?id=${knownId}`);
        const team = data.teams?.[0];
        if (team) return team;
      } catch {}
    }
    return findTeam(rawName);
  }

  try {
    const [homeTeam, awayTeam] = await Promise.all([
      resolveTeam(homeRaw, homeId),
      resolveTeam(awayRaw, awayId),
    ]);

    if (!homeTeam) {
      return { statusCode: 404, body: JSON.stringify({ error: `Time não encontrado: "${homeRaw}". Tente o nome em português ou inglês.` }) };
    }
    if (!awayTeam) {
      return { statusCode: 404, body: JSON.stringify({ error: `Time não encontrado: "${awayRaw}". Tente o nome em português ou inglês.` }) };
    }

    const [homeResults, awayResults] = await Promise.all([
      getLastResults(homeTeam.idTeam),
      getLastResults(awayTeam.idTeam),
    ]);

    // Detecta liga
    let leagueId = null;
    for (const [key, id] of Object.entries(LEAGUE_MAP)) {
      if (leagueHint.includes(key) || (homeTeam.strLeague || '').toLowerCase().includes(key)) {
        leagueId = id; break;
      }
    }
    if (!leagueId && homeTeam.idLeague) leagueId = homeTeam.idLeague;

    let table = [];
    if (leagueId) {
      try { table = await getLeagueTable(leagueId); } catch { /* silencioso */ }
    }

    const homeRow = table.find(r => String(r.idTeam) === String(homeTeam.idTeam) || r.strTeam?.toLowerCase() === homeTeam.strTeam?.toLowerCase());
    const awayRow = table.find(r => String(r.idTeam) === String(awayTeam.idTeam) || r.strTeam?.toLowerCase() === awayTeam.strTeam?.toLowerCase());

    const homeStats = {
      name: homeTeam.strTeam,
      logo: homeTeam.strTeamBadge || null,
      form: calcForm(homeResults, homeTeam.idTeam),
      momentum: calcMomentum(homeResults, homeTeam.idTeam),
      goals: calcGoalsAvg(homeResults, homeTeam.idTeam),
      tablePos: homeRow ? parseInt(homeRow.intRank) : null,
      tablePts: homeRow ? parseInt(homeRow.intPoints) : null,
    };
    const awayStats = {
      name: awayTeam.strTeam,
      logo: awayTeam.strTeamBadge || null,
      form: calcForm(awayResults, awayTeam.idTeam),
      momentum: calcMomentum(awayResults, awayTeam.idTeam),
      goals: calcGoalsAvg(awayResults, awayTeam.idTeam),
      tablePos: awayRow ? parseInt(awayRow.intRank) : null,
      tablePts: awayRow ? parseInt(awayRow.intPoints) : null,
    };

    const sensor = calcSensorScore(homeStats, awayStats);
    const redflags = detectRedFlags(homeStats, awayStats);
    const corners = calcCornerAndCardEstimate(homeStats, awayStats);
    const odds = buildOdds(sensor, homeStats, awayStats);

    const groqRaw = await generateWithGroq(buildGroqPrompt(homeStats, awayStats, sensor, redflags, match));
    let groqData = {};
    try {
      const clean = groqRaw.replace(/```json|```/g, '').trim();
      const block = clean.match(/\{[\s\S]*\}/);
      if (block) groqData = JSON.parse(block[0]);
    } catch { /* usa fallbacks */ }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        match: {
          home: homeStats.name,
          away: awayStats.name,
          competition: homeTeam.strLeague || 'Internacional',
          time: 'Análise pré-jogo',
        },
        logos: { home: homeStats.logo, away: awayStats.logo },
        context: groqData.context || buildFallbackContext(homeStats, awayStats, sensor),
        sensor: {
          level: sensor.level,
          side: sensor.side,
          favorLabel: sensor.side,
          bestMarket: sensor.bestMarket,
          bestMarketValue: sensor.bestMarketValue,
          bestMarketEdge: 'pos',
          dangerMarket: sensor.dangerMarket,
          caution: redflags.some(f => f.severity === 'high') ? 'alto' : redflags.some(f => f.severity === 'mid') ? 'moderado' : 'leve',
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
        summary: groqData.summary || `${sensor.side === 'Casa' ? homeStats.name : awayStats.name} parte como favorito segundo o Goat Radar.`,
        redflags,
        odds,
        verdict: {
          headline: groqData.headline || buildFallbackHeadline(sensor, homeStats, awayStats),
          tags: buildTags(sensor, redflags),
          text: groqData.verdictText || buildFallbackVerdict(sensor, homeStats, awayStats, redflags),
        },
      }),
    };

  } catch (e) {
    console.error('Goat Radar error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
