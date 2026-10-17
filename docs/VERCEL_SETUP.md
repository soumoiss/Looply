# Configuração de produção da playlist do YouTube

A página de músicas usa `/api/youtube-playlist` no Vercel. A chave da YouTube Data API deve existir somente nas variáveis de ambiente do servidor.

## Variáveis obrigatórias no Vercel

Em **Project Settings → Environment Variables**, configure estas três variáveis para os ambientes que serão usados (Production e Preview, se ambos forem usados):

- `LOOPLY_SUPABASE_URL`: URL do projeto Supabase ativo, por exemplo `https://qixocgetiwlrsbadpbvh.supabase.co`.
- `LOOPLY_SUPABASE_PUBLISHABLE_KEY`: publishable key do mesmo projeto Supabase usado pelo app.
- `LOOPLY_YOUTUBE_API_KEY`: chave da YouTube Data API v3. Crie/rotacione a chave no Google Cloud se ela já foi compartilhada em conversa ou commit. Não a coloque em `config.js`, HTML, JavaScript do navegador ou GitHub.

A URL e a publishable key do Supabase precisam corresponder ao mesmo projeto. Não use uma chave `service_role` ou `sb_secret_` como publishable key.

## Depois de configurar

1. Salve as variáveis nos ambientes apropriados e faça um novo deploy do Vercel; alterar variáveis não atualiza deploys já existentes.
2. Abra o Looply, entre com uma das contas provisionadas e acesse Músicas.
3. Confirme que a lista mostra as faixas, a busca filtra títulos e selecionar uma faixa abre o player dentro do Looply.
4. Confirme que a rota `/api/youtube-playlist` retorna erro JSON controlado quando a sessão está ausente e que não revela a chave da API.
5. Repita na URL de produção e na prévia. A prévia usa o endpoint de produção configurado em `config.js`; a origem precisa continuar na allowlist de `api/youtube-playlist.js`.

## Diagnóstico

- `youtube_service_not_configured` / HTTP 503: falta uma ou mais variáveis acima no deployment que está servindo a API.
- `youtube_unauthorized` / HTTP 401: sessão ausente/expirada ou token rejeitado pelo Supabase.
- `youtube_quota_exceeded`: cota da YouTube Data API atingida.
- `youtube_key_rejected` ou `youtube_api_disabled`: verifique a chave e se a YouTube Data API v3 está ativa no Google Cloud.

O player incorporado pode continuar funcionando quando a lista pesquisável falha. Isso não deve ser considerado validação completa da playlist.
