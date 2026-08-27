# Central do Bloco 7

    index.html          o dashboard inteiro
    atualizar.ps1       busca na EA, atualiza o dashboard e publica — tudo num comando
    api/matches.js      tenta buscar na EA pelo servidor (a EA costuma recusar)
    api/calendario.js   guarda o proximo jogo para todo mundo ver
    package.json        dependencia do armazenamento do calendario
    vercel.json         fixa a funcao em Sao Paulo

## Atualizar as partidas — um comando

Abra o PowerShell e rode:

    cd $HOME\bloco7
    .\atualizar.ps1

Ele busca os amistosos novos na EA, junta com o historico, descarta as partidas de
lobby refeito, preserva as que voce corrigiu a mao, e faz o push. A Vercel republica
sozinha em menos de um minuto.

Se a primeira execucao reclamar de permissao, rode isto uma vez:

    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

Para so atualizar o arquivo sem publicar:

    .\atualizar.ps1 -SemPush

## Deixar automatico (opcional)

Para rodar sozinho todo dia as 10h, cole no PowerShell **como administrador**:

    $acao = New-ScheduledTaskAction -Execute "powershell.exe" `
      -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$HOME\bloco7\atualizar.ps1`""
    $quando = New-ScheduledTaskTrigger -Daily -At 10:00
    Register-ScheduledTask -TaskName "Bloco7 - atualizar dashboard" -Action $acao -Trigger $quando

Para remover depois:

    Unregister-ScheduledTask -TaskName "Bloco7 - atualizar dashboard" -Confirm:$false

## Calendario compartilhado

Para a edicao do proximo jogo valer para todo mundo, crie o armazenamento uma vez:

1. vercel.com, abra o projeto **b7-hub**
2. aba **Storage** -> **Create Database** -> **Blob** -> **Continue**
3. de o nome que quiser e conecte ao projeto b7-hub
4. va em **Deployments**, nos tres pontinhos do ultimo deploy, **Redeploy**

Sem isso o site funciona igual; so o calendario volta a ficar salvo apenas no
navegador de quem editou.

## A busca automatica das partidas

A rota `api/matches.js` tenta quatro transportes diferentes contra a EA, imitando a
impressao digital TLS do Chrome (http2, https 1.1, https h2 e o fetch comum). Abrir
`/api/matches` no navegador mostra o resultado de cada tentativa.

Se todos falharem, resta o plano B: um servico de proxy com IP residencial. Cadastre
a chave em **Settings -> Environment Variables** do projeto na Vercel, com um destes
nomes, e faca Redeploy — nao precisa mudar uma linha de codigo:

    SCRAPERAPI_KEY     scraperapi.com      (5.000 chamadas gratis por mes)
    SCRAPINGBEE_KEY    scrapingbee.com     (1.000 creditos gratis)
    SCRAPINGANT_KEY    scrapingant.com     (tem plano gratis)

A resposta fica em cache por 2 minutos, entao 10 pessoas usando o site gastam
pouquissimas chamadas.
