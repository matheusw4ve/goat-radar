// ============================================================
// GOAT RADAR — search.js v3
// API-Football (api-sports.io) — autocomplete com score
// Endpoint: /api/search?q=vasco
// ============================================================

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const BASE = 'https://v3.football.api-sports.io';

// ── NORMALIZAÇÃO ─────────────────────────────────────────────
function normalize(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ── ALIASES ───────────────────────────────────────────────────
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
  'spurs': 'Tottenham', 'man city': 'Manchester City',
  'man utd': 'Manchester United', 'man united': 'Manchester United',
  'wolves': 'Wolverhampton',
  'barca': 'Barcelona', 'barça': 'Barcelona',
  'bvb': 'Borussia Dortmund', 'dortmund': 'Borussia Dortmund',
  'leverkusen': 'Bayer Leverkusen',
  'juve': 'Juventus',
  'inter': 'Inter Milan', 'internazionale': 'Inter Milan',
  'psg': 'Paris Saint-Germain',
  'om': 'Marseille',
};

// ── POPULARIDADE ──────────────────────────────────────────────
const POPULARITY_BOOST = {
  'flamengo': 600, 'palmeiras': 580, 'corinthians': 560, 'sao paulo': 540,
  'fluminense': 520, 'atletico mineiro': 500, 'vasco da gama': 490, 'vasco': 490,
  'santos': 480, 'botafogo': 475, 'internacional': 470, 'gremio': 460,
  'cruzeiro': 455, 'bahia': 445, 'fortaleza': 440, 'athletico paranaense': 430,
  'real madrid': 580, 'barcelona': 575, 'manchester city': 570,
  'manchester united': 565, 'liverpool': 560, 'arsenal': 550, 'chelsea': 545,
  'tottenham': 540, 'paris saint-germain': 535, 'juventus': 530,
  'inter milan': 525, 'ac milan': 520, 'atletico madrid': 515,
  'borussia dortmund': 510, 'bayer leverkusen': 505,
};

const JUNK_KEYWORDS = ['u20','u-20','u17','u-17','women','feminino','ladies','futsal','beach','reserves','b team','academy'];

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

function scoreTeam(team, query) {
  const q = normalize(query);
  const name = normalize(team.name);
  const country = team.country || '';
  let score = 0;

  if (name === q)              score += 1000;
  else if (name.startsWith(q)) score += 700;
  else if (name.includes(q))   score += 400;
  else {
    const dist = levenshtein(name, q);
    if (dist <= 1)      score += 500;
    else if (dist <= 2) score += 300;
    else if (dist <= 3) score += 100;
    else                score -= 200;
  }

  if (country === 'Brazil') score += 200;
  if (country === 'Brazil' && q.length <= 3) score += 300;
  if (q.length <= 3 && country !== 'Brazil') score -= 400;

  const popKey = normalize(team.name);
  if (POPULARITY_BOOST[popKey]) score += POPULARITY_BOOST[popKey];
  else {
    for (const [k, v] of Object.entries(POPULARITY_BOOST)) {
      if (popKey.includes(k) || k.includes(popKey)) { score += Math.round(v * 0.7); break; }
    }
  }

  const nameLower = team.name.toLowerCase();
  for (const junk of JUNK_KEYWORDS) {
    if (nameLower.includes(junk)) { score -= 800; break; }
  }

  return score;
}

exports.handler = async function(event) {
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

  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const q = (event.queryStringParameters?.q || '').trim();
  if (!q || q.length < 2) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ results: [] }),
    };
  }

  const key = normalize(q);
  const searchTerm = ALIASES[key] || q;

  try {
    const url = `${BASE}/teams?search=${encodeURIComponent(searchTerm)}`;
    const r = await fetch(url, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    });
    if (!r.ok) throw new Error(`API-Football error: ${r.status}`);
    const data = await r.json();
    const teams = data.response || [];

    const scored = teams
      .filter(t => t.team?.id && t.team?.name)
      .map(t => {
        const candidate = {
          id:      String(t.team.id),
          name:    t.team.name,
          league:  t.team.country || '',
          country: t.team.country || '',
          logo:    t.team.logo || null,
        };
        return { ...candidate, score: scoreTeam(candidate, searchTerm) };
      })
      .filter(t => t.score > 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
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
