# Looply V3 — Registro de migração (2026-10-25)

## Segurança e escopo
Este branch é preparatório, não altera produção. Não apagar projetos originais. Não ativar faturamento. Não armazenar dumps, senhas, tokens, hashes ou dados pessoais no Git.

## Origem confirmada
- Repositório principal: soumoiss/Looply, main, commit d96527dd71a28aa3efb535615fe827dfaacba5d9 (verificado na auditoria inicial).
- PR de Stories: #115, branch feat/instagram-inspired-stories-20261025, head 36cc6ec88e74a5de9131ee9b1c0310b64c732383, draft e não mesclado.
- Git tree main: 385 entradas, sem truncamento.
- Build: node scripts/build.mjs; testes: node scripts/build.mjs && node --test tests/*.test.mjs.
- Funções legadas encontradas: looply-admin, looply-chat, looply-login, looply-push, looply-stories-cleanup, looply-youtube-playlist.
- A documentação original menciona acervo de 97 cartas e referências de mídias ainda não integralmente importadas; não considerar esse acervo migrado sem conferência.

## Infraestrutura detectada (somente metadados)
- Supabase: Looply V2 e Loooply ativos; dois outros projetos inativos. Determinar qual é a origem de produção antes de exportar.
- Vercel: projetos looply e derivados encontrados.
- Neon: nenhum projeto listado.
- Oracle looply-auth-prod e Cloudflare R2: acesso e cotas não verificados.

## Arquitetura candidata (não implantada)
- Frontend estático: GitHub Pages.
- Backend: Oracle Cloud Always Free se recursos e acesso comprovados.
- PostgreSQL: instância própria ou Neon gratuito se limites adequados.
- Mídias: R2 gratuito se habilitação não exigir cobrança; caso contrário, alternativa gratuita com cotas comprovadas.
- APIs autenticadas, autorização por objeto e WebSocket: backend próprio, sem Supabase.

## Portões obrigatórios
1. Inventariar código, branches, dependências, esquemas, buckets, usuários e referências de mídia.
2. Identificar produção e gerar backups privados verificáveis; testar restauração.
3. Criar novo repositório e preservar histórico sem segredos.
4. Implementar backend paralelo e autenticação segura, com migração de contas e permissões.
5. Migrar registros e objetos com checksums e sincronização de alterações.
6. Executar testes unitários, integração, E2E, isolamento, mídia e tempo real.
7. Validar PR #115 separadamente antes de integrar.
8. Realizar corte de tráfego reversível; manter origem para rollback.

## Execução verificada
- Leitura do README, package.json, árvore Git e patch PR #115.
- Criação deste branch preparatório e deste registro.
- Nenhuma alteração em produção; nenhum banco migrado; nenhum teste de execução realizado.

## Próximos passos
- Auditar SQL, frontend e configuração das APIs.
- Verificar quotas e viabilidade sem cobrança.
- Preparar cópia integral no novo repositório quando houver método autorizado de criação.
- Atualizar este arquivo após cada etapa com SHA, testes e rollback.
