// ============================================================
// GOAT RADAR — analyze.js FIXED
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SPORTSDB_KEY = process.env.SPORTSDB_KEY || "123";

const BASE =
  `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;

// ── IDs BRASIL ──────────────────────────────────────────────

const TEAM_IDS = {

  'flamengo': '133612',
  'fla': '133612',
  'flam': '133612',

  'palmeiras': '133616',
  'pal': '133616',

  'corinthians': '133610',
  'timao': '133610',
  'timão': '133610',

  'gremio': '133618',
  'grêmio': '133618',
  'grem': '133618',

  'vasco': '133624',

  'fluminense': '133613',
  'flu': '133613',

  'botafogo': '133607',

  'internacional': '133615',
  'inter': '133615',

  'santos': '133621',

  'sao paulo': '133622',
  'são paulo': '133622',
  'spfc': '133622',

  'cruzeiro': '133611',

  'bahia': '133606',

  'fortaleza': '133619',

  'athletico': '133617',
  'athletico paranaense': '133617'

};

// ── HELPERS ────────────────────────────────────────────────

function normalize(str = '') {

  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

}

async function sportsDBGet(endpoint) {

  const r = await fetch(`${BASE}/${endpoint}`);

  if (!r.ok) {
    throw new Error(`TheSportsDB ${r.status}`);
  }

  return r.json();
}

// ── BUSCA TIME ─────────────────────────────────────────────

async function findTeam(rawName) {

  const key = normalize(rawName);

  // 1. ID DIRETO
  const localId = TEAM_IDS[key];

  if (localId) {

    try {

      const data =
        await sportsDBGet(
          `lookupteam.php?id=${localId}`
        );

      const team = data.teams?.[0];

      if (team) return team;

    } catch(e) {
      console.error(e);
    }
  }

  // 2. BUSCA TEXTO
  try {

    const data =
      await sportsDBGet(
        `searchteams.php?t=${encodeURIComponent(rawName)}`
      );

    let teams = data.teams || [];

    // SOMENTE BRASIL
    teams = teams.filter(t =>
      t.strCountry === 'Brazil' ||
      t.strCountry === 'Brasil'
    );

    const exact =
      teams.find(t =>
        normalize(t.strTeam) === key
      );

    if (exact) return exact;

    const starts =
      teams.find(t =>
        normalize(t.strTeam).startsWith(key)
      );

    if (starts) return starts;

    return teams[0] || null;

  } catch(e) {

    console.error(e);

    return null;

  }
}

// ── FORM ───────────────────────────────────────────────────

function calcForm(results, teamId) {

  let pts = 0;

  const last5 = results.slice(0, 5);

  const seq = [];

  for (const e of last5) {

    const isHome =
      String(e.idHomeTeam) === String(teamId);

    const hg = Number(e.intHomeScore);
    const ag = Number(e.intAwayScore);

    if (isNaN(hg) || isNaN(ag)) continue;

    if (isHome) {

      if (hg > ag) {
        pts += 3;
        seq.push('W');
      }

      else if (hg === ag) {
        pts += 1;
        seq.push('D');
      }

      else {
        seq.push('L');
      }

    } else {

      if (ag > hg) {
        pts += 3;
        seq.push('W');
      }

      else if (ag === hg) {
        pts += 1;
        seq.push('D');
      }

      else {
        seq.push('L');
      }

    }

  }

  return {
    score: Math.round((pts / 15) * 10),
    results: seq,
    pts
  };

}

// ── MOMENTUM ───────────────────────────────────────────────

function calcMomentum(form) {

  return Math.min(
    100,
    Math.max(
      0,
      form.score * 10
    )
  );

}

// ── SENSOR ────────────────────────────────────────────────

function calcSensor(home, away) {

  const homeScore =
    home.form.score * 0.6 +
    home.momentum * 0.4;

  const awayScore =
    away.form.score * 0.6 +
    away.momentum * 0.4;

  const total =
    homeScore + awayScore || 1;

  const homePct =
    Math.round(
      (homeScore / total) * 100
    );

  const diff =
    Math.abs(homeScore - awayScore);

  return {

    side:
      homeScore >= awayScore
        ? 'Casa'
        : 'Visitante',

    level:
      diff > 20
        ? 'forte'
        : diff > 8
        ? 'moderado'
        : 'fraco',

    confidence:
      diff > 25
        ? 'Alta'
        : diff > 12
        ? 'Média'
        : 'Baixa',

    homeWinPct: homePct

  };

}

// ── HANDLER ───────────────────────────────────────────────

exports.handler = async function(event) {

  if (event.httpMethod !== 'POST') {

    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };

  }

  try {

    const body = JSON.parse(event.body);

    const {
      match,
      homeId,
      awayId
    } = body;

    if (!match) {

      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'match obrigatório'
        })
      };

    }

    const m =
      match.match(/^(.+?)\s+x\s+(.+)$/i);

    if (!m) {

      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Formato inválido'
        })
      };

    }

    const homeRaw = m[1].trim();
    const awayRaw = m[2].trim();

    // ── RESOLVE POR ID ───────────────────────

    async function resolveTeam(raw, knownId) {

      if (knownId) {

        try {

          const data =
            await sportsDBGet(
              `lookupteam.php?id=${knownId}`
            );

          const team =
            data.teams?.[0];

          if (team) return team;

        } catch(e) {}

      }

      return findTeam(raw);

    }

    const [
      homeTeam,
      awayTeam
    ] = await Promise.all([

      resolveTeam(homeRaw, homeId),
      resolveTeam(awayRaw, awayId)

    ]);

    if (!homeTeam || !awayTeam) {

      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Times não encontrados'
        })
      };

    }

    // ── RESULTADOS ───────────────────────────

    const [
      homeResults,
      awayResults
    ] = await Promise.all([

      sportsDBGet(
        `eventslast.php?id=${homeTeam.idTeam}`
      ),

      sportsDBGet(
        `eventslast.php?id=${awayTeam.idTeam}`
      )

    ]);

    const homeForm =
      calcForm(
        homeResults.results || [],
        homeTeam.idTeam
      );

    const awayForm =
      calcForm(
        awayResults.results || [],
        awayTeam.idTeam
      );

    const homeStats = {

      name: homeTeam.strTeam,
      logo: homeTeam.strTeamBadge,

      form: homeForm,

      momentum:
        calcMomentum(homeForm)

    };

    const awayStats = {

      name: awayTeam.strTeam,
      logo: awayTeam.strTeamBadge,

      form: awayForm,

      momentum:
        calcMomentum(awayForm)

    };

    const sensor =
      calcSensor(
        homeStats,
        awayStats
      );

    // ── RESPOSTA ─────────────────────────────

    return {

      statusCode: 200,

      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },

      body: JSON.stringify({

        match: {

          home: homeStats.name,
          away: awayStats.name,

          competition:
            homeTeam.strLeague || 'Brasil',

          time: 'Pré-jogo'

        },

        logos: {

          home: homeStats.logo,
          away: awayStats.logo

        },

        sensor: {

          level: sensor.level,
          side: sensor.side,

          favorLabel:
            sensor.side,

          bestMarket: 'Vencer',

          bestMarketValue:
            sensor.side === 'Casa'
              ? homeStats.name
              : awayStats.name,

          bestMarketEdge: 'pos',

          dangerMarket: 'Cartões',

          caution:
            sensor.level,

          winPct:
            sensor.homeWinPct,

          winDesc:
            `${sensor.side === 'Casa'
              ? homeStats.name
              : awayStats.name
            } com ${sensor.homeWinPct}% de vantagem`,

          goalsPct: 58,
          goalsDesc: 'Jogo equilibrado ofensivamente',

          cornersPct: 61,
          cornersDesc: 'Tendência média de escanteios',

          cardsPct: 66,
          cardsDesc: 'Jogo físico esperado',

          homeForm:
            homeStats.form.results,

          awayForm:
            awayStats.form.results

        },

        context:
          `${homeStats.name} chega com forma ${homeStats.form.score}/10 enquanto ${awayStats.name} possui ${awayStats.form.score}/10.`,

        summary:
          `${sensor.side === 'Casa'
            ? homeStats.name
            : awayStats.name
          } aparece como lado favorito.`,

        redflags: [],

        odds: [],

        verdict: {

          headline:
            `${(
              sensor.side === 'Casa'
                ? homeStats.name
                : awayStats.name
            ).toUpperCase()} FAVORITO`,

          tags: [

            {
              cls:
                sensor.level === 'forte'
                  ? 'safe'
                  : sensor.level === 'moderado'
                  ? 'warn'
                  : 'danger',

              label:
                `Sinal ${sensor.level}`
            },

            {
              cls:
                sensor.confidence === 'Alta'
                  ? 'safe'
                  : sensor.confidence === 'Média'
                  ? 'warn'
                  : 'danger',

              label:
                `Confiança ${sensor.confidence}`
            }

          ],

          text:
            `${sensor.side === 'Casa'
              ? homeStats.name
              : awayStats.name
            } apresenta melhor combinação entre forma recente e momentum.`

        }

      })

    };

  } catch(e) {

    console.error(e);

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
