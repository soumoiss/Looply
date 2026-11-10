# Início e Reels — entrega técnica (10/11/2026)

## Escopo e status
Branch: `feat/home-reels-novo-visual`. Referência visual: anexo
`looply-inicio-reels-premium-v3.html`. Não publicar em produção antes de
aplicar a migração e executar homologação com sessão autenticada.

Arquivos criados: `assets/css/pages/home-reels.css`, `src/home-reels-premium.js`,
`migration/20261110_home_reels_premium.sql`,
`tests/home-reels-premium.test.mjs`, este documento.

Arquivos alterados: `home.html`, `reels.html`, `assets/js/home.js`,
`assets/js/reels.js`, `src/home-hybrid-reels.js`, `DESIGN.md`,
`scripts/build.mjs`, `sw.js`, testes de regressão e workflows visuais.

Arquivos apagados: **nenhum**. As ligações para CSS exclusivo abandonado
foram removidas das páginas. Para excluir fisicamente CSS antigo do repositório,
ainda é obrigatório conferir `grep -R` em checkout completo e analisar
importações cruzadas; não apagar dependências compartilhadas sem prova.

## Inventário de funções existentes × nova apresentação

| Função original | Integração mantida no novo visual |
|---|---|
| Login/sessão/autorização Neon | `mountAppPage` → `src/page-runtime.js` |
| Perfil, foto, saudação | `renderWelcome(profile)` → `#hello .hero-panel` |
| Cabeçalho, notificações e menu de temas | `[data-site-header]` e `src/primary-navigation.js` |
| Barra inferior com seis destinos | `primaryNavigationMarkup` e CSS premium |
| Why Now: câmera/editor/visualização, reações e respostas | `mountWhyNowStories` e `src/why-now-integration.js` |
| Música do dia | `app_settings` → `[data-global-music]` → `.premium-music` |
| Recado secreto | `src/secret-messages.js`; indicador limitado a registro não lido |
| Criar post, validar audiência, mídia e publicar | `data-social-post`, `src/social.js` |
| Feed nativo e Reels externos | `loadSocialData(client, "native"/"external")` |
| Curtir e reações por usuário | `v13_set_post_reaction` → coração/reação |
| Lista de quem curtiu | `v13_post_engagement_page` → `.premium-sheet` |
| Seguir/deixar de seguir | `v11_set_follow` com atualização otimista |
| Salvar e remover dos salvos | `v13_set_post_saved` |
| Comentários, respostas, curtidas e edição | `bindSocialEvents` e `bindHomeCommentsSheet` |
| Compartilhamento externo e chat | `data-share-post` / `data-share-in-app` |
| Editar e excluir publicação | `data-edit-post` / `data-delete-post` |
| Reprodução, iframe oficial, swipe, preload | `src/home-hybrid-reels.js` com CSS da nova página |
| Reels: curtir duplo toque, progresso real, áudio, salvar | `src/home-reels-premium.js` |
| Realtime e puxar para atualizar | `setupSocialRealtime` e runtime compartilhado |
| Busca/filtros/lista/grade/topo | `mountPremiumSurface` |
| Tema e fontes | `src/theme.js`, `src/theme-bootstrap.js` e tokens |
| Cache de assets | `sw.js` v49 e build com hash de conteúdo |

## Como aplicar banco

Em ambiente Neon de homologação, **revisar esquema e permissões** antes:
```sh
psql "$NEON_DATABASE_URL" -v ON_ERROR_STOP=1 -f migration/20261110_home_reels_premium.sql
```
A variável de conexão é definida no ambiente seguro, jamais em
`config.js` ou no navegador. Depois, verificar execução de
`v13_post_engagement_page`, `v13_set_post_reaction` e
`v13_set_post_saved` para dois usuários autorizados e um bloqueado. A
migração não foi aplicada automaticamente. Não reverter apagando dados
de produção. A reversão, se autorizada, exige planejamento específico
para preservar reações e itens salvos criados após implantação.

## Validação exigida antes de mesclar

- `npm test` num checkout completo **antes e depois** da migração.
- Playwright 320/360/390/428/768/1024 px, claro e escuro.
- Capturas Modelo × sessão REAL no feed e Reels e comparação de dimensões.
- Banco real: bloqueios, público selecionado, follows, reações e salvos.
- Reprodução iOS/Android, teclado virtual e cache anterior.
- Todas as pendências sem execução devem constar como **NÃO VERIFICADO**.

O arquivo HTML do modelo não foi versionado no código de produção,
pois contém pessoas, posts e contadores fictícios que não devem ser distribuídos.
