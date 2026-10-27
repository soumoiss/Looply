# QA — Recuperação das chamadas e dos convites do Looply sem infraestrutura Supabase

Data: 27/10/2026 · Branch: `fix/restore-legacy-call-signaling-diagnostics-20261027` · PR #172.

## Referência histórica: 19/10/2026

O commit `de0f97387937` restaurou o WebRTC anteriormente utilizado: `getUserMedia`, `RTCPeerConnection`, negociação `offer`/`answer`, candidatos ICE, aceite, recusa e encerramento, com broadcast privado por conversa. Ao comparar `src/chat-calls.js` histórico e atual, a negociação central permanece praticamente a mesma. A regressão ocorre na camada de sinalização: a migração para Neon/Cloudflare passou a depender de uma conexão privada que o usuário reportou como indisponível.

**Não houve restauração de Supabase como backend.** O caminho novo usa somente Neon Auth/PostgreSQL e, quando disponível, Cloudflare Durable Objects.

## Alterações realizadas

1. O transporte Cloudflare existente continua sendo a primeira opção para baixa latência. `src/neon-realtime-bridge.js` limita o tempo de emissão do ticket e do handshake WSS a 3 segundos cada, deixando margem para o plano B dentro dos 10 segundos do controlador de chamada. O aviso de erro, quando ambos falham, informa motivos mais específicos.
2. Um transporte alternativo independente, `src/neon-call-fallback.js`, usa a própria Neon Data API com token de sessão ativo. Não depende de Supabase, de WebSocket externo nem de endpoints secretos no navegador. A função `createNeonRealtimeBridge` mantém a API de canais usada pelo WebRTC antigo: `on('broadcast',{event:'signal'},...)`, `subscribe`, `send` e `unsubscribe`. O mesmo caminho trata convites do jogo da velha e invalidações de mensagens.
3. A migração aditiva `migration/neon-call-signaling-fallback-20261027.sql` foi aplicada no projeto Neon `looply-v3-migration` **sem mudar os registros existentes**. Adiciona `looply_migration.call_signal_events` e duas RPCs públicas acessíveis apenas pelo papel `authenticated`: `v3_call_signal_send` e `v3_call_signal_list`. Ambos validam associação à conversa via `v3_is_conversation_member` e mapeamento de identidade verificado pelo banco. O remetente deriva de `auth.uid()` no servidor; identidade enviada pelo cliente não é confiável. Conteúdos têm limite de tamanho, janela lógica de 2 minutos e limite básico de taxa.
4. A tabela de sinais fica fora do schema de API, sem `SELECT` direto para o papel `authenticated`. A verificação no banco confirmou existência das RPCs, permissões `EXECUTE` e ausência de acesso direto à tabela.
5. Os identificadores das entradas de Chat e Conversa foram atualizados. O cache de `sw.js` continua compatível com `scripts/build.mjs`, que já incorpora o hash dos arquivos na implantação.
6. A consulta ao Neon é espaçada em cerca de 3,2 segundos no navegador quando o Cloudflare está indisponível; isso usa mais solicitações do que um WebSocket persistente, mas evita depender exclusivamente do Worker.

## Compatibilidade e ausência de Supabase

Não foram restaurados projetos, chaves, tabelas, canais ou servidores do Supabase. A autenticação principal do aplicativo ainda utiliza a interface de compatibilidade chamada `SupabaseAuthAdapter`, que faz parte do SDK **oficial do Neon** e se comunica com Neon Auth — não com um projeto Supabase. **Não foi substituída** nesta correção para não comprometer cadastro, login ou sessões existentes. O novo transporte de voz/vídeo/jogos não a utiliza diretamente.

## Validação objetiva e limites

- A suíte `node --test` do GitHub Actions é a confirmação de regressão de código, inclusive testes do fallback com negação do Worker, ofertas, respostas, ICE, encerramento, duas contas simuladas e convite de jogo da velha.
- As contas dos participantes anteriores continuam vinculadas no Neon (consulta agregada confirmou seis identidades distintas vinculadas e nenhuma participação sem vínculo).
- **Não foi realizada uma chamada com áudio/vídeo real entre dois telefones autenticados**, nem um convite real aceito por outro aparelho. A aprovação dos testes de protocolo com serviços simulados não equivale a essa prova. Isso deve ser apresentado como pendente.
- Sem TURN/relay configurado, conexões WebRTC entre redes NAT restritivas ainda podem falhar mesmo com sinalização funcionando. O suporte a STUN anterior continua preservado.
- A fila do Neon mantém fisicamente registros efêmeros até que seja implementada a rotina segura de retenção; a expiração de 2 minutos impede a leitura de sinais antigos, mas não substitui a limpeza dos registros. Não foi feita exclusão automática nem destrutiva de registros nesta entrega.

## Escopo e arquivos

`src/neon-call-fallback.js`, `src/neon-realtime-bridge.js`, `src/neon-production-client.js`, `src/chat-calls.js`, `migration/neon-call-signaling-fallback-20261027.sql`, `tests/neon-call-fallback.test.mjs`, páginas Chat/Conversa e respectivos entrypoints, `sw.js`.

## Teste manual pendente

Após GitHub Pages publicar: abrir a mesma conversa em duas contas reais diferentes, iniciar voz, atender, verificar áudio dos dois lados, finalizar; repetir para vídeo e conferir câmera/microfone, alternar câmera; usar jogo da velha e confirmar que o convite e as jogadas chegam; alternar 4G/Wi-Fi e validar reconexão. Se falhar, identificar o código do toast detalhado e o status HTTP da RPC Neon — sem registrar ou compartilhar tokens.
