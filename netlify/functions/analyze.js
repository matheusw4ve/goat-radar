// ============================================================
// GOAT RADAR — analyze.js FIXED
// ============================================================

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
          error: 'Campo match obrigatório'
        })
      };
    }

    // ── TESTE DOS IDS RECEBIDOS ─────────────────────────────
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ok: true,
        matchRecebido: match,
        homeIdRecebido: homeId || null,
        awayIdRecebido: awayId || null
      })
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
