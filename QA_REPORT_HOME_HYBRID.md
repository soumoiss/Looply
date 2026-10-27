# QA — Home híbrida do Looply — 27/10/2026

## Fonte visual
Arquivo fornecido pelo usuário: `Loooply & Instagram Hybrid Experience (1).html` (927 linhas).
A estrutura Home da referência foi aplicada sobre os dados reais do Looply **sem copiar dados fictícios**, sem substituir o cabeçalho global e sem alterar as páginas das demais abas.

## Entregue nesta revisão
- Boas-vindas "Bem-vindo, [nome real]", tipografia Plus Jakarta Sans e botão "Meu perfil" para `perfil.html`.
- Header real do Looply preservado. Na Home, tocar no próprio avatar abre modal de prévia do perfil sem substituir seu markup global.
- Cartão de prévia do perfil: avatar/nome/username/bio do banco Neon, total de posts por consulta contada ao banco com RLS.
- Contadores de seguidores e seguindo honestamente indisponíveis: **o banco atual não tem tabela/relacionamento de follows**. Sem números inventados; botão "Seguir · em breve" desabilitado para terceiros.
- Cartão branco/lilás de Stories com botão "Adicionar story", avatar com anel degradê, contagem de stories reais, editor e visualizador de stories funcionais existentes preservados; estilo imersivo atualizado.
- Feed em cartões arredondados, cabeçalho de autor clicável, selo de visibilidade, player destacado, legenda, botão curtir, salvar, compartilhar, enviar no Looply e responder em particular, todos com integração de eventos existente.
- Previsão Instagram/TikTok/YouTube continua baseada em iframe oficial; botão "Assistir em Reels" abre visualizador 9:16, com scroll vertical e teardown da mídia inativa. Limites técnicos ou de direitos das plataformas não são contornados.
- O compositor de nova publicação existente foi adaptado visualmente em modal de cartão, mantendo a seleção de fotos e vídeos reais, prévia, legenda, link externo, privacidade, upload autenticado e inserção via RPC Neon.
- Comentários abertos em painel inferior: o formulário e a lista reais são movidos temporariamente para o diálogo, preservando eventos e persistência, sem simular sucesso.
- Rodapé da Home com as seis abas da referência: Início, Cartas, Músicas, Galeria, Chat e Avisos (links reais).

## Testes automatizados
- Suite `npm test`, que inclui `tests/home-hybrid-design.test.mjs` e `tests/feed-reels-experience.test.mjs`, além dos testes existentes. Última verificação GitHub Actions: **443 PASS / 0 FAIL** antes da incorporação final dos últimos ajustes de tipografia.
- Verificar o status do workflow do commit final e do deploy antes de declarar produção atualizada.

## Pendências para 100% end-to-end
- A conta não foi autenticada via navegador real para publicar foto/vídeo e excluí-los após confirmação. O relatório anterior já constatou 0 registros em `post_media` no banco conectado; upload efetivo segue sem comprovação.
- A tabela de follows ainda não existe e foi explicitamente deixada para fase futura pelo usuário. O perfil não mostra contagens inventadas.
- Os iframes de Instagram/TikTok só abrem quando os fornecedores permitem. Não há bypass ou cópia de vídeos; em caso de bloqueio, o player pode ficar indisponível.
- Não foram capturadas evidências visuais de 320px, Android e iPhone autenticados. Testes de código não substituem essas verificações.
- A versão anexada usava exemplos, imagens ilustrativas, ações simuladas e contagens fictícias; os novos componentes usam dados reais ou informam claramente indisponibilidade.

## Arquivos alterados
`home.html`, `assets/js/home.js`, `src/social.js`, `src/home-profile-preview.js`, `src/home-comments-sheet.js`, `src/home-hybrid-reels.js`, `assets/css/pages/home-hybrid.css`, `tests/feed-reels-experience.test.mjs`, `tests/home-hybrid-design.test.mjs`, este relatório.
