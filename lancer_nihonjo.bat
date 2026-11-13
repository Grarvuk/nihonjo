@echo off
setlocal EnableExtensions
:: ===================================================================
::  Nihonjo - lancement local complet
::  Demarre Docker Desktop si besoin, construit et lance le conteneur
::  (Apache + PHP + base SQLite), attend que l'API reponde, puis ouvre
::  le navigateur sur http://localhost:8080.
::  La base est le fichier data\nihonjo.sqlite de ce dossier (partage
::  avec le conteneur) : DB Browser for SQLite l'ouvre directement.
::  Texte sans accents : la console Windows les affiche mal.
:: ===================================================================
cd /d "%~dp0"
set "URL=http://localhost:8080"

echo ===================================================
echo   Nihonjo - lancement local
echo ===================================================
echo.

:: --- 1. Docker doit repondre ---------------------------------------
docker info >nul 2>&1
if not errorlevel 1 goto docker_pret
echo [..] Docker ne repond pas : demarrage de Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a ESSAIS=0
:attendre_docker
:: ping sert de pause : "timeout" echoue quand la console est redirigee.
ping -n 4 127.0.0.1 >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_pret
set /a ESSAIS+=1
if %ESSAIS% LSS 40 goto attendre_docker
echo [ERREUR] Docker ne demarre pas apres 2 minutes.
echo          Lancez Docker Desktop a la main, puis relancez ce fichier.
pause
exit /b 1
:docker_pret
echo [OK] Docker est pret.

:: --- 2. docker compose (v2) ou docker-compose (v1) -----------------
set "COMPOSE=docker compose"
docker compose version >nul 2>&1
if errorlevel 1 set "COMPOSE=docker-compose"

:: --- 2 bis. Reprise de la base de l'ancien volume (une fois, 25/10) --
:: Avant le 25/10 la base vivait dans un volume Docker. Si data\ n'a pas
:: encore de base, on recopie celle du conteneur existant AVANT de le
:: refaire. Le volume reste intact, en secours.
if exist "data\nihonjo.sqlite" goto base_prete
docker cp nihonjo_web:/var/www/html/data/nihonjo.sqlite "data\nihonjo.sqlite" >nul 2>&1
if exist "data\nihonjo.sqlite" (
  echo [OK] Base reprise de l'ancien volume Docker vers data\nihonjo.sqlite
) else (
  echo [..] Pas d'ancienne base : une base neuve sera creee dans data\
)
:base_prete

echo [..] Construction et demarrage du conteneur...
:: --force-recreate : le conteneur est TOUJOURS refait avec le code et les
:: reglages du moment (le 23/10, un conteneur ancien continuait de tourner
:: et l'on ne voyait pas les changements).
%COMPOSE% up -d --build --force-recreate
if errorlevel 1 goto echec_compose
echo [OK] Conteneur demarre.

:: --- 3. Attendre que l'API reponde ---------------------------------
echo [..] Attente de l'API...
set /a ESSAIS=0
:attendre_api
curl -s -f -o nul "%URL%/api/index.php?action=sante" >nul 2>&1
if not errorlevel 1 goto api_prete
set /a ESSAIS+=1
if %ESSAIS% GEQ 30 goto api_muette
ping -n 2 127.0.0.1 >nul
goto attendre_api

:api_prete
echo [OK] Nihonjo repond sur %URL%
:: Le mode de connexion du serveur qui tourne vraiment (api sante).
curl -s "%URL%/api/index.php?action=sante" | findstr /c:"\"mode\":\"firebase\"" >nul
if not errorlevel 1 (
  echo [OK] Connexion : Google ^(ecran "Se connecter avec Google"^)
) else (
  echo [!!] Connexion : AUCUNE ^(un seul compte, pas d'ecran de connexion^)
  echo      Pour la connexion Google : NIHONJO_AUTH doit rester commente
  echo      dans docker-compose.yml.
)
:: Le serveur sert-il bien le code de CE dossier ? (25/10 : un ancien code
:: servi a fait croire que les changements ne marchaient pas.)
curl -s -o "%TEMP%\nihonjo_app.js" "%URL%/assets/js/app.js"
fc /b "%TEMP%\nihonjo_app.js" "assets\js\app.js" >nul 2>&1
if errorlevel 1 (
  echo [!!] Le serveur ne sert PAS le code de ce dossier.
  echo      Fermez tout autre Nihonjo ou programme sur le port 8080, puis relancez.
  docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
) else (
  echo [OK] Code servi = code de ce dossier.
)
del "%TEMP%\nihonjo_app.js" >nul 2>&1
start "" "%URL%"
echo.
echo ===================================================
echo   Nihonjo est lance : %URL%
echo.
echo   Base (DB Browser for SQLite) : %~dp0data\nihonjo.sqlite
echo   Arreter (la base est gardee) : %COMPOSE% stop
echo   Journal du serveur           : %COMPOSE% logs -f
echo   ATTENTION : ne pas supprimer ni remplacer data\nihonjo.sqlite :
echo   c'est la base (mots, progression, comptes).
echo ===================================================
echo.
pause
exit /b 0

:echec_compose
echo.
echo [ERREUR] La construction ou le demarrage a echoue (voir ci-dessus).
pause
exit /b 1

:api_muette
echo.
echo [ATTENTION] L'API ne repond pas apres 30 secondes. Dernieres lignes du journal :
%COMPOSE% logs --tail 40 nihonjo-app
pause
exit /b 1
