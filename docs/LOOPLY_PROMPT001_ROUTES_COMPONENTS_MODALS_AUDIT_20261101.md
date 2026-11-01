# PROMPT 001 — Auditoria estática de rotas, componentes e modais

Data: 2026-11-01. Repositório: soumoiss/Looply. Referência imutável: main@5daaa66ab86fa61f04c3ec2fffd6f6f3c54a01a2.
Natureza deste PR: DOCUMENTAÇÃO DIAGNÓSTICA, SEM MODIFICAÇÃO DE UI. É uma inspeção parcial orientada por código, NÃO uma homologação visual ou funcional. Não usar este documento como autorização para merge automático.

## 1. Fonte de verdade, histórico e escopo

- DESIGN.md encontrado e lido em main, blob 4f94403810cd1e14b771c72af02185358d77c2ed. Design system já documentado em docs/LOOPLY_DESIGN_SYSTEM_PROMPT02_20261101.md. Navegação recentemente integrada pelo merge #240. Não sobrepor ajustes já realizados nos prompts 02–05.
- HEAD no início e ao fim da inspeção: 5daaa66ab86fa61f04c3ec2fffd6f6f3c54a01a2 (ainda é necessário reconfirmar antes de qualquer merge).
- Árvore Git recursiva: 882 entradas, retorno não truncado. A presença de um arquivo na árvore NÃO prova que ele seja publicado nem carregado.
- O APK EXTRA v3.0.4 não foi recebido como binário; correspondência criptográfica de binário com este HEAD: NÃO VERIFICADA. Não houve qualquer leitura/escrita de arquivos Android/Gradle.
- Infra de Neon/Auth, Cloudflare Workers/R2, FCM, SQL, serviços, endpoints, deploy e dados de usuário fora do escopo; nenhuma mutação efetuada.
- Contrato de preservação: logotipo, marca, Cabin Sketch/Quillen, lilás/roxo/branco, tokens e 10 temas + system em src/theme.js, personalização tipográfica, Cartas em papel, visualizadores escuros e Story Studio 9:16.

## 2. Rotas HTML e pontos de entrada reais

| Rota | Papel/renderer | Observação |
|---|---|---|
| index.html | src/splash.js | Splash e roteamento inicial; não confundir com Home autenticada. |
| login.html | assets/js/login.js -> src/login.js | Formulário #loginForm; #username, #password, #togglePassword, #loginButton, #message, #invitePasswordForm. |
| login-neon.html, login-teste.html | src/neon-login-staging.js, src/login-teste.js | Rotas auxiliares de teste/ativação; não presumir equivalência à rota principal. |
| home.html | assets/js/home.js -> src/page-runtime.js, src/social.js, src/stories.js | #pageContent quase vazio no HTML inicial; Stories, feed e composer gerados após sessão. |
| cartas.html | assets/js/letters.js -> archived-cards, letters-community, scheduled-letters | Composição, coleção, leitura, recuperação e agendamento injetados por JS. |
| musicas.html | assets/js/music.js -> src/music.js, youtube-playlist, music-admin-playlists | Player, dedicatórias, busca e seletores são dinâmicos. |
| galeria.html | assets/js/gallery.js | Grade, upload, filtros, menus, viewers e sheets produzidos por JS. |
| chat.html | assets/js/chat.js -> src/chat.js, chat-enhancements, chat-calls, stories, social | Lista, novo chat, figurinhas, Story e chamadas. |
| conversa.html | assets/js/conversation.js -> src/chat.js, chat-enhancements, chat-calls | Conversa, composer, gravador, chamada e painéis. |
| perfil.html | assets/js/profile.js -> src/profile-page.js | Perfil, edição, avatar, tabs, viewer. |
| usuarios.html | assets/js/users.js -> src/profiles.js | Pesquisa e resultados. |
| notificacoes.html | assets/js/notifications.js | Lista de alertas e marcar lidos. |
| configuracoes.html | assets/js/settings.js -> src/theme.js | Formulário de tema, fonte e escala. |
| admin.html | assets/js/admin.js -> src/admin.js | Administração e estados de autorização. |
| admin-importar-figurinhas.html | src/admin-sticker-zip-import.js | Importação administrativa isolada. |
| admin-passwords-neon.html, admin-senhas-neon.html | src/neon-password-admin.js | Rotas auxiliares administrativas: possuem estilos próprios/ausentes no HTML; exigir verificação de autorização e apresentação antes de refinamento. |
| realtime-neon.html | src/neon-realtime-staging.js | Ferramenta auxiliar de teste; não integrar ao shell sem investigação. |
| share.html | script inline, share-external.css | Compartilhamento independente, com #peoplePicker (dialog) e formulário. |
| car/index.html, mu/index.html, admin/cartas/index.html, admin/musicas/index.html | HTMLs de compatibilidade/encaminhamento | Verificar destino e parâmetros em navegador antes de classificar como telas. |

## 3. Navegação e shell compartilhados

- src/primary-navigation.js contém seis destinos, em ordem: home=Início/home.html; letters=Cartas/cartas.html; music=Músicas/musicas.html; gallery=Galeria/galeria.html; chat=Chat/chat.html; notifications=Avisos/notificacoes.html.
- primaryNavigationMarkup gera links reais, aria-current="page", label, SVG via src/icons.js e badge de avisos. conversation reutiliza chat como destino ativo.
- src/page-runtime.js exige #pageContent e [data-site-header] e injeta cabeçalho, menu de conta e controles; event listener de logout abre dialog .looply-logout-dialog criado em runtime com [data-logout-cancel], [data-logout-confirm], [data-logout-error].
- Outras superfícies do shell: aviso de carta .looply-letter-notice com role alertdialog, tela de manutenção, estado de sessão não verificada, perfil obrigatório, restrição adminOnly, contador de avisos e pull-to-refresh.
- Contratos a não alterar: [data-site-header], #pageContent, [data-admin-mode-toggle], [data-sign-out], aria-current, hrefs, hierarquia/ordem da navegação, ids de diálogo, listeners de foco, click, pagehide, auth e eventos customizados.

## 4. Inventário de componentes e controles montados por JavaScript

| Superfície | Arquivo(s) responsável(is) | Seletores/estados reais amostrados | Eventos/risco |
|---|---|---|---|
| Stories: tray e viewer | src/stories.js | [data-story-list], [data-story-viewer], [data-story-progress-list], [data-story-close], [data-story-prev], [data-story-next], [data-story-like], [data-story-reply], [data-story-repost], [data-story-owner-menu], [data-story-share-panel], [data-story-mention-dialog], [data-story-insights-panel], [data-story-create-dialog] | click, pointerdown/up, keydown, input, submit, visibilitychange; playback e gestos. |
| Story Studio: câmera e edição | src/story-studio.js | [data-studio-stage], [data-studio-video], [data-studio-shutter], [data-studio-flip], [data-studio-grid-toggle], [data-studio-ratio], [data-studio-flash], [data-studio-modal], [data-studio-modal-body], [data-studio-add-text], [data-studio-music-open], [data-studio-publish-friends], [data-studio-send], [data-studio-status] | touch, pointer, click, change, submit, cancel; cuidado com proporção, permissões e mídia. |
| Música no Studio | src/story-music-picker.js | [data-studio-music-query], [data-studio-provider], [data-studio-music-results], [data-studio-music-preview] | input, change e estados de preview; não trocar fontes nem reprodução. |
| Feed/reels | src/social.js, src/home-hybrid-reels.js | [data-post-card], [data-feed-carousel], [data-social-post], [data-toggle-composer], [data-reels-viewer], [data-reels-scroll], [data-reel-close], [data-reel-comments-panel], [data-share-dialog], [data-share-recipient], [data-reels-comments] | click, pointer, scroll, submit, teclado e visualização de mídia. |
| Comentários da Home | src/home-comments-sheet.js | [data-hybrid-comments-close], [data-hybrid-comments-content], [data-toggle-post-comments] | dialog e cancel; foco/scroll. |
| Galeria | assets/js/gallery.js | [data-filter-sheet], [data-upload-modal], [data-upload-progress], [data-people-modal], [data-album-picker-modal], [data-album-modal], [data-access-modal], [data-tags-modal], [data-comments-modal], [data-viewer], [data-photo-adjust-panel], #galleryActionSheet | click, change, submit, pointer, wheel; upload e ajuste de foto são sensíveis. |
| Cartas principais | assets/js/letters.js, src/letters-community.js | #modalEscrever, #cartaComposeForm, #destPicker, #editorAdminCarta, [data-community-letter-edit-dialog], [data-community-letter-dialog], [data-letter-password], [data-community-letter-hint-form] | submit, change, close; senha, destinatário, criptografia, permissões. |
| Cartas programadas | src/scheduled-letters.js | [data-scheduled-direction], [data-scheduled-action], [data-schedule-id], #scheduledUnlockForm | click, submit, cancel; operações de agendamento intocáveis. |
| Músicas e dedicatórias | src/music.js, src/music-admin-playlists.js | [data-music-player], [data-music-audio], [data-music-picker], [data-music-recipient-picker], [data-music-dedication-edit-dialog], [data-music-search-results], [data-admin-music-comment-form] | play, pause, input, submit, close; preservar player/seleção. |
| Chat e conversas | src/chat.js, src/chat-enhancements.js | [data-chat-thread], [data-chat-send], [data-chat-reply], [data-chat-record-start], [data-chat-sticker-picker], [data-chat-group-create], [data-chat-conversation-search], [data-chat-v2-modal], [data-v2-game] | click, input, submit, foco, resize e evento customizado; composer/teclado. |
| Chamadas | src/chat-calls.js | [data-call-modal], [data-call-toast], [data-call-accept], [data-call-decline], [data-call-hangup], [data-call-toggle-mic], [data-call-toggle-camera], [data-call-local], [data-call-remote], [data-call-status] | click, incoming-call, signaling e WebRTC; somente apresentação. |
| Perfil e mídia | src/profile-page.js, src/profile-media-viewer.js, src/avatar-crop-editor.js | [data-pr-edit], [data-pr-connections], [data-pr-tab], [data-pr-follow], [data-mv-comment-form], [data-mv-edit-form], [data-avatar-menu], [data-avatar-crop], [data-avatar-zoom] | click, cancel, pointer, input, wheel; crop e ações sobre mídia. |
| Painel ADM | src/admin.js | [data-users-refresh], [data-app-settings-form], [data-admin-broadcast], [data-secret-message-form], [data-admin-page], [data-user-access-action], [data-moderate-content] | click, change, submit; autorização só por regra real. |
| Notificações/temas/busca | assets/js/notifications.js, assets/js/settings.js, assets/js/users.js | [data-notification-list], [data-notifications-read-all], [data-settings-form], [data-profile-search], [data-profile-open] | click, submit; status real, não ocultar erros. |
| Compartilhar externamente | share.html | #form, #publish, #peoplePicker, #sharePeopleList, #confirmPeople, #status | script inline e dialog; preservar parâmetros/payload. |

Observação: estes seletores foram extraídos por inspeção do conteúdo-fonte de arquivos indicados. A tabela é uma MATRIZ DE RASTREABILIDADE INICIAL, NÃO UMA LISTA EXAUSTIVA de cada elemento montado condicionalmente, nem prova de que todos foram alcançados na aplicação. IDs/data-* enumerados são contratos a preservar, não alvos para remoção.

## 5. Cadeia de estilos e riscos de cascata

- Origem do contrato: styles.css -> assets/css/app.css -> assets/css/pages/shared.css -> folhas por página -> assets/css/theme-complete.css; exceção share.html usa share-external.css isolado.
- Home carrega também home.css, stories-instagram.css, story-studio.css, stories-four-screens.css, feed-reels-refresh.css, feed-reels-experience.css, home-hybrid.css, story-reels-viewport-fix.css e stories-viewer-engagement.css. Chat reutiliza várias folhas de Stories. Deve-se conferir prioridade/especificidade em cada tela antes de editar.
- Tokens: --primary (#7010b0 no tema lilás), --bg (#f5f0fa), --surface-strong (#fff); aliases --looply-ds-* preservam valores de origem; preferência de fonte e escala aplicada via src/theme.js e src/theme-bootstrap.js.
- O DESIGN.md registra pares de contraste preexistentes inferiores a 4.5:1 em alguns temas: risco registrado, não reparado unilateralmente. Diferenciar requisito de texto normal, texto grande e ícones.
- Atenção específica: chat-enhancements.js monta uma section role=dialog em vez de dialog nativo; chat-calls.js usa modal próprio; não inferir trapping de foco sem teste. Galeria, Story Studio e cartas usam muito HTML gerado em string: CSS que esconde um seletor pode amputar ação funcional.

## 6. Estados a capturar e provar em etapa de QA autenticada

- Login: vazio, erro real, senha visível, convite, teclado aberto, loading, sucesso/redirecionamento.
- Shell: sessão válida/inválida, sem avatar, manutenção, usuário sem permissão, conta e confirmação de saída, erro de saída, badge, pull-to-refresh.
- Home: vazio, cards/carrossel, composer, upload, comentários, Reels, Story tray, viewer, menus e compartilhamento.
- Stories: câmera sem permissão, câmera liberada, texto, música, stickers, audiência, prévia, publicação, erro, saída/cancelamento; usuário mencionado e dono com controles condicionais.
- Galeria: filtros, upload, seleção de destinatário, álbuns, viewer, ajustes, comentários, menus; estados de mídia e erro.
- Cartas: coleção, filtros, compose, privada, senha, dica, original, editar, programada, desbloqueio, erro e autorização ADM.
- Chat/chamadas: lista vazia, conversa, teclado, sticker, gravador, chamada ativa, chamada recebida, erro de mídia, fechar.
- Perfil/admin/configurações/músicas/notificações/share: modais, vazios, progresso, permissão, sucesso, erro, teclado e rolagem.
- Matriz visual obrigatória quando houver mudanças: 320/360/390/428/768/1024 px, temas claro/escuro e personalizados, reduced motion, teclado, safe areas e foco visível. Nenhuma célula está homologada neste diagnóstico.

## 7. Execução e evidências — sem alegações indevidas

| Verificação | Resultado real |
|---|---|
| Leitura do GitHub e DESIGN.md | EXECUTADA; fonte main@5daaa66ab86fa61f04c3ec2fffd6f6f3c54a01a2. |
| Árvore e HTMLs | EXECUTADA; 882 entradas, 24 páginas/encaminhamentos lidos, sem truncamento da árvore. |
| Leitura de módulos dinâmicos | EXECUTADA parcialmente; grupos principais lidos, inventário de seletores amostral. |
| Conferência do site público | PARCIAL: login.html respondeu com conteúdo legível; home.html retornou empty_content via extração sem sessão. Não comprova erro de runtime. |
| Screenshots atuais ANTES | NÃO OBTIDOS: conector HTML/CSS to Image informou 56/50 créditos utilizados e pediu upgrade pago; nenhuma cobrança/upgrade efetuado. Capturas históricas em docs não substituem captura atual. |
| Screenshots DEPOIS | NÃO SE APLICA, porque UI não foi alterada. |
| Teste real em dispositivo/teclado/permissões/320–1024 | NÃO EXECUTADO. |
| npm test e E2E | NÃO EXECUTADOS: ambiente local sem resolução DNS para github.com; fonte consultada via connector, não clonada para Node. Existem package.json e testes/*.test.mjs no repo; não declarar aprovados. |
| Status de CI associado à main observada | Nenhum status combinado e nenhum workflow PR retornado pela consulta: ausência de resultado NÃO equivale a aprovação. |
| Verificação do APK 3.0.4 | NÃO EXECUTADA: binário não fornecido nem validado por hash. |
| Modificações em lógica/CSS/JS/backend/SQL/Android | NENHUMA. Esta entrega altera apenas documentação nesta branch. |

## 8. Ferramentas avaliadas (uso comprovado vs. não acionado)

- GitHub conectado: consulta efetiva de repositório, branch HEAD, tree, arquivos, branches e checks; usado também para registrar este PR.
- 12ui Design: skill lida; sem geração, pois o alvo 001 é diagnóstico sem UI nova e seus fluxos podem exigir execução hospedada/créditos. Design system vigente prevalece.
- Product Design: skills de auditoria lidas; o workflow completo requer captura comprovada, inviável aqui sem browser com sessão/arquivos de screenshot; não declarar auditoria visual concluída.
- Frontend Design Premium, Engineering Suite Redesign, UI Consistency, Modern Web Guidance: instruções relevantes consultadas; avaliação metodológica, nenhuma transformação estética executada.
- HTML Code Generator: instrução de revisão consultada, sem ativar geração/refatoração. Web Design, BaselineLab, Themely, Figma, MagicPath, Context7: avaliados como ferramentas disponíveis, mas desnecessários ou impróprios para modificar/prototipar numa etapa de inventário read-only. Figma não recebeu arquivo criado nem alterado.
- HTML/CSS to Image API: TENTATIVA REAL de screenshot público, bloqueada por limite de créditos gratuitos excedido. Não houve pagamento.
- TinyFish: usado somente em fetch público sem login; nenhuma automação paga acionada.
- Testes: nomes de testes/workflows existentes conferidos no repositório; nenhuma execução E2E ou CI disparada por esta auditoria.

## 9. Próxima condição para sair de draft

1. Completar inventário linha a linha dos controles e handlers condicionalmente criados, com DOM real por permissão/papel e matriz por rota; comparar seletor JS/HTML/CSS.
2. Capturar screenshot atual de cada superfície e de cada estado alcançável com conta de teste sem dados privados; validar em navegador/Android sem editar APK, inclusive variação de viewport/tema.
3. Rodar npm test e testes visuais relacionados com ambiente de CI apropriado, documentar comandos, SHA e resultados; comparar diff de documentação e ausência de arquivos de código alterados.
4. Só então promover o PR à revisão, sem alegar homologação prematura; nenhum merge ou publicação de UI é justificado nesta rodada.

**Status deste documento: AUDITORIA ESTÁTICA PARCIAL / PR DRAFT / NÃO HOMOLOGADO.**
