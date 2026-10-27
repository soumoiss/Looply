# QA — Feed e Reels Looply — 27/10/2026

## Escopo implementado nesta alteração
- Interface mobile-first adaptada das capturas enviadas, mantendo variáveis `--primary`, `--surface`, `--line` e demais cores do tema Looply.
- Feed real de `posts` e `post_media`, sem dados ou métricas fictícias.
- Cards com foto/vídeo em destaque; imagens quadradas, verticais ou panorâmicas conforme dimensões reais; vídeos 4:5 no feed.
- Carrossel horizontal limitado à mídia de uma mesma postagem, com indicadores vinculados à posição de rolagem; página sem rolagem horizontal intencional.
- Composer de publicação aberto pelo botão `+`, com prévia local de imagem/vídeo, galeria explícita, legenda e visibilidade pública/privada/selecionada.
- Publicação ainda usa o fluxo autenticado existente: RPCs `v5_create_post`, `v5_attach_post_media`, upload pela API de Storage Neon/Cloudflare, comentários, salvamento e curtidas persistentes.
- Links válidos em texto de publicação podem ser identificados; YouTube, Instagram e TikTok usam players oficiais suportados.
- Reels viewer com `scroll-snap-type:y mandatory`, vídeos reais, um áudio ativo por vez, botão de áudio, controles de coração, comentário, compartilhar, salvar, fechar e liberação de fontes ao sair.
- Navegação inferior responsiva para páginas reais do Looply.
- `src/reels-scroll.js` carregado sob demanda; fallback para visualizador preexistente.

## Verificações
- `Verify Looply` no GitHub Actions da branch: passou nos commits 749f5786, d9bbc34f, f861cf0c, 0bdaf17c e anteriores.
- Incluídos **21 testes de contrato automatizados** em `tests/feed-reels-experience.test.mjs`, incorporados ao `node --test tests/*.test.mjs` da verificação.
- Banco Neon vinculado ao app, consulta somente leitura de 27/10/2026: 23 posts, 0 mídias em `post_media`, 16 comentários, 20 curtidas, 0 salvos e 2 RPCs de criação/anexação de publicação instalados. Esses números são uma observação pontual, NÃO uma prova de upload bem-sucedido.

## Não verificado / riscos remanescentes
- **Nenhuma publicação autenticada de foto/vídeo seguida de exclusão foi executada**: sem sessão de usuário com permissão no navegador, não se pode declarar upload R2 e exibição final validados.
- **Não foram produzidos 20 prints reais ou 20 testes visuais PASS**. Testes de contrato e build não substituem testes com arquivo real em Android/iOS.
- Instagram/TikTok podem impedir reprodução por restrições externas. Não há extração de MP4 por scraping ou bypass; embutir via player oficial não garante disponibilidade.
- `post_media` vazia exige diagnóstico do fluxo do primeiro upload real: conferir autorização, URL assinada, solicitação PUT, CORS R2, `v5_attach_post_media`, políticas e formato do navegador.
- Botões `Seguir` e repostagem com contagem própria não foram inventados sem contrato de backend, portanto não constam como implementados.
- Suporte a múltiplos uploads no composer mantém o limite REAL de 8 arquivos de até 25 MB cada e o estado de erros preexistente.
- Testes end-to-end de sessão persistente, UX, orientação e áudio em dispositivo físico permanecem necessários.

## Arquivos
`home.html`, `src/social.js`, `src/reels-scroll.js`, `assets/css/pages/feed-reels-experience.css`, `tests/feed-reels-experience.test.mjs` e este relatório.
