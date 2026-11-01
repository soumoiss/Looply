# Looply · PROMPT 003 — Ícones, emojis e semântica de controles

Data: 2026-11-01. Branch: `ui/looply-304-003`. Baseline: `main@2feb19bab1b15b0bdeb7def5f0497c7a0d722043`.

## Diagnóstico no código real

- `src/icons.js`: catálogo SVG monocromático, `viewBox=0 0 24 24`, `stroke-width=1.8`, `currentColor`, `aria-hidden` por padrão, com `label` opcional escapado; **preservado**.
- `src/primary-navigation.js`: seis destinos, contagem de avisos, rotas e estado `aria-current`; **sem alterações**.
- `src/page-runtime.js`: o menu 'Sair' duplicava um SVG inline fora do catálogo, e o aviso de manutenção usava glifo `⚙`.
- `src/story-studio.js`: controles acionáveis com rótulos `aria-label` exibiam glifos tipográficos em vez do SVG local; `data-studio-modal-close` não tinha nome acessível.
- `assets/js/gallery.js`: 'Recentes' exibía ícone `refresh`, embora o botão selecione mídias, não execute refresh.

## Implementação efetiva

| Área | Troca restrita à apresentação | Contrato preservado |
|---|---|---|
| Registro SVG | Três chaves `chevronDown`, `clock`, `logout` usando o mesmo traço, `currentColor` e sanitização. | Nenhuma chave, path ou API antiga removida |
| Menu de conta | SVG `logout` local substitui SVG inline duplicado. | `[data-sign-out]`, evento e `auth.signOut` mantidos |
| Manutenção | SVG `settings` substitui glifo visual solto. | `role=alertdialog`, título e condição de acesso inalterados |
| Story Studio câmera | SVGs para fechar, configurações, grade, opções, temporizador, galeria e inverter câmera. | Mesmo `data-*`, `aria-label`, proporção, modos, câmera e handlers |
| Story Studio edição | SVGs para voltar, editar texto, música, mais opções e fechar painel; `aria-label` no fechamento. | Mesma publicação, música, textos, audiência e overlays |
| Story Studio thumbs | Foto/vídeo apresentam ícones locais enquanto ainda não há thumbnail real. | Mesmo tipo de mídia, object URLs, validação e upload |
| Galeria | 'Recentes' usa `image`, semanticamente associado a fotos. | `data-main=recentes` e filtro original intactos |
| CSS | Baselines e dimensões fixas só para SVGs do menu, navegação e Studio. | Temas atuais, mídia fullscreen, Cartas e arte autoral preservados |

**Símbolos autorais não substituídos:** `Aa`, `∞`, flash estilizado, brilho dos efeitos, estrela de amigos próximos, elementos de câmera e emojis de conteúdos de usuário.

## Arquivos e limitações

Arquivos editados: `src/icons.js`, `src/page-runtime.js`, `src/story-studio.js`, `assets/js/gallery.js`, `assets/css/pages/shared.css`, `assets/css/pages/story-studio.css`, `assets/css/app.css`, `docs/icon-inventory.md`; adicionados `tests/prompt003-icon-semantics.test.mjs`, `scripts/check-icon-controls-visual.mjs`, `.github/workflows/icon-controls-visual.yml` e este relatório.

**Nenhum backend, SQL, Worker, R2, Neon Auth, FCM, serviço externo, Gradle ou APK editado.** Não há importação de biblioteca de ícones, alteração de fonte, cor, paleta, rota, `id`, nome de campo, evento ou operação assíncrona.

## Evidência e QA

- Teste estático: `node --test tests/prompt003-icon-semantics.test.mjs` (também incluído em `npm test`).
- Teste visual de Chromium: `node scripts/check-icon-controls-visual.mjs` via workflow `icon-controls-visual.yml`. Usa DOM derivado de `storyStudioMarkup` e `primaryNavigationMarkup`, CSS real, viewport 320/360/390/428/768/1024 px, checagem de SVG, nomes e geometria, produz capturas sem dados privados.
- Workflows de regressão já existentes: `Verify Looply`, `Stories Studio validation`, `Looply single navigation visual regression`, `Looply pull-to-refresh mobile gesture regression`.
- O teste visual usa **fixture público** com DOM real dos componentes, não uma sessão autenticada nem câmera ou upload funcionando no navegador. Comparação antes/depois de **todas** as superfícies condicionais, teclado real, permissões e APK: **não homologada**; não se deve alegar 100% de cobertura.
- A imagem de referência APK EXTRA 3.0.4 e o commit original correspondente não foram verificados por SHA do binário.
- Screenshots de navegação da fase anterior existem como artefatos GitHub Actions; screenshots deste escopo devem ser obtidas da execução do workflow antes de declarar a prova visual.
- Se alguma verificação estiver falha, não mesclar; manter PR para correção.

## Ferramentas avaliadas/acionadas

**Usadas:** GitHub conectado (arquivos, branches, commits, PR, CI e deploy), consulta do `DESIGN.md`, 12ui Design, Frontend Design/Premium, UI Consistency e Modern Web Guidance (instruções consultadas), testes do repositório e busca técnica W3C/MDN para semântica SVG (sem imagens de referência). **Não acionadas para desenho/protótipo:** Figma, MagicPath, Product Design, Engineering Suite Redesign, Web Design, Themely, BaselineLab, Context7 e geradores de HTML; não havia necessidade de nova identidade ou serviço externo. API HTML/CSS to Image já reportou falta de créditos gratuitos em etapa anterior; screenshots desta etapa foram encaminhados para GitHub Actions sem serviço pago.

## Merge e produção

Preencher SHA de merge, status dos jobs, links das capturas e prova de CSS/JS servido no GitHub Pages somente após sucesso efetivamente observado.
