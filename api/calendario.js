// Guarda o proximo jogo do time num arquivo unico, para que a edicao de um
// valha para todo mundo que abrir o site.
//
// Usa o Blob Store da Vercel. O store pode ser privado ou publico, entao
// tentamos os dois modos em vez de adivinhar. Se nada funcionar, devolvemos o
// erro real e o dashboard volta a guardar so no navegador de quem editou.
import { put, get } from '@vercel/blob';

const ARQUIVO = 'calendario.json';
const MODOS = ['private', 'public'];

async function corpoDe(r) {
  if (!r) return null;
  if (typeof r.text === 'function') return await r.text();
  if (r.stream) return await new Response(r.stream).text();
  if (r.body) return await new Response(r.body).text();
  if (r.url) { const f = await fetch(r.url, { cache: 'no-store' }); return f.ok ? await f.text() : null; }
  return null;
}

async function ler() {
  let ultimo = null;
  for (const access of MODOS) {
    try {
      const r = await get(ARQUIVO, { access, useCache: false });
      const txt = await corpoDe(r);
      if (txt == null || txt === '' || txt === 'null') return null;
      return JSON.parse(txt);
    } catch (e) {
      if (/not found|404|no such/i.test(String(e && e.message))) return null;
      ultimo = e;
    }
  }
  if (ultimo) throw ultimo;
  return null;
}

async function gravar(dados) {
  let ultimo = null;
  for (const access of MODOS) {
    try {
      await put(ARQUIVO, JSON.stringify(dados), {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return access;
    } catch (e) { ultimo = e; }
  }
  throw ultimo || new Error('nao consegui gravar');
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
      const modo = await gravar(limpo);
      return res.status(200).json({ ok: true, dados: limpo, modo });
    }

    return res.status(405).json({ ok: false, motivo: 'metodo nao suportado' });
  } catch (e) {
    // mensagem crua de proposito: e o que permite descobrir o que falhou
    return res.status(200).json({
      ok: false,
      motivo: String(e && e.message ? e.message : e).slice(0, 300),
      tem: {
        storeId: Boolean(process.env.BLOB_STORE_ID),
        oidc: Boolean(process.env.VERCEL_OIDC_TOKEN),
        token: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      },
    });
  }
}
