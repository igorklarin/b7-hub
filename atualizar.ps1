<#
  Atualiza a Central do Bloco 7 e publica.

  Faz tudo de uma vez: busca os amistosos novos na API da EA, junta com o
  historico que ja esta no index.html, e envia pro GitHub. A Vercel republica
  sozinha em menos de um minuto.

  Rodar:   .\atualizar.ps1
  Sem publicar (so atualiza o arquivo):   .\atualizar.ps1 -SemPush
#>
param(
  [switch]$SemPush,
  [string]$Arquivo = "index.html",
  [string]$Url = ""
)

$ErrorActionPreference = "Stop"
$CLUBE = "689529"
$PLATAFORMA = "common-gen5"
if (-not $Url) {
  $Url = "https://proclubs.ea.com/api/fc/clubs/matches" +
         "?matchType=friendlyMatch&platform=$PLATAFORMA&clubIds=$CLUBE&maxResultCount=50"
}

function Escreve($txt, $cor = "Gray") { Write-Host $txt -ForegroundColor $cor }

# --- 1. ler o dashboard --------------------------------------------------
Set-Location -Path $PSScriptRoot
if (-not (Test-Path $Arquivo)) { throw "nao achei o $Arquivo nesta pasta" }
$html = Get-Content $Arquivo -Raw -Encoding UTF8

$marcaIni = '<script id="app-data" type="application/json">'
$marcaFim = '</script>'
$i = $html.IndexOf($marcaIni)
if ($i -lt 0) { throw "nao achei o bloco de dados dentro do $Arquivo" }
$ini = $i + $marcaIni.Length
$fim = $html.IndexOf($marcaFim, $ini)
$dados = $html.Substring($ini, $fim - $ini) | ConvertFrom-Json

# --- 2. buscar na EA -----------------------------------------------------
Escreve "buscando os amistosos na API da EA..."
$cabecalhos = @{
  "User-Agent"      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  "Accept"          = "application/json, text/plain, */*"
  "Accept-Language" = "pt-BR,pt;q=0.9"
  "Referer"         = "https://proclubs.ea.com/"
}
try {
  $bruto = Invoke-RestMethod -Uri $Url -Headers $cabecalhos -TimeoutSec 40
} catch {
  Escreve "nao consegui falar com a API da EA: $($_.Exception.Message)" "Red"
  Escreve "se isso persistir, tente abrir o endereco no navegador para conferir." "Yellow"
  exit 1
}
if (-not $bruto) { Escreve "a EA respondeu vazio." "Red"; exit 1 }
Escreve "a EA devolveu $($bruto.Count) partida(s)"

# --- 3. converter --------------------------------------------------------
$gt2nome = @{}
foreach ($p in $dados.roster.PSObject.Properties) {
  if ($p.Value.gt) { $gt2nome[$p.Value.gt.ToLower()] = $p.Name }
  $gt2nome[$p.Name.ToLower()] = $p.Name
  foreach ($a in $p.Value.alias) { $gt2nome[[string]$a.ToLower()] = $p.Name }
}

$novas = @(); $descartadas = 0
foreach ($m in $bruto) {
  $clubes = $m.clubs
  $eu = $clubes.$CLUBE
  if (-not $eu) { continue }
  $idAdv = ($clubes.PSObject.Properties.Name | Where-Object { $_ -ne $CLUBE } | Select-Object -First 1)
  $adv = $clubes.$idAdv

  $brutos = @()
  if ($m.players.$CLUBE) { $brutos = @($m.players.$CLUBE.PSObject.Properties.Value) }

  $jogadores = @()
  foreach ($j in $brutos) {
    $chave = ([string]$j.playername).ToLower()
    $nome = if ($gt2nome.ContainsKey($chave)) { $gt2nome[$chave] } else { [string]$j.playername }
    $nota = [double]$j.rating
    $jogadores += [ordered]@{
      p = $nome
      rating = $(if ($nota -gt 0) { $nota } else { $null })
      g  = [int]$j.goals;         a  = [int]$j.assists
      sh = [int]$j.shots
      pm = [int]$j.passesmade;    pa = [int]$j.passattempts
      tm = [int]$j.tacklesmade;   ta = [int]$j.tackleattempts
      mom = [int]$j.mom;          red = [int]$j.redcards
    }
  }

  # lobby refeito: partida curta demais ou sem bola rolando
  $segs = @($brutos | ForEach-Object { [int]$_.secondsPlayed } | Sort-Object)
  $mediana = if ($segs.Count) { $segs[[int]($segs.Count / 2)] } else { 0 }
  $totalPa = 0; foreach ($x in $jogadores) { $totalPa += [int]$x.pa }
  $porDnf = ($eu.winnerByDnf -eq "1") -or ($adv.winnerByDnf -eq "1")
  if ($porDnf -or ($mediana -gt 0 -and $mediana -lt 1500) -or $totalPa -lt 30) { $descartadas++; continue }

  $gf = [int]$eu.goals; $ga = [int]$adv.goals
  $ts = [int]$m.timestamp
  $jogo = [ordered]@{
    id = [string]$m.matchId; src = "api"
    opp = $(if ($adv.details.name) { $adv.details.name } else { "Adversario" })
    gf = $gf; ga = $ga; ts = $ts
    res = $(if ($gf -gt $ga) { "V" } elseif ($gf -eq $ga) { "E" } else { "D" })
    players = $jogadores
  }
  if ($ts -gt 0) {
    $d = [DateTimeOffset]::FromUnixTimeSeconds($ts).ToLocalTime()
    $jogo.date = $d.ToString("dd/MM/yyyy"); $jogo.time = $d.ToString("HH:mm")
  }
  $marcados = 0; foreach ($x in $jogadores) { $marcados += [int]$x.g }
  if ($marcados -lt $gf) {
    $n = $gf - $marcados
    $jogo.note = "$n gol$(if($n -gt 1){'s'}) sem dono no registro da EA - normalmente e gol contra do adversario."
  }
  $novas += ,$jogo
}

# --- 4. juntar sem duplicar e sem desfazer correcao manual ---------------
$porId = @{}
foreach ($m in $dados.matches) { $porId[[string]$m.id] = $m }
$add = 0; $upd = 0; $travadas = 0
$lista = [System.Collections.ArrayList]@($dados.matches)

foreach ($j in $novas) {
  if ($porId.ContainsKey($j.id)) {
    $antiga = $porId[$j.id]
    if ($antiga.locked) { $travadas++; continue }
    foreach ($k in $j.Keys) { $antiga | Add-Member -NotePropertyName $k -NotePropertyValue $j[$k] -Force }
    $upd++
  } else {
    [void]$lista.Add(([pscustomobject]$j)); $add++
  }
}

$ordenada = @($lista | Sort-Object @{Expression={ if ($_.ts) { [int]$_.ts } else { 0 } }},
                                   @{Expression={ if ($_.order) { [int]$_.order } else { 0 } }})
$n = 1
foreach ($m in $ordenada) { $m | Add-Member -NotePropertyName order -NotePropertyValue $n -Force; $n++ }
$dados.matches = $ordenada
$dados | Add-Member -NotePropertyName generated `
  -NotePropertyValue ([DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")) -Force

# --- 5. gravar de volta --------------------------------------------------
$json = $dados | ConvertTo-Json -Depth 40 -Compress
$novoHtml = $html.Substring(0, $ini) + $json + $html.Substring($fim)
Copy-Item $Arquivo "$Arquivo.bak" -Force
[System.IO.File]::WriteAllText((Resolve-Path $Arquivo), $novoHtml, (New-Object System.Text.UTF8Encoding($false)))

Escreve ""
Escreve "$add partida(s) nova(s), $upd atualizada(s), $descartadas descartada(s) por lobby refeito" "Green"
if ($travadas) { Escreve "$travadas partida(s) corrigida(s) a mao foram preservadas" "Yellow" }
Escreve "total no dashboard: $($ordenada.Count) partidas"

# --- 6. publicar ---------------------------------------------------------
if ($SemPush) { Escreve "arquivo atualizado. (-SemPush: nao publiquei)" "Cyan"; exit 0 }
if ($add -eq 0 -and $upd -eq 0) { Escreve "nada novo para publicar." "Cyan"; exit 0 }

Escreve ""
Escreve "publicando no GitHub..."
git add . 2>&1 | Out-Null
git commit -m "atualiza partidas ($add nova(s))" 2>&1 | Out-Null
git push 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Escreve "publicado. a Vercel republica em menos de um minuto." "Green"
} else {
  Escreve "o push falhou. rode 'git push' na mao para ver a mensagem." "Red"
}
