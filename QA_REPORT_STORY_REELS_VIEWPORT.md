# QA — Correções de Stories (câmera 9:16) e Reels (visualização limpa)

Data: 27/10/2026. Escopo: apenas a Home e seus diálogos de câmera/visualização de Reels.

## Defeitos observados nas capturas
- Câmera mostrava recorte central pequeno/quadrado, com vídeo duplicado e desfocado acima e abaixo.
- Um Reel externo do Instagram era exibido como página completa incorporada, incluindo barra da conta e rodapé branco com estatísticas/links do provedor; controles de Reels do Looply ficavam sobrepostos.
- Os ícones de comentário, envio ao chat e compartilhamento externo eram ambíguos; havia botão de salvar que o usuário não deseja.

## Correções aplicadas
1. A prévia da câmera frontal e traseira usa `object-fit:cover` em toda a área da câmera. O segundo player desfocado não recebe mais a stream e fica oculto por CSS.
2. `cameraCoverCrop` calcula o recorte central sem esticar a imagem; a captura fotográfica e a gravação geradas pelo Canvas continuam em **1080×1920**, proporção **9:16**. O mesmo caminho `drawLiveFrame` serve ambos e a lente sobreposta. Um sensor 4:3 ou 1:1 inevitavelmente perde conteúdo nas bordas laterais para preencher 9:16 — sem barras desfocadas.
3. Visualizador fullscreen de Reels simplificado: mídia na altura do viewport, sem título duplicado de Reels; autor/legenda do post no rodapé compacto.
4. Controles laterais exatamente: curtir (coração), comentar (balão), compartilhar externamente (⇄, aciona o compartilhamento externo existente), enviar ao chat (avião de papel, aciona o compartilhamento interno existente). **Salvar removido somente do visualizador Reels**. Sem contadores inventados.
5. O iframe Instagram continua sendo **player oficial cross-origin**. Foi adicionado zoom/crop visual do iframe para ocultar a maior parte do cabeçalho e rodapé *internos*. Não existe API ou autorização para extrair o MP4 privado do Instagram, e não é possível garantir que o player oficial sempre se apresente como vídeo puro; pode variar conforme conteúdo/região/políticas do Instagram.
6. Instagram/TikTok/YouTube mantêm iframes oficiais; quando alternados, o iframe inativo perde `src` para reduzir reprodução simultânea de áudio. Nas incorporações, o swipe vertical funciona pelas laterais transparentes, mantendo a área central do player interativa.

## Validação
- Testes automatizados novos: `tests/story-reels-fullbleed-fix.test.mjs`, com crop de sensor quadrado/4:3/9:16, controles reais, CSS, áudio e gestos. Teste legado `tests/story-studio.test.mjs` atualizado para rejeitar letterboxing na captura ao vivo — a função separada `drawCover` para mídias importadas continua inalterada.
- Executar a suíte final do GitHub Actions, registrar sucesso antes de produção.
- **Ainda não houve teste de câmera física Android, reprodução real de vídeo remoto do Instagram nem gravação autenticada seguida de publicação no banco**. Testes de código não são evidência de funcionamento em hardware externo.

## Arquivos
`src/story-studio.js`, `src/home-hybrid-reels.js`, `assets/css/pages/story-reels-viewport-fix.css`, `home.html`, `tests/story-studio.test.mjs`, `tests/story-reels-fullbleed-fix.test.mjs` e este relatório.
