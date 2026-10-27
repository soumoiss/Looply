# QA — Chat mobile e chamadas reais (27/10/2026)

## Referência e falhas observadas

Referência do usuário: `chatmodelo.html`, documento visual com telas de lista/conversa, Stories, cartões de mensagens, cabeçalho e navegação, ícones de chamada, paleta lilás/branco.

Capturas enviadas: `Screenshot_20261027_094309_Chrome.jpg` e `Screenshot_20261027_094325_Chrome.jpg`. Defeito principal: grade de duas colunas desktop continuava ativa no Chrome Android, comprimindo chat e conversa ao mesmo tempo em metade da largura.

O HTML de referência contém usuários, imagens e chamadas **simuladas** (a função `triggerCall` só abre um modal). **Nenhuma dessas simulações foi instalada em produção**; a nova interface utiliza os registros Neon e os controladores WebRTC existentes.

## Alterações implementadas

- Estilos em `assets/css/pages/chat-mobile-reference.css` adicionados por último em `chat.html` e `conversa.html`, sobrescrevendo a grade desktop em até 760 px. Lista ocupa toda a largura; conversa aberta substitui a lista e pode voltar; `conversa.html` mostra somente a thread.
- Layout de Chat com cartões brancos, barras lilases, balões de chat, pesquisa, filtros, indicadores reais de não lidas, pré-visualização de mídia, mensagem de voz, emojis, anexos e criação de grupo. Tipografia Plus Jakarta Sans.
- **Um único cabeçalho global** mantido via `page-runtime.js`; **uma única barra global de seis abas** via `.page-navigation`. Nenhum `global-header`, `global-nav` ou teclado de demonstração importados do mock.
- Entrada de texto compatível com `visualViewport` e teclado nativo Android; favoritos agora não acionam simultaneamente a abertura da conversa.
- Chamada de voz em UI real exibe avatar/nome do interlocutor e os controles WebRTC de microfone, alto-falante e encerrar. A mídia remota continua montada para receber áudio.
- Chamadas de vídeo continuam com `getUserMedia`, `RTCPeerConnection`, visualização de vídeo remoto/local, virar câmera, mutar e encerrar.
- **Falha backend encontrada:** `src/neon-production-client.js` continha `supportsRealtime:false`, `setAuth` falhava sempre, `channel` era no-op. Logo botões de chamada não podiam completar sinalização, mesmo que interface fosse apresentada.
- Novo `src/neon-realtime-bridge.js` faz ticket autenticado com token Neon em memória (`POST /api/realtime-ticket`), valida sala por ID de conversa, estabelece WSS por subprotocolo de ticket de 30s e envia/recebe ofertas, respostas, ICE, cancelamento e encerramento por Cloudflare Durable Object. O servidor extrai `senderId` do WebSocket autorizado, não confia na identidade da mensagem.
- O worker `looply-original-realtime-staging` EXISTENTE foi atualizado, preservando namespace/volume `LOOPLY_ROOMS`, binding Neon e allowed origins. Nova versão permite `decline`, `failed` e jogo da velha via room de membro autenticado.
- Mensagens passam a disparar invalidation ephemérica após confirmação Neon, e o outro participante refaz a leitura no Neon. Como complemento há atualização periódica de lista/chat quando a página está visível.
- Arquivos e dados existentes foram preservados; não foram inseridos usuários ou mensagens de exemplo.

## Testes de código

GitHub Actions `Verify Looply` da branch, workflow **40510814735**: **485 testes aprovados, zero falhas**. Inclui 17 regressões de layout/teclas e testes do WebSocket com mock de servidor de ticket/socket, identidade, sinalização completa, invalidações e recusas.

Cloudflare `PUT /accounts/{account_id}/workers/scripts/looply-original-realtime-staging` confirmou **HTTP 200 / success:true** e preservou os três bindings (ALLOWED_ORIGINS, LOOPLY_ROOMS, NEON_DATA_API_URL). Namespace Durable Object SQLite pré-existente preservado. O cliente app requer publicação GitHub Pages para começar a usar o novo bridge.

## Evidência ainda necessária para uma garantia 100%

**Não foram executadas duas contas reais em dois telefones e a troca efetiva de áudio/vídeo WebRTC**, nem o teste visual de aplicativo autenticado em Android/iPhone. Testes automatizados de protocolo com `MockSocket` validam o código, não comprovam a ligação completa em redes reais. O arquivo `config.js` fornece STUN mas não credenciais TURN; NATs restritivos podem impedir conexão até configuração de relay apropriado, dependendo do plano/custos.

Também não foram validados todos os anexos, permissões de microfone/câmera, teclados de fabricantes diferentes e envio real de nova mensagem neste turno. O sistema deve exibir erros reais, sem declaração de sucesso falsa.

## Referências

Código: `chat.html`, `conversa.html`, `assets/js/chat.js`, `assets/js/conversation.js`, `assets/css/pages/chat-mobile-reference.css`, `src/chat.js`, `src/chat-calls.js`, `src/neon-realtime-bridge.js`, `src/neon-production-client.js`, `backend/neon-cloudflare/realtime-worker.mjs`, `tests/chat-mobile-reference.test.mjs`, `tests/neon-realtime-bridge.test.mjs`, `tests/neon-pages-routing.test.mjs`, `tests/foundation.test.mjs`.
