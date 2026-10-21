# Cree la cle de signature Android de Sur-MeZur, HORS du depot (une seule fois).
#
#   powershell -ExecutionPolicy Bypass -File scripts\creer-cle.ps1
#
# Fichiers crees dans %USERPROFILE%\.surmezur\ :
#   android.keystore     la cle (PKCS12)
#   android.properties   son mot de passe, genere au hasard
#
# A SAUVEGARDER (cle USB, gestionnaire de mots de passe d'equipe) : sans eux,
# impossible de publier une mise a jour de l'application, Android refuse
# d'installer une nouvelle version signee par une autre cle.
#
# Affiche ensuite l'empreinte SHA-256 a recopier dans
# web/public/.well-known/assetlinks.json (c'est elle qui supprime la barre
# d'adresse dans l'application).

$ErrorActionPreference = "Stop"
$dossier = Join-Path $env:USERPROFILE ".surmezur"
$cle = Join-Path $dossier "android.keystore"
$props = Join-Path $dossier "android.properties"

if (-not (Test-Path -LiteralPath $dossier)) { New-Item -ItemType Directory -Path $dossier | Out-Null }

if (Test-Path -LiteralPath $cle) {
  Write-Output "La cle existe deja : $cle"
} else {
  $alphabet = [char[]]"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  $octets = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($octets)
  $mdp = -join ($octets | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
  & keytool -genkeypair -keystore $cle -storetype PKCS12 -alias surmezur `
    -keyalg RSA -keysize 2048 -validity 10950 `
    -storepass $mdp -keypass $mdp `
    -dname "CN=Sur-MeZur, O=Sur-MeZur, L=Douala, C=CM" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "keytool a echoue" }
  Set-Content -LiteralPath $props -Encoding ascii -Value "storePassword=$mdp`nkeyAlias=surmezur"
  Write-Output "Cle creee : $cle"
  Write-Output "Mot de passe : $props"
}

$mdp = ((Get-Content -LiteralPath $props) | Where-Object { $_ -like "storePassword=*" }) -replace "^storePassword=", ""
# Libelle « SHA256: » ou « SHA 256: » selon la langue de keytool.
$ligne = & keytool -list -v -keystore $cle -alias surmezur -storepass $mdp | Select-String -Pattern "SHA\s?256:" | Select-Object -First 1
$empreinte = ($ligne.Line.Trim() -replace "^SHA\s?256:\s*", "")
Write-Output "Empreinte SHA-256 : $empreinte"
