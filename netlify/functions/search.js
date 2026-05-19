// ============================================================
// GOAT RADAR — search.js v2
// Netlify Function: autocomplete com sistema de score profissional
// Endpoint: /api/search?q=chelsea
// ============================================================

const SPORTSDB_KEY = process.env.SPORTSDB_KEY || "123";
const BASE = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;

// ── NORMALIZAÇÃO ─────────────────────────────────────────────
function normalize(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ── ALIASES: apelido → nome oficial ─────────────────────────
const ALIASES = {
  // Brasileirão
  'fla':               'Flamengo',
  'mengao':            'Flamengo',
  'mengão':            'Flamengo',
  'flu':               'Fluminense',
  'bota':              'Botafogo',
  'galo':              'Atletico Mineiro',
  'furacão':           'Athletico Paranaense',
  'furacao':           'Athletico Paranaense',
  'cap':               'Athletico Paranaense',
  'timão':             'Corinthians',
  'timao':             'Corinthians',
  'spfc':              'Sao Paulo',
  'tricolor paulista': 'Sao Paulo',
  'peixe':             'Santos',
  'cru':               'Cruzeiro',
  'colorado':          'Internacional',
  'inter gaucho':      'Internacional',
  'dragão':            'Atletico Goianiense',
  'dragao':            'Atletico Goianiense',
  'coelho':            'America Mineiro',
  'bragantino':        'Red Bull Bragantino',
  'vitória':           'Vitoria',
  'vitoria':           'Vitoria',
  'pal':               'Palmeiras',
  'palestra':          'Palmeiras',
  'gremio':            'Gremio',
  'grêmio':            'Gremio',

  // Premier League
  'spurs':             'Tottenham Hotspur',
  'tottenham':         'Tottenham Hotspur',
  'man city':          'Manchester City',
  'man utd':           'Manchester United',
  'man united':        'Manchester United',
  'west ham':          'West Ham United',
  'wolves':            'Wolverhampton Wanderers',
  'forest':            'Nottingham Forest',

  // La Liga
  'barca':             'FC Barcelona',
  'barça':             'FC Barcelona',
  'bara':              'FC Barcelona',
  'atletico':          'Atletico Madrid',
  'atletico madrid':   'Atletico Madrid',
  'betis':             'Real Betis',
  'sociedad':          'Real Sociedad',
  'bilbao':            'Athletic Club',

  // Bundesliga
  'bvb':               'Borussia Dortmund',
  'dortmund':          'Borussia Dortmund',
  'leverkusen':        'Bayer Leverkusen',
  'bayer':             'Bayer Leverkusen',
  'leipzig':           'RB Leipzig',
  'frankfurt':         'Eintracht Frankfurt',
  'gladbach':          'Borussia Monchengladbach',
  'bremen':            'Werder Bremen',

  // Serie A
  'juve':              'Juventus',
  'inter':             'Inter Milan',
  'internazionale':    'Inter Milan',
  'ac milan':          'AC Milan',
  'roma':              'AS Roma',
  'lazio':             'SS Lazio',

  // Ligue 1
  'psg':               'Paris Saint-Germain',
  'om':                'Olympique Marseille',
  'marseille':         'Olympique Marseille',
  'losc':              'Lille OSC',
  'lille':             'Lille OSC',

  // Liga MX
  'rayados':           'Monterrey',
  'chivas':            'Guadalajara',
};

// ── BOOSTS PARA TIMES POPULARES ──────────────────────────────
// Quanto maior o número, mais esse time sobe no ranking
const POPULARITY_BOOST = {
  // Brasil — prioridade máxima para o público
  'flamengo':              600,
  'palmeiras':             580,
  'corinthians':           560,
  'sao paulo':             540,
  'fluminense':            520,
  'atletico mineiro':      500,
  'atletico-mineiro':      500,
  'vasco da gama':         490,
  'vasco':                 490,
  'santos':                480,
  'botafogo':              475,
  'internacional':         470,
  'gremio':                460,
  'cruzeiro':              455,
  'bahia':                 445,
  'fortaleza':             440,
  'athletico paranaense':  430,
  'red bull bragantino':   400,

  // Europa
  'real madrid':           580,
  'fc barcelona':          575,
  'manchester city':       570,
  'manchester united':     565,
  'liverpool':             560,
  'arsenal':               550,
  'chelsea':               545,
  'tottenham hotspur':     540,
  'paris saint-germain':   535,
  'juventus':              530,
  'inter milan':           525,
  'ac milan':              520,
  'atletico madrid':       515,
  'borussia dortmund':     510,
  'bayer leverkusen':      505,
  'rb leipzig':            490,
  'olympique marseille':   480,
  'as roma':               475,
  'napoli':                470,
  'porto':                 460,
  'benfica':               455,
};

// ── LIGAS ACEITAS (filtra amadores/obscuras) ─────────────────
const PRIORITY_LEAGUES = new Set([
  'Brazilian Série A', 'Brazilian Serie A', 'Brasileirao', 'Brasileirão',
  'Brazilian Série B', 'Brazilian Serie B',
  'Copa do Brasil',
  'English Premier League', 'Premier League',
  'Spanish La Liga', 'La Liga', 'LaLiga',
  'German Bundesliga', 'Bundesliga',
  'Italian Serie A', 'Serie A',
  'French Ligue 1', 'Ligue 1',
  'UEFA Champions League', 'Champions League',
  'UEFA Europa League', 'Europa League',
  'Copa Libertadores',
  'Copa Sudamericana',
  'Liga MX',
  'Süper Lig', 'Super Lig',
  'Eredivisie',
  'Primeira Liga', 'Portuguese Primeira Liga',
  'Scottish Premiership',
  'Argentine Primera División',
  'Colombian Primera A',
  'Chilean Primera División',
  'Uruguayan Primera División',
  'MLS',
]);

// Palavras que indicam time irrelevante para o produto
const JUNK_KEYWORDS = ['sub-20', 'sub20', 'u20', 'u-20', 'sub-17', 'u17', 'women', 'feminino', 'feminin', 'ladies', 'futsal', 'beach', 'reserves', 'b team', 'ii', ' b ', 'academy'];

// ── LEVENSHTEIN PARA FUZZY MATCH ─────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array(n + 1).fill(0).map((_, j) => (j === 0 ? i : 0))
  );
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── SISTEMA DE SCORE ─────────────────────────────────────────
function scoreTeam(team, query) {
  const q = normalize(query);
  const name = normalize(team.name);
  const league = team.league || '';
  const country = team.country || '';

  let score = 0;

  // 1. MATCH DE NOME
  if (name === q) {
    score += 1000; // match exato
  } else if (name.startsWith(q)) {
    score += 700;  // começa com a query
  } else if (name.includes(q)) {
    score += 400;  // contém a query
  } else {
    // Levenshtein para typos (ex: "flamenco" → "flamengo")
    const dist = levenshtein(name, q);
    if (dist <= 1) score += 500;
    else if (dist <= 2) score += 300;
    else if (dist <= 3) score += 100;
    else score -= 200; // muito diferente, penaliza
  }

  // 2. LIGA PRIORITÁRIA
  if (PRIORITY_LEAGUES.has(league)) score += 250;

  // 3. BOOST BRASIL — público principal é BR
  if (country === 'Brazil' || country === 'Brasil') score += 200;

  // Extra boost BR para queries curtas (≤3 chars) — evita Arsenal p/ "va", "fl", etc.
  if ((country === 'Brazil' || country === 'Brasil') && q.length <= 3) score += 300;

  // 4. BOOST DE POPULARIDADE
  const popKey = normalize(team.name);
  if (POPULARITY_BOOST[popKey]) score += POPULARITY_BOOST[popKey];
  // Tenta match parcial no mapa de popularidade
  else {
    for (const [k, v] of Object.entries(POPULARITY_BOOST)) {
      if (popKey.includes(k) || k.includes(popKey)) {
        score += Math.round(v * 0.7);
        break;
      }
    }
  }

  // 5. PENALIZA TIMES IRRELEVANTES
  const nameLower = team.name.toLowerCase();
  for (const junk of JUNK_KEYWORDS) {
    if (nameLower.includes(junk)) { score -= 800; break; }
  }

  // 6. PENALIZA TIMES INTERNACIONAIS EM QUERIES CURTAS (≤3 chars)
  // Evita que "Arsenal" apareça para "va", "fl", "cr", etc.
  if (q.length <= 3 && country !== 'Brazil' && country !== 'Brasil') score -= 400;

  return score;
}

// ── HANDLER PRINCIPAL ────────────────────────────────────────
exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const q = (event.queryStringParameters?.q || '').trim();

  if (!q || q.length < 2) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ results: [] }),
    };
  }

  const key = normalize(q);
  // Resolve alias antes de buscar (ex: "fla" → "Flamengo")
  const searchTerm = ALIASES[key] || q;

  try {
    const url = `${BASE}/searchteams.php?t=${encodeURIComponent(searchTerm)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`TheSportsDB error: ${r.status}`);
    const data = await r.json();
    const teams = data.teams || [];

    // Monta lista com score
    const scored = teams
      .filter(t => t.strTeam && t.idTeam)
      .map(t => {
        const candidate = {
          id: t.idTeam,
          name: t.strTeam,
          league: t.strLeague || '',
          country: t.strCountry || '',
          logo: t.strTeamBadge || null,
        };
        return { ...candidate, score: scoreTeam(candidate, searchTerm) };
      })
      // Remove times com score muito baixo (irrelevantes ou muito diferentes)
      .filter(t => t.score > 50)
      // Ordena pelo score (maior primeiro)
      .sort((a, b) => b.score - a.score)
      // Máximo 8 sugestões
      .slice(0, 8)
      // Remove o campo score do output final
      .map(({ score, ...rest }) => rest);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify({ results: scored }),
    };

  } catch (e) {
    console.error('Search error:', e.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message, results: [] }),
    };
  }
};
