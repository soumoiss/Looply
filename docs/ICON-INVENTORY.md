# Looply 3.0.1 — inventário de ícones e plano de validação

> Estado: auditoria inicial no commit 93201f7a3822e7a059abb296340fca3785139acb da branch main. Este documento não declara a padronização concluída. Cada item precisa passar por verificação de origem, visual e comportamento antes de ser marcado como validado.

## Escopo e baseline

- Repositório-alvo: https://github.com/soumoiss/Looply (dois “o” no nome).
- Commit-base inspecionado: https://github.com/soumoiss/Looply/commit/93201f7a3822e7a059abb296340fca3785139acb.
- Branch de trabalho: audit/icons8-stroke1-looply-3.0.1.
- Árvore do repositório: 194 entradas na resposta da API Git Tree; inclui páginas HTML, módulos ES, CSS, testes, workflows, migrations e app Android.
- Build: npm run build gera dist/ copiando páginas, src/ e assets/.
- Testes declarados: npm test executa build e os testes Node tests/foundation.test.mjs, tests/youtube-api.test.mjs e tests/chat-stability.test.mjs.
- A navegação compartilhada fica em src/page-runtime.js. Há SVGs inline fora desse módulo; trocar apenas a navegação não conclui a auditoria global.

## Origem e licença

- Catálogo exigido: https://icons8.com.br/icons/all--stroke-1
- Página de licença consultada: https://icons8.com.br/license
- A página de licença informa que uso gratuito em sites requer link para Icons8 nas páginas que usam os recursos (ou rodapé se forem a maioria) e recomenda créditos em Sobre/Configurações para aplicativos móveis. Confirmar a licença aplicável a cada ativo e modo de distribuição antes de publicar.
- Ainda não foi validada a URL de download de nenhum SVG individual Stroke 1. Portanto, este inventário não inventa URL de arquivo nem afirma que um ativo do Icons8 já foi integrado.
- Preferência técnica: SVG local, transparente, sem dependência de rede em tempo de execução; a cor deve respeitar o contraste do tema.

## Inventário inicial por página e componente

Legenda: Pendente = identificado por arquitetura/código, mas ainda não substituído e/ou não testado em navegador. A descrição do ícone atual não representa validação visual completa.

| Página/componente | Arquivos de referência | Funções/ícones | Atual/decisão | Origem/arquivo | Estado/evidência |
|---|---|---|---|---|---|
| Entrada/redirect | index.html | Marca e redirecionamento para login | Revisar marca | Pendente; sem ativo selecionado | Pendente; HTML inspecionado |
| Login | login.html, assets/css/login.css, src/login.js | Mostrar/ocultar senha; indicador de carregamento; marca | SVG inline de olho e carregamento; marca decorativa | Pendente; URLs individuais não validadas | Pendente; HTML inspecionado |
| Shell/navegação global | src/page-runtime.js, styles.css, assets/css/app.css | Início, Cartas, Músicas, Chat, Notificações; perfil, pessoas, configurações, administração; sair; contador de avisos | Mapa de SVG inline com chaves home, music, chat, profile, letters, notifications, users, settings e admin | Pendente; selecionar Stroke 1 após verificação individual | Pendente; módulo e markup inspecionados |
| Início/feed/stories | home.html, assets/js/home.js, src/social.js, src/stories.js, assets/css/pages/home.css | Curtir, comentar, compartilhar, criar/ver story, mídia, menus e estados vazios | Controles montados dinamicamente; inventário por função incompleto | Pendente | Pendente; arquivos identificados, sem teste visual |
| Cartas | cartas.html, assets/js/letters.js, src/letters-community.js, src/archived-cards.js, assets/css/pages/letters.css | Abrir, filtrar por data, marcar leitura, navegar e fechar modal | Há SVG inline de calendário em src/archived-cards.js | Pendente | Pendente; SVG encontrado via busca GitHub |
| Músicas | musicas.html, assets/js/music.js, src/music.js, src/youtube-playlist.js, assets/css/pages/music.css | Reproduzir, pausar, avançar, dedicatória, comentário, player/modal, busca e lista | Verificar símbolos textuais, botões e estados | Pendente | Pendente |
| Chat/lista de conversas | chat.html, assets/js/chat.js, src/chat.js, src/chat-enhancements.js, assets/css/pages/chat.css | Nova conversa, pesquisa, anexos, envio, áudio, reações, respostas e grupos | Inspecionar ícones dinâmicos preservando ações | Pendente | Pendente |
| Conversa individual/chamadas | conversa.html, assets/js/conversation.js, src/chat-calls.js | Voz, vídeo, microfone, câmera, encerrar, anexar e enviar | Os controles de chamada têm texto; voz/vídeo/microfone/câmera devem ser distintos | Pendente | Pendente; markup de modal inspecionado |
| Notificações | notificacoes.html, assets/js/notifications.js, assets/css/pages/notifications.css | Ler/não lida, abrir destino e estados vazios | Verificar controles | Pendente | Pendente |
| Pessoas | usuarios.html, assets/js/users.js, assets/css/pages/users.css | Buscar pessoas, abrir perfil e ações | Verificar controles | Pendente | Pendente |
| Perfil | perfil.html, assets/js/profile.js, src/profiles.js, assets/css/pages/profile.css | Avatar, editar, salvar, mídia e navegação | Verificar controles | Pendente | Pendente |
| Configurações | configuracoes.html, assets/js/settings.js, src/theme.js, assets/css/pages/settings.css | Tema, fonte, tamanho, salvar e sair | Verificar contraste claro/escuro | Pendente | Pendente |
| Administração | admin.html, assets/js/admin.js, src/admin.js, assets/css/pages/admin.css | Usuários, auditoria e ações administrativas | Verificar ícones e estados de autorização/erro | Pendente | Pendente |
| Arquivo/galeria legado | src/archive-import.js, src/archived-cards.js, docs/LEGACY_AUDIT.md | Mídia, filtros, calendário, comentários e modal | A árvore atual não contém galeria.html nem assets/js/gallery.js; não presumir que uma galeria separada esteja publicada | Pendente | Ausência confirmada na árvore |
| Workflows/build | .github/workflows/verify.yml, .github/workflows/github-pages.yml, scripts/build.mjs, vercel.json | Verificação, build e publicação | Validar que novo módulo entra no build | Não aplicável | Pendente; configuração identificada |
| App Android | android/app/src/main, android/README.md | Ícone launcher e WebView | Launcher usa recursos raster/XML; não misturar automaticamente com ícones web | Não aplicar pacote web automaticamente | Pendente |

## Mapeamento semântico a validar no Stroke 1

As funções abaixo exigem símbolos distintos. Nenhuma linha afirma que o ícone já foi selecionado ou baixado.

| Função | Nome semântico de busca | Página individual Icons8 | URL real do SVG | Alvo visual | Situação |
|---|---|---|---|---|---|
| Início | home / house | Pendente | Pendente | Traço preto em superfície clara; variante clara em superfície escura | Pendente |
| Cartas | mail / envelope | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Músicas | music / music note | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Chat | chat / message | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Notificações | bell | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Perfil | user / person | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Pessoas | users / people | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Configurações | settings / gear | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Administração | shield / shield check | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Telefone de voz | phone / phone call | Pendente | Pendente | Diferente da câmera | Pendente |
| Chamada de vídeo | video camera / video call | Pendente | Pendente | Diferente do telefone | Pendente |
| Microfone | microphone | Pendente | Pendente | Estado ligado/desligado acessível | Pendente |
| Alto-falante | speaker / volume | Pendente | Pendente | Estado mudo/ativo acessível | Pendente |
| Enviar mensagem | send / paper plane | Pendente | Pendente | Diferente de anexar | Pendente |
| Anexar arquivo | paperclip / attachment | Pendente | Pendente | Diferente de enviar | Pendente |
| Comentários | comment / message square | Pendente | Pendente | Ação clara e associação correta ao conteúdo | Pendente |
| Fechar modal | close / x | Pendente | Pendente | Área clicável e nome acessível | Pendente |
| Busca | search / magnifier | Pendente | Pendente | Linha, fundo transparente | Pendente |
| Calendário/filtro | calendar / filter | Pendente | Pendente | Símbolos distintos | Pendente |
| Reproduzir/pausar | play / pause | Pendente | Pendente | Estados e rótulos acessíveis | Pendente |
| Erro/carregamento/vazio | alert, loader, inbox | Pendente | Pendente | Estado não depende apenas da cor | Pendente |

## Critérios para marcar como implementado/validado

1. Abrir a página individual do ícone e confirmar que pertence à família Stroke 1.
2. Verificar a resposta do SVG, viewBox, transparência e traço; registrar URL exata do ativo.
3. Verificar licença e atribuição para a distribuição escolhida.
4. Salvar SVG aprovado localmente e registrar origem; evitar carregamento remoto em tempo de execução.
5. Integrar em módulo compartilhado compatível com ES modules sem trocar listeners, funções ou contratos.
6. Garantir nome acessível nos controles sem texto, SVG decorativo oculto de leitores de tela e foco visível.
7. Executar npm test; testar visualmente em celular e desktop; inspecionar console e rede.
8. Só marcar “Validado” com evidência específica. Teste estático, automatizado e manual no navegador devem ser relatados separadamente.

## Evidência e histórico

- Busca GitHub por SVG encontrou SVGs inline em src/page-runtime.js, login.html e src/archived-cards.js.
- src/page-runtime.js contém mapa central de ícones da navegação compartilhada; isso não prova que todos os ícones passam por ele.
- assets/css/app.css aplica dimensões comuns a SVGs de cabeçalho/navegação, mas a cor herda currentColor e variáveis roxas em alguns componentes. A regra final precisa respeitar superfícies claras e escuras.
- Nenhum teste de navegador ou dispositivo foi executado nesta auditoria inicial.
