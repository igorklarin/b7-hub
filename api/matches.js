// Busca os amistosos do Bloco Sete na API da EA a partir do servidor.
//
// A EA usa Akamai, que recusa clientes cuja "impressao digital" TLS nao parece
// um navegador — nao e so questao de IP. Por isso tentamos varios transportes
// diferentes e devolvemos o primeiro que passar. Se nenhum passar, a resposta
// traz o diagnostico de cada tentativa e o dashboard cai no modo copiar/colar.
import https from 'node:https';
import http2 from 'node:http2';

const CLUB = '689529';
const PLATAFORMA = 'common-gen5';
const CAMINHO = `/api/fc/clubs/matches`
  + `?matchType=friendlyMatch&platform=${PLATAFORMA}&clubIds=${CLUB}&maxResultCount=50`;
const HOST = 'proclubs.ea.com';
const URL_EA = `https://${HOST}${CAMINHO}`;

// ordem de cifras e assinaturas que o Chrome usa
const CIFRAS = [
  'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA', 'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256', 'AES256-GCM-SHA384', 'AES128-SHA', 'AES256-SHA',
].join(':');
const ASSINATURAS = [
  'ecdsa_secp256r1_sha256', 'rsa_pss_rsae_sha256', 'rsa_pkcs1_sha256',
  'ecdsa_secp384r1_sha384', 'rsa_pss_rsae_sha384', 'rsa_pkcs1_sha384',
  'rsa_pss_rsae_sha512', 'rsa_pkcs1_sha512',
].join(':');
const CURVAS = 'X25519:prime256v1:secp384r1';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const CABECALHOS = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'referer': 'https://proclubs.ea.com/',
  'sec-ch-ua': '"Chromium";v="151", "Not.A/Brand";v="24", "Google Chrome";v="151"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': UA,
};

const TLS = { ciphers: CIFRAS, sigalgs: ASSINATURAS, ecdhCurve: CURVAS,
              minVersion: 'TLSv1.2', honorCipherOrder: true, servername: HOST };

function viaHttps(alpn) {
  return new Promise((ok, erro) => {
    const req = https.request({
      host: HOST, path: CAMINHO, method: 'GET',
      headers: { ...CABECALHOS, host: HOST, connection: 'keep-alive' },
      ...TLS, ALPNProtocols: alpn,
    }, (r) => {
      let corpo = '';
      r.setEncoding('utf8');
      r.on('data', (c) => { corpo += c; });
      r.on('end', () => ok({ status: r.statusCode, corpo }));
    });
    req.setTimeout(15000, () => { req.destroy(new Error('tempo esgotado')); });
    req.on('error', erro);
    req.end();
  });
}

function viaHttp2() {
  return new Promise((ok, erro) => {
    const cli = http2.connect(`https://${HOST}`, { ...TLS, ALPNProtocols: ['h2'] });
    const t = setTimeout(() => { cli.destroy(); erro(new Error('tempo esgotado')); }, 15000);
    cli.on('error', (e) => { clearTimeout(t); erro(e); });
    const req = cli.request({ ':method': 'GET', ':path': CAMINHO,
      ':authority': HOST, ':scheme': 'https', ...CABECALHOS });
    let corpo = '', status = 0;
    req.on('response', (h) => { status = h[':status']; });
    req.setEncoding('utf8');
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => { clearTimeout(t); cli.close(); ok({ status, corpo }); });
    req.end();
  });
}

async function viaFetch() {
  const r = await fetch(URL_EA, { headers: CABECALHOS });
  return { status: r.status, corpo: await r.text() };
}

// Plano B: um servico de proxy com IP residencial. A chave fica nas variaveis
// de ambiente da Vercel (Settings -> Environment Variables), nunca no repositorio.
// Basta cadastrar UMA delas para esta rota entrar em acao.
function viaProxyPago() {
  const alvo = encodeURIComponent(URL_EA);
  let url = null;
  if (process.env.SCRAPERAPI_KEY) {
    url = `https://api.scraperapi.com/?api_key=${process.env.SCRAPERAPI_KEY}`
        + `&url=${alvo}&country_code=br`;
  } else if (process.env.SCRAPINGBEE_KEY) {
    url = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_KEY}`
        + `&url=${alvo}&render_js=false&country_code=br`;
  } else if (process.env.SCRAPINGANT_KEY) {
    url = `https://api.scrapingant.com/v2/general?x-api-key=${process.env.SCRAPINGANT_KEY}`
        + `&url=${alvo}&browser=false&proxy_country=BR`;
  }
  if (!url) return Promise.resolve({ status: 0, corpo: 'sem chave de proxy configurada' });
  return fetch(url, { headers: { accept: 'application/json' } })
    .then(async (r) => ({ status: r.status, corpo: await r.text() }));
}

const ESTRATEGIAS = [
  ['http2 com tls de chrome', viaHttp2],
  ['https1.1 com tls de chrome', () => viaHttps(['http/1.1'])],
  ['https h2 com tls de chrome', () => viaHttps(['h2', 'http/1.1'])],
  ['fetch padrao', viaFetch],
  ['proxy residencial', viaProxyPago],
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
  const notas = [];

  for (const [nome, tentar] of ESTRATEGIAS) {
    try {
      const { status, corpo } = await tentar();
      if (status === 200 && corpo.trim().startsWith('[')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Estrategia', nome);
        return res.status(200).send(corpo);
      }
      if (status === 0) { notas.push(`${nome}: ${corpo}`); continue; }
      notas.push(`${nome}: HTTP ${status}`
        + (corpo.includes('Access Denied') ? ' (recusado pelo Akamai)' : ''));
    } catch (e) {
      notas.push(`${nome}: ${String(e.message || e).slice(0, 100)}`);
    }
  }
  return res.status(200).json({
    bloqueado: true, regiao: process.env.VERCEL_REGION || '?', notas,
  });
}
