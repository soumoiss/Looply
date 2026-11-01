# Looply — Auditoria visual inicial e contrato de preservação
Data: 2026-11-01. Escopo: somente frontend, branch ux/looply-visual-preservation-20261101.

## Baseline
Branch de origem main: ad77059f28e14ab6cdc9828e7324a8406fdf7186. A referência APK EXTRA 3.0.4 não foi fornecida como binário e sua equivalência com os registros de builds permanece não verificada. Não tocar no APK.
Existem ao menos dois artefatos documentados como 3.0.4: docs/LOOPLY_ANDROID_SIGNED_RELEASE_PROOF_20261030.md (source f67cab1, SHA256 3e3fcb...) e .github/workflows/publish-looply-signed-download.yml (source 54ec18f, SHA256 5d67de...). Nunca confundir esses hashes.

## Inventário inicial do código real
- Seis destinos primários: Início, Cartas, Músicas, Galeria, Chat, Avisos — src/primary-navigation.js; src/icons.js.
- home.html: feed, stories e composer; folhas home.css, stories-instagram.css, story-studio.css e outras camadas.
- galeria.html: grade, ações e overlays, gallery.css.
- cartas.html: coleção, escrita, leitura e programação; letters.css e scheduled-letters.css.
- musicas.html: playlists, player e dedicatórias; music.css.
- chat.html e conversa.html: lista e conversa; chat.css, conversation.css e camadas mobile.
- perfil.html: perfil e publicações; profile.css e profile-publications.css.
- admin.html: administração e importação de figurinhas; admin.css, com estilos inline que merecem auditoria.
- login.html, notificacoes.html, usuarios.html, configuracoes.html: incluir na próxima passagem de inventário.
- Estilos globais: styles.css, assets/css/app.css, assets/css/pages/shared.css, assets/css/theme-complete.css. Fontes Plus Jakarta Sans e Inter aparecem no código; não substituir sem evidência da referência.

## Diagnóstico preliminar baseado no código, não em screenshots
1. Múltiplas folhas CSS por página e overrides globais podem competir na cascata, criando divergências visuais.
2. Há estilos inline no painel ADM, dificultando consistência e temas.
3. A navegação já possui um componente central; refiná-lo deve preservar seis destinos, hrefs, aria-current e badge de notificações.
4. Ícones SVG já estão centralizados; não substituir indiscriminadamente por outra biblioteca.
5. O sistema de temas inclui lilás, noite, oceano, rosa e floresta; preservar todos.

## Contratos invariantes
Não modificar backend, Neon, Workers, R2, FCM, autenticação, APIs, endpoints, SQL, permissões, criptografia, envio, uploads, player, câmera, WebRTC, Android, APK, workflows ou lógica de negócio. Preservar IDs, classes referenciadas pelo JS, data-attributes, eventos, estrutura de navegação, conteúdo do usuário, ações e acessibilidade. Alterações futuras apenas HTML/CSS/SVG e JS estritamente de apresentação com prova de equivalência.

## Critérios de aceite por tela
Capturas ANTES/DEPOIS em 320, 360, 390, 428, 768 e 1024 px, temas relevantes, teclado e safe areas; checagem de console, foco, contraste, touch targets, scroll, modal, loading e estados de erro; comparar handlers e requests; testes automatizados existentes; revisar diff antes de qualquer merge. Não alegar testes executados sem evidência.

## Pendências
- Binário exato APK EXTRA e SHA256 conferido: NÃO VERIFICADO.
- Capturas autenticadas em aparelho/browser: NÃO EXECUTADAS.
- Testes responsivos e regressão: NÃO EXECUTADOS.
- Implementação de UI: NÃO INICIADA.
- Deploy/merge: NÃO REALIZADOS.

## Próxima sequência
1. Capturar baseline visual das telas e overlays, com contas de teste sem dados sensíveis.
2. Mapear dependências CSS e seletores JavaScript.
3. Propor ajustes mínimos em design tokens e navegação sem alteração de rotas.
4. Aplicar melhorias por tela, em commits isolados, com validação.
