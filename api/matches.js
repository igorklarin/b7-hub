// Busca os amistosos do Bloco Sete na API da EA a partir do servidor.
// A EA (Akamai) barra IP de datacenter dos EUA; por isso o vercel.json fixa a
// regiao em gru1 (Sao Paulo). Se ainda assim vier bloqueio, devolvemos um
// diagnostico legivel e o dashboard cai no fluxo de copiar/colar do navegador.
const CLUB = '689529';
const PLATAFORMA = 'common-gen5';
const URL_EA = `https://proclubs.ea.com/api/fc/clubs/matches`
  + `?matchType=friendlyMatch&platform=${PLATAFORMA}&clubIds=${CLUB}&maxResultCount=50`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TENTATIVAS = [
  {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
    'Referer': 'https://www.ea.com/',
    'Origin': 'https://www.ea.com',
    'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
  },
  { 'User-Agent': UA, 'Accept': '*/*' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
  const regiao = process.env.VERCEL_REGION || 'desconhecida';
  const notas = [];

  for (let i = 0; i < TENTATIVAS.length; i++) {
    try {
      const r = await fetch(URL_EA, { headers: TENTATIVAS[i] });
      const texto = await r.text();
      if (r.ok && texto.trim().startsWith('[')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Regiao', regiao);
        return res.status(200).send(texto);
      }
      notas.push(`tentativa ${i + 1}: HTTP ${r.status}`
        + (texto.includes('Access Denied') ? ' (a EA recusou este servidor)' : ''));
    } catch (e) {
      notas.push(`tentativa ${i + 1}: ${String(e).slice(0, 120)}`);
    }
  }
  return res.status(200).json({ bloqueado: true, regiao, notas });
}
