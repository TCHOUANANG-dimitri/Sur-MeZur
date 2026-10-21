# Compile, aligne et signe l'APK de Sur-MeZur.
#
#   powershell -ExecutionPolicy Bypass -File scripts\compiler.ps1 [-Publier]
#
# -Publier : copie aussi l'APK dans la landing (landing/public/android/
# sur-mezur.apk) et y inscrit sa version et sa taille (landing/src/data/
# apk.json) : la page /telecharger et la section « Application » l'utilisent
# au prochain deploiement.
#
# Prerequis : projet genere (npm run generer), cle creee (scripts\creer-cle.ps1),
# JDK 17+ et SDK Android (%LOCALAPPDATA%\Android\Sdk ou ANDROID_HOME).
# Sortie : dist\sur-mezur-<version>.apk (non versionne).

param([switch]$Publier)
$ErrorActionPreference = "Stop"
$racine = Split-Path -Parent $PSScriptRoot
$android = Join-Path $racine "android"
$dist = Join-Path $racine "dist"
$manifeste = Get-Content -Raw (Join-Path $racine "twa-manifest.json") | ConvertFrom-Json
$version = $manifeste.appVersion

$cle = Join-Path $env:USERPROFILE ".surmezur\android.keystore"
$props = Join-Path $env:USERPROFILE ".surmezur\android.properties"
if (-not (Test-Path -LiteralPath $cle)) { throw "Cle absente : lancez d'abord scripts\creer-cle.ps1" }
$mdp = ((Get-Content -LiteralPath $props) | Where-Object { $_ -like "storePassword=*" }) -replace "^storePassword=", ""

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$outils = Get-ChildItem (Join-Path $sdk "build-tools") -Directory | Sort-Object { [version]($_.Name -replace "[^0-9.]", "") } | Select-Object -Last 1
if (-not $outils) { throw "Build Tools Android introuvables dans $sdk" }

Write-Output "Compilation (Gradle, release)..."
Push-Location $android
try {
  & .\gradlew.bat --quiet assembleRelease
  if ($LASTEXITCODE -ne 0) { throw "Gradle a echoue" }
} finally { Pop-Location }

$brut = Join-Path $android "app\build\outputs\apk\release\app-release-unsigned.apk"
$aligne = Join-Path $android "app\build\outputs\apk\release\app-release-aligned.apk"
New-Item -ItemType Directory -Force $dist | Out-Null
$sortie = Join-Path $dist "sur-mezur-$version.apk"

& (Join-Path $outils.FullName "zipalign.exe") -p -f 4 $brut $aligne
if ($LASTEXITCODE -ne 0) { throw "zipalign a echoue" }
& (Join-Path $outils.FullName "apksigner.bat") sign --ks $cle --ks-key-alias surmezur --ks-pass "pass:$mdp" --key-pass "pass:$mdp" --out $sortie $aligne
if ($LASTEXITCODE -ne 0) { throw "apksigner a echoue" }
& (Join-Path $outils.FullName "apksigner.bat") verify $sortie
if ($LASTEXITCODE -ne 0) { throw "Signature invalide" }
Remove-Item -LiteralPath "$sortie.idsig" -ErrorAction SilentlyContinue

$taille = [math]::Round((Get-Item $sortie).Length / 1KB)
Write-Output "APK signe : $sortie ($taille Ko)"

if ($Publier) {
  $landing = Join-Path (Split-Path -Parent $racine) "landing"
  $cible = Join-Path (Join-Path $landing "public") "android"
  New-Item -ItemType Directory -Force $cible | Out-Null
  Copy-Item -LiteralPath $sortie -Destination (Join-Path $cible "sur-mezur.apk") -Force
  $info = [ordered]@{
    version = $version
    versionCode = $manifeste.appVersionCode
    bytes = (Get-Item $sortie).Length
    file = "/android/sur-mezur.apk"
  }
  $json = Join-Path (Join-Path (Join-Path $landing "src") "data") "apk.json"
  [System.IO.File]::WriteAllText($json, ($info | ConvertTo-Json) + "`n")
  Write-Output "Publie dans la landing : public/android/sur-mezur.apk et src/data/apk.json"
}
