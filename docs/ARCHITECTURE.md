# Arquitetura inicial do Looply

## Aplicação

A aplicação usa ES modules nativos e tem entradas HTML separadas para login, início, galeria, músicas, chat/cartas, perfil e administração. O login reutiliza o HTML/CSS legado; as páginas autenticadas reutilizam o CSS antigo e os módulos novos do Supabase. A reprodução visual das páginas, especialmente a coleção arquivada de cartas, ainda não está completa. A auditoria de HTML/CSS e as lacunas de conteúdo estão em `docs/LEGACY_AUDIT.md`. O código de interface não contém credenciais administrativas. O cliente Supabase é carregado em uma versão exata do pacote oficial, @supabase/supabase-js 2.117.3.

Arquivos principais:

- `index.html` redireciona ao login; cada página autenticada tem seu próprio arquivo HTML.
- `assets/css/app.css` conserva estilos antigos; `assets/css/pages/` contém ajustes por página e `styles.css` mantém os componentes novos.
- config.js recebe somente a URL do projeto e sua publishable key.
- scripts/build.mjs publica somente os arquivos necessários ao browser em dist/; Vercel serve esse diretório, não as migrações nem o código das Edge Functions.
- `src/` contém autenticação, shell das páginas, perfis, feed, mídia, música, conversas e administração.
- `src/youtube-playlist.js` escolhe a playlist por username e usa o player incorporado; não reutiliza a chave de API pública do código antigo.
- supabase/migrations/ é a fonte versionada do esquema.
- src/social.js mantém a leitura e as ações do feed em um módulo separado da sessão.
- src/music.js implementa uma biblioteca musical privada por usuário, dedicatórias e comentários com visibilidade privada ou compartilhada entre participantes.
- src/chat.js implementa conversas diretas, cartas privadas para Peixinho, anexos, notificações, recibos de leitura e atualizações Realtime.

## Banco e autorização

A migração inicial cria perfis ligados exclusivamente a auth.users, normaliza e valida usernames, e cria um espaço privado para membros administradores. O username precisa pertencer à lista confirmada `patati`, `misol`, `yara`, `peixinho`; uma restrição SQL protege essa regra também nas gravações diretas à API. Grants SQL e trigger bloqueiam a troca de username. As inscrições públicas ficam desativadas; o proprietário cria as quatro contas em Supabase Auth. Para usuários criados sem metadata, o trigger deriva o username da parte anterior a `@` no e-mail e valida a lista permitida. O perfil não contém papel de usuário. O trigger nunca concede privilégios a partir de metadata.

Os perfis usam RLS. Uma pessoa autenticada lê seu próprio perfil e os perfis que foram marcados como visíveis para membros ou publicamente; cada pessoa atualiza somente sua linha e um conjunto limitado de colunas. Visitantes `anon` podem selecionar apenas `id`, `username`, `display_name`, `bio` e `profile_visibility`, e somente em perfis com visibilidade pública. A lista de administradores fica em `private.admin_users`, sem privilégios diretos para clientes. A função `private.is_admin()` usa `auth.uid()` e não consulta metadata editável.

Publicações e comentários também usam RLS. A função privada private.can_view_post() calcula a visibilidade por autor, público ou destinatário escolhido. Publicações privadas ficam com o autor; publicações selecionadas são criadas por uma função transacional que valida de 1 a 20 perfis visíveis. A lista de destinatários só é legível por quem publicou e pelo destinatário correspondente. Comentários e respostas exigem autorização na publicação em cada leitura e escrita; a resposta é limitada a um nível e sua chave estrangeira garante vínculo com a mesma publicação. A tabela de posts e a de comentários estão na publicação Realtime. O cliente trata eventos como sinal para buscar o estado persistido novamente.

Fotos e vídeos de publicações e comentários usam o bucket privado `looply-media`, com lista MIME restrita e máximo de 100 MiB. O caminho do objeto inclui o UUID do post e, para anexos de comentários, também o UUID do comentário. As políticas de `storage.objects` consultam o registro da mídia e a mesma autorização de leitura do post. A aplicação só emite URLs assinadas por 30 minutos depois que o Storage confirma o acesso; uploads usam TUS com blocos de 6 MiB e tentativas de reconexão. O limite de oito mídias por publicação e quatro por comentário é validado no banco. Avatares usam o bucket privado `looply-avatars` (máximo de 10 MiB) e caminhos vinculados ao UUID do proprietário; a leitura segue a visibilidade do perfil.

Dedicatórias musicais têm remetente e destinatário explícitos e não são públicas. A coleção pessoal usa uma tabela separada com RLS de proprietário; links externos aceitos são limitados a provedores de música conhecidos. Comentários de dedicatórias ficam privados ao autor por padrão; o autor pode compartilhá-los somente com os participantes da dedicatória. Leituras e gravações são persistentes e a publicação Realtime inclui a coleção, as dedicatórias e os comentários.

O Data API exige privilégios SQL e políticas RLS. As migrações concedem somente os privilégios necessários; RLS continua sendo a regra de linha. As tabelas da aplicação devem receber grants explícitos, pois projetos novos podem não expor automaticamente novas tabelas. Consulte a [documentação de segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api) e o [guia de Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Conversas, cartas e administração

Conversas diretas guardam exatamente os participantes criados por uma função confiável. Mensagens, anexos, marcadores de leitura e notificações são persistentes; o acesso a conversas e arquivos exige participação. Anexos usam o bucket privado `looply-chat`, validação de objeto no banco e URLs assinadas temporárias. Uma carta cria uma conversa privada direcionada somente ao perfil `peixinho` quando a associação administrativa verificada existir. A resposta continua no mesmo histórico de chat.

As funções de criação não são executáveis por `anon` nem por `authenticated`. A Edge Function `looply-chat` exige JWT válido, deriva o UUID do usuário de `auth.getUser()` e invoca as funções SQL com a chave secreta apenas no servidor. Leituras administrativas de publicações, mídia, biblioteca musical, dedicatórias, perfis, cartas e conversas passam por `looply-admin`; o servidor verifica a associação, exige motivo de consulta, registra o pedido antes da leitura e audita a entrega de links assinados. Comentários administrativos em publicações privadas também registram pedido, conclusão ou falha, sempre com autoria do perfil administrador. O schema `private.admin_audit` não concede leitura direta a clientes. As funções privilegiadas têm `search_path` vazio.

## Autenticação e configuração

Para desenvolvimento, edite config.js com a URL de Looply V2 e a publishable key desse mesmo projeto. Essa chave foi projetada para o cliente e não substitui RLS. Não coloque chaves secretas, senhas ou tokens administrativos no código, no HTML ou no navegador. O app usa e-mail e senha do Supabase Auth e persiste a sessão pelo SDK.

O Supabase remoto usa URL e redirecionamento do site; o cadastro público fica desativado e o frontend oferece login por username. O proprietário provisiona as contas no Auth e marca cada conta como confirmada, sem exigir caixa postal ou SMTP para login. SMTP é necessário somente para enviar recuperação de senha por e-mail. As migrações não criam usuários nem armazenam senhas.

## Etapas de implementação

1. **Fundação e perfis — esquema implementado:** Auth por username, edição e descoberta de perfis com RLS; os quatro perfis ativos existem e já foram conferidos no Auth.
2. **Publicações, comentários e mídia — esquema e interface implementados:** feed persistente, visibilidade pública/privada/escolhida, respostas de um nível, Realtime e fotos/vídeos em bucket privado com links assinados. A validação de isolamento com duas contas ainda depende de usuários de teste.
3. **Músicas — esquema e interface implementados:** coleção pessoal privada, dedicatórias entre perfis, comentários privados/compartilhados e atualizações Realtime.
4. **Administração — infraestrutura implementada:** Edge Function e RPCs de serviço para leituras e comentários auditados. Peixinho já está associado ao grupo administrativo e a concessão inicial foi auditada.
5. **Chat e cartas — esquema e interface implementados:** conversas por participante, mensagens e anexos em tempo real, cartas privadas e notificações. A resposta a uma carta usa o mesmo chat.
6. **Acervo antigo — esquema e interface de importação implementados:** cartas arquivadas, estado de leitura, filtros, calendário, visualizador de mídia e comentários têm tabelas, políticas e fluxo de importação próprios. O acervo ainda não foi enviado ao Storage.
7. **Integração:** testar com as contas existentes, em especial isolamento entre duas sessões, anexos, sincronização entre dispositivos e falhas de rede; revisar visualmente em dispositivos móveis.

## Limitações conhecidas desta etapa

O Supabase remoto registra 19 migrations aplicadas e as Edge Functions `looply-admin` (versão 5) e `looply-chat` estão ativas. Há quatro contas Auth com perfis correspondentes; Peixinho está no grupo administrativo. Os buckets são privados; a consulta de estado confirma que nenhuma carta ou mídia do acervo antigo foi importada ainda. O build e 24 testes automatizados passaram localmente. A auditoria catalogou 97 cartas e 256 caminhos únicos de mídia, todos presentes na cópia extraída; a interface para importá-los já está no código local e aguarda atualização da prévia e seleção da pasta no navegador. Ainda faltam os fluxos integrados com as contas, a comparação por screenshots e a validação móvel.



