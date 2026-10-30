# Looply Android Release 3.0.4 — assinatura verificável
Data: 2026-10-30

## Artefato assinado fora do GitHub
- APK: `Looply-Android-3.0.4-RELEASE-ASSINADO.apk`
- Source commit de build: `f67cab1c58906a996b831b5e2f1c9703ba17e178`
- CI de build: https://github.com/soumoiss/Looply/actions/runs/41124514828
- Tamanho: **4.037.851 bytes**.
- APK SHA-256: `3e3fcbf682c66f6687fdb3202fe204b6f3a51dc4e5f4670e4a56a79b7b48c200`
- Certificado SHA-256: `0d7a7eb02810db2ac32aa5c08afc05f3247eb9ac26effde8872e150b05ad4ad6`
- Chave de assinatura: RSA 4096, alias `looply-release`.
- Verificação com `apksigner.jar` do Android SDK 36: **v2=true; v3=true; 1 signatário**.
- APK com `assets/share.html`, `assets/src/stories.js`, `assets/src/chat-calls.js`, `assets/src/neon-production-client.js`, `AndroidManifest.xml` e `classes.dex`.

## Preservação do segredo
A chave privada de assinatura NÃO está no repositório, nem no Android APK, nem em JavaScript público. Backup JKS com senha separada está disponível apenas como artefato privado de entrega para o proprietário. A key original de builds anteriores é diferente; Android não permite instalar atualização com certificado não correspondente.

Para permitir futuras Releases assinadas com esta mesma identidade, proteger a JKS num cofre de segredos (GitHub Actions Secrets/Secrets Manager), fornecer em `LOOPLY_ANDROID_KEYSTORE_B64`, `LOOPLY_ANDROID_KEYSTORE_PASSWORD`, `LOOPLY_ANDROID_KEY_ALIAS`, `LOOPLY_ANDROID_KEY_PASSWORD` e `LOOPLY_ANDROID_EXPECTED_SIGNER_SHA256`. Não salvar o keystore ou a senha no Git.

## Critérios NÃO comprovados
Não classificar como versão funcional integral:
- Worker FCM real ainda não implantado, 0 entregas push no Neon à última consulta.
- Autenticação de nova conta criada pelo painel ADM não exercitada com credenciais reais.
- Chamada WebRTC da aplicação entre usuários autenticados não testada; somente dois pares WebRTC diretos em Chromium com câmera/microfone virtuais e pacotes RTP reais.
- Instagram, uploads R2, Story final e streaming licenciado ainda dependem de testes de integração com usuários e dispositivos.
- Música promocional Spotify/Apple/Deezer não constitui licença para sincronização de áudio com Story.
- O APK Release offline acima ainda não foi publicado no GitHub Releases nem instalado de ponta a ponta.

A assinatura é tecnicamente válida; essa qualidade criptográfica não certifica as funcionalidades acima.
