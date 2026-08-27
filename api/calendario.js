// Guarda o proximo jogo do time num arquivo unico, para que a edicao de um
// valha para todo mundo que abrir o site.
//
// Precisa de um Blob Store criado no painel da Vercel (Storage -> Create ->
// Blob -> Connect Project). Isso injeta BLOB_READ_WRITE_TOKEN sozinho.
// Sem o store configurado, esta rota responde {ok:false} e o dashboard volta a
// guardar so no navegador de quem editou - o site continua funcionando igual.
import { put, list } from '@vercel/blob';

const ARQUIVO = 'calendario.json';

function temStore() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

async function ler() {
  const { blobs } = await list({ prefix: ARQUIVO, limit: 1 });
  if (!blobs.length) return null;
  const r = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!r.ok) return null;
  return await r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!temStore()) {
    return res.status(200).json({ ok: false, motivo: 'sem armazenamento configurado' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, dados: await ler() });
    }

    if (req.method === 'POST') {
      let corpo = req.body;
      if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = null; } }
      if (!corpo || typeof corpo !== 'object') {
        return res.status(400).json({ ok: false, motivo: 'corpo invalido' });
      }
      const limpo = {
        opp:  String(corpo.opp  ?? '').slice(0, 60),
        data: String(corpo.data ?? '').slice(0, 10),
        hora: String(corpo.hora ?? '').slice(0, 5),
        obs:  String(corpo.obs  ?? '').slice(0, 80),
        por:  String(corpo.por  ?? '').slice(0, 40),
        em:   new Date().toISOString(),
      };
      const vazio = !limpo.opp;
      await put(ARQUIVO, JSON.stringify(vazio ? null : limpo), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return res.status(200).json({ ok: true, dados: vazio ? null : limpo });
    }

    return res.status(405).json({ ok: false, motivo: 'metodo nao suportado' });
  } catch (e) {
    return res.status(200).json({ ok: false, motivo: String(e).slice(0, 200) });
  }
}
