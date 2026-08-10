@echo off
chcp 65001 >nul
title Propryo - Demo locale (GARDER CETTE FENETRE OUVERTE)
cls
echo.
echo   ============================================================
echo      D E M O   P R O P R Y O   -   serveur local
echo   ============================================================
echo.
echo   1) Sur CE PC :  http://localhost:8899/demo/
echo      (le navigateur s'ouvre tout seul - clique "Demarrer la demo")
echo.
echo   2) Sur ta TABLETTE ou ton TELEPHONE (meme reseau WiFi) :
echo      utilise l'adresse "http://192.168.x.x:8899" affichee plus bas
echo      (ligne "Available on"), en ajoutant  /demo/  a la fin.
echo      Ex :  http://192.168.1.20:8899/demo/
echo      (la 1re fois, Windows peut demander d'AUTORISER - clique "Autoriser").
echo.
echo   >>> GARDE CETTE FENETRE OUVERTE pendant la presentation.
echo   >>> Ferme-la pour arreter la demo.
echo.
echo   ------------------------------------------------------------
echo   Si la page ne s'ouvre pas tout de suite, attends 2s et rafraichis.
echo   ------------------------------------------------------------
echo.

start "" http://localhost:8899/demo/
npx --yes http-server "%~dp0" -p 8899 -a 0.0.0.0 -c-1

echo.
echo   (Serveur arrete.) Tu peux fermer cette fenetre.
pause >nul
