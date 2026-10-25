# Login do Looply: investigação e correções parciais — 25/10/2026

**Estado: NÃO CONCLUÍDO. Não foi comprovado login real, sessão persistida nem
acesso aos dados no GitHub Pages.** Uma publicação ou testes simulados aprovados
não satisfazem esse critério.

## Causa comprovada

Em 25/10/2026, às 04:05 UTC (01:05 em Fortaleza), chamadas públicas reais ao
projeto `qixocgetiwlrsbadpbvh` retornaram:

| Serviço | Requisição sem credenciais de usuário | Resultado |
| --- | --- | --- |
| Auth | GET `/auth/v1/health` | 402, `exceed_egress_quota` |
| Data API | GET `/rest/v1/profiles?select=id&limit=0` | 402, `exceed_egress_quota` |
| Login | OPTIONS `/functions/v1/looply-login` | 402, `exceed_egress_quota` |
| Storage | GET `/storage/v1/version` | 402, `exceed_egress_quota` |

Os logs do projeto confirmaram também POSTs 402 na RPC
`looply_login_fallback` e em `/auth/v1/token`. O plano da organização foi
confirmado como **Free**. O estado administrativo `ACTIVE_HEALTHY` não significa
que o gateway público esteja liberado.

O navegador abriu o GitHub Pages e chegou ao formulário com usuário e senha,
sem exigir e-mail. A conexão administrativa ao banco funciona, mas não cria
uma sessão de usuário no navegador nem libera o gateway público. Não usamos
essa conexão como proxy público, não emitimos JWTs artificiais e não desativamos
RLS para aparentar um login funcional.

A documentação do Supabase informa que restrições de cota são removidas no
novo ciclo; pausar ou excluir projetos não apaga o consumo já acumulado.
O dia exato do reset não foi confirmado: o painel de uso requer autenticação
separada neste navegador, e o conector não fornece o ciclo de faturamento.
Não fizemos upgrade, não removemos limites de gastos e não solicitamos serviços
pagos.

Referências oficiais:
- https://supabase.com/docs/guides/troubleshooting/http-status-codes
- https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy

## Dados preservados e avaliação de migração

Inventário agregado por consulta administrativa, sem extrair senhas ou conteúdo
privado para o repositório:

- 6 contas Auth; os 6 hashes existentes são bcrypt.
- Banco com aproximadamente 21,45 MB, 56 tabelas públicas e 44 funções públicas.
- 277 objetos de mídia, somando 369.296.700 bytes, conforme metadados do Storage.

O banco e os objetos de produção não foram modificados. A consulta de teste
da RPC foi encerrada com `ROLLBACK`, sem consumir permanentemente o limite
de tentativas. O inventário é metadado; **não é um backup dos arquivos de mídia**.

A conta Neon conectada está no plano Free e sem projetos. O plano publicado
inclui 1 GB de Postgres e 5 GB de Object Storage, mas também tem cotas de
transferência e computação. Capacidade suficiente não equivale a migração
compatível.

A documentação atual do Managed Better Auth afirma que a migração padrão não
preserva senhas de usuários Supabase devido aos algoritmos diferentes. Portanto,
a simples troca de URL para Neon viola o requisito de manter as senhas. Uma
alternativa com autenticação própria pode verificar os bcrypt existentes, mas
exige implementação e validação de sessões, recuperação, permissões/RLS, IDs,
RPCs, mídia privada e eventos em tempo real. Não está implementada neste patch.

Além disso, o gateway Storage de origem responde 402; não foi validada uma rota
autorizada de exportação dos bytes das 277 mídias. Transferir apenas os registros
`storage.objects` não transfere os arquivos. Não mudamos a configuração de
produção para um backend vazio ou parcialmente migrado.

Uma nova instância Supabase na mesma organização continua sujeita à restrição
da organização. Uma troca de provedor só pode ser considerada concluída após
exportação protegida e restauração verificadas, preservação das identidades,
comparação de contagens/checksums e testes reais de acesso autorizado e negado.

Referências oficiais consultadas:
- https://neon.com/pricing
- https://neon.com/docs/auth/migrate/from-supabase
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Correções deste patch

- HTTP 402 retornado por Auth ou validação de sessão não perde sua classificação
  quando envolvido em outro erro. A interface explica o bloqueio do provedor.
- HTTP 429 não dispara outra tentativa por uma rota secundária; a interface
  informa o limite de tentativas.
- Respostas sem sessão/tokens não redirecionam para o feed como se o login
  tivesse terminado.
- A Edge Function diferencia indisponibilidade de dependências e limite de
  tentativas de credenciais inválidas. Exceções inesperadas retornam 503.
- O console do login registra apenas o código HTTP, sem objetos de requisição,
  respostas ou tokens.
- `node scripts/check-login-service.mjs` reproduz quatro verificações públicas,
  sem senhas. Código de saída 0: endpoints respondem 2xx; 2: algum 402;
  1: outras falhas. Um resultado 0 **não comprova autenticação**.
- Dez novos testes executam o handler real com respostas simuladas para sucesso,
  fallback, 401, 402 em diferentes etapas, 429 e sessões ausentes.

## Reversão e continuidade

O ponto anterior ao patch é o commit
`ea79d0de7882a8220478cfdead2fce76ecc3166d`, preservado na branch
`backup/login-before-20261025`. Para reverter, aplicar um `git revert` do commit
do patch e publicar pelo workflow existente. Não usar force push nem reproduzir
migrações antigas com `--include-all`. Nenhuma migração de banco faz parte
deste patch.

O código continua usando Supabase Auth e suas sessões persistidas. Esse caminho
voltará a poder ser validado quando o provedor liberar as APIs; o patch não
promete uma data de liberação nem disponibilidade ilimitada de plano gratuito.
A senha de uma conta real deve ser fornecida somente pela interface segura de
autenticação do navegador, nunca no chat, em logs ou em arquivos do repositório.

Para concluir, é necessário obter resposta operacional de Auth/Data API/Storage
ou concluir a migração completa descrita acima; então executar login real por
username, abrir dados da própria conta, recarregar/reabrir a página, verificar
renovação e persistência da sessão e testar que outra conta não acessa dados
privados. Esses testes de produção continuam pendentes.
