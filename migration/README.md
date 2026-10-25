# Looply original → Neon + Cloudflare | migração integral

**Fonte de verdade:** [soumoiss/Looply](https://github.com/soumoiss/Looply) (não Looply-V3).
**Branch isolada:** `migration/neon-cloudflare-full-20261025`.
**Regra de corte:** nenhuma troca de produção, exclusão ou desativação do Supabase até que testes de autenticação, upload, RLS, mensagens, chamadas e mídias privadas sejam aprovados.

## 1. Auditoria verificada em 25/10/2026

| Critério | Supabase original | Neon principal |
|---|---:|---:|
| Tabelas de aplicação (public) | 56 | 56 |
| Contas | 6 | 6 |
| Perfis | 6 | 6 |
| Publicações | 25 | 25 |
| Mensagens no chat | 31 | 31 |
| Vínculos de identidade no destino | — | 6 registros |
| Mídias privadas | 277 | 0 arquivos |
| Buckets | 7 | 7 |

- Supabase Storage possui **277 objetos**, aproximadamente **369.296.700 bytes**, maior objeto ~**15.926.565 bytes**.
- Buckets com arquivos: `looply-avatars` 24, `looply-chat` 9, `looply-gallery` 5, `looply-letters` 2, `looply-media` 236, `looply-secret-messages` 1; `looply-announcements` 0.
- Neon Object Storage já está habilitado; os sete buckets estão privados e vazios.
- Neon Data API está ativa e apontando para o esquema público, e Managed Better Auth está provisionado.
- Das 6 contas Neon Auth, somente **1** tinha senha cadastrada e e-mail marcado como verificado na última checagem de autenticação. Os 6 registros de vínculo na tabela de migração **não significam login funcional**.
- Neon Realtime está desativado; exige adaptação de protocolo e segurança (a versão beta ainda não oferece RLS no motor Realtime).
- Cloudflare Workers: somente `looply-v3-staging` estava implantado. R2 respondeu **HTTP 403 / enable R2 in dashboard**; **não depender de R2** nesta migração. O banco Neon reportou limite configurado de 512 MiB e aproximadamente 38 MiB de dados; não assumir armazenamento ilimitado.
- As funções legadas do Supabase incluem: `looply-admin`, `looply-login`, `looply-chat`, `looply-push`, `looply-stories-cleanup`, `looply-youtube-playlist`, além de `api/youtube-playlist.js` e operações `storage`/`rpc`/`realtime` diretamente no frontend.

## 2. Componentes preparados nesta branch

- `backend/neon-cloudflare/worker.mjs`: gateway **somente leitura** para `GET /api/self-profile` e `GET /api/feed`, validando a sessão Neon pela Data API e respeitando as views RLS do banco. Endpoint `/health` sempre informa **migração incompleta**. Não expõe acesso irrestrito ao banco.
- `tests/neon-migration-gateway.test.mjs`: testes isolados de autenticação exigida, origem, métodos, filtragem de resposta e erros.
- `migration/transfer-media.mjs`: listagem recursiva privada do Storage original; por padrão **dry-run**; cópia sob confirmação explícita, usando credenciais do backend em ambiente privado. Um objeto por vez, preservando nome e bucket; calcula SHA-256 e confirma metadados/bytes por HEAD no Neon; pode retomar sem recopiá-los.
- `.github/workflows/migrate-private-media.yml`: execução manual com campos mode=\`dry-run\`/\`copy\`, confirmação e contagem esperada. **Somente na branch neste momento; a opção Run workflow do GitHub exige que o workflow seja promovido à main**, depois de adicionar segredos e aprovar o destino. Nenhum copy automático ou cobrança foi autorizado.
- A página pública original NÃO passou a usar o gateway; o login existente NÃO foi substituído.

## 3. Dependências para exportar 277 mídias

Para o script rodar, configure num ambiente privado do GitHub Actions (`migration-media`) ou localmente:

| Variável | De onde vem |
|---|---|
| `SUPABASE_URL` | URL pública do projeto original (a workflow já preenche) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API Keys → chave administrativa do projeto **original** |
| `AWS_ENDPOINT_URL_S3` | Endpoint Neon Object Storage da branch destino (preenchido na workflow) |
| `AWS_ACCESS_KEY_ID` | Neon storage credential `token_id`, escopo `storage:write` |
| `AWS_SECRET_ACCESS_KEY` | Neon storage credential `s3_secret_access_key` |
| `AWS_REGION` | `us-east-1` |
| `EXPECTED_MEDIA_COUNT` | `277` no snapshot inicial |

No Actions, usar os nomes `LOOPLY_SOURCE_SERVICE_ROLE_KEY`, `LOOPLY_NEON_STORAGE_ACCESS_KEY_ID`, `LOOPLY_NEON_STORAGE_SECRET_ACCESS_KEY` que a workflow mapeia para variáveis do processo. Credenciais nunca devem entrar em `config.js`, HTML, `.env` versionado ou commit.

O script usa `@aws-sdk/client-s3@3.1156.0`, instala a versão fixa e executa `node migration/transfer-media.mjs`. Sem `MIGRATE_MEDIA=1`, não envia arquivos. Para enviar, exige `MIGRATION_CONFIRM=TRANSFER_WITH_CHECKSUMS`. Antes de cada transferência, exige **exatamente** a quantidade esperada de objetos; se o original mudou, aborta até atualizar a auditoria. Pode falhar com HTTP 402 enquanto o Supabase estiver restrito; não há como ignorar a restrição do serviço.

## 4. Etapas restantes — ordem obrigatória

1. **Validar banco e RLS**: conferir todos os 56 conjuntos de dados, políticas RLS e funções, não apenas contagens globais. Verificar cada view exposta com JWTs de contas distintas e clientes anônimos.
2. **Autenticação real**: Managed Better Auth **não importa os hashes bcrypt do Supabase** automaticamente. Escolher reset seguro de senhas, ou implantar Better Auth auto-hospedado com verificação bcrypt e novo hashing no primeiro acesso. Validar 6 contas e sessões antes do corte.
3. **Concluir 277 arquivos**: exportar do original para os mesmos 7 buckets Neon, verificar byte length, SHA256 e permissões de downloads/assinaturas.
4. **Portar serviços**: substituir `looply-admin`, `looply-login`, `looply-chat`, `looply-push`, `looply-stories-cleanup`, `looply-youtube-playlist`, web push, RPC e Storage assinada por Workers/Neon Functions equivalentes. Validar autorizações e logs sem segredos.
5. **Substituir clientes**: separar `auth`, `from/rpc`, `storage`, `realtime` e `functions` do `src/supabase.js`; migrar cada ponto de uso com testes. `@neondatabase/neon-js` é compatível em parte para Auth/Data API, **não oferece substituição automática para Storage/Realtime/Edge Functions**.
6. **Realtime e chamadas**: migrar assinaturas de chat, typing, mensagens, Stories, notificações e sinalização WebRTC, sem expor conversas privadas. Neon Realtime beta não implementa RLS; usar autorização de consultas no servidor.
7. **Homologação visual e funcional**: cadastro/login/logout em navegador móvel e desktop; post no feed; anexos, galeria e histórico; chat e ligações áudio/vídeo entre dois usuários; permissões e ADM; tratamento de erros.
8. **Corte controlado**: comparar novamente quantidades atualizadas no original e no destino, transferir deltas, habilitar backend novo somente após testes, verificar rollback e só então desabilitar dependências Supabase.

## 5. Limites e custo

Não prometer “armazenamento ilimitado e 100% gratuito”. Documentação Neon em 25/10/2026: plano Free inclui 5 GB de Object Storage, 1 GB de PostgreSQL por projeto e limites mensais de compute/transferência. Neon Realtime beta é gratuito como serviço, porém pode gerar consumo de compute e saída do banco. Cloudflare R2 requer habilitação explícita no painel da conta.

O termo “Kubernetes” não identifica um cluster seu no repositório original; o projeto utiliza serviços gerenciados e 390 arquivos versionados, sem manifests Kubernetes. A operação real é migrar **serviços e dados do backend**, e não mover um cluster Kubernetes.
