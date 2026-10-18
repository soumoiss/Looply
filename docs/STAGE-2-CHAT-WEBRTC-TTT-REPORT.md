# Looply — Etapa 2: Chat, WebRTC, notificações e jogo da velha

## Estado desta entrega

Esta branch contém uma primeira implementação parcial e verificável. Não representa conclusão integral da Etapa 2. Não foram executados testes de chamadas entre dois dispositivos físicos e a migração SQL ainda precisa ser aplicada ao projeto Supabase remoto antes de o placar funcionar em produção.

## Alterações nesta branch

- `src/chat.js`: o botão de emoji abre uma grade de emojis e insere a seleção no ponto do cursor; imagens de avatar que falham ao carregar são substituídas por fallback visual.
- `assets/css/pages/chat.css`: estilos responsivos e acessíveis para o seletor de emojis e layout de chamada ampliado para ocupar a tela.
- `src/chat-calls.js`: controles separados de microfone, áudio recebido, câmera ligada/desligada e alternância entre câmera frontal/traseira usando `RTCRtpSender.replaceTrack`.
- `src/chat-enhancements.js`: o primeiro jogador é sorteado na partida inicial; após vitória, o vencedor começa a rodada seguinte; cada rodada recebe um UUID e o resultado é registrado com chave única para evitar duplicação por repetição da mesma chamada RPC.
- `supabase/migrations/20261018191500_chat_ttt_persistent_scores.sql`: tabela de resultados com RLS restrita a participantes da conversa e função RPC idempotente para gravar resultados.
- `tests/chat-stability.test.mjs`: testes de contrato para seletor de emoji, fallback de avatar, controles WebRTC e persistência/idempotência do placar.

## Limitações que permanecem

1. **TURN:** a chamada ainda usa STUN público, sem TURN configurado. Algumas redes/NATs exigem TURN para mídia bidirecional; não é possível garantir chamadas confiáveis em todas as redes sem credenciais e infraestrutura TURN.
2. **Chamadas recebidas globalmente:** a sinalização continua ligada ao canal da conversa e ao módulo de chat. A chamada ainda não foi integrada a um listener global em todas as páginas.
3. **Web Push com navegador fechado:** não está implementado. Exige service worker, permissão explícita, assinatura Push e serviço servidor para envio. Uma página web não pode garantir despertar/tocar indefinidamente quando o navegador foi encerrado.
4. **Teste de chamadas:** nenhum teste de áudio/vídeo bidirecional entre dois dispositivos reais foi realizado nesta entrega.
5. **Placar Supabase:** a migração foi adicionada ao repositório, mas não aplicada ao banco remoto por esta alteração. Até a aplicação da migração, o RPC e o placar persistente retornarão erro.
6. **Ícones:** alguns controles de chat/chamada ainda usam caracteres Unicode. A substituição integral por ativos Icons8 Stroke 1 verificados não foi concluída.
7. **Teste visual:** não houve validação manual em navegador móvel/desktop nesta entrega.

## Como validar

1. Executar `npm test` no commit desta branch.
2. Aplicar a migração SQL ao projeto Supabase correto e confirmar a função `record_chat_ttt_result`, a tabela `chat_ttt_results` e as políticas RLS.
3. Testar emoji, anexos e avatars no chat.
4. Testar chamada entre dois dispositivos em redes diferentes, nos dois sentidos, com permissões de microfone/câmera e com/sem TURN.
5. Testar placar em duas sessões autenticadas e repetir o envio do mesmo `game_id` para confirmar que não duplica a pontuação.
6. Só depois da validação, integrar à `main` e verificar o deploy do GitHub Pages.

## Publicação

Esta etapa deve permanecer em revisão enquanto os itens acima estiverem pendentes. Um PR/commit no GitHub não prova que o site foi publicado nem que o banco remoto recebeu a migração.
