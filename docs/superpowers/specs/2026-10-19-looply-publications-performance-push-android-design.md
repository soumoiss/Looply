# Looply — Publicações, Performance, Notificações e Android

## Objetivo

Permitir publicações de mídia sem legenda, remover burocracia da interface administrativa sem enfraquecer autorização ou auditoria, acelerar o carregamento do app e estruturar notificações in-app, Web Push e chamadas para o WebView Android.

## Contexto e restrições

- O frontend é um site estático em JavaScript, sem React; otimizações de React não se aplicam.
- O backend usa Supabase Auth, PostgreSQL, RLS, Storage, Realtime e Edge Functions.
- O APK atual é um WebView nativo em `android/`, não uma TWA nem um aplicativo React Native.
- O cliente público nunca receberá `service_role` ou chave secreta.
- A remoção de prompts administrativos não removerá autenticação ADM, RLS, autorização server-side ou auditoria.
- Browsers podem bloquear autoplay e Push depende de HTTPS, permissão do usuário e chave VAPID configurada.

## Arquitetura aprovada

### 1. Publicações sem texto

Uma migration tornará `posts.body` e o corpo de Stories compatíveis com `NULL`/string vazia, preservando limites quando houver conteúdo. O RPC `create_selected_post` aceitará corpo vazio, mas continuará validando destinatários e identidade.

Os compositores de Feed, Galeria e Stories removerão `required` e validações de texto mínimo. A regra de publicação será: deve existir pelo menos uma mídia ou, no caso de publicação textual, conteúdo não vazio. A UI renderizará legenda somente quando houver texto e não criará frases artificiais como substituto da legenda.

Comentários individuais continuarão exigindo texto não vazio; “comentário inicial opcional” significa que a criação da publicação não dependerá de um comentário.

### 2. Ações administrativas sem justificativa manual

Prompts, confirmações e campos de motivo serão removidos da UI ADM. O cliente enviará somente a ação e o recurso autorizado. A Edge Function validará a sessão administrativa e gerará um motivo técnico padronizado para `recordAccess`, preservando o histórico de auditoria sem solicitar texto ao administrador.

Exclusões, alterações de acesso, moderação e alterações de perfil continuarão protegidas por sessão server-side, membership ADM, allowlist de recursos e RLS. Não haverá caminho client-side para elevar privilégios.

### 3. Performance e mídia

Será criado um Service Worker versionado para cachear o shell estático, CSS, JavaScript, ícones e fontes com estratégia cache-first/revalidate. Respostas Supabase e mídia privada não serão colocadas em cache público.

Feed e Galeria usarão URLs transformadas para thumbnails no carregamento de listas; o visualizador solicitará a mídia original ou uma transformação HD sob demanda. Imagens terão `loading="lazy"`, `decoding="async"` e dimensões reservadas para evitar layout shift.

Consultas de Feed, Galeria, Chat e notificações serão adaptadas para páginas com `range()`/cursor, mantendo ordenação estável por data e carregando a próxima página via sentinel/infinite scroll. A atualização Realtime será limitada a invalidar ou inserir a página afetada, sem substituir a árvore inteira desnecessariamente.

Uma migration adicionará apenas índices ausentes e úteis para os filtros reais: autor/data, visibilidade/data, participantes/conversa, mensagens/data, notificações por destinatário/read state e mídia por proprietário/data. Índices já existentes não serão duplicados.

### 4. Notificações in-app e Web Push

O runtime global terá um pequeno barramento de eventos para badge e toast. A assinatura Realtime existente continuará como fonte de atualização para `notifications` e `chat_notifications`; a atualização do contador será debounced e não recarregará a página.

Será criada uma tabela `push_subscriptions` com RLS para o próprio usuário e endpoint Edge Function para registrar/remover inscrições. O navegador solicitará permissão somente após gesto explícito, registrará o Service Worker e criará a inscrição com a chave pública VAPID. A chave privada permanecerá em segredo da Edge Function.

Um dispatcher server-side será preparado para eventos de mensagem, curtida, comentário, carta, menção e anúncio. O envio Push será best-effort, com remoção de endpoints expirados e sem bloquear a transação principal.

### 5. Chamadas e Android

No navegador, o listener Realtime continuará recebendo chamadas enquanto a página estiver ativa. A camada web não prometerá WebRTC confiável com aba fechada, pois o navegador não garante execução em background.

No APK, a implementação nativa adicionará Firebase Cloud Messaging, serviço de mensagens, canal de chamadas, permissões `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` e `FOREGROUND_SERVICE_CAMERA` conforme a API alvo, além de permissões runtime de câmera/microfone já usadas pelo WebView. Uma notificação de alta prioridade abrirá a tela de chamada; o WebView assumirá a sessão WebRTC após a ação do usuário.

O código nativo também tratará token FCM, ciclo de vida e deep link seguro para a conversa. A chamada não será automaticamente atendida nem terá microfone/câmera ativados sem ação e permissão explícita do usuário.

## Fluxo de dados

1. Usuário publica mídia; o cliente valida mídia, envia Storage e cria o registro com corpo nulo/vazio.
2. Triggers/RPCs existentes criam notificações quando aplicável.
3. Realtime atualiza a UI dos destinatários conectados.
4. O dispatcher Push tenta entregar aos endpoints registrados fora do app.
5. No Android fechado, FCM exibe a notificação e o usuário abre a conversa/chamada pelo deep link.

## Arquivos e entregáveis esperados

- Migration SQL para corpos opcionais, índices ausentes e `push_subscriptions` com RLS.
- Ajustes em `src/social.js`, `src/stories.js`, `assets/js/gallery.js` e componentes ADM/Edge Function.
- Módulo compartilhado de paginação/cache e `sw.js` registrado pelo runtime.
- Módulo de inscrição Web Push e Edge Function de dispatch.
- Ajustes em `src/page-runtime.js`, notificações e listener de chamadas.
- Alterações em `AndroidManifest.xml`, `build.gradle.kts` e `MainActivity.kt`; Firebase será configurado somente se as credenciais/dependências do projeto estiverem disponíveis.
- Testes de contrato, segurança, paginação, Service Worker, Push e build web/Android.

## Critérios de aceite

- Foto/vídeo sem legenda publica no Feed, Galeria e Stories.
- Nenhuma ação ADM pede motivo ou confirmação manual; todas continuam autorizadas e auditadas.
- Listas não carregam toda a coleção de uma vez e não baixam HD para thumbnails.
- Badge de notificações muda via Realtime sem refresh completo.
- Service Worker registra, atualiza cache sem interceptar dados privados e responde ao evento Push.
- O navegador possui fluxo de permissão/inscrição Web Push documentado.
- O APK declara e solicita permissões necessárias, mantém câmera/microfone funcionando no WebView e documenta que chamada com app fechado exige FCM/nativo.
- Build web, suíte de testes e build Android passam antes do deploy.
