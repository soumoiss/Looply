# QA — Chamadas espelhadas e recebimento global
Data: 27/10/2026. Infraestrutura: Neon PostgreSQL + Cloudflare, sem novo backend Supabase.

## Implementação
- Imagens local e remota das videochamadas espelhadas horizontalmente no CSS. MediaStreams originais e áudio preservados.
- Listener de ligações iniciado após restaurar a sessão, antes da renderização de Home, Cartas, Música, Chat e outras páginas.
- Janela de chamada recebida promovida a dialog modal nativo para sobrepor Stories, Reels e outras telas cheias.
- Nova função Neon v3_call_signal_inbox consulta em uma requisição sinais de todas as conversas diretas autorizadas. Acesso filtrado por Neon Auth, vínculo de identidade e participação na conversa.
- Consulta do inbox ~850 ms enquanto a página está visível, com redução em segundo plano. Canal Cloudflare WebSocket continua como opção push rápida.
- Ligação ativa e convites de jogo priorizam caminho autenticado no Neon; WebSocket permanece como alternativa. Offer, answer, ICE, hangup, microfone/câmera e controles anteriores preservados.
- Espera inicial de ICE reduzida para 750 ms, com candidatos adicionais enviados via trickle ICE.
- Recusar em qualquer aba envia evento autenticado mesmo sem WebSocket funcional.
- GitHub Pages continuará usando hashes de conteúdo para invalidar caches de scripts e estilos.

## Verificações e limitações
- Testes de código em tests/instant-incoming-calls.test.mjs, incluindo espelhamento, janela top-layer, privacidade de remetente/sala, consulta global e chamadas/jogos.
- Neon: função v3_call_signal_inbox instalada e permissão EXECUTE concedida ao papel authenticated.
- A verificação do GitHub Actions deve ser confirmada no commit final; testes automatizados não são evidência de chamadas reais.
- Não houve neste turno dois celulares autenticados trocando mídia WebRTC. O usuário poderá testar a versão publicada; comunicação pode depender de TURN em certas redes.
- Recebimento em frações de segundo não pode ser garantido com rede lenta ou navegador suspenso pelo sistema operacional. O inbox consulta aproximadamente a cada 850 ms quando a aba está visível.
- Nenhum dado existente de usuários e mensagens foi excluído.