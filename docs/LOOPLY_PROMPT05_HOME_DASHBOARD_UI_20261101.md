# Looply — Prompt 05: Início e dashboard social (somente apresentação)

**Data:** 2026-11-01. **Branch isolada:** `ux/home-dashboard-looply-20261101`.
**Baseline:** `main@521b4ed5e3520a9ce3f8e440af0a59c754cc6dab`.
**APK EXTRA 3.0.4:** referência externa intocável; a associação exata com SHA do código não foi comprovada por binário.

## 1. Inspeção do código original

- `home.html`: contêiner autenticado `#pageContent`, um cabeçalho global `[data-site-header]` e folhas CSS de Home, Stories, Feed/Reels e temas.
- `assets/js/home.js`: importa e chama `renderWelcome`, `renderGlobalHomeSettings`, `storiesMarkup`, `socialMarkup`, `bindStories`, `bindSocialEvents`, `bindHomeProfilePreview`, `bindHomeCommentsSheet`. A árvore visual real é acolhida → banner global e música do dia (se habilitados) → Stories → Feed.
- `src/stories.js`: `storiesMarkup` monta `[data-story-create-open]`, `[data-story-list]`, status e visualizador/editor. Os estados de Stories vazios e erro não podem ser apagados.
- `src/social.js`: `socialMarkup` monta `.social-heading` e `[data-realtime-status]`, `form[data-social-post]` e controles `[data-toggle-composer]`/`[data-composer-fields]`, posts `[data-social-feed]`, interações e avisos. `feedMarkup` distingue conteúdo, erro e vazio.
- `src/page-runtime.js`/`src/primary-navigation.js`: sessão, cabeçalho e seis destinos reais, intocados.
- `assets/css/pages/home-hybrid.css` é carregado depois de `home.css` e `feed-reels-experience.css`, mas antes de `theme-complete.css`. Especificidade e ordem importam.

## 2. Diagnóstico antes

| Zona | Problema confirmado pelo código | Decisão |
|---|---|---|
| Acolhida `.home-welcome` | Foto `.home-welcome-avatar img` ocultada por `display:none`, apesar de `renderWelcome` adicioná-la quando disponível | Exibir a foto real já fornecida pelo JS, com `object-fit:cover` e fallback existente |
| Acolhida `.home-welcome-copy p` | Texto explicativo genérico “Feed conectado com atualizações ao vivo” | Ocultar somente este parágrafo visual; status de realtime real fica intacto |
| Stories `.story-area` | Espaçamento e altura de ação relativamente altos em sequência com acolhida | Compactar, manter linha rolável e `data-story-create-open` |
| Compositor `.post-composer-heading` | Altura de 73px, botão novo post 37px | Reduzir densidade e tornar o botão 44px |
| Feed `.social-area` | `padding-bottom:90px` somado ao `padding-bottom` de `.page-content` (90px + safe area) | Retirar somente o excesso interno da área social |
| Feed heading | “Publicações” sobre “Feed” | Ocultar somente o kicker redundante, manter `h2` e status de realtime |
| Feed cards | Botões de interação com alvos mínimos de 37px | Estabelecer mínimo 44px nos botões existentes sem mexer no player, mídia ou likes |

**Outros riscos preexistentes:** muitas sobreposições CSS com `!important`; diferentes larguras entre Feed e Home; mídia responsiva complexa em Reels/Story; modais e janela do teclado. Não afirmar defeito visual sem inspeção real.

## 3. Implementação (diff)

**Um único CSS:** `assets/css/pages/home-hybrid.css` (acréscimo ao final, sem editar as regras anteriores).

Mudanças: reduz espaçamento de Home, acolhida e Stories; revela o avatar já carregado pelo JS; melhora alvos de toque do perfil, “Adicionar story”, “Nova publicação” e ações de post; preserva rótulos operacionais, reduz redundância visual; corrige o padding acumulado no fim do Feed; adiciona foco visível e `prefers-reduced-motion`.

**NÃO ALTERADOS:** `home.html`, `assets/js/home.js`, todos os `src/*.js`, navegação global, URLs, IDs, `data-*`, ACL, tema, cores, tipografia e todas as APIs. Nenhum contrato de mídia, câmera, chamada, player, carregamento, publicação, paginação, presença ou realtime foi modificado.

A escala e as cores continuam vindo dos tokens originais (`--primary`, `--line`, `--surface`, `--text`). O HTML e os controles seguem a interface do Looply.

## 4. Capturas técnicas antes/depois

**Limite crítico:** telas Home autenticadas não puderam ser acessadas neste contexto sem credenciais. Estas imagens foram geradas com **uma fixture offline ilustrativa**, usando classes e componentes baseados no markup JS real e as folhas CSS de `main`. A fixture apresenta conteúdo vazio, não substitui integrações, não foi publicada e não representa a conta de nenhum usuário. Os screenshots **não demonstram comportamento real de feed, Stories ou backend**.

| Largura | Antes | Depois (CSS da branch) |
|---:|---|---|
| 320 | https://hcti.io/v1/image/01a1988a-27d7-75af-bfd7-dc764b4f0b6d.png | https://hcti.io/v1/image/01a1988a-31cb-764d-814d-bcd2a4468a71.png |
| 390 | https://hcti.io/v1/image/01a1988a-3e66-7e41-a0a9-f5378a76effc.png | https://hcti.io/v1/image/01a1988a-48c0-7a3d-a6a0-dd7d3db05730.png |
| 768 | https://hcti.io/v1/image/01a1988a-53ed-7548-99fa-a497a33f9b04.png | https://hcti.io/v1/image/01a1988a-5e37-7a32-a806-3026175797cc.png |
| 1024 | Não capturado antes | https://hcti.io/v1/image/01a1988a-66e7-737b-a211-f196776b749e.png |

**Ainda não verificado:** 360/428px com screenshots, tema noite em fixture, scroll e teclado Android, mídia real e longa, story publicado, todos os estados carregando/erro/vazio/sucesso sob backend, teste E2E autenticado, retorno de abas e revisão independente por outro agente. Os testes estáticos do GitHub não substituem esses cenários.

## 5. Ferramentas e limites

Foi feito inventário dos conectores e skills da sessão. GitHub foi usado para consultar e alterar apenas a branch; frontend-design, frontend-design-premium, redesign e UI Consistency foram consultados como práticas, sempre subordinados ao design original. Capturas usam HTML/CSS to Image. **12ui CLI:** tentativa de instalação `npx -y @12ui/design cli install` excedeu limite local sem instalar a ferramenta; `improve` não foi executado, nem gerou proposta. Ferramentas de prototipagem externas e infraestrutura não foram usadas, pois não melhorariam a inspeção do código original. Nenhuma alteração nos servidores.

## 6. Testes e reversão

O diff deve ser comparado com `main@521b4ed5`: apenas `assets/css/pages/home-hybrid.css` e este documento. A branch não deve ser mesclada automaticamente.

- Revisões estáticas: regras CSS balanceadas, nenhuma remoção de `data-*`, id, callback, import ou API; nenhum JS/HTML modificado.
- CI: verificar execução dos workflows associados ao PR e registrar sua conclusão.
- Antes de autorizar merge, verificar visualmente em sessão real e 320/360/390/428/768/1024px, temas claro/escuro, teclado/safe areas, estados sem conteúdo e com conteúdo e navegação entre abas. Nenhum desses testes pode ser presumido a partir das fixtures.

**Rollback:** eliminar/reverter o commit CSS da branch. A `main` permanece intacta até merge explícito. O APK 3.0.4 e o backend Neon/Cloudflare/R2/FCM permaneceram intocados nesta etapa.


## 7. Capturas adicionais (segunda série de fixtures)

Para complementar a matriz de seis resoluções, foram renderizadas fixtures *antes/depois* com CSS de origem e CSS da branch:

| Largura | Antes | Depois |
|---:|---|---|
| 360 | https://hcti.io/v1/image/01a1988c-3b53-79e9-869e-1d912b2b635d.png | https://hcti.io/v1/image/01a1988c-4647-71b1-9808-952e40d72b85.png |
| 428 | https://hcti.io/v1/image/01a1988c-52b5-76da-a982-d47ff0192bf8.png | https://hcti.io/v1/image/01a1988c-5c85-7f92-8805-77b130b34a7b.png |
| 1024 | https://hcti.io/v1/image/01a1988c-7a52-7d84-a5b5-f44a4355ea8e.png | https://hcti.io/v1/image/01a1988a-66e7-737b-a211-f196776b749e.png |
| 390 / noturno simulado | https://hcti.io/v1/image/01a1988c-663c-7ce2-9789-2ea443a9e056.png | https://hcti.io/v1/image/01a1988c-6fee-7d07-a618-6c6042be4188.png |

**Limite da segunda série:** usa fixture equivalente, com simplificação dos blocos de conta, sem autenticação. A série de 320/390/768 usa fixture técnica mais completa, também não autenticada. As diferenças entre fixtures impedem comparação cruzada de valores de pixels e não devem ser tratadas como equivalência pixel-perfect. O tema noturno é simulado pelos valores reais dos tokens de `src/theme.js`, não por uma sessão autenticada. O inventário das larguras agora contém todos os tamanhos solicitados, mas testes reais de interação, viewport com teclado, vídeos e feed povoado continuam **não verificados**.
