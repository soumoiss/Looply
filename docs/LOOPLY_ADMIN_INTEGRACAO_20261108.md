# Looply · Painel ADM — relatório de integração (08/11/2026)

## Escopo efetivamente entregue

Substituição do documento admin.html pelo HTML visual do modelo; remoção do script de simulação, substituído por `src/admin-model-live.js` que usa Neon Auth / Data API. O CSS, a estrutura de quatro abas e os modais do modelo são preservados. O painel não confirma sucesso sem resposta do servidor. As operações não suportadas são explicitamente indisponíveis.

**Situação:** integração parcial. Não afirmar 100% funcional. SQL novo não aplicado no Neon e front ainda não foi validado com sessão Peixinho real.

## Tabela completa das funções (47)

| Categoria | Função do modelo | Endpoint ou situação |
|---|---|---|
| Usuários | Gerenciar usuários | looply-admin: users_list |
| Usuários | Cadastrar usuário | looply-admin: user_create_with_password |
| Usuários | Gerar convites | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Usuários | Redefinir senha | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Usuários | Sessões ativas | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Usuários | Gerenciar VIP | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Cartas | Todas as cartas | looply-admin: v12_admin_read(community_letters) (limit=100, auditoria) |
| Cartas | Atividade de cartas privadas | Data API RLS: looply_admin_letter_access_log |
| Cartas | Fila de agendadas | Data API: scheduled_letters (RLS) |
| Cartas | Senhas das cartas | looply-admin: v12_admin_read(community_letters) (limit=100, auditoria) |
| Cartas | Cartas para Peixinho | looply-admin: v12_admin_read(letters) (limit=100, auditoria) |
| Cartas | Importar acervo | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Chat | Conversas privadas | looply-admin: v12_admin_read(conversations) (limit=100, auditoria) |
| Chat | Grupos | looply-admin: v12_admin_read(conversations) (limit=100, auditoria) |
| Chat | Pacotes de figurinhas | admin-importar-figurinhas.html (fluxo existente) |
| Chat | Denúncias | RPC: v26_admin_panel_action(reports_list/resolve/ignore) |
| Chat | Filtro de palavras | RPC: v26_admin_panel_action(word_*), trigger v26_filter_chat_message |
| Chat | Partidas de jogos | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Chat | Registro de chamadas | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Conteúdo | Moderação | looply-admin: v12_admin_read(posts) (limit=100, auditoria) |
| Conteúdo | Stories | looply-admin: v12_admin_read(stories) (limit=100, auditoria) |
| Conteúdo | Galeria comunitária | looply-admin: v12_admin_read(community_gallery_media) (limit=100, auditoria) |
| Conteúdo | Mídias antigas | looply-admin: v12_admin_read(archive_media) (limit=100, auditoria) |
| Música | Música do dia | looply-admin: app_settings_update |
| Música | Comentários por música | looply-admin: v12_admin_read(youtube_track_comments) (limit=100, auditoria) |
| Música | Coleções pessoais | looply-admin: v12_admin_read(music_library) (limit=100, auditoria) |
| Música | Playlists do YouTube | looply-admin: v12_admin_read(profiles) (limit=100, auditoria) |
| Comunicação | Comunicado global | looply-admin: broadcast_list/create/deactivate |
| Comunicação | Recado secreto VIP | looply-admin: secret_list/create/cancel |
| Comunicação | Notificação push | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Comunicação | Boas-vindas da Home | looply-admin: app_settings_update |
| Sistema | Modo de manutenção | looply-admin: app_settings_update |
| Sistema | Aparência | Local: tema e Matrix (não altera dados) |
| Sistema | Funcionalidades | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Sistema | Limites | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Sistema | Backup e exportação | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Sistema | Banco de dados | looply-admin: users_list/broadcast_list |
| Segurança | Trilha de auditoria | looply-admin: v12_admin_read(audit) (limit=100, auditoria) |
| Segurança | Tentativas de login | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Segurança | Bloqueio de IP | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Segurança | Permissões | PRECISA SER CRIADO / NÃO IMPLEMENTADO |
| Ferramentas | Console | looply-admin v12_admin_read/action (lista controlada) |
| Ferramentas | Consulta de dados | looply-admin: v12_admin_read (consulta limitadas) |
| Ferramentas | Inspetor de objetos | looply-admin: v12_admin_read + sanitização cliente (backend ainda retorna colunas sensíveis) |
| Ferramentas | Radar em tempo real | looply-admin: v12_admin_read audit (atualização manual) |
| Ferramentas | Mapa de calor | looply-admin: v12_admin_read audit (agregação parcial no cliente) |
| Ferramentas | Relatórios | looply-admin: users_list + audit |

## Arquivos

Criados: `src/admin-model-live.js`, `migration/20261108_admin_panel_reports_word_filter.sql`, `tests/admin-premium-shell.test.mjs`, `package-lock.json`.

Alterados: `admin.html`, `sw.js`, `tests/design-foundations-002.test.mjs`, `tests/neon-pages-routing.test.mjs`, `tests/primary-navigation-single.test.mjs`, `tests/user-reported-regressions-20261031.test.mjs`, `tests/foundation.test.mjs`.

Sem remoção física de `src/admin.js` ou `assets/js/admin.js`, que continuam no repositório por dependências legadas e testes históricos, mas o novo `admin.html` NÃO os carrega. Não há interface administrativa antiga na rota `admin.html`.

## Migrações e ordem

Não reaplicar indiscriminadamente o acervo inteiro sem conferir o estado do Neon. Para instalação que já possui a migração base e o log de 05/11, aplicar apenas:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migration/20261108_admin_panel_reports_word_filter.sql
```

Pré-requisitos: `migration/20261029_neon_admin_restoration.sql`; `migration/20261104_chat_conversation_reports.sql`; `migration/20261105_admin_letter_access_log_story_views.sql`. O arquivo novo é idempotente e não apaga dados.

## Verificações realizadas na cópia local recuperada da Biblioteca

- `npm ci --offline --no-audit --no-fund`: sucesso (lockfile gerado; não existem dependências externas declaradas).
- `npm run build`: sucesso.
- `npm test`: 934 testes aprovados; 0 falhas. Resultados da cópia local, e NÃO da revisão remota mais recente.
- Chromium em 390×844 com sessão Neon simulada só no teste: 4 abas, 47 módulos e modal de usuário aberto, sem erros JavaScript no fluxo básico.
- Sem teste de login do Peixinho ou gravações reais no Neon. Sem migração aplicada. Teste de todos os 47 fluxos em servidor real não foi realizado.

## Pendências de implementação real

- Convites e senhas de usuários sem limite, sessões, VIP, exclusão de usuários: autenticação Neon exige novos contratos e testes.
- Cartas agendadas de terceiros, atualização/remoção de senhas e importação ilimitada: requerem novas RPCs com RLS/auditoria e carregamento em lotes.
- Denúncias: fila, resolver e ignorar preparados em SQL; suspender autor/remover conteúdo podem reutilizar ações legadas, mas ainda não estão conectadas à denúncia. A interface do chat para criar denúncia ainda necessita validação/ligação.
- Filtro de palavras: SQL vincula trigger a chat_messages.body; precisa ser aplicado e testado contra todos os caminhos de escrita do chat.
- Bloqueio de IP e login, feature flags globais, RBAC, push segmentado, convites em lote, gerenciamento completo de figurinhas, encerrar jogos/chamadas, editar/excluir grupos e backup servidor ainda exigem implementação.
- Console de consulta: restrição de recursos e sanitização no cliente não bastam para garantir ocultação de colunas sensíveis no servidor. Criar RPC v26_admin_safe_query com SELECT explícito e tempo limite antes de disponibilizar consultas sensíveis.
- Radar é leitura manual de auditoria e mapa de calor agrega a página carregada; não são realtime nem cobertura global.
- A RPC v12_admin_read ainda exige justificativa de 20 caracteres, mesmo com campo removido do novo front. Corrigir esta validação na migração do servidor sem enfraquecer auditoria.
- `v12_admin_action` verifica identidade admin, mas precisa ser reforçada para conferir o nome Peixinho em todas as ações antigas, além do bloqueio do cliente. Nova RPC v26 já verifica ambos.
- Validar a compatibilidade da migração contra o schema real e os triggers atuais do Neon; confirmar CSP/CORS, cache offline e serviço de push.

## Deploy e variáveis

No checkout do GitHub após revisão:

```bash
npm ci
npm run build
npm test
export DATABASE_URL="postgresql://..."  # configurar localmente, nunca publicar
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migration/20261108_admin_panel_reports_word_filter.sql
```

O GitHub Pages precisa receber o build da branch publicada; o SQL não é executado pelo Pages. Não há Edge Function nova publicada; o front fala com Neon RPC existente. Se for necessário reimplantar Workers/FCM depois de novas integrações, isso é trabalho pendente.
