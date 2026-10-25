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
- Cloudflare Workers: gateway de leitura Neon preparado em `backend/neon-cloudflare/worker.mjs`, com testes; **não** substitui ainda o backend principal.
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
