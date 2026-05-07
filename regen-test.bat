@echo off
REM v14.61 SANDBOX-MODE - regenere index-test.html depuis index.html
REM A relancer apres chaque release prod pour synchroniser le sandbox.

echo Copie index.html -^> index-test.html...
copy /Y "%~dp0index.html" "%~dp0index-test.html"

if errorlevel 1 (
  echo.
  echo ERREUR : copie echec
  pause
  exit /b 1
)

echo.
echo OK - index-test.html regenere.
echo.
echo Pour ouvrir le sandbox :
echo   - Double-clic sur index-test.html (mode test auto)
echo   - OU index.html?sandbox=1 dans le navigateur
echo.
echo Donnees isolees via prefixe localStorage "_test_"
echo Drive auto-connect desactive en mode test.
echo.
pause
