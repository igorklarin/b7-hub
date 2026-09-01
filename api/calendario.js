// Guarda o calendario do time (ate 3 jogos marcados) num arquivo unico,
// para que a edicao de um valha para todo mundo que abrir o site.
//
// Importante: importamos o pacote inteiro em vez de nomes soltos. Se uma funcao
// nao existir na versao instalada, aqui ela vira undefined e o codigo escolhe
// outro caminho — em vez de derrubar a rota logo na inicializacao.
import * as blob from '@vercel/blob';

const ARQUIVO = 'calendario.json';
const MAX_JOGOS = 3;

// aceita o formato antigo (um jogo solto) e o novo (lista), sempre devolve lista
function comoLista(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : (Array.isArray(v.jogos) ? v.jogos : [v]);
  return arr
    .filter((x) => x && typeof x === 'object' && x.opp)
    .slice(0, MAX_JOGOS)
    .map((x) => ({
      opp:  String(x.opp  ?? '').slice(0, 60),
      data: String(x.data ?? '').slice(0, 10),
      hora: String(x.hora ?? '').slice(0, 5),
      obs:  String(x.obs  ?? '').slice(0, 80),
      em:   new Date().toISOString(),
    }));
}
const MODOS = ['private', 'public'];

async function corpoDe(r) {
  if (!r) return null;
  if (typeof r.text === 'function') return await r.text();
  if (r.stream) return await new Response(r.stream).text();
  if (r.body)   return await new Response(r.body).text();
  if (r.url) { const f = await fetch(r.url, { cache: 'no-store' }); return f.ok ? await f.text() : null; }
  return null;
}
const naoAchou = (e) => /not found|404|no such|does not exist/i.test(String(e && e.message));

async function ler() {
  let ultimo = null;

  // caminho novo: get() le tambem de store privado
  if (typeof blob.get === 'function') {
    for (const access of MODOS) {
      try {
        const txt = await corpoDe(await blob.get(ARQUIVO, { access, useCache: false }));
        if (txt == null || txt === '' || txt === 'null') return null;
        return JSON.parse(txt);
      } catch (e) { if (naoAchou(e)) return null; ultimo = e; }
    }
  }

  // caminho antigo: achar pela listagem e baixar a url.
  // store privado exige autenticacao, entao mandamos o token junto quando existe.
  try {
    const { blobs } = await blob.list({ prefix: ARQUIVO, limit: 1 });
    if (!blobs || !blobs.length) return null;
    const alvo = blobs[0].downloadUrl || blobs[0].url;
    const tk = process.env.BLOB_READ_WRITE_TOKEN;
    const r = await fetch(alvo, {
      cache: 'no-store',
      headers: tk ? { authorization: 'Bearer ' + tk } : {},
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao baixar o arquivo do calendario');
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
      return res.status(200).json({ ok: true, dados: comoLista(await ler()) });
    }
    if (req.method === 'POST') {
      let corpo = req.body;
      if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = null; } }
      const limpo = comoLista(corpo);
      const modo = await gravar(limpo);
      return res.status(200).json({ ok: true, dados: limpo, modo });
    }
    return res.status(405).json({ ok: false, motivo: 'metodo nao suportado' });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      motivo: String(e && e.message ? e.message : e).slice(0, 300),
      sdk: { get: typeof blob.get, put: typeof blob.put, list: typeof blob.list },
      tem: { storeId: Boolean(process.env.BLOB_STORE_ID),
             oidc: Boolean(process.env.VERCEL_OIDC_TOKEN),
             token: Boolean(process.env.BLOB_READ_WRITE_TOKEN) },
    });
  }
}
