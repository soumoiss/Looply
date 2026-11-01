# Looply — Prompt 002: identidade e componentes compartilhados

**Data:** 2026-11-01  
**Baseline:** `main@5daaa66ab86fa61f04c3ec2fffd6f6f3c54a01a2`  
**Branch:** `ui/looply-304-002`  
**Escopo:** apresentação CSS e testes estáticos/visuais; nenhuma operação assíncrona ou lógica funcional alterada.

## Diagnóstico real
O projeto já possui um contrato em `DESIGN.md` e aliases `--looply-ds-*` definidos em `assets/css/app.css`. Antes desta etapa, `assets/css/theme-complete.css` já continha uma passagem inicial de acabamento UI; `assets/css/pages/shared.css` já continha a navegação de seis itens refinada no Prompt 03. Esta entrega **não recria a marca nem substitui tokens existentes**.

## Alterações propostas
1. Acrescentar aliases semânticos de geometria e movimento (altura confortável 48px, raio de controle/card/chip/dialog, curva de transição) baseados nos valores já existentes do produto, sem mudar nenhuma cor ou família tipográfica.
2. Refinar foco visível e pressed-state em botões reais; estilos derivados do tema ativo, com `[aria-disabled=true]` percebido como inativo, sem bloquear eventos.
3. Harmonizar chips/badges, contorno de cards da Home/Galeria/Avisos/Músicas e limites dos sheets existentes, sem mexer em carta de papel e nas mídias fullscreen.
4. Melhoria de legibilidade de mensagens auxiliares específicas pela mescla `muted/text` dos próprios temas, sem esconder `error/loading/empty`.
5. Em até 428px: permitir quebra dos botões de ações em diálogos selecionados, preservar áreas seguras e máximo de altura.
6. Respeitar `prefers-reduced-motion` nas interações tocadas.
7. Em `assets/css/pages/shared.css`, acabamento de conta/menu sem alterar a navegação canônica nem seus elementos; exclusão explícita `.page-letters` nas regras do pacote 002.

## Invariantes
Nenhuma modificação de arquivos `src/**`, `assets/js/**`, HTML, rotas, IDs, `data-*`, eventos, payloads, Neon/Auth, Cloudflare, R2, FCM, Android/Gradle ou APK. Câmera, Story Studio, papéis das Cartas, Reels, chamadas, chat composer e visualizadores escuros **não receberam regra de geometria global**. O tema permanece aplicado por `src/theme.js` e a tipografia pela preferência de perfil.

## Critérios de prova
- `tests/design-foundations-002.test.mjs` confere aliases, escopo, responsividade, reduced-motion e presença da folha nas principais rotas.
- O script de QA `scripts/check-primary-nav-visual.mjs` passou a carregar também `assets/css/theme-complete.css` no fixture Chromium e inspeciona a navegação em 320/360/390/428/768/1024 px. O script é apenas de teste; nenhum JavaScript executado em produção foi modificado.
- `npm test` e workflows de CI: aguardar resultado real de GitHub Actions, sem declarar aprovação antes da conclusão.
- Capturas do **fixture de navegação**, 320/360/390/428/768/1024: execução anterior de Chromium em GitHub Actions foi concluída e gerou artifact `looply-navigation-responsive-screenshots` (run 41346711752, referente a commit intermediário); nova execução com a folha final está condicionada ao workflow. Isso não substitui ANTES/DEPOIS de todas as superfícies autenticadas.
- Capturas reais comparativas do app autenticado, seus estados e teclado: **não executadas**. HTML/CSS to Image retornou limite de créditos grátis excedido na auditoria anterior. Não pagar nem fabricar provas.
- Equivalência APK EXTRA v3.0.4 ↔ SHA: **não verificada**.
- Se os testes automatizados falharem, **não mesclar**; preservar PR revisável.

## Ferramentas
- GitHub conectado: leitura de `main`, CSS, documentação, navegação e workflow; branch, commits, PR, revisão dos arquivos e checks.
- Modern Web Guidance, Frontend Design / Premium, UI Consistency e 12ui: instruções consultadas e avaliadas para preservar a marca e os estados. A ferramenta 12ui não foi acionada para gerar UI alternativa, pois este escopo exige lapidar superfícies reais com tokens já existentes.
- Figma, MagicPath, Product Design, Themely, BaselineLab, Context7, Web Design, Engineering Suite Redesign e HTML Code Generator: avaliados; nenhum projeto remoto/desenho/arquivo novo criado nesses serviços. HTML/CSS to Image: screenshot bloqueado por limite de créditos, sem cobrança.
- Pesquisa web técnica: norma WCAG 2.2 para foco e alvos; **não** houve busca de imagens, marcas ou estilos de referência.
