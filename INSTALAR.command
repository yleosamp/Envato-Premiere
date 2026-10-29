#!/bin/bash
# Universal UXP plugin: no Node, Homebrew, FFmpeg or runtime download required.
set -u

pause_if_interactive() {
  if [ -t 0 ]; then
    printf '\nPressione Enter para fechar / Press Enter to close... '
    IFS= read -r envato_reply || true
  fi
}

if [ "$(/usr/bin/uname -s)" != "Darwin" ]; then
  printf '%s\n' 'Este instalador e para macOS. No Windows use INSTALAR.bat ou abra o arquivo .ccx.'
  pause_if_interactive
  exit 1
fi

envato_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
shopt -s nullglob
envato_packages=("$envato_directory"/Envato-Audio-Bridge-*.ccx)
if [ "${#envato_packages[@]}" -ne 1 ] || [ ! -f "${envato_packages[0]}" ]; then
  printf '%s\n' 'Extraia o ZIP completo antes de instalar. Mantenha apenas um arquivo Envato-Audio-Bridge-*.ccx nesta pasta.'
  printf '%s\n' 'Extract the complete ZIP before installing; keep one matching CCX in this folder.'
  pause_if_interactive
  exit 1
fi
envato_package="${envato_packages[0]}"
envato_upia='/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/macOS/UnifiedPluginInstallerAgent'

printf '%s\n' 'Envato Audio Bridge - Instalacao macOS / macOS installation'
printf '%s\n' 'O plugin usa o runtime do Premiere. Nao precisa instalar Node ou Homebrew.'
printf '%s\n' 'A Adobe pode pedir sua confirmacao. Nao desative a seguranca do macOS.'

if [ -x "$envato_upia" ]; then
  if "$envato_upia" --install "$envato_package"; then
    printf '\n%s\n' 'A Adobe confirmou a instalacao / Adobe confirmed installation.'
    printf '%s\n' 'No Premiere: Janela > Plugins UXP > Envato Audio.'
    printf '%s\n' 'Se necessario, ative o Modo de desenvolvedor nas preferencias de Plugins.'
    printf '%s\n' 'Se o painel antigo continuar aberto, salve o projeto e reabra o Premiere quando puder.'
    pause_if_interactive
    exit 0
  fi
  printf '\n%s\n' 'O instalador direto nao concluiu. Abrindo o CCX para confirmar no Creative Cloud...'
fi

if /usr/bin/open "$envato_package"; then
  printf '\n%s\n' 'Arquivo aberto. Confirme Instalar no Adobe Creative Cloud Desktop.'
  printf '%s\n' 'Package opened. Confirm Install in Adobe Creative Cloud Desktop.'
  printf '%s\n' 'Depois: Premiere > Janela > Plugins UXP > Envato Audio.'
  pause_if_interactive
  exit 0
fi

printf '\n%s\n' 'Nao foi possivel abrir o instalador. Instale/atualize o Adobe Creative Cloud Desktop e abra o arquivo .ccx.'
printf '%s\n' 'Could not open the installer. Install/update Adobe Creative Cloud Desktop, then double-click the CCX.'
pause_if_interactive
exit 1
