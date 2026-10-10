# Genere la cle de signature Android de Sur-MeZur, HORS du depot.
#
# Usage (PowerShell) :
#   .\generate-keystore.ps1
#
# La cle est creee dans %USERPROFILE%\.surmezur\android.keystore (jamais dans
# Git : voir .gitignore racine). Le mot de passe demande par keytool n'est
# ecrit nulle part dans le depot : conservez-le dans un gestionnaire de mots
# de passe d'equipe. Apres generation, affichez l'empreinte SHA-256 et
# recopiez-la dans web/public/.well-known/assetlinks.json :
#   keytool -list -v -keystore $env:USERPROFILE\.surmezur\android.keystore -alias surmezur

$ErrorActionPreference = "Stop"

$storeDir = Join-Path $env:USERPROFILE ".surmezur"
$storeFile = Join-Path $storeDir "android.keystore"

if (Test-Path -LiteralPath $storeFile) {
  Write-Output "La cle existe deja : $storeFile"
  Write-Output "Affichez son empreinte avec :"
  Write-Output "  keytool -list -v -keystore $storeFile -alias surmezur"
  exit 0
}

if (-not (Test-Path -LiteralPath $storeDir)) {
  New-Item -ItemType Directory -Path $storeDir | Out-Null
}

& keytool -genkeypair `
  -keystore $storeFile `
  -alias surmezur `
  -keyalg RSA -keysize 2048 -validity 9125 `
  -storetype JKS `
  -dname "CN=Sur-MeZur, OU=Atelier, O=Sur-MeZur, L=Douala, C=CM"

Write-Output ""
Write-Output "Cle creee : $storeFile"
Write-Output "Prochaine etape : copiez l'empreinte SHA-256 ci-dessous dans"
Write-Output "web/public/.well-known/assetlinks.json, champ sha256_cert_fingerprints."
Write-Output ""
& keytool -list -v -keystore $storeFile -alias surmezur | Select-String "SHA256"
