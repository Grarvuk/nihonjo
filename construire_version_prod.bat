@echo off
setlocal EnableExtensions
:: ===================================================================
::  Nihonjo - prepare la version de production
::
::  On ne peut PAS envoyer tout le dossier du projet en ligne :
::    - data\nihonjo.sqlite est la base de CE poste : envoye, il ecrase
::      la base du serveur, celle de TOUS les comptes ;
::    - les secrets (api\config.local.php, .env, data\*.key) n'ont rien a
::      faire en ligne ;
::    - tests, outils, documentation, archives, Docker : inutiles en ligne.
::
::  Ce fichier copie dans version_prod\ SEULEMENT ce qui doit partir :
::    index.html, manifest.webmanifest, .htaccess (celui de la racine),
::    assets\, api\ (sans config.local.php), data\.htaccess (et rien
::    d'autre de data\).
::  Avant : les essais de l'API, si Docker tourne (un essai rate = rien
::  n'est prepare). Apres : il verifie qu'aucun fichier dangereux n'est
::  dans la copie, et en fait un zip.
::
::  Ensuite : envoyer le CONTENU de version_prod\ dans www\nihonjo\ du
::  serveur (FileZilla : glisser-deposer, "Remplacer"). Le .htaccess racine
::  part avec : il remplace celui du serveur (ses regles de reecriture
::  ecartent celles du dossier parent, celui d'Odyvresse ; le mot de passe y
::  est en option, desactive). Le .htpasswd ne part jamais.
::  Le detail : doc_pour_agents\deploiement.md, "En ligne".
::  Texte sans accents : la console Windows les affiche mal.
:: ===================================================================
cd /d "%~dp0"

:: Rustine reprise d'Odyvresse (build_mobile_production.bat) : sur le poste
:: de Jose, ComSpec porte une espace finale. Les "for /f" (date du zip,
:: Docker en marche ?) ne s'executent alors pas, SANS erreur : vu le 25/10,
:: zip nomme "nihonjo_prod_version.zip" (le test de Docker passe par le
:: meme chemin : les essais ont pu etre sautes). Voir
:: odyvresse_all\deckolector\doc_pour_agents\connexion_google_mobile.md.
set "ComSpec=%SystemRoot%\System32\cmd.exe"
set "SORTIE=version_prod"
set "COPIE=/E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP"

echo ===================================================
echo   Nihonjo - version de production
echo ===================================================
echo.

:: --- 0. Les essais de l'API (dans le Docker de lancer_nihonjo.bat) --
:: Ils travaillent sur des bases jetables : data\nihonjo.sqlite n'est pas touchee.
set "MARCHE="
for /f %%e in ('docker inspect -f "{{.State.Running}}" nihonjo_web 2^>nul') do set "MARCHE=%%e"
if /i not "%MARCHE%"=="true" goto sans_essais
docker exec nihonjo_web php tests/api_test.php > "%TEMP%\nihonjo_essais.txt" 2>&1
if errorlevel 1 goto essais_rates
echo [OK] Essais de l'API reussis.
goto dossier_neuf
:sans_essais
echo [--] Docker ne tourne pas : essais de l'API sautes. Pour les faire,
echo      lancer d'abord lancer_nihonjo.bat, puis relancer ce fichier.

:: --- 1. Dossier neuf ---------------------------------------------
:dossier_neuf
if exist "%SORTIE%" rmdir /s /q "%SORTIE%"
if exist "%SORTIE%" goto dossier_occupe
mkdir "%SORTIE%" || goto echec

:: --- 2. Les fichiers a envoyer -----------------------------------
copy /y "index.html" "%SORTIE%\" >nul || goto echec
copy /y "manifest.webmanifest" "%SORTIE%\" >nul || goto echec
copy /y ".htaccess" "%SORTIE%\" >nul || goto echec
echo [OK] index.html, manifest.webmanifest, .htaccess

:: robocopy : un code de retour de 8 ou plus est une erreur.
robocopy "assets" "%SORTIE%\assets" %COPIE% >nul
if errorlevel 8 goto echec
echo [OK] assets\

robocopy "api" "%SORTIE%\api" %COPIE% /XF "config.local.php" "*.local.php" >nul
if errorlevel 8 goto echec
echo [OK] api\  (sans config.local.php : celui du serveur reste)

mkdir "%SORTIE%\data" || goto echec
copy /y "data\.htaccess" "%SORTIE%\data\" >nul || goto echec
echo [OK] data\.htaccess  (SANS la base : celle du serveur reste)

:: --- 3. Garde-fous : rien de dangereux dans la copie -------------
:verifier
set "FUITE="
:: Un "call" par motif : dans un "for", *.sqlite serait cherche dans CE
:: dossier-ci au lieu d'etre passe tel quel.
call :chercher "*.sqlite"
call :chercher "*.sqlite-journal"
call :chercher "*.db"
call :chercher "*.key"
call :chercher "*.keystore"
call :chercher ".env"
call :chercher ".htpasswd"
call :chercher "config.local.php"
call :chercher "certificats_firebase.json"
if defined FUITE goto fuite
if not exist "%SORTIE%\.htaccess" goto echec
if not exist "%SORTIE%\data\.htaccess" goto echec
if not exist "%SORTIE%\api\.htaccess" goto echec
if not exist "%SORTIE%\api\lib\.htaccess" goto echec
echo [OK] Verifie : ni base, ni cle, ni secret dans %SORTIE%\

:: --- 4. Un zip, pour le gestionnaire de fichiers d'OVH ----------
set "JOUR="
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "JOUR=%%d"
if not defined JOUR set "JOUR=version"
set "ZIP=nihonjo_prod_%JOUR%.zip"
if exist "%ZIP%" del /q "%ZIP%"
:: tar (Windows 10 et plus) garde les fichiers .htaccess dans le zip.
tar -a -c -f "%ZIP%" -C "%SORTIE%" . >nul 2>&1
if errorlevel 1 (
    echo [--] Zip non cree : envoyer le dossier %SORTIE%\ tel quel.
) else (
    echo [OK] %ZIP%
)

echo.
echo ===================================================
echo   Version de production prete : %SORTIE%\
echo ===================================================
echo   Envoyer le CONTENU de %SORTIE%\ dans www\nihonjo\ du serveur.
echo   Apres l'envoi, verifier :
echo     https://nihonjo.odyvresse.com/api/index.php?action=sante
echo       doit repondre du JSON ;
echo     https://nihonjo.odyvresse.com/data/nihonjo.sqlite
echo       doit repondre 403 (interdit).
echo.
start "" explorer "%SORTIE%"
pause
exit /b 0

:essais_rates
echo [ERREUR] Un essai de l'API a echoue : la version de production n'est
echo          PAS preparee. Le detail :
echo.
type "%TEMP%\nihonjo_essais.txt"
pause
exit /b 1

:dossier_occupe
echo [ERREUR] Impossible de vider %SORTIE%\ : un fichier y est ouvert
echo          (explorateur, FileZilla ?). Fermez-le et relancez.
pause
exit /b 1

:fuite
echo [ERREUR] Un fichier qui ne doit JAMAIS partir en ligne est dans la copie :
echo          %FUITE%  -  rien n'a ete envoye. Signalez-le : ce fichier ne
echo          devrait pas etre dans assets\ ou api\.
pause
exit /b 1

:echec
echo [ERREUR] La copie a echoue (voir ci-dessus).
pause
exit /b 1

:: Cherche un motif dans toute la copie ; s'il y est, le note dans FUITE.
:chercher
dir /s /b /a-d "%SORTIE%\%~1" >nul 2>&1 && set "FUITE=%~1"
exit /b 0
