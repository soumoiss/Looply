# Looply original — etapa 1: autenticação isolada

Objetivo: continuar o **projeto original** e preparar só a autenticação, sem copiar mídia, banco, chat, feed ou outras funcionalidades, e sem alterar o login principal.

## Estado atual

- Login principal `login.html`: **inalterado**.
- Auth e banco ativos: Supabase do Looply original.
- Seis contas e seis perfis já cadastrados no projeto original (verificação em 25/10/2026).
- Cadastro de novos usuários **já implementado** em `admin.html`: "Gerenciamento de usuários → Cadastrar novo usuário". Exige login administrativo. A operação é validada em `supabase/functions/looply-admin/index.ts`, action `user_create_with_password`, e cria o perfil correspondente.
- Alternativa no dashboard: Authentication → Users → Add user. **Preferir a aplicação**, pois o formulário de administrador coordena username, dados do perfil e senha inicial.

## Preparação nova nesta etapa

1. `src/auth-gateway.js`: fronteira isolada de autenticação. Aceita username ou e-mail; para username usa a função `looply-login` (com o fallback original já existente); para e-mail usa Auth; confirma o usuário no servidor e carrega somente `profiles.id` correspondente à identidade verificada. `ACTIVE_AUTH_PROVIDER` atualmente é `supabase`.
2. `login-teste.html` + `src/login-teste.js`: tela separada de teste real de login e de carregamento de perfil. Reutiliza a sessão `looply-auth` do aplicativo original, para que o usuário possa seguir para `home.html`.
3. `tests/auth-gateway.test.mjs`: cobertura de entradas, credenciais inválidas, perfil vinculado e indisponibilidade do gateway.
4. `scripts/build.mjs`: publica a página adicional no artefato estático.

## Procedimento de teste

1. No Looply original, entrar com a conta administrativa autorizada, abrir Administração → Gerenciamento de usuários → Cadastrar novo usuário e informar username, e-mail, nome e senha. Ou testar primeiro uma conta que já existe.
2. Abrir `login-teste.html` no **mesmo domínio** da aplicação.
3. Informar username ou e-mail e senha. O servidor original valida a senha. A página só renderiza perfil quando Auth verifica o usuário e a linha de `profiles` corresponde ao ID autenticado.
4. Confirmar nome e @usuário exibidos; clicar "Abrir o Looply original" para verificar reaproveitamento da sessão.
5. Testar senha incorreta: não deve exibir perfil. Fazer logout e verificar que o painel de perfil desapareceu.

## Migração futura apenas da autenticação

O código agora oferece uma fronteira específica para substituir o provedor depois. **Não trocar somente o login por Neon Auth enquanto o restante do projeto exige `auth.uid()` do Supabase**: os IDs e tokens não são automaticamente intercambiáveis, e isso quebraria as políticas RLS do feed/chat/perfis. A migração futura deverá incluir emissor/sessão confiável e mapeamento de identidade, preservando os IDs de dados e suas políticas. Cloudflare Workers pode servir de gateway seguro; Neon fornece banco/Auth conforme arquitetura escolhida. Nenhuma migração foi iniciada nesta etapa.

## Publicação

`vercel.json` está com `git.deploymentEnabled=false`, portanto push no GitHub **não garante** uma nova publicação Vercel. É preciso criar/testar deployment deliberado, primeiro em preview, sem substituir produção. As operações de cadastro e login reais exigem o backend original disponível; testes automatizados com mocks não demonstram acesso real.
