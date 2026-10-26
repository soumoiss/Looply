# Prévia contínua de Stories no GitHub Pages

Após a aprovação do workflow **Stories Studio validation**, o workflow `Deploy Looply to GitHub Pages` publicado na branch `main` recompila:
1. O site estável do `main` (na raiz, sem misturar o novo editor);
2. O Stories Studio da branch `feat/stories-studio-neon-20261026`, em `preview/stories/`.

**Acesso para verificar a alteração no navegador:**
https://soumoiss.github.io/Looply/preview/stories/home.html

**Login da prévia:**
https://soumoiss.github.io/Looply/preview/stories/login.html

**Aplicativo principal:**
https://soumoiss.github.io/Looply/

Toda nova alteração na branch de prévia inicia validação e, ao passar, publica uma nova cópia de seus arquivos no GitHub Pages.

A prévia utiliza as APIs reais do Neon (Auth, PostgreSQL e Storage). Não publique mídias de teste sensíveis: ações de escrita são reais e não isoladas em um banco de demonstração. O editor não usa Spotify nem Supabase.

Para impedir interferência nos caches do aplicativo principal, o service worker da prévia é desabilitado somente no artefato de publicação.

O Pages deve continuar exibindo o site principal mesmo se os testes da prévia falharem; nesse caso, o novo editor não será publicado até as verificações passarem.
