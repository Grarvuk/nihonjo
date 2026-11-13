@echo off
setlocal EnableExtensions
:: ===================================================================
::  Nihonjo - fabrique l'application Android (APK)
::
::  Meme methode que l'application d'Odyvresse
::  (odyvresse_all\odyvresse\build_mobile_production.bat) : Capacitor.
::  Le front (index.html, assets\) est COPIE DANS l'APK ; l'application
::  appelle l'API du site en ligne (https://nihonjo.odyvresse.com), et la
::  connexion Google passe par le selecteur de compte d'Android.
::  Consequence : apres une modification du front, refaire l'APK.
::
::  Ce qu'il faut (deja la pour Odyvresse) : Node.js 22 ou plus,
::  Android Studio (son Java "jbr" et le SDK Android).
::  Une fois : declarer l'application dans la console Firebase
::  (paquet com.odyvresse.nihonjo + empreinte SHA-1 de la cle de debug),
::  sinon la connexion Google echoue dans l'application.
::
::  Resultat : sortie_android\Nihonjo-AAAA-MM-JJ_HHMM.apk
::  Le detail : doc_pour_agents\deploiement.md, "Application Android".
::  Texte sans accents : la console Windows les affiche mal.
:: ===================================================================
cd /d "%~dp0"

:: Rustine reprise d'Odyvresse : sur ce poste, ComSpec porte une espace
:: finale ; Node ne peut alors ouvrir aucun shell ("spawn cmd.exe ENOENT"),
:: et "capacitor sync" en ouvre un (greffon de connexion Google).
:: Voir odyvresse_all\deckolector\doc_pour_agents\connexion_google_mobile.md.
set "ComSpec=%SystemRoot%\System32\cmd.exe"

set "APPLI=%~dp0application_android"
set "SORTIE=%~dp0sortie_android"
set "CAPACITOR=node node_modules\@capacitor\cli\bin\capacitor"

:: Publicites (12/11) : l'identifiant d'application AdMob pose dans le
:: manifeste (application_android\regler_admob.mjs). Sans lui, le SDK des
:: publicites ferme l'application des son ouverture. Par defaut : celui
:: d'ESSAI de Google. Le votre (console AdMob, "Applications") : remplacer
:: la valeur ci-dessous, ou "set NIHONJO_ADMOB_APP=..." avant de lancer.
if not defined NIHONJO_ADMOB_APP set "NIHONJO_ADMOB_APP=ca-app-pub-3940256099942544~3347511713"

echo ===================================================
echo   Nihonjo - application Android (Capacitor)
echo ===================================================
echo.

:: --- 1/6 Les outils ----------------------------------------------
where node >nul 2>&1
if errorlevel 1 goto sans_node
set "NODE_MAJ="
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJ=%%v"
if not defined NODE_MAJ goto sans_node
if %NODE_MAJ% LSS 22 goto vieux_node
echo [OK] Node.js %NODE_MAJ%

:: Java : celui d'Android Studio (comme Odyvresse), sinon JAVA_HOME.
if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_HOME goto sans_java
if not exist "%JAVA_HOME%\bin\java.exe" goto sans_java
echo [OK] Java : %JAVA_HOME%

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools" goto sans_sdk
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo [OK] SDK Android : %ANDROID_HOME%

:: --- 2/6 Le front, copie dans l'application ----------------------
echo.
echo [2/6] Copie du front dans l'application...
if exist "%APPLI%\www" rmdir /s /q "%APPLI%\www"
if exist "%APPLI%\www" goto dossier_occupe
mkdir "%APPLI%\www" || goto echec
copy /y "index.html" "%APPLI%\www\" >nul || goto echec
copy /y "manifest.webmanifest" "%APPLI%\www\" >nul || goto echec
robocopy "assets" "%APPLI%\www\assets" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XF ".htaccess" >nul
if errorlevel 8 goto echec
:: Un autre serveur (application d'essai) : NIHONJO_SERVEUR=https://.../
if not defined NIHONJO_SERVEUR goto serveur_par_defaut
> "%APPLI%\www\assets\js\config_application.js" echo export const SERVEUR_APPLICATION = '%NIHONJO_SERVEUR%';
echo [OK] Serveur de l'application : %NIHONJO_SERVEUR%
goto front_copie
:serveur_par_defaut
echo [OK] Serveur de l'application : https://nihonjo.odyvresse.com/
:front_copie

:: --- 3/6 Capacitor (une seule fois) ------------------------------
cd /d "%APPLI%"
:: Reinstaller quand un greffon manque (un greffon ajoute a package.json,
:: comme celui des publicites le 12/11) : npm ci suit package-lock.json.
if not exist "node_modules\@capacitor\cli\bin\capacitor" goto installer_npm
if not exist "node_modules\@capacitor-community\admob\package.json" goto installer_npm
goto capacitor_pret
:installer_npm
echo.
echo [3/6] Installation de Capacitor et des greffons...
call npm ci --no-audit --no-fund
if errorlevel 1 goto echec_npm
:capacitor_pret
echo [OK] Capacitor installe.

:: --- 4/6 Le projet Android (cree au premier lancement) -----------
if exist "android\gradlew.bat" goto projet_pret
echo.
echo [4/6] Creation du projet Android...
call %CAPACITOR% add android
if errorlevel 1 goto echec_capacitor
:projet_pret
:: Icones et ecran de demarrage de Nihonjo (outils\icones_android.py).
:: Les .webp qu'Android Studio aurait pu poser feraient doublon avec nos .png.
for /d %%d in ("android\app\src\main\res\mipmap-*") do del /q "%%d\ic_launcher*.webp" >nul 2>&1
robocopy "res" "android\app\src\main\res" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto echec
if exist "google-services.json" copy /y "google-services.json" "android\app\" >nul
call node regler_admob.mjs "android\app\src\main\AndroidManifest.xml" "%NIHONJO_ADMOB_APP%"
if errorlevel 1 goto echec
echo [OK] Projet Android pret.

:: --- 5/6 Synchronisation -----------------------------------------
echo.
echo [5/6] Synchronisation Capacitor (front et greffons)...
call %CAPACITOR% sync android
if errorlevel 1 goto echec_capacitor

:: --- 6/6 Compilation ---------------------------------------------
echo.
echo [6/6] Compilation de l'APK (plusieurs minutes la premiere fois)...
cd /d "%APPLI%\android"
:: assembleDebug, comme Odyvresse : l'APK est signe avec la cle de debug
:: du poste (%USERPROFILE%\.android\debug.keystore), celle dont le SHA-1
:: est declare dans Firebase. Une version "release" demanderait une cle
:: de signature configuree dans app\build.gradle.
call gradlew.bat assembleDebug
if errorlevel 1 goto echec_gradle

set "JOUR="
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "JOUR=%%d"
if not defined JOUR set "JOUR=version"
if not exist "%SORTIE%" mkdir "%SORTIE%"
set "APK=%SORTIE%\Nihonjo-%JOUR%.apk"
copy /y "app\build\outputs\apk\debug\app-debug.apk" "%APK%" >nul || goto echec

echo.
echo ===================================================
echo   Application Android prete
echo ===================================================
echo   %APK%
echo.
echo   Sur le telephone : copier le fichier, l'ouvrir, autoriser
echo   l'installation depuis cette source. Une nouvelle version
echo   s'installe par-dessus l'ancienne.
echo.
start "" explorer "%SORTIE%"
pause
exit /b 0

:sans_node
echo [ERREUR] Node.js est introuvable. Installez la version LTS (22 ou plus)
echo          depuis https://nodejs.org puis relancez ce fichier.
pause
exit /b 1

:vieux_node
echo [ERREUR] Node.js %NODE_MAJ% est trop ancien : Capacitor 8 demande la version 22.
echo          https://nodejs.org
pause
exit /b 1

:sans_java
echo [ERREUR] Java introuvable. Installez Android Studio (son Java est dans
echo          "%ProgramFiles%\Android\Android Studio\jbr"), ou posez JAVA_HOME.
pause
exit /b 1

:sans_sdk
echo [ERREUR] SDK Android introuvable dans %ANDROID_HOME%.
echo          Ouvrez Android Studio une fois (il installe le SDK), ou posez ANDROID_HOME.
pause
exit /b 1

:dossier_occupe
echo [ERREUR] Impossible de vider application_android\www : un fichier y est
echo          ouvert (explorateur, editeur ?). Fermez-le et relancez.
pause
exit /b 1

:echec_npm
echo [ERREUR] L'installation de Capacitor a echoue (reseau ? proxy ?).
pause
exit /b 1

:echec_capacitor
echo [ERREUR] Capacitor a echoue (voir ci-dessus). Si le message parle de
echo          "spawn ... cmd.exe ENOENT" : variable ComSpec du poste, voir
echo          doc_pour_agents\deploiement.md.
pause
exit /b 1

:echec_gradle
echo [ERREUR] La compilation Gradle a echoue (voir ci-dessus).
pause
exit /b 1

:echec
echo [ERREUR] Une copie a echoue (voir ci-dessus).
pause
exit /b 1
