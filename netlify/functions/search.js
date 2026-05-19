exports.handler = async function(event) {

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      teste: 'CODIGO NOVO RODANDO'
    })
  };

  // resto do código...
// ============================================================
// GOAT RADAR — search.js FIXED BR
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

// ── TIMES BR DIRETOS (ANTI-ARSENAL BUG) ─────────────────────
const BR_TEAMS = {
  'flamengo': { id:'133612', name:'Flamengo' },
  'fla': { id:'133612', name:'Flamengo' },
  'flam': { id:'133612', name:'Flamengo' },

  'palmeiras': { id:'133616', name:'Palmeiras' },
  'pal': { id:'133616', name:'Palmeiras' },

  'corinthians': { id:'133610', name:'Corinthians' },
  'timao': { id:'133610', name:'Corinthians' },
  'timão': { id:'133610', name:'Corinthians' },

  'gremio': { id:'133618', name:'Gremio' },
  'grêmio': { id:'133618', name:'Gremio' },
  'grem': { id:'133618', name:'Gremio' },

  'vasco': { id:'133624', name:'Vasco da Gama' },

  'fluminense': { id:'133613', name:'Fluminense' },
  'flu': { id:'133613', name:'Fluminense' },

  'botafogo': { id:'133607', name:'Botafogo' },

  'santos': { id:'133621', name:'Santos' },

  'sao paulo': { id:'133622', name:'Sao Paulo' },
  'são paulo': { id:'133622', name:'Sao Paulo' },
  'spfc': { id:'133622', name:'Sao Paulo' },

  'internacional': { id:'133615', name:'Internacional' },
  'inter': { id:'133615', name:'Internacional' },

  'cruzeiro': { id:'133611', name:'Cruzeiro' },

  'bahia': { id:'133606', name:'Bahia' },

  'fortaleza': { id:'133619', name:'Fortaleza' },

  'athletico': { id:'133617', name:'Athletico Paranaense' },
  'athletico paranaense': { id:'133617', name:'Athletico Paranaense' }
};

// ── HANDLER ──────────────────────────────────────────────────
exports.handler = async function(event) {

  // CORS
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
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  const q = (event.queryStringParameters?.q || '').trim();

  if (!q || q.length < 2) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ results: [] }),
    };
  }

  const key = normalize(q);

  // ── MATCH DIRETO BRASIL ───────────────────────────────────
  const local = BR_TEAMS[key];

  if (local) {
    try {

      const r = await fetch(
        `${BASE}/lookupteam.php?id=${local.id}`
      );

      const data = await r.json();

      const t = data.teams?.[0];

      if (!t) throw new Error('time não encontrado');

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          results: [{
            id: t.idTeam,
            name: t.strTeam,
            league: t.strLeague || 'Brasileirão',
            country: t.strCountry || 'Brazil',
            logo: t.strTeamBadge || null
          }]
        })
      };

    } catch(e) {
      console.error(e);
    }
  }

  // ── BUSCA NORMAL (APENAS BRASIL) ──────────────────────────
  try {

    const r = await fetch(
      `${BASE}/searchteams.php?t=${encodeURIComponent(q)}`
    );

    const data = await r.json();

    let teams = data.teams || [];

    // FILTRA APENAS BR
    teams = teams.filter(t =>
      t.strCountry === 'Brazil' ||
      t.strCountry === 'Brasil'
    );

    // MATCH PRIORITÁRIO
    teams.sort((a, b) => {

      const aName = normalize(a.strTeam);
      const bName = normalize(b.strTeam);

      // match exato sobe
      if (aName === key) return -1;
      if (bName === key) return 1;

      // começa com sobe
      if (aName.startsWith(key)) return -1;
      if (bName.startsWith(key)) return 1;

      return 0;
    });

    const results = teams
      .slice(0, 8)
      .map(t => ({
        id: t.idTeam,
        name: t.strTeam,
        league: t.strLeague || '',
        country: t.strCountry || '',
        logo: t.strTeamBadge || null
      }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ results })
    };

  } catch(e) {

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: e.message
      })
    };

  }
};
