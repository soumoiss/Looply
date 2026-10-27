# QA — Feed e Reels (27/10/2026)

## Implementado
- Remoção do cabeçalho redundante e link externo destacado dos cards de incorporação; players oficiais existentes preservados.
- Feed responsivo com cards de até 470px, mídia 4:5 e altura limitada a 75dvh, imagens e vídeos com enquadramento cover.
- Integrações preexistentes de publicações, curtidas, comentários, salvos e Reels preservadas em src/social.js.
- Cores seguem variáveis do tema Looply.

## Limites e testes pendentes
- **Não foram realizados 20 testes com prints nem publicação autenticada de foto/vídeo**; portanto não marcar PASS.
- Instagram e TikTok podem bloquear reprodução embutida. Não se faz scraping nem cópia de mídia de terceiros sem permissão; a plataforma controla seus embeds.
- Reels 9:16 e backend existentes não foram reconstruídos neste lote; requerem teste visual e funcional em dispositivos reais.
- Validar ações autenticadas, upload R2, persistência Neon, rolagem e áudio em Android/iOS antes de alegar funcionamento 100%.
