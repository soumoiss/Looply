# DESIGN.md — Looply (contrato visual de preservação)

> Data: 2026-11-01. Origem: `soumoiss/Looply`, baseline `521b4ed5e3520a9ce3f8e440af0a59c754cc6dab`. Documento do Prompt 02.

## Identidade, direção e proibições

O produto é **Looply**: rede social privada orientada a vínculos, cartas, músicas, galerias e conversas. A direção visual é o **mesmo Looply**, com acabamento coerente, responsivo e acessível; jamais uma marca substituta, retematização ou framework novo.

1. Preservar a logo, SVGs de `src/icons.js`, marca estilizada com Cabin Sketch/Quillen e os estilos tipográficos que já existem.
2. Preservar o lilás, roxo e branco do padrão original: `--primary: #7010b0`, `--bg: #f5f0fa`, `--surface-strong: #fff`.
3. Preservar **todos** os temas efetivos definidos em `src/theme.js`: lilas, noite, oceano, rosa, floresta, aurora, coral, menta, sunset, grafite e opção system. A personalização `font_family` e `font_size` é funcional, não decorativa.
4. Preservar exceções autorais: papel/ink das Cartas (`--letters-paper`, `--letters-ink`, `--letters-accent`), canvas escuro dos visualizadores de fotos/vídeos e Story Studio, e a tela standalone de compartilhamento.
5. CSS/HTML/SVG de apresentação são o único escopo de trabalho. Não tocar em handlers, IDs, data-attributes, auth, Neon, Cloudflare, FCM, armazenamento, chamadas, criptografia, APK Android ou rotas.

## Fonte de verdade, cascata e aliases

- `styles.css`: variáveis históricas e estilos globais; não reescrever.
- `assets/css/app.css`: tokens básicos atuais (`--primary`, `--surface`, `--radius-sm`…`--shadow-lg`), layout, tipografia e componentes. Aqui ficam os aliases `--looply-ds-*`.
- `assets/css/pages/shared.css`: cabeçalho, navegação de seis destinos, conta, feedback compartilhado e safe areas.
- `assets/css/theme-complete.css`: último nível visual por página, mantém compatibilidade com os componentes existentes.
- `src/theme.js` / `src/theme-bootstrap.js`: aplicam tokens do tema e preferências da conta. **Nunca substituir por CSS fixo**.
- `src/primary-navigation.js`: seis abas canônicas, hrefs, acessibilidade e contagem de avisos intactos.
- `src/icons.js`: biblioteca existente dos SVGs; manter alinhamento e semântica de cada ícone.

Semântica disponível em `app.css`: `--looply-ds-brand`, `-canvas`, `-surface-raised`, `-text-secondary`, `-stroke`, `-radius-*`, `-elevation-*`, `-space-*`, `-control-min-height`, `-focus-width`, `-motion-*`, `-font-body`. **São aliases**: não introduzem outra paleta nem invalidam os tokens originais.

## Heurísticas de acabamento

- Ações primárias: usar `--primary` do tema e componentes que já existem; não trocar texto por ícones sem alternativa acessível.
- Hierarquia: título > subtítulo > corpo > legenda; aproveitar `font_family` e `font_size` do perfil; manter as tipografias específicas de cartas e marca.
- Espaçamento: reutilizar padrões constatados de 4/8/12/16/24/32 px, sem impor valores indiscriminadamente nas páginas.
- Superfícies: `--surface-strong` para elevada; `--surface` para cards; `--surface-soft` para insumos discretos; `--line` para separadores.
- Raio: usar os existentes 14/20/28/34 px (`--radius-sm/md/lg/xl`), sem apagar exceções funcionais.
- Microinterações: duração curta, somente transformações e cores visuais; respeitar `prefers-reduced-motion`.
- Campos e controles: alvos de toque de pelo menos 44 px quando a geometria permitir, foco visível de 3 px; não alterar keyboard, drag, gestos nem handlers.
- Estados: loading/erro/vazio/sucesso são funcionais; não simular progresso ou ocultar erro verdadeiro.
- Em viewport estreita, preservar teclado, barra de navegação, status bar, `safe-area-inset-*` e scroll específico de câmera/chat.

## Exceções que não devem ser uniformizadas

Cartas: papel `#f5f1e9`, tinta `#171717` e acento interno `#20b99a` na folha `letters.css`. Galeria e Feed: visualizar mídia escura sem clareamento ou corte novo. Stories: editor 9:16 com gestos e ferramentas próprias; viewer com progresso e ações sobre a imagem. Reels: mídia em fullscreen. Chat: composer ancorado ao teclado e modal de chamada. `share.html`: folha isolada `share-external.css`, sem dependência forçada do shell.

## Regras de revisão e QA

- Qualquer diferença de código deve ser pequena, reversível e restrita a CSS/HTML/SVG de apresentação.
- Antes/depois: 320, 360, 390, 428, 768, 1024 px; temas claros e escuros, teclado e safe areas; registrar limitações.
- Confirmar foco visível, contraste, ordem tab, estados carregando/erro, vazios, modais, scroll e responsividade; auditoria estática não prova E2E.
- Testar `npm test` e workflows relevantes antes de mesclar; screenshots e testes reais não executados devem constar como **não verificados**.
- Contraste observado na paleta preexistente: alguns pares `muted/surfaceStrong` não atingem 4.5:1; **não trocar cores unilateralmente**. Ver relatório técnico específico.
- O APK EXTRA 3.0.4 é intocável e sua correspondência exata com o SHA do código permanece sem confirmação criptográfica do binário.
