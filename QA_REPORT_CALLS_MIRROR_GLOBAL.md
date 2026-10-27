# QA — Vídeo espelhado e recebimento de chamadas em qualquer aba
**Data:** 27/10/2026  
**Escopo:** chamadas de voz/vídeo nas abas do Looply; Neon e Cloudflare, sem Supabase.

## Alterações implementadas
- CSS específico do player WebRTC nas telas Chat/Conversa: vídeo local e remoto espelhados horizontalmente por `scaleX(-1)`, sem inverter os botões. Aplica-se à interface de ambos os participantes.
- `setupGlobalCallListener` chamado no início do `mountAppPage`, antes de renderizar Home, Cartas, Músicas, Galeria etc.; não precisa abrir o Chat para receber.
- Cloudflare Durable Object mantém o envio rápido por WebSocket e aceita o novo evento `ring` antes da negociação SDP.
- Canal independente `v3_call_signal_inbox` instalado no Neon: consulta ÚNICA de eventos de chamada em todas as conversas individuais das quais a conta autenticada participa. SQL com `SECURITY DEFINER`, validação `auth.uid()` e vínculo com `verified_identity_links`, sem conceder SELECT na tabela interna.
- Polling de recuperação pelo Neon (1.100 ms em página visível; pode ser retardado pelo navegador em segundo plano), sem abrir N pollers de banco ao mesmo tempo.
- `sendUrgentNeonCallEvent` encaminha `ring` imediatamente em paralelo à conexão da sala Cloudflare, **antes** de `getUserMedia` e do ICE gathering (que antes podia consumir até 5 s).
- Recebedor é alertado primeiro; `Atender` só é habilitado quando chega uma oferta SDP real, evitando iniciar chamada sem dados de conexão. `failed`, `decline`, `hangup` encerram o aviso.
- Tentativa de aviso sonoro no navegador, vibração quando suportada e notificação do sistema quando a permissão já existe. Esses alertas respeitam limitações de reprodução automática e suspensão de abas dos sistemas móveis.
- Atualizadas as URLs dos módulos em todas as páginas autenticadas e o cache de Service Worker, evitando reutilização da lógica anterior em navegadores móveis.
- Estilos, navegação e dados existentes preservados.

## Evidências
- A implantação do Worker Cloudflare `looply-original-realtime-staging` retornou HTTP 200 com `success:true` após aceitar o sinal `ring`; bindings `LOOPLY_ROOMS`, `ALLOWED_ORIGINS` e `NEON_DATA_API_URL` preservados.
- A função Neon `public.v3_call_signal_inbox(bigint,timestamptz)` existe; `authenticated` tem EXECUTE e **não** tem SELECT sobre `looply_migration.call_signal_events`. A função `v3_call_signal_send` aceita `ring`.
- Testes `tests/global-incoming-calls.test.mjs` e `tests/global-call-ring-fast.test.mjs` cobrem polling, autenticação, recebimento de ring/offer, espelhamento, ordem de inicialização e feedback.
- Revalidar GitHub Actions do commit final antes de considerar esta alteração publicada.

## Limitações não disfarçadas
**Não há teste autenticado entre dois celulares reais** nesta execução. A suíte automatizada valida a lógica, a estrutura da sinalização e a interface, mas não confirma conexão ICE, áudio/vídeo físicos ou tempo real de entrega numa operadora.
**Não é possível garantir frações exatas de segundo** numa aba suspensa, com o celular bloqueado ou sem rede: WebSocket entrega prontamente enquanto a página está ativa; o fallback com Neon usa polling; aviso sonoro pode depender de gesto do usuário e permissões do navegador.
O projeto ainda depende da conectividade P2P/STUN; sem servidor TURN operacional algumas redes restritivas não permitirão conexão de mídia, mesmo que o toque da chamada seja entregue. Não foram criados serviços pagos.
