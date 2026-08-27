# Central do Bloco 7 — arquivos do site

    index.html        o dashboard inteiro (um arquivo só)
    api/matches.js    busca os amistosos na API da EA pelo servidor

A pasta `api/` precisa ficar do lado do `index.html`, com esse nome exato.
É ela que faz o botão "Atualizar" funcionar pra qualquer pessoa que abrir o site:
rodando no servidor não existe bloqueio de CORS.

## Como atualizar o site depois

No GitHub, dentro do repositório:

1. **Add file → Upload files**
2. Arraste o `index.html` novo
3. **Commit changes**

A Vercel republica sozinha em menos de um minuto. Não precisa mexer em mais nada.
