@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   ImmoTrack — definir ton mot de passe de connexion
echo   (compte didierkeller@gmail.com)
echo ============================================================
echo.
set /p PASS=Choisis un mot de passe (min 6 caracteres) puis Entree :
echo.
node _setpass.mjs "%PASS%"
set "PASS="
echo.
echo ------------------------------------------------------------
echo  Si tu vois un check vert ci-dessus, c'est bon : tu peux te
echo  connecter avec ce mot de passe. Tu peux fermer cette fenetre.
echo ------------------------------------------------------------
pause
