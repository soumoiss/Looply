# Auditoria técnica inicial do Looply

Data da auditoria: 2026-10-26  
Escopo: revisão incremental do prompt mestre, do código ativo, da bridge Neon e das policies reais da branch principal. Esta auditoria continua; não declara o aplicativo inteiro concluído.

## Registro técnico de achados e estado

| Área / local | Comportamento e causa observada | Ação aplicada | Verificação / estado |
|---|---|---|---|
| Seletor musical e mídia de Stories (`src/story-music-picker.js`, `src/story-studio.js`) | Selecionar faixa de catálogo abria seletor local; fontes comerciais retornam metadados/prévias, não licença de sincronização | PR #135 manteve seleção no app e separou áudio pessoal; preservou mídia 9:16 com composição integral. PR #142 alinhou câmera e preview sem zoom imprevisto | CI dos PRs passou; faltam publicação autenticada real com áudio autorizado e teste físico |
| Reprodução de vídeo com trilha em Stories (`src/stories.js`) | A trilha podia tocar enquanto o vídeo aguardava gesto ou buffer; evento atrasado do vídeo anterior podia controlar a trilha seguinte | PRs #148, #149 e #150 iniciam a trilha quando o vídeo realmente reproduz, pausam ambos juntos e isolam eventos por slide | `npm test`: 381/381 aprovados; Verify Looply e Pages do #149 passaram, arquivo servido conferido; deploy do #150 e publicação autenticada com inspeção de áudio ainda pendentes |
| Ações administrativas (`src/admin.js`, `src/neon-rest-bridge.js`) | Controllers antigos invocam `looply-admin`; bridge ativa não oferece esse endpoint | PR #139 removeu identidade administrativa codificada em Cartas; operações não portadas seguem bloqueadas. Não há bypass direto nas tabelas | `v3_self_is_admin()` foi confirmada no Neon e é derivada do JWT. Administração/mutação segue pendente até portar endpoint autenticado e auditável |
| Menções e notificações (`src/story-studio.js`, `src/stories.js`) | Nenhum suporte persistente a menções | PR #143 adicionou referências por ID, RPC de autoria/expiração/visibilidade, notificação deduplicada e link ao Story | Migração aplicada no Neon e RLS verificada; falta exercício com duas contas |
| Feed/Reels (`src/social.js`) | Reels só usa mídia real do feed; controle salvo incluído no PR #146 | PR #144 criou visualizador vertical com ações reais; PR #145 simplificou compartilhamentos externos; PR #146 criou save persistente por usuário | Runs Verify #2623 e Pages #487 passaram; migração `saved_posts` aplicada no Neon main, RLS e FK verificadas. Sem sessão autenticada, falta teste user-to-user/device |
| Visibilidade do feed (`posts`) | Consulta do cliente não adiciona filtro local, portanto depende da RLS | Nenhuma mudança necessária: policy real `v3_posts_visible_for_verified_users` chama `v3_can_view_post(id)` | SQL da branch principal confirmou regra pública/autor/destinatário selecionado, moderação excluída; usuário sem identidade não recebe linha |
| Cartas arquivadas (`src/archived-cards.js`) | Com recibos de leitura indisponíveis, coleção não deve desaparecer; edição usa `window.prompt` e só tem corpo. `archived_cards` não tem coluna de título | PR #141 preservou cartas quando falha recibo. Edição ampla está bloqueada: o fluxo depende do `looply-admin` inativo e não deve gravar diretamente contornando auditoria | Esquema Neon confirmado. Consulta busca destinatário ou `v3_self_is_admin()`. Falta recuperar endpoint, criar modal/título compatível e verificar casos Peixinho/destinatário |
| Música (`src/music.js`, `src/music-admin-playlists.js`, `src/neon-rest-bridge.js`) | Dedicatórias exigem campos de texto/link; comentários por faixa usam tabela, mas bridge/policies atuais restringem consulta a próprios comentários; playlist admin usa `looply-admin` | Nenhum atalho implementado; cadastro público segue estado atual, admin continua bloqueado | `music_track_comments` existe e `track_key` está restrito a YouTube ou `library:<uuid>`. Falta integrar busca de catálogo e um caminho de permissão coerente por destinatário sem expor comentários |
| Chat (`src/chat.js`, `src/chat-enhancements.js`, `src/neon-production-client.js`) | Além dos filtros (#138), o Neon não tinha as RPCs de entrega/leitura; notificações tinham RLS sem políticas, e o contador limitava-se às últimas 50 notificações globais | PR #151 adicionou RPCs com validação de participante, leitura/atualização de notificação própria, contagem paginada por usuário e lote de entrega até 50 conversas | Neon temp branch compilou as funções; chamadas sem identidade e lote >50 retornaram `false`; privilégios verificados (sem update de preview). Main aplicado; 31 mensagens e 33 notificações preservadas; falta testar com duas contas autenticadas. Ainda faltam stickers, foto de grupo e avatares em todos os estados |
| Galeria (`assets/js/gallery.js`) | Grade superior reorganizada; funcionalidades de upload/edição/favorito não foram verificadas em sessão autenticada | PR #140 realizou apenas layout 3×2, sem remover opções existentes | Necessário teste visual e de upload em usuário comum/ADM; mobile não medido nesta execução |
| Chamadas (`src/chat-calls.js`, `backend/neon-cloudflare/realtime-worker.mjs`) | Adaptador existente fornece realtime de conversa e Durable Object; disponibilidade de sala depende de `LOOPLY_ROOMS`; chamada é distinta do chat realtime | Sem alteração de infraestrutura ainda | Configuração/credenciais de staging não provam chamadas em produção. Falta verificar sinalização WebRTC, TURN e duas sessões; câmera/microfone físico indisponíveis |
| Navegação autenticada e mobile | Páginas protegidas encaminham visitante anônimo ao login | Nenhuma sessão de teste foi criada ou assumida | Sem conta/sessão fornecida: fluxos autenticados não foram executados. Sem dispositivos físicos: Safari iOS e Chrome Android pendentes |

## Publicações verificadas

- PR #135: seletor musical interno e enquadramento de Stories.
- PR #138: filtros de chat pela lógica dos dados.
- PR #139: identidade admin no Neon, sem nome codificado.
- PR #140: ações superiores da Galeria 3×2.
- PR #141: fallback de recibos não oculta coleção arquivada.
- PR #142: geometria da câmera/preview de Stories.
- PR #143: menções e notificações autorizadas.
- PR #144: Reels com mídia real do feed; Pages #485 passou.
- PR #145: apresentação limpa de compartilhamentos externos; Pages #486 passou.
- PR #146: salvamento persistente de publicações; migration `saved_posts` aplicada após verificar estrutura e policies Neon; Pages #487 passou no commit `4a7e3358fdd1890bd586f27ea5ca114b566ca302`.
- PR #151: recibos de leitura/entrega de Chat e permissões de notificações no Neon; Verify passou e Pages Actions #40421836605 passou após merge no commit `120d39fe137d03ca3300367cea89330a1a042324`; migração validada em branch Neon temporária e aplicada à main sem alterar linhas existentes.

## Pendências do prompt mestre — inventário atualizado

1. Stories: opção `allow_reposts`, republicação de Story mencionado com atribuição e validação server-side, bloqueio de ampliar audiência de Story privado; teste autenticado de publicação com faixa efetivamente autorizada e verificação do arquivo/stream publicado.
2. Feed/Reels: teste de salvar/remover com duas contas, comentários e playback em navegador autenticado; validação de posição de feed e dispositivos.
3. Admin: portar `looply-admin` para Cloudflare/Neon autenticado com JWT, verificação role no Neon, autorização por recurso, auditoria e limites; somente então habilitar editor/admin/carta privada/música/playlists. Testar requisição direta como comum e administrador.
4. Cartas: resolver consulta de carregamento se reproduzível; modal completo (título/edição/dedicação/metadados conforme schema), alterar dica e senha com hashing, substituir prompts; confirmar autor/destinatário/Peixinho.
5. Música: unificar pesquisa por Apple/iTunes, Deezer, Audius onde permitido; seletor interno para dedicatórias; recebidas/enviadas; playlists admin com usuários pesquisáveis/avatar; comentários individuais com leitura autorizada do destinatário e atualização realtime; sem assumir licença de catálogo.
6. Galeria: verificar upload/categorias/filtros/curtir/favoritar/editar/excluir e controles no viewer em 320–390 px.
7. Chat: foto de perfil para contatos, upload/substituição de avatar do grupo com autorização por membro, figurinhas autorizadas com busca/categorias/favoritos/recentes, envio de mensagem tipada e exclusão pelo dono.
8. Chamadas: confirmar backend real de sinalização/ICE/STUN/TURN, reconstruir tela com streams reais, testar duas sessões e liberar tracks/listeners ao encerrar.
9. Qualidade: navegador autenticado comum/dono/destinatário/ADM; 320–390 px; Chrome Android, Safari iOS, desktop; rede lenta; console/requisições e mídia real. Esta sessão não tem login de teste nem dispositivos físicos.

## Preservação

As alterações de banco aplicadas foram DDL aditiva/restritiva para menções/notificações e favoritos salvos. Não foram apagados nem recriados dados, tabelas ou banco. Os conteúdos de áudio comercial não são copiados a partir de previews.
