# QA — Cartas Programadas (31/10/2026)

Status: PR #234 em rascunho. NÃO implantado no banco Neon principal, Worker de produção ou GitHub Pages.

## Evidências
- GitHub Actions Verify Looply aprovou a revisão inicial da branch feat/cartas-programadas-20261031.
- Migration SQL completa validada na branch Neon não produtiva br-damp-waterfall-b7okj21w dentro de SAVEPOINT + ROLLBACK TO SAVEPOINT.
- Testes SQL transacionais: uma entrega na data vencida; segunda execução sem duplicação; cancelada nunca entregue; criptografia preservada no destino; histórico de entrega.
- Falha de inserção simulada em trigger: detectou-se e corrigiu-se a perda do incremento de tentativas por rollback da subtransação. Revalidado: failed com attempts=1; nova tentativa retorna delivered com attempts=2 e histórico com ambos eventos.
- Verificada a existência de candidatos FCM de community_letters limitados ao destinatário.
- Após cada teste, a schema de desenvolvimento foi confirmada sem novas tabelas/colunas permanentes.

## Ordem de publicação
1. Aplicar migration/20261031_scheduled_letters.sql no Neon principal (projeto looply-v3-migration).
2. Implantar backend/cloudflare/android-push-worker.mjs mantendo secrets e Cron existente de 1 minuto.
3. Testar duas contas reais, data/hora, senha, usuário offline, notificação Android, falhas, concorrência e a interface em 320/360/390/428 px.
4. Somente depois de aprovado o teste de integração, integrar a PR no main e publicar GitHub Pages.

## Pendências
Não foram executados testes E2E com duas contas reais, dispositivo Android fechado, interação mobile com leitor de tela ou duas sessões PostgreSQL simultâneas. Nenhum segredo ou dado de usuário foi exportado.
