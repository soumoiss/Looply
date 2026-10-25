# Looply original — migração integral para Neon / Cloudflare

**Repositório:** `soumoiss/Looply` (não utilizar Looply-V3 como fonte principal).
**Branch de trabalho:** `migration/neon-cloudflare-full-20261025`.
**Produção antiga:** continua usando Supabase; não mudar até autenticação, banco, storage e recursos em tempo real terem sido validados.

## Decisão do proprietário (25/10/2026): iniciar toda a mídia do ZERO

O proprietário autorizou descartar **todas as mídias antigas**, sem distinção:
- Avatares e fotos de perfil;
- Galeria atual e arquivo histórico de 227 mídias;
- Imagens, áudios e vídeos de publicações, comentários e stories;
- Arquivos e gravações anexadas a chats;
- Anexos de cartas, mensagens secretas e anúncios.

**Não importar nenhum dos 277 objetos antigos do Supabase Storage.**
Quando o sistema novo funcionar, usuários farão uploads novos pelo próprio Looply. As sete estruturas de bucket privadas do Neon foram preservadas para suportar esses uploads; todos os buckets estão vazios.

### Ações já realizadas, e verificadas, no Neon

- Criada branch Neon `backup-before-media-reset-20261025` (`br-sweet-tooth-b7r1qrke`, sem compute), como referência pré-limpeza.
- Executado em `neondb` da branch `main` do projeto `small-scene-81115187`:
  1. `migration/20261025_reset_all_legacy_media_neon.sql` — remove tabelas de metadados de mídia e relações dependentes, zera `profiles.avatar_path`, `community_letters.attachments`, `secret_messages.media_url` e `global_announcements.media_url`.
  2. `migration/20261025_scrub_old_media_migration_snapshots.sql` — remove os snapshots privados de mídia do inventário de migração, para impedir reimportação acidental.
- Removidos, tanto do branch de trabalho quanto da `main`, os workflows manuais de transferência privada de mídias. O script `migration/transfer-media.mjs` foi excluído.
- A limpeza preservou **6 contas, 6 perfis, 25 publicações, 31 mensagens de chat e 6 cartas**; não apagou seus textos.
- `looply_migration.media_reset_events` registra a aplicação. O SQL principal recusa uma segunda execução, para não apagar novos uploads no futuro.

**Não foi realizado DELETE de arquivos ou registros no Supabase de produção.**
As restrições HTTP 402 do Supabase continuam impedindo operações de Storage. A mídia antiga deve permanecer esquecida no projeto legado até seu desligamento; não será migrada para Neon. Isso evita interromper a aplicação que ainda está publicada no backend antigo.

**Atenção sobre conteúdo histórico:** os comentários que pertenciam diretamente às mídias removidas foram excluídos do Neon por efeito das FKs `ON DELETE CASCADE`. Cartas, conversas, perfis e publicações de texto permaneceram. Stories sem mídia podem permanecer no banco para preservar respostas associadas, mas não têm mais anexos.

## Infraestrutura disponível

- PostgreSQL Neon: 56 tabelas públicas copiadas, Data API ativa.
- Neon Auth: seis contas e vínculo de identidade registrado; o login real das seis **não** está confirmado; o provedor gerenciado não migra automaticamente bcrypt.
- Object Storage Neon: sete buckets privados existentes, **zero objetos**.
- Cloudflare Workers: gateway de leitura Neon preparado em `backend/neon-cloudflare/worker.mjs` e implantado isoladamente como `looply-original-neon-staging` em `https://looply-original-neon-staging.s0upoetamoiss.workers.dev/health` (testado com HTTP 200 em 25/10/2026). O gateway usa a Neon Data API para leituras autenticadas; **não** substitui ainda o backend principal e não recebe novos uploads.
- Cloudflare R2: não habilitado; dispensável nesta etapa porque o Neon Storage está disponível.
- Realtime: desativado no Neon, requer adaptação para chat, notificação e sinalização de chamadas.

## Próximas tarefas da migração completa, sem copiar mídia antiga

1. Auditar e adaptar autenticação para manter usuários, sessões, RLS e perfis, sem Supabase.
2. Portar funções `looply-admin`, `looply-login`, `looply-chat`, `looply-push`, limpeza de stories e playlists para Cloudflare Workers ou Neon Functions.
3. Criar APIs privadas para **novos** uploads, downloads e exclusões no Neon Storage com autorização baseada na identidade autenticada e regras de tamanho/tipo.
4. Migrar requisições de dados e RPC para Neon Data API/Cloudflare com verificação de permissões.
5. Restabelecer funcionalidades de realtime, mensagens e sinalização WebRTC.
6. Testar em staging duas contas reais, cadastro e login, feed, chats, chamadas, galeria vazia e envio de novos arquivos.
7. Só após paridade comprovada, promover o backend novo para `soumoiss/Looply` em produção e descontinuar Supabase.

Não alterar a interface original e não contratar recursos pagos sem autorização. O aplicativo **ainda não está 100% migrado**, pois o trabalho de autenticação, APIs, armazenamento de novos uploads e tempo real permanece pendente.


## Realtime: decisão após bloqueio PostgreSQL 17 (25/10/2026)

O Neon Console mostra corretamente: `Realtime requires Postgres 18. This project runs Postgres 17.`
Confirmado por SQL: versão `17.11`; `get_realtime.enabled=false`.

**Não recriar nem atualizar o projeto Neon apenas para habilitar o Realtime beta.**
Neon bloqueia upgrades principais no mesmo projeto: PG18 exigiria outro projeto mais exportação/importação dos dados, reconfiguração de Auth, Data API e Storage.

**Implementação prevista no projeto ORIGINAL Looply:**
- Neon PostgreSQL 17 permanece fonte persistente (mensagens, usuários, comentários, posts e suas permissões);
- Cloudflare Workers + **Durable Objects SQLite-backed** + WebSocket Hibernation gerenciam canais em tempo real;
- autenticação e autorização obrigatórias antes da conexão, escopo de sala/conversa e checagem de participantes no Neon;
- persistir mensagens/autoria no Neon **antes** de propagá-las ao grupo; Durable Object faz fanout de eventos, presença, typing, confirmação de entrega e sinalização WebRTC;
- não confiar em `conversation_id` sem autorização: conferir associação do usuário em `conversation_participants`;
- reconexão e sincronização por cursor consultando Neon, evitando perder mensagens durante desconexão/hibernação;
- áudio e vídeo usam WebRTC e precisarão de ICE/STUN/TURN conforme teste; o WebSocket é só a sinalização, não transporta mídia;
- implementar limites por usuário, limpeza de presença, sem expor tokens em parâmetros de URL ou logs;
- manter interface original sem alterações visuais e não fazer corte de produção até validar dois usuários em chat/chamadas.

**Estado:** arquitetura definida/documentada; ainda não existe gateway Durable Object implantado ou chat totalmente migrado.

Referências:
- https://neon.com/docs/postgresql/postgres-upgrade
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/platform/limits/


## Implementado em staging: Neon Auth + Cloudflare Durable Objects (25/10/2026)

A alternativa de tempo real foi **implementada e publicada isoladamente**, sem atualizar PostgreSQL 17 nem substituir o aplicativo principal:

- `backend/neon-cloudflare/realtime-worker.mjs`: Worker Cloudflare com `LooplyConversationRoom`, Durable Object SQLite, WebSocket hibernation, ingresso aleatório de uso único válido por 30 segundos e verificação Neon de identidade e pertencimento à conversa ANTES de emitir o ingresso. Eventos `typing`, `invalidate`, `presence` e sinalização WebRTC `signal`; **mensagens não são escritas no Durable Object**.
- `migration/20261025_neon_realtime_authorization.sql`: duas RPCs autenticadas que já foram aplicadas ao Neon: `v3_is_conversation_member(uuid)` e `v3_list_my_conversations()`. Permissão `EXECUTE` apenas para `authenticated`. Não passam IDs de usuário escolhidos pelo cliente.
- `tests/neon-realtime.test.mjs`: testes de origem, ausência de token, participação, erro do banco, ingresso e recusa de WebSocket não autenticado. Verificação GitHub Actions aprovada.
- Worker publicado: `https://looply-original-realtime-staging.s0upoetamoiss.workers.dev/health`, com `LOOPLY_ROOMS` vinculado e domínio `workers.dev` habilitado.
- Testador visual de login Neon: `login-neon.html` + `src/neon-login-staging.js` (formato visual do Looply original), publicado **somente em staging** no Worker `looply-original-login-staging`.
- Testador de WebSockets e salas autorizadas: `realtime-neon.html` + `src/neon-realtime-staging.js`, publicado no **mesmo domínio do login de testes**, para compartilhar a sessão Neon. O domínio foi incluído nos Trusted Domains do Neon.
- URL de teste: `https://looply-original-login-staging.s0upoetamoiss.workers.dev/login-neon.html`
- URL de evento/chat de teste: `https://looply-original-login-staging.s0upoetamoiss.workers.dev/realtime-neon.html`

**Não confundir staging com migração completa.** O frontend principal ainda usa `src/supabase.js` e chat original; sessão Neon em staging não transfere automaticamente sessão para o original. Login com contas reais, consulta de conversas por JWT, conexão entre dois navegadores, persistência de mensagens, mídias, reconexões em rede ruim, gravação de mensagens, chamadas reais WebRTC e testes de privacidade fim a fim precisam ser validados. Sem essas verificações, não promover para produção.

**Fluxo de teste manual:** abrir login-neon.html; entrar com um dos 6 usuários e senha existente (não enviar senha ao ChatGPT); conferir perfil; clicar no link de teste de conversas; escolher uma sala e abrir WebSocket. Com outra conta, testar a mesma sala quando ambos forem participantes e observar presença/typing. Se a conta não tiver sala comum, não forçar acesso; deve retornar erro 403. A lista não mostra conversas de terceiros.
