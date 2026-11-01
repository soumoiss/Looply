# Prompt 02 — Design System Looply sem mudança de marca

**Data:** 2026-11-01  
**Repositório:** `soumoiss/Looply`  
**Referência auditada:** `main@521b4ed5e3520a9ce3f8e440af0a59c754cc6dab`  
**Branch de implementação isolada:** `ux/design-system-looply-20261101`  
**Escopo:** CSS semântico + documentação. **Nenhum backend, Android, APK ou JS alterado.**

## 1. Diagnóstico da fonte real

O Looply já tem design system implícito e não precisa de novas cores nem novo visual:

- `styles.css`: tokens de origem, cinco conjuntos estáticos de temas, componente geral histórico.
- `assets/css/app.css`: layout global atual e valores dos componentes, além dos tokens `--radius-sm/md/lg/xl`, `--shadow-sm/md/lg`, `--paper`, `--success`, `--danger`.
- `assets/css/pages/shared.css`: cabeçalho, seis destinos da navegação, menu de conta, safe areas.
- `assets/css/theme-complete.css`: camada carregada por último nas páginas autenticadas e responsável por compatibilizar páginas legadas com temas.
- `src/theme.js`: **10 temas nomeados + system**, com estilo salvo pela conta e personalizado por `font_family`/`font_size`. `src/theme-bootstrap.js` carrega os tokens antes do primeiro paint.
- `src/icons.js`: mapa único de SVGs, apoiando `src/primary-navigation.js`.
- Exceções intencionais: `assets/css/pages/letters.css`, `story-studio.css`, visualizadores de mídia e `share-external.css`.

**Risco preexistente:** camadas CSS concorrem por especificidade. No baseline inspecionado, Home possuía 145 ocorrências de `!important`, Galeria 194, Story Studio 59 e os refinamentos do visualizador 158. Esse dado **não comprova defeito na tela**, mas exige verificação de cascata antes de toda alteração.

## 2. Inventário de cor e superfície

| Papel | Token original | Base lilás (quando aplicável) | Alias criado |
|---|---|---|---|
| Ação primária | `--primary` | `#7010b0` | `--looply-ds-brand` |
| Ação pressionada | `--primary-dark` | `#5f1098` | `--looply-ds-brand-pressed` |
| Destaque profundo | `--primary-deep` | `#503090` | `--looply-ds-brand-emphasis` |
| Fundo | `--bg` | `#f5f0fa` | `--looply-ds-canvas` |
| Fundo secundário | `--bg-2` | `#f0e0f0` | `--looply-ds-canvas-subtle` |
| Card | `--surface` | `rgba(255,255,255,.94)` | `--looply-ds-surface` |
| Card elevado | `--surface-strong` | `#fff` | `--looply-ds-surface-raised` |
| Campo/subsuperfície | `--surface-soft` | `#faf7fc` | `--looply-ds-surface-recessed` |
| Texto | `--text` | `#29252f` | `--looply-ds-text` |
| Texto secundário | `--muted` | `#817b89` | `--looply-ds-text-secondary` |
| Linha | `--line` | `rgba(102,82,126,.12)` no app.css | `--looply-ds-stroke` |
| Sucesso | `--success` | `#35c878` | `--looply-ds-positive` |
| Erro | `--danger` | `#e63232` | `--looply-ds-negative` |
| Papel padrão | `--paper` | `#f4ebdd` | `--looply-ds-paper` |
| Tinta de papel | `--paper-text` | `#342f2a` | `--looply-ds-paper-ink` |

**Nota:** os valores são exemplares do tema lilás estático. Todos os aliases usam `var(--token-original)`, portanto acompanham os temas ativos aplicados em runtime e não congelam a paleta.

## 3. Tipografia, espaço, raios e elevação

**Famílias:** as fontes da marca (Cabin Sketch e Quillen) continuam em `assets/css/app.css`. As opções de perfil em `src/theme.js` incluem Inter/sistema, Arial, Georgia, rounded, Manrope, DM Sans, Plus Jakarta Sans, Space Grotesk, Nunito, Quicksand, Montserrat, Cormorant Garamond, Playfair Display, Fraunces, Caveat e Syne; não substituir nenhuma.

**Tamanho de texto armazenado por perfil:** small 14.4 px, normal 16 px, large 17.92 px, very_large 20 px. Introduzidos somente os aliases `--looply-ds-font-body` (aponta para `--looply-font-family`) e `--looply-ds-font-size-body` (para `--looply-root-font-size`); nenhum remapeamento da preferência.

| Papel | Escala existente | Alias |
|---|---|---|
| Espaçamento | 4, 8, 12, 16, 24, 32 px | `--looply-ds-space-1/2/3/4/6/8` |
| Radius sm/md/lg/xl | 14, 20, 28, 34 px | `--looply-ds-radius-sm/md/lg/xl` |
| Radius pill | 999 px | `--looply-ds-radius-pill` |
| Sombra leve | `0 8px 24px rgba(80,56,115,.07)` | `--looply-ds-elevation-low` |
| Sombra média | `0 18px 44px rgba(80,56,115,.12)` | `--looply-ds-elevation-mid` |
| Sombra alta | `0 30px 90px rgba(65,45,94,.20)` | `--looply-ds-elevation-high` |
| Mínimo botão | 44 px (já aplicado pelo refinamento anterior) | `--looply-ds-control-min-height` |
| Aba mobile | 54 px na implementação base | `--looply-ds-navigation-min-height` |
| Ícone base | 20 px | `--looply-ds-icon-base` |
| Foco visual | 3 px | `--looply-ds-focus-width` |
| Transição breve/padrão | 140/180 ms | `--looply-ds-motion-quick/standard` |

**Importante:** escalas são aliases de dimensões já identificadas no CSS, não regras globais que forçam outros componentes a mudar seu tamanho.

## 4. Temas de perfil: preservar todos

Temas reais em `src/theme.js`: `lilas`, `noite`, `oceano`, `rosa`, `floresta`, `aurora`, `coral`, `menta`, `sunset`, `grafite`; `system` segue preferência claro/escuro. Os temas, cores, persistência e aplicação em `src/theme.js`/`src/theme-bootstrap.js` **não foram modificados**.

### Amostra de contraste estático (texto primário de marca sobre superfície forte)

| Tema | Contraste `primary/surfaceStrong` | `muted/surfaceStrong` |
|---|---:|---:|
| lilas | 8.79:1 | 4.10:1 |
| noite | 4.62:1 | 8.18:1 |
| oceano | 4.39:1 | 4.59:1 |
| rosa | 4.78:1 | 4.35:1 |
| floresta | 5.23:1 | 4.10:1 |
| aurora | 5.56:1 | 4.55:1 |
| coral | 3.91:1 | 4.15:1 |
| menta | 4.84:1 | 4.15:1 |
| sunset | 3.50:1 | 4.02:1 |
| grafite | 7.31:1 | 7.47:1 |

Aritmética WCAG 2.2 para os valores hex do **código**, não captura de tela nem verificação do estado de cada componente. Pares menores que 4.5:1 podem falhar para texto de corpo normal; a exigência pode variar para texto grande e elementos não textuais. **Nenhuma cor foi alterada**, pois o usuário exigiu preservar a marca. Recomenda-se uma etapa de reparo de contraste específica, com aprovação prévia.

## 5. Mapa de tokens e exceções por tela

| Área/rota | Fonte de apresentação | Tokens base | Exceção preservada |
|---|---|---|---|
| `index.html` (splash) | `app.css`, `splash.css` | brand, canvas, text | entrada e animação originais |
| `login.html` | `app.css`, `login.css` | brand, superfície, contorno, foco | logo e tipografia originais |
| `home.html` | `home.css`, `home-hybrid.css`, `feed-reels-experience.css` | brand, surface, muted, line | proporção de mídia, reels em tela cheia |
| Stories em `home.html` e `chat.html` | `stories-instagram.css`, `story-studio.css`, `stories-viewer-engagement.css` | global fora da câmera | superfície preta própria, editor 9:16, overlays |
| `cartas.html` | `letters.css`, `scheduled-letters.css` | global fora do papel | `--letters-paper:#f5f1e9`; `--letters-ink:#171717`; `--letters-accent:#20b99a` |
| `musicas.html` | `music.css` | surface, text, muted, line | player 16:9 e embeds escuros |
| `galeria.html` | `gallery.css` | gallery-action ligado ao tema, surface | viewer escuro `--gallery-viewer-bg` |
| `chat.html` | `chat.css`, `chat-mobile-reference.css` | surface, brand, muted | stickers, voz, grupo, mensagens |
| `conversa.html` | `conversation.css`, `chat.css` | surface, text, line | teclado, scroll, composer, chamada |
| `perfil.html` | `profile.css`, `profile-publications.css` | brand, surface, radius | editor de avatar/crop e mídia |
| `usuarios.html` | `users.css` | surface, stroke, text | busca, resultados e mensagens reais |
| `notificacoes.html` | `notifications.css` | surface, muted, brand | não lidas, ações, feedback |
| `configuracoes.html` | `settings.css` | todos temas e tipografias | preferências por conta |
| `admin.html` | `admin.css` e subpainéis dinâmicos | surface, border, text | controle de acesso e logs |
| `share.html` | `share-external.css` standalone | tokens locais da página | jamais aplicar shell à força |

## 6. Mudanças desta etapa — antes/depois

1. **Antes:** componentes consultavam `--primary`, `--line`, `--surface-strong` e demais tokens diretamente; não existia contrato semântico único. **Depois:** `assets/css/app.css` oferece aliases `--looply-ds-*` para futuras telas, sem redefinir tokens anteriores.
2. **Antes:** cabeçalho, aba ativa e menu de conta consultavam diretamente esses mesmos tokens. **Depois:** `assets/css/pages/shared.css` usa aliases com fallback para o valor original. A cor calculada **deve ser equivalente**.
3. **Antes:** botões globais com 44 px e foco de 3 px no refinamento anterior. **Depois:** `assets/css/theme-complete.css` consulta aliases para esses mesmos valores, sem alterar handlers, dimensões pretendidas ou estados.
4. **Depois:** `DESIGN.md` registra critérios de marca, tokens, exceções e QA para próximos prompts.

Todos os arquivos CSS preexistentes foram preservados; não há substituição de cores, fontes, rotas ou eventos. Esta rodada foi planejada para **equivalência visual**: não reivindica redesenho nem diferença estética substancial.

## 7. Capturas de referência e verificações

Seis capturas da página pública `login.html` na `main` foram produzidas. **Não são capturas de telas autenticadas e não são screenshots pós-deploy da branch**:

- 320 px: https://hcti.io/v1/image/01a1985c-b8e2-7caa-9989-885f1a353cfd.png
- 360 px: https://hcti.io/v1/image/01a1985c-c12c-7f99-90f0-d7bb6dd8a415.png
- 390 px: https://hcti.io/v1/image/01a1985c-ca4a-7126-94a4-9dcf7e1844ec.png
- 428 px: https://hcti.io/v1/image/01a1985c-d2c0-7781-b0f1-a0f9c1060c75.png
- 768 px: https://hcti.io/v1/image/01a1985c-db33-7924-a790-a7aa2992d015.png
- 1024 px: https://hcti.io/v1/image/01a1985c-e400-7d6e-9bc0-bb64f5320168.png

Pendências a registrar como **NÃO VERIFICADAS**: capturas pós-alteração em ambiente da branch; todos os estados autenticados; toque/teclado/safe area no Android WebView real; verificação do binário APK EXTRA 3.0.4; todas as combinações de preferências; screenshots comparativos reais antes/depois do app instalado.

## 8. Testes, risco, rollback, entrega

**Revisão de escopo:** comparar branch `ux/design-system-looply-20261101` com o SHA de origem. Mudanças permitidas exclusivamente em `assets/css/app.css`, `assets/css/pages/shared.css`, `assets/css/theme-complete.css` e documentação (`DESIGN.md`, este relatório). Nenhum arquivo em `src/` deve ser alterado.

**Testes estáticos:** validar chaves CSS balanceadas, aliases referenciando propriedades já existentes, sem IDs/data-attributes/JS editados. Validar via CI `npm test` se possível antes do merge, não confundir testes automatizados com E2E.

**Riscos:** colisões de cascata futura, contraste insuficiente em alguns temas preexistentes, e screenshot de experiência autenticada ausente. Documentação não altera nenhum contrato de armazenamento/privacidade.

**Rollback:** branch isolada; remover os commits desta etapa para restaurar a `main` original. O CSS novo não substitui referências legadas; se eventualmente mesclado, reverter o commit de merge ou PR preservando o histórico.

**Estado de entrega:** branch criada e mudanças preparadas; **sem merge/deploy nesta etapa**. O APK EXTRA v3.0.4 e o backend Neon/Cloudflare/FCM permaneceram intocados. A equivalência exata entre APK 3.0.4 e fonte ainda depende do binário original e seu SHA-256.

### Ferramentas usadas e limites

- GitHub conectado: leitura dos arquivos reais, escrita na branch isolada, diffs/CI.
- Skills de 12ui, frontend-design/premium, redesign, ui-consistency, HTML/CSS e Web Design consultadas como diretrizes; os requisitos de preservação do usuário prevalecem.
- Renderização HTML/CSS to Image: capturas públicas do login. **12ui CLI não disponível neste ambiente** (`npx --no-install` não inicializou); nenhum resultado fictício de prototipagem. Figma/MagicPath não foram acionados; não há necessidade de criar protótipo de outra identidade.
- Infraestrutura e dados: nenhuma mutação; não houve consulta necessária a Neon, Supabase, R2, Cloudflare, Vercel ou FCM.
