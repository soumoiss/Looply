# Notificações, Web Push e Android

O código do Looply já contém o fluxo web de Service Worker, a tabela `push_subscriptions`, a Edge Function `looply-push` e o serviço nativo FCM. Esta documentação lista somente o que depende de configuração externa e não pode ser criado com segurança dentro do repositório.

## Supabase / Web Push

Configure os secrets da Edge Function `looply-push` no projeto Supabase:

- `VAPID_PUBLIC_KEY`: chave pública usada pelo navegador.
- `VAPID_PRIVATE_KEY`: chave privada VAPID; nunca deve ir para o frontend.
- `VAPID_SUBJECT`: e-mail ou URL `mailto:` de contato do operador.

O `SUPABASE_SERVICE_ROLE_KEY` é usado apenas no ambiente seguro das Edge Functions. Ele não deve ser colocado em `config.js`, no bundle web ou no APK.

O navegador precisa estar em HTTPS (localhost é a exceção de desenvolvimento), aceitar a permissão explícita do usuário e conseguir registrar `sw.js`. A assinatura da inscrição é persistida em `push_subscriptions`; a função remove endpoints expirados automaticamente.

Para entrega automática de push para cada notificação criada por trigger, o produtor server-side deve chamar `looply-push` com o JWT do usuário autenticado e este formato:

```json
{
  "recipientIds": ["uuid-do-destinatario"],
  "title": "Nova atividade",
  "body": "Você recebeu uma nova notificação.",
  "url": "notificacoes.html",
  "kind": "notification"
}
```

A função é intencionalmente autenticada, valida a rota interna e nunca aceita a service role no cliente. A criação da notificação in-app continua sendo feita pelo banco/Realtime; o dispatcher push deve ser ligado ao job, webhook ou Edge Function que já conhece o evento de negócio.

## Android Studio / FCM

O módulo Android já declara `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, permissões de câmera/microfone e `FirebaseMessagingService`. Em Android 13 ou superior, o `MainActivity` solicita `POST_NOTIFICATIONS` em runtime.

Para ativar FCM no APK:

1. Crie ou selecione um projeto no Firebase Console.
2. Registre o aplicativo Android com o package `com.soumoiss.looply`.
3. Baixe `google-services.json` e coloque-o em `android/app/google-services.json`.
4. Ative o Firebase Cloud Messaging e envie o token recebido em `onNewToken` para um endpoint protegido do backend.
5. Não versione `google-services.json` se o projeto o tratar como segredo/artefato privado; use o mecanismo de secrets do CI para materializá-lo antes do build.

Sem `google-services.json`, o código compila a dependência FCM, mas o dispositivo não fica associado ao projeto Firebase e não receberá mensagens FCM de produção.

## Chamadas com app fechado ou tela bloqueada

Uma notificação FCM de alta prioridade pode acordar o serviço e abrir `conversa.html`, mas isso não é um Call Kit completo. Para chamadas de áudio/vídeo realmente prioritárias, com app fechado e tela bloqueada, o Android exige uma integração nativa de telecom (`ConnectionService`/self-managed calls), notificação full-screen com canal de alta importância e, conforme a versão, serviço em foreground com os tipos de câmera/microfone. O WebRTC continua responsável pela mídia e o servidor de sinalização pela oferta/resposta.

O WebView não pode garantir sozinho esse comportamento com o app totalmente encerrado. A implementação nativa deve ser adicionada somente quando o provedor de sinalização e o fluxo de identidade das chamadas estiverem definidos.

## Câmera e microfone

`CAMERA` e `RECORD_AUDIO` já estão no Manifest. O WebView solicita a permissão Android quando a página pede captura e só concede o pedido para a origem local confiável do aplicativo. O usuário ainda precisa aceitar a permissão no dispositivo.
