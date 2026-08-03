# Démarrage du backend Sur-MeZur.
#
# Utiliser CE script plutôt qu'une commande uvicorn tapée à la main : deux
# oublis reviennent sans cesse et donnent exactement le même symptôme côté
# mobile — « le serveur n'a pas répondu après 15 s ».
#
#   1. `--host 0.0.0.0` manquant  -> uvicorn n'écoute que sur 127.0.0.1,
#      donc le téléphone ne peut pas joindre l'API.
#   2. mauvais interpréteur       -> le Python global n'a ni pydantic_settings,
#      ni scikit-learn, ni joblib : l'import échoue ou les modèles ML restent
#      invisibles.
#
#   .\start.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "venv introuvable : $venvPython" -ForegroundColor Red
    Write-Host "Creez-le avec : python -m venv venv ; .\venv\Scripts\pip install -r requirements.txt"
    exit 1
}

# Un serveur deja en ecoute sur 8000 masquerait celui-ci (le bind 127.0.0.1
# est plus specifique que 0.0.0.0 et gagne pour les requetes localhost).
$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -eq 8000 }
if ($busy) {
    Write-Host "Le port 8000 est deja occupe :" -ForegroundColor Yellow
    foreach ($c in $busy) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
        Write-Host ("  {0}:8000  PID {1}  {2}" -f $c.LocalAddress, $c.OwningProcess, $p.CommandLine)
    }
    Write-Host "Arretez-le avant de relancer (Stop-Process -Id <PID> -Force)." -ForegroundColor Yellow
    exit 1
}

# IP LAN a renseigner cote mobile si la detection automatique echoue.
$lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "Backend Sur-MeZur" -ForegroundColor Cyan
Write-Host "  local     http://127.0.0.1:8000"
if ($lan) { Write-Host "  telephone http://${lan}:8000" }
Write-Host "  etat      http://127.0.0.1:8000/api/measurements/capabilities"
Write-Host ""

& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
