// Busca os amistosos do Bloco Sete na API da EA pelo servidor.
// Rodando aqui não existe CORS, então o botão "Atualizar" do dashboard funciona
// pra todo mundo que abrir o site, sem proxy público no meio.
const CLUB = '689529';
const PLATAFORMA = 'common-gen5';
const URL_EA = `https://proclubs.ea.com/api/fc/clubs/matches`
  + `?matchType=friendlyMatch&platform=${PLATAFORMA}&clubIds=${CLUB}&maxResultCount=50`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
  try {
    const r = await fetch(URL_EA, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://proclubs.ea.com/',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    const texto = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(r.ok ? 200 : r.status).send(texto);
  } catch (e) {
    return res.status(502).json({ erro: 'nao consegui falar com a API da EA', detalhe: String(e) });
  }
}
