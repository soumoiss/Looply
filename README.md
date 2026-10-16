# Looply

Reconstrução independente do Looply com uma página HTML por área e Supabase como backend.

## Páginas

- `login.html`: tela antiga de login, com a mesma estrutura e folha visual.
- `home.html`: coleção de cartas antigas, leitura, filtros, calendário e feed social.
- `galeria.html`: acervo antigo privado, visualizador de fotos/vídeos/áudio, comentários e feed social.
- `musicas.html`: playlist do YouTube conforme o usuário, dedicatórias e comentários.
- `chat.html`: conversas em tempo real, anexos e cartas privadas para Peixinho.
- `perfil.html`: edição do nome de exibição, foto, biografia e privacidade.
- `admin.html`: consultas administrativas auditadas e importação do acervo antigo, somente para Peixinho.

As páginas compartilham os módulos em `src/`, mas cada uma tem seu próprio HTML e JavaScript de entrada em `assets/js/`; os estilos de página ficam em `assets/css/pages/`. O player de cada playlist funciona sem chave da API. Para exibir também a relação pesquisável de faixas ao lado do player, configure `LOOPLY_YOUTUBE_API_KEY` no ambiente de build. O script injeta essa chave pública no bundle do navegador; restrinja-a à YouTube Data API v3 e aos domínios do app. O ID enviado para Peixinho está em `src/youtube-playlist.js`.

## Configuração e execução

`config.js` contém a URL do projeto Supabase, sua publishable key e um campo vazio para a chave opcional do YouTube. Não coloque senhas, `service_role`, tokens privados ou chaves secretas nesse arquivo. A chave da YouTube Data API é pública no navegador por projeto: proteja-a com restrições de API e de referenciador HTTP antes de configurar `LOOPLY_YOUTUBE_API_KEY`. Para executar localmente, use Node.js 22 ou posterior e sirva a raiz por HTTP.

```text
node scripts/build.mjs
node --test tests/foundation.test.mjs
```

O build gera `dist/` com as páginas estáticas e os módulos do navegador. O conteúdo da pasta de referência em `work/legacy-app/` não é publicado pelo build.

## Contas e dados

O login converte o username confirmado em e-mail e autentica com Supabase Auth. As quatro contas existentes são `Patati`, `Misol`, `Yara` e `Peixinho`; o UUID e o perfil de cada uma vêm do projeto Supabase. Peixinho tem a associação administrativa no backend. Senhas não ficam no código.

As migrações em `supabase/migrations/` definem tabelas, relacionamentos, buckets privados, políticas RLS e funções. Fotos, vídeos e anexos enviados pela aplicação usam esses buckets privados e recebem URLs assinadas depois da autorização.

## Conteúdo antigo e itens ainda pendentes

A cópia local de referência contém 97 cartas (47 Misol, 42 Patati e 8 Yara) e 256 caminhos únicos de mídia catalogados (209 referências comuns e 48 exclusivas, com uma repetida entre as listas). A migração de esquema já foi aplicada ao projeto Supabase; os buckets continuam privados e os objetos do acervo ainda não foram enviados. A aplicação inclui importação auditada no painel de Peixinho, com upload retomável, validação, progresso e repetição idempotente. O build não publica cartas nem arquivos de mídia.

Para importar o acervo, extraia `Loooply-main.zip` em uma pasta local. Depois que a atualização do branch estiver na prévia Vercel, entre como Peixinho, abra Administração, informe um motivo com pelo menos 20 caracteres, escolha a pasta extraída completa `Loooply-main` e inicie a importação. O processo lê as cartas e o catálogo local no navegador e envia os arquivos ao bucket privado. Ele usa somente os caminhos catalogados, preserva as audiências exclusivas e as descrições `MSG_*.txt` junto às mídias; mídias catalogadas que não estiverem na pasta selecionada são ignoradas, sem bloquear as cartas e demais arquivos disponíveis. Nenhuma senha de conta, carta ou chave privada entra no repositório. Repita a importação para retomar falhas.

O build e 24 testes estáticos passaram nesta revisão. Ainda faltam a importação real das cartas/mídias, testes de navegador com as quatro contas (incluindo duas sessões e isolamento de acesso), validação visual por screenshots, testes móveis e confirmação de todos os fluxos na prévia. Build e testes estáticos não comprovam a operação ponta a ponta.

Para a publicação, use o branch/PR de trabalho no repositório `soumoiss/Looply`. Configure no Vercel Build Command `npm run build` e Output Directory `dist`. A prévia da PR deve ser validada antes de qualquer publicação em produção.
