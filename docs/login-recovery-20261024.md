# Login do Looply — recuperação automática por nome de usuário (24/10/2026)

## Incidente e causa

A Edge Function `looply-login` recebeu HTTP 402 durante o preflight
`OPTIONS`, antes da validação das credenciais. A mensagem anterior
"usuário ou senha incorretos" era enganosa para esse cenário.

## Correção publicada

O formulário solicita **somente usuário e senha** e tenta `looply-login`.
Se a Edge Function estiver indisponível (402/429/5xx/rede), o cliente chama
`public.looply_login_fallback(p_username,p_password)` via Supabase PostgREST.
Essa RPC executa o verificador protegido `login_internal.looply_verified_login_email`.
Ela compara a senha informada com o hash bcrypt existente em `auth.users`
e consulta o usuário atual em `public.profiles`, sem copiar senhas para o
código do GitHub ou divulgar e-mails de usuários sem validação.

A RPC possui controle de tentativas (10 verificações por usuário em 15 minutos)
e só retorna o e-mail quando a senha corresponde. O cliente então chama
`supabase.auth.signInWithPassword` e recebe uma sessão **real** do Supabase
Auth, com as mesmas regras RLS e o mesmo ID da conta existente.

Novas contas são consultadas dinamicamente por `profiles` e `auth.users`;
nenhuma atualização de lista estática é necessária.

## Implantação

A solução de banco foi aplicada diretamente no projeto `qixocgetiwlrsbadpbvh`
com os registros de migração `20261024233604` e `20261024233841`.
O script completo de recuperação está em
`supabase/manual/verified_username_login_fallback.sql`.

A pasta `supabase/migrations` contém marcadores dos dois registros para
manter o histórico reconhecível. Não registrar uma nova migração pendente
sem antes reconciliar outras migrações históricas fora de ordem:
`supabase db push` encontrou versões antigas locais ainda não marcadas
como aplicadas remotamente. **Não executar** `--include-all` sem auditar
os efeitos dessas migrações, pois algumas podem já ter sido aplicadas.

## Verificações realizadas

- `anon` possui `EXECUTE` apenas na RPC de login e no verificador
  isolado; não possui `USAGE` no esquema `private`.
- Uma tentativa de login de usuário inexistente, sob `SET LOCAL ROLE anon`,
  retorna `null`, sem expor e-mail.
- `pgcrypto` suporta a comparação bcrypt no banco.
- Em 24/10/2026, as seis contas Auth possuíam hashes bcrypt `$2a$`,
  compatíveis com a verificação.
- A validação estática do projeto e a implantação do GitHub Pages
  finalizaram com sucesso após as alterações da interface.

## Limitações

A rota secundária contorna falhas da **Edge Function**, mas ainda necessita
que PostgREST e Supabase Auth estejam disponíveis; não é um provedor
independente do Supabase. Sem a senha de uma conta de teste não foi possível
executar login real completo. Se o serviço Auth ou PostgREST também responder
402, será necessário corrigir o bloqueio do projeto antes de criar sessões.

A senha nunca deve ser armazenada no repositório, no HTML ou em
`GitHub Secrets` como banco de usuários. Chaves secretas nunca devem ser
inseridas no frontend.
