// Guarda o proximo jogo do time num arquivo unico, para que a edicao de um
// valha para todo mundo que abrir o site.
//
// Usa o Blob Store da Vercel. A autenticacao acontece sozinha: em producao a
// Vercel injeta credenciais OIDC junto com o BLOB_STORE_ID; fora dela vale o
// BLOB_READ_WRITE_TOKEN. Em vez de adivinhar qual existe, simplesmente tentamos
// a operacao e, se falhar, avisamos - o dashboard volta a guardar so no
// navegador de quem editou e o site continua funcionando igual.
import { put, list } from '@vercel/blob';

const ARQUIVO = 'calendario.json';

async function ler() {
  const { blobs } = await list({ prefix: ARQUIVO, limit: 1 });
  if (!blobs.length) return null;
  const r = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!r.ok) return null;
  const txt = await r.text();
  if (!txt || txt === 'null') return null;
  return JSON.parse(txt);
}

async function gravar(dados) {
  await put(ARQUIVO, JSON.stringify(dados), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

function motivo(e) {
  const m = String(e && e.message ? e.message : e);
  if (/No token found|BLOB_READ_WRITE_TOKEN|store not found|Unauthorized/i.test(m)) {
    return 'o armazenamento ainda nao esta ligado a este deploy';
  }
  return m.slice(0, 160);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, dados: await ler() });
    }

    if (req.method === 'POST') {
      let corpo = req.body;
      if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = null; } }
      const vazio = !corpo || typeof corpo !== 'object' || !corpo.opp;
      const limpo = vazio ? null : {
        opp:  String(corpo.opp  ?? '').slice(0, 60),
        data: String(corpo.data ?? '').slice(0, 10),
        hora: String(corpo.hora ?? '').slice(0, 5),
        obs:  String(corpo.obs  ?? '').slice(0, 80),
        em:   new Date().toISOString(),
      };
      await gravar(limpo);
      return res.status(200).json({ ok: true, dados: limpo });
    }

    return res.status(405).json({ ok: false, motivo: 'metodo nao suportado' });
  } catch (e) {
    return res.status(200).json({ ok: false, motivo: motivo(e) });
  }
}
