# Looply para Android

Este módulo abre o Looply publicado no GitHub Pages dentro de uma WebView Android. O APK usa `https://soumoiss.github.io/Looply/` como origem remota, portanto novas publicações no site ficam disponíveis no aplicativo sem recompilar o APK. As páginas continuam usando o cliente Supabase público já existente; nenhuma chave administrativa é adicionada ao APK.

## Build local

Use JDK 17 ou superior, Android SDK com API 36 e Build Tools 36.0.0, além de Node.js 22 ou superior:

```powershell
cd android
gradlew.bat assembleDebug
```

Se Node.js não estiver no PATH, informe o executável:

```powershell
gradlew.bat -Plooply.nodeExecutable="C:\caminho\para\node.exe" assembleDebug
```

O APK de desenvolvimento sai em `app/build/outputs/apk/debug/app-debug.apk`. A assinatura debug é adequada para instalação e avaliação; não representa uma chave de release nem pode atualizar um app instalado com outra chave.

## Dependências do serviço

Login, perfis, publicações, stories, comentários, chat e mídias usam o projeto Supabase configurado no site. A lista de playlists de música usa `/api/youtube-playlist`, uma função do Vercel que precisa de acesso público ao endpoint e da variável secreta já mantida no servidor.

No momento da adaptação, os deploys Vercel acessíveis ao repositório redirecionavam para a tela de autenticação do Vercel. O APK não contém bypass do Vercel. Por isso, o restante do site é empacotado localmente; o endpoint da playlist continua sujeito à proteção do deploy e precisa ser disponibilizado publicamente para funcionar dentro do APK. Nenhuma configuração do Vercel nem banco de produção foi alterada.
