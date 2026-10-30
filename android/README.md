# Looply Android (3.0.2, desenvolvimento)

Identificador Android: `com.looply.app`. Projeto Firebase: `looplyv3`.

Este módulo empacota a interface web local em `dist/` e a carrega via `WebViewAssetLoader` no HTTPS `soumoiss.github.io/Looply/`, preservando a origem esperada pelo login Neon. Os dados e mídias devem ser fornecidos por Neon PostgreSQL e Cloudflare, não por Supabase. O APK contém a interface, mas **não está comprovado como 100% funcional**: partes da migração web permanecem incompletas.

## Compilar

Requer Node.js 22, JDK compatível com o Android Gradle Plugin 9.4.1, Android SDK API 36 e Build Tools 36.

```bash
npm run build
cd android
./gradlew assembleDebug
```

O resultado de depuração fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Esta assinatura **não** serve como chave persistente de atualização da distribuição final.

## Firebase e push

`app/google-services.json` é a configuração **pública de cliente Android** gerada pelo Firebase. O projeto é `looplyv3` e o package precisa permanecer `com.looply.app`. Não adicione credenciais privadas de conta de serviço a este diretório.

O receptor Android FCM existe e mapeia tipos de notificação para telas conhecidas. Ainda faltam: associação autenticada do token FCM ao usuário no backend, persistência Neon, disparo de eventos Cloudflare, controle de duplicidade e teste real de entrega. Não confundir esta instalação com push comprovadamente funcional.

No Cloudflare, o `FCM_PROJECT_ID` e o **segredo** `FCM_SERVICE_ACCOUNT_JSON` pertencem ao Worker que enviará mensagens. Nunca copie a conta de serviço para o APK.

## Android Sharesheet

A Activity `ShareReceiverActivity` recebe `ACTION_SEND` do tipo `text/plain` e apresenta uma janela sobre o aplicativo de origem. O usuário confirma explicitamente antes de salvar o link com `v5_create_post` no Neon.

Esta implementação é limitada a links HTTPS do Instagram, TikTok e YouTube. Não extrai nem republica mídias privadas de outras plataformas, não altera a interface do Instagram e ainda exige teste real em Android e conta Neon autenticada. Recebimento de imagens e vídeos compartilhados como arquivos não está implementado nesta etapa.

## APK Release assinado

O workflow `.github/workflows/android-apk.yml` compila Debug sempre. Compila e verifica **APK Release e AAB assinados** somente se estes quatro GitHub Actions Secrets estiverem configurados:

- `LOOPLY_ANDROID_KEYSTORE_B64`: arquivo keystore persistente, codificado em Base64.
- `LOOPLY_ANDROID_KEYSTORE_PASSWORD`: senha da keystore.
- `LOOPLY_ANDROID_KEY_ALIAS`: alias da chave de assinatura.
- `LOOPLY_ANDROID_KEY_PASSWORD`: senha da chave.

Guarde backup seguro da keystore e respectivas senhas. Não gere uma keystore diferente em cada build. Nunca faça commit do arquivo privado ou das senhas.

## Pendências para entrega

Ainda são exigidos testes de login, captura e publicação com áudio, notificações em primeiro e segundo plano, links recebidos, chamadas em dois aparelhos e todos os módulos dependentes da migração Neon/Cloudflare. Uma compilação bem-sucedida não substitui testes ponta a ponta.
