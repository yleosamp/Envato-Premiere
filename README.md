# Envato Audio Bridge para Premiere

Painel UXP independente para Adobe Premiere Pro. Versão 0.3.0 — Windows e macOS (Intel/Apple Silicon). Abre o Envato Elements dentro do Premiere e automatiza o trabalho depois do download:

1. voce pesquisa e faz login no Envato dentro do painel;
2. escolhe a licenca e inicia o download normalmente;
3. o painel detecta o ZIP ou arquivo de audio na pasta de downloads;
4. extrai/copia o audio para `Envato Audio`, ao lado do arquivo `.prproj`;
5. cria `MUSICAS > Nome da musica` ou `SFX > Nome do pacote` no painel Projeto;
6. importa automaticamente todos os audios do download para essa pasta.

O plugin nao contorna licenciamento, nao baixa em massa e nao armazena sua senha. O login e o download acontecem no WebView do proprio Premiere.

## Requisitos

- Adobe Premiere Pro 25.6 ou superior.
- Projeto salvo antes do primeiro download.
- Adobe Creative Cloud Desktop instalado (o instalador oficial de CCX).
- Uma conta/assinatura Envato com autorização para os arquivos baixados.
- No Hackintosh/Intel, use Premiere 26.x. A Adobe exige Apple Silicon/macOS 15+ para Premiere 27+ no Mac. Hackintosh não é uma configuração validada pela Adobe nem por este projeto.
- Sem Node, npm, Homebrew, FFmpeg ou helpers externos no computador do usuário.

## Instalar o pacote

1. [Baixe o instalador universal CCX](https://github.com/yleosamp/Envato-Premiere/releases/latest).
2. Dê dois cliques em `Envato-Audio-Bridge-0.3.0.ccx` e confirme no Creative Cloud Desktop.
3. No Premiere, abra **Janela > Plugins UXP > Envato Audio**. Se a Adobe pedir, permita plugins independentes/modo de desenvolvedor nas preferências de Plugins.
4. Salve o projeto e faça login na Envato. Ao baixar música/SFX, a extração e a organização são locais.

Também há um ZIP de conveniência: extraia tudo e abra `INSTALAR.command` no Mac ou `INSTALAR.bat` no Windows. No Mac, o comando tenta o instalador oficial Adobe e abre o CCX se precisar de confirmação. O CCX direto é o caminho mais simples, inclusive se o Gatekeeper bloquear um comando não assinado. Não desative o Gatekeeper. Se o sistema pedir, autorize apenas esse arquivo conforme as configurações de segurança do macOS.

**Permissão de Downloads no Mac:** se o sistema negar acesso, o próprio painel pede para selecionar/autorizar a pasta Downloads. Isso é uma autorização única do sistema, não uma instalação extra. Pode ser ajustada na engrenagem > Escolher. Projetos em volumes externos/redes também precisam estar acessíveis no Finder.

**Validação:** caminhos POSIX, `/Volumes`, extração/importação e recuperação de permissão foram testados por código, com simulações das APIs Adobe e testes em disco/arquivos. Não houve teste nativo em um Mac nesta sessão. Login, download pelo WebView, Gatekeeper e importação no Premiere precisam de confirmação no Mac; não se trata de promessa de funcionamento 100% em toda configuração.

## Carregar o codigo para desenvolvimento

1. Instale **UXP Developer Tools** pelo aplicativo Adobe Creative Cloud.
2. No Premiere, abra **Editar > Preferencias > Plugins** e ative o modo de desenvolvedor; reinicie o Premiere.
3. Abra o UXP Developer Tool e use **Add Plugin**.
4. Selecione o arquivo `manifest.json` desta pasta.
5. Clique em **Load & Watch**.
6. No Premiere, abra **Janela > UXP Plugins > Envato Audio**.

Na primeira abertura, confira a pasta observada no botao de engrenagem. O padrao e a pasta `Downloads` do usuario. O projeto precisa estar salvo antes do download para que o painel saiba onde criar `Envato Audio`.

Se o mecanismo de download do WebView nao entregar o arquivo na pasta observada, use **Importar arquivo**. Essa opcao mantem a extracao, organizacao e importacao automaticas e serve como fallback enquanto o comportamento e validado na versao instalada do Premiere.

O botão ↗ abre a Envato no navegador normal se o login exigir uma janela que o WebView da Adobe não suporta. Mantenha o painel aberto observando a mesma pasta Downloads: o pós-download continua automático. O plugin não altera o site, não lê cookies/senhas e não tenta contornar proteções, CAPTCHAs ou licenciamento.

Downloads antigos não são importados por conta própria ao abrir o painel. **Tentar último** recupera explicitamente o arquivo mais recente. Durante o uso, arquivos novos precisam permanecer estáveis por duas varreduras antes de processar. ZIPs e áudios extraídos têm limite inicial de 256 MiB/1.000 arquivos para controlar uso de memória; AppleDouble (`._`) e `__MACOSX` são ignorados. Os nomes originais são sanitizados e não sobrescrevem arquivos existentes.

## Atualizações e privacidade

O painel consulta a release pública do GitHub com cache de 24 horas. Uma atualização aparece discretamente; o clique abre o GitHub. A engrenagem permite verificar manualmente. Não há instalação automática, conta própria ou telemetria. Essa consulta não envia nomes de projeto, arquivos ou dados da Envato; o GitHub recebe metadados normais da conexão. Falhas de rede não travam o monitor.

Os logs ficam na pasta privada de dados do plugin, não em Documents. Podem conter caminhos/nomes de arquivos; não os publique sem revisar. A senha e os cookies continuam no WebView da Adobe. Só os áudios dos downloads são copiados para junto do projeto, sem uploads adicionais.

## Privacidade e permissoes

- `webview: all`: o site da Envato usa varios dominios para login, imagens e downloads.
- `localFileSystem: fullAccess`: necessario para observar Downloads e criar a pasta de audio ao lado de qualquer projeto salvo.
- Nenhum token ou senha da Envato e lido pelo codigo do plugin.
- `network`: apenas API pública do GitHub para consultar atualizações; `launchProcess`: URLs HTTPS por clique explícito.

## Dependencia incluida

Este projeto inclui `fflate` 0.8.2 (MIT) para descompactar ZIPs localmente, sem enviar arquivos a servidores externos.

## Development / English

An unofficial, local UXP audio bridge, not affiliated with Envato or Adobe. Download the universal CCX and double-click to install through Adobe Creative Cloud Desktop. No Node, npm, Homebrew or FFmpeg required. macOS may ask for Downloads permission; select that folder once from the panel. Use Premiere 26.x on Intel/Hackintosh; Premiere 27+ on Mac requires Apple Silicon/macOS 15+. Native macOS/WebView authentication has not yet been validated on a Mac. External-browser login and manual file import remain available as fallbacks.

Maintain a saved project and legitimate Envato license. This panel does not bypass login, subscriptions, CAPTCHAs or license registration. It cannot guarantee third-party website behavior. Local extraction is bounded at 256 MiB/1,000 audio files. Update checks read public GitHub release metadata only; no project or account data is uploaded.

Developers only: `npm run check`, `npm test`, `npm run build` (no dependency installation needed). Builds allowlist runtime/source files and verify ZIP permissions and hashes. User data, download archives, logs and credentials are never included. MIT for this code; third-party media/effect licenses remain with their owners.
