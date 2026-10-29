@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "ENVATO_CCX="
set /a ENVATO_PACKAGE_COUNT=0 >nul
for %%F in ("%~dp0Envato-Audio-Bridge-*.ccx") do if exist "%%~fF" (
  set "ENVATO_CCX=%%~fF"
  set /a ENVATO_PACKAGE_COUNT+=1 >nul
)
if not "%ENVATO_PACKAGE_COUNT%"=="1" (
  echo Extraia o ZIP completo e mantenha um unico arquivo Envato-Audio-Bridge-*.ccx nesta pasta.
  echo Extract the complete ZIP and keep one matching CCX in this folder.
  pause
  exit /b 1
)
echo Envato Audio Bridge - Instalacao Windows
echo Nao precisa instalar Node, FFmpeg ou qualquer runtime extra.
echo Confirme Instalar no Adobe Creative Cloud Desktop.
start "" "%ENVATO_CCX%"
if errorlevel 1 (
  echo Nao foi possivel abrir o CCX. Instale ou atualize o Adobe Creative Cloud Desktop.
  pause
  exit /b 1
)
echo Depois: Premiere ^> Janela ^> Plugins UXP ^> Envato Audio.
echo Se necessario, ative o Modo de desenvolvedor nas preferencias de Plugins.
pause
exit /b 0
