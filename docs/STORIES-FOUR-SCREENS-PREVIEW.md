# Loooply Stories — revisão visual de quatro telas

**Estado:** Pull Request rascunho #164, **não integrado à main, não publicado no GitHub Pages**. Aguardando aprovação do proprietário.

## Fonte e objetivo

Referência fornecida pelo usuário: `Instagram Stories Simulation.html` (quatro interfaces com câmera, edição, visualização do criador e visualização de terceiros) e descrição textual detalhada. Não se deve substituir o aplicativo por aquele simulador; o desenho atual modifica `storyStudioMarkup`, `storiesMarkup` e a folha `stories-four-screens.css` enquanto mantém a lógica de identidade, mídia e permissões de Neon + Cloudflare.

## Implementações realizadas nesta branch

| Área | Integração prevista | Estado |
| --- | --- | --- |
| Câmera | topo X / flash / configurações; barra lateral Aa / Boomerang / Layout / mais; efeitos e lentes, galeria, obturador, inversão | Implementado sobre os controladores existentes |
| Layout 2×2 | quatro disparos compõem um único JPEG vertical, sem zoom automático | Implementado |
| Temporizador | 0, 3 ou 10 segundos antes da captura de foto | Implementado |
| Mãos livres | alterna gravação com toque, sem manter obturador pressionado | Implementado |
| Edição | voltar, música, remoção da trilha, texto, figurinhas, efeitos, menções, legenda, publicar | Implementado reutilizando APIs existentes |
| Filtros | Original / Natural / Dourado / Azulado / Preto e branco, aplicados à mídia exportada | Implementado |
| Audiência | "Seu story" publica ao público configurado; "Amigos próximos" pede destinatários e publica com visibilidade restrita | Implementado no frontend; permissões reais dependem de RPC |
| Autor | atividade real do story, compartilhamento Web Share/link, download da mídia, menção por RPC, opções de exclusão | Implementado; testes autenticados pendentes |
| Terceiros | coração salvo no banco, resposta privada, responder, compartilhamento nativo e visualização de música | Implementado onde o backend já oferece |
| Música | permanece o seletor interno (catálogo comercial para prévia; faixas autorizadas para vídeo), com informação de título nos Stories publicados | Implementado nos fluxos existentes |

## Recursos não declarados como funcionando

- **Turbinar:** publicidade paga exige infraestrutura de anúncios, políticas e autorização de cobrança. Botão visualmente presente, mas desabilitado; nenhum pagamento pode ser disparado.
- **Destaques:** exige persistência pós-24h e regras de acesso específicas no Neon/R2. Botão desabilitado para não induzir o usuário a acreditar que já salvou permanentemente.
- **REEL / LIVE na câmera:** apenas rótulos visuais desabilitados; Reels existente é um visualizador distinto; Live não foi implementada nesta etapa.
- **Enquetes, perguntas, links clicáveis, stickers animados e encaminhamento interno via DM:** exigem modelos de dados/ações adicionais e não estão concluídos. Figurinhas de emoji, texto e menções existentes foram preservados.
- **Testes autenticados em Android e múltiplas contas:** não executados; o CI automatizado não constitui prova de publicação/reprodução no dispositivo do proprietário.
- **Teste visual do aplicativo real com backend:** a prévia HTML gerada na conversa apresenta a composição de telas, mas não executa a sessão de usuário nem o backend. Não alegar que o simulador comprova o app real.

## Validação

`npm test` através do workflow Verify Looply e `Stories Studio validation` quando disparado. Os novos testes `tests/stories-four-screens.test.mjs` verificam seletores, existência de handlers reais, visibilidade de ações exclusivas e composição de 4 capturas. A UI de referência é preservada por uma folha de estilos importada ao final da `home.html` **somente na branch de preview**.

## Política de publicação

Não fazer squash/merge, `git push origin main`, deploy de GitHub Pages ou migrações de produção antes da confirmação explícita do usuário após inspeção da prévia.
