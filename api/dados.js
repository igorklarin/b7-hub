// Guarda o historico de partidas do time, para que o botao "Atualizar" de
// qualquer pessoa valha para todo mundo. Sem isso cada um teria a sua versao
// do dashboard, que nao serve para nada.
//
// Mesmo armazenamento do calendario, arquivo diferente.
import * as blob from '@vercel/blob';

const ARQUIVO = 'dados.json';
const MODOS = ['private', 'public'];

async function corpoDe(r) {
  if (!r) return null;
  if (typeof r.text === 'function') return await r.text();
  if (r.stream) return await new Response(r.stream).text();
  if (r.body)   return await new Response(r.body).text();
  return null;
}
const naoAchou = (e) => /not found|404|no such|does not exist/i.test(String(e && e.message));

async function ler() {
  let ultimo = null;
  if (typeof blob.get === 'function') {
    for (const access of MODOS) {
      try {
        const txt = await corpoDe(await blob.get(ARQUIVO, { access, useCache: false }));
        if (txt == null || txt === '' || txt === 'null') return null;
        return JSON.parse(txt);
      } catch (e) { if (naoAchou(e)) return null; ultimo = e; }
    }
  }
  try {
    const { blobs } = await blob.list({ prefix: ARQUIVO, limit: 1 });
    if (!blobs || !blobs.length) return null;
    const tk = process.env.BLOB_READ_WRITE_TOKEN;
    const r = await fetch(blobs[0].downloadUrl || blobs[0].url, {
      cache: 'no-store', headers: tk ? { authorization: 'Bearer ' + tk } : {},
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao baixar o historico');
    const txt = await r.text();
    return (!txt || txt === 'null') ? null : JSON.parse(txt);
  } catch (e) { if (naoAchou(e)) return null; ultimo = ultimo || e; }
  if (ultimo) throw ultimo;
  return null;
}

async function gravar(dados) {
  let ultimo = null;
  for (const access of MODOS) {
    try {
      await blob.put(ARQUIVO, JSON.stringify(dados), {
        access, addRandomSuffix: false, allowOverwrite: true,
        contentType: 'application/json', cacheControlMaxAge: 60,
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
      if (!corpo || !Array.isArray(corpo.matches)) {
        return res.status(400).json({ ok: false, motivo: 'esperava uma lista de partidas' });
      }
      if (corpo.zerar === true) {                       // voltar ao publicado
        await gravar(null);
        return res.status(200).json({ ok: true, zerado: true });
      }
      const estado = {
        matches: corpo.matches,
        roster: (corpo.roster && typeof corpo.roster === 'object') ? corpo.roster : null,
        em: new Date().toISOString(),
      };
      await gravar(estado);
      return res.status(200).json({ ok: true, em: estado.em, partidas: estado.matches.length });
    }
    return res.status(405).json({ ok: false, motivo: 'metodo nao suportado' });
  } catch (e) {
    return res.status(200).json({ ok: false, motivo: String(e && e.message ? e.message : e).slice(0, 300) });
  }
}
