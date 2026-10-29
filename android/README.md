# Looply Android

A interface web é copiada para os assets do APK por `scripts/build.mjs` e carregada de `https://soumoiss.github.io/Looply/` com `WebViewAssetLoader` interceptando somente esse caminho. Assim, o código vem do APK e mantém a origem HTTPS já autorizada no Neon Auth e na Data API. O início do aplicativo não depende da disponibilidade do GitHub Pages. Os dados e arquivos ainda dependem dos endpoints HTTPS usados pelo cliente web; alterações no código da interface exigem novo APK, enquanto dados enviados ao backend são sincronizados sem recompilar.

## Compilação

Use JDK 17, Android SDK API 36, Build Tools 36.0.0 e Node.js 22. Na raiz do projeto, execute `npm run build`; em `android`, execute `./gradlew assembleDebug`. O workflow `.github/workflows/android-apk.yml` publica o APK debug instalável como artefato de Actions. Ele tem assinatura debug; não é uma distribuição release com chave persistente.

## Estado das integrações

O cliente web usa Neon Auth, Neon Data API e funções de armazenamento. Algumas páginas e módulos legados ainda mantêm referências ao Supabase no código. Migração integral e verificação de dados existentes exigem trabalho adicional; um pacote compilado não prova que todos os fluxos estão operacionais.

O serviço FCM Android está declarado, mas não há `google-services.json` nem registro autenticado de token no backend. Sem configuração de projeto Firebase e envio server-side, notificações push não funcionam. O app não solicita permissão de notificações até essa integração estar pronta. Chamadas WebRTC exigem sinalização e credenciais TURN reais para funcionar em redes restritivas; chamadas em segundo plano/tela bloqueada exigem implementação nativa adicional. Nenhuma dessas funções deve ser anunciada como testada em dois aparelhos só porque o APK compilou.

Links `https://soumoiss.github.io/Looply/...` são encaminhados para a interface empacotada quando chegam ao app. A verificação automática de App Links depende de publicar `/.well-known/assetlinks.json` no domínio e da impressão digital da chave de assinatura de produção. A câmera, microfone e seleção de arquivos seguem permissões do Android quando requisitados pela página local.
