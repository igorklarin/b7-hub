# Central do Bloco 7 — arquivos do site

    index.html        o dashboard inteiro (um arquivo só)
    api/matches.js    busca os amistosos na API da EA pelo servidor
    vercel.json       fixa a função em São Paulo (gru1)

## Por que a região importa

A EA usa Akamai e barra requisição vinda de datacenter dos Estados Unidos, que é
onde a Vercel roda por padrão (Washington, `iad1`). O `vercel.json` muda isso para
`gru1`, São Paulo — muito mais perto de onde o time joga e com chance real de passar.

Se mesmo assim a EA recusar, a função devolve um diagnóstico e o dashboard cai
sozinho no fluxo de copiar/colar, que sai do navegador de casa e sempre funciona.

## Como atualizar o site

    cd $HOME\bloco7
    git add . ; git commit -m "ajuste" ; git push

A Vercel republica sozinha em menos de um minuto.
