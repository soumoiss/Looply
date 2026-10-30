# Looply — Etapa 3/6 (2026-10-30)

## Escopo executado

Branch: `fix/looply-stage3-fcm-login-stickers-20261030`, sobre `fix/looply-stage2-media-calls-responsive-20261030`. Nenhuma alteração da `main`, dados do cliente, segredos ou APK foi publicada nesta etapa.

### FCM Android e notificações

- O banco principal Neon possui 3 registros de dispositivo FCM, o trigger `looply_v19_chat_notification_on_insert`, tabelas de fila e 0 registros de entrega no momento da leitura.
- A conta Cloudflare conectada **não contém um Worker de despacho FCM implantado**. Logo, nenhum teste de push de sistema real foi aprovado; cadastro de token ≠ notificação entregue.
- `src/neon-production-client.js`: cadastro agora guarda chave **token + dispositivo + identidade Neon**, evitando suprimir cadastro quando usuários alternam no mesmo aparelho; o logout remove o cadastro e limpa o cache.
- `backend/cloudflare/android-push-worker.mjs`: seleção de mensagens de voz com anexo áudio real, corpo genérico para não revelar texto privado em push, reivindicação anti-duplicação e registro do status `sent/failed`; consulta exige nome **exato** `looply_push_relay_limited`, rejeitando a role privilegiada antiga.
- `backend/cloudflare/wrangler.android-push.toml`: Worker com Cron de 1 minuto. `.github/workflows/android-fcm-deploy.yml`: implantação **manual, fail-closed**. Só pode rodar após os quatro secrets GitHub `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `FCM_SERVICE_ACCOUNT_JSON` e `NEON_PUSH_DATABASE_URL` estarem configurados corretamente, sendo a última URI exclusiva da role restrita. Não colocar segredos no código.
- Antes de conectar o Worker ao banco é necessário ativar login e senha privada da nova role, com conexão segura, e promover a migração já validada em staging.

### Segurança do banco de dados

- A role anterior `looply_push_dispatcher` **era membro de `neon_superuser`**, com atributos `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`. A tentativa de revogar essa associação na branch de teste recebeu `permission denied`. Não usar essa conta no Worker.
- Foi criada a **migração SQL auditável** `migration/20261030_stage3_fcm_dispatcher_least_privilege.sql` para uma nova role `looply_push_relay_limited`, sem LOGIN (até haver credencial privada) nem privilégios administrativos.
- **Teste real no banco staging** `fix-looply-sticker-share-20261030`: migração SQL da role executada; resultado `can_read_profiles=false`, `can_read_media_path=false`, `can_read_media_type=true`, `inherits_admin=false`, `rolbypassrls=false`, 9 políticas RLS específicas. Nenhum dado de produção foi alterado.

### Criação de contas e login

- Leitura da `main` Neon: 8 identidades Auth, 8 perfis, 8 vínculos verificados e nenhum usuário Auth órfão naquele instante.
- Identificada uma divergência real entre username de perfil e alias técnico do usuário `angel0v`. Restaurado o alias técnico existente no `src/neon-login-identity.js`, **sem recriar conta nem trocar senha**.
- `adminCreateUser` agora verifica a duplicidade do username no Neon antes de criar a identidade Better Auth, reduzindo a possibilidade de contas órfãs. A RPC de vínculo administrativo mantém checagem no backend.
- A criação/login de uma nova conta por usuário real **não foram testados com senha pessoal**. Não afirmar que todas as contas já conseguem entrar sem validação.

### Figurinhas

- Banco principal: 534 figurinhas ativas compartilhadas. Políticas RLS atuais de leitura permitem pacotes `is_shared` sem atribuir permissão administrativa a usuários comuns.
- A política de inserção `looply_v10_chat_sticker_insert` possuía comparações tautológicas (`m.conversation_id=m.conversation_id`, `m.sender_id=m.sender_id`). Nova política exige conversa e remetente corretos, e pacote compartilhado/pertencente ao remetente.
- `migration/20261030_stage3_sticker_reference_integrity.sql` foi aplicada **somente na branch Neon de testes**, onde os atributos de correção `correct_conversation`, `correct_sender` e `shared_allowed` retornaram `true`.
- Biblioteca de mídia real existente permanece intacta, sem substituição por emojis. Uso com usuário comum e visualização de arquivos R2 em aparelho permanecem pendentes.

### Testes

- `tests/android-stage3-fcm-login-stickers.test.mjs`: testes de notificações de dados FCM com transporte de teste isolado, bloqueio de duplicatas, erro não classificado como entrega, ausência de requisição quando fila vazia, login, logout e política de figurinhas.
- CI GitHub `Verify Looply`: verificar a execução na PR; sucesso do CI prova contratos/unitários, **não** envio ao Firebase nem leitura pelo Android.
- Android e2e: ainda não aprovado para pushes em segundo plano e login de novos usuários por credenciais reais.

## Critérios para avançar à etapa 4

Preservar commits, migrações e workflows, não mesclar etapas em produção antes da etapa 6. O usuário pode dizer `continue` para prosseguir. Etapa 4: Sharesheet, Instagram 404, responsividade de playlist, ícone e carregamento.
