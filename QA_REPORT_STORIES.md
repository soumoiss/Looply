# QA — Stories 9:16 e biblioteca musical licenciada

Data de preparação: 26–27/10/2026. Este arquivo documenta somente fatos conferidos em código/CI; **não é uma declaração de publicação real de mídia por uma conta humana**.

## Biblioteca musical autorizável

- Pesquisa comercial existente (iTunes/Apple Music, Deezer e Audius) é mantida. Uma prévia promocional da Apple/Deezer **não** se transforma em faixa incorporável por ter sido reproduzida.
- Nova categoria **Músicas livres** consulta a API pública do Openverse e filtra resultados por CC0 1.0 ou CC BY 2.0, 2.5, 3.0 ou 4.0, com URL de origem, autor, licença e arquivo de áudio. Licenças ND, NC e SA ficam excluídas.
- Openverse **não verifica** as licenças em cada origem. O editor solicita a conferência e a declaração explícita do publicador antes de importar. Não se deve tratar um resultado encontrado como licença confirmada.
- Ao selecionar uma música dessa categoria, o navegador tenta obter o arquivo binário efetivo por HTTPS, sem credenciais, com limite de 15 MB e inspeção da assinatura do formato. **Se o host proibir download por CORS ou a origem/licença não puder ser confirmada, essa faixa não fica pronta para publicação.**
- O áudio importado é entregue à mesma pipeline `exportVideo` existente para trilhas próprias, que mistura uma trilha de áudio via Web Audio / `MediaStreamDestination` e `MediaRecorder`, produzindo arquivo com som. A trilha musical é gravada no arquivo exportado, não apenas no nome da música.
- Créditos CC0/CC BY (nome, autor, link de origem e licença, com indicação de sincronização) são acrescentados à legenda antes do upload quando o arquivo licenciado foi selecionado.

## Arquivos relevantes

- `src/story-licensed-music.js` — busca, filtragem, importação segura e atribuição.
- `src/story-music-picker.js` — nova categoria, seleção interna, confirmação e pré-escuta.
- `src/story-studio.js` — inclusão de créditos na publicação e pipeline existente de áudio.
- `tests/story-licensed-music.test.mjs` — contratos automatizados de busca/licença/binário/créditos.
- `scripts/check-story-posted-audio.mjs` — já existente: teste de gravação real em Chromium e análise de vídeo+áudio com ffprobe, usando sinal sintético. **Não substitui a prova de um Story enviado ao Neon.**

## Limitações e validação ainda exigida

1. Confirmar no site original o direito sobre composição, gravação e uso em vídeo; o índice Openverse não é uma certificação.
2. Testar no Android e no Safari se a origem escolhida fornece arquivo com CORS e codec decodificável; o download pode falhar legitimamente.
3. Em duas sessões autenticadas, publicar uma fotografia + música e um vídeo + música; ler de volta a mídia real no Cloudflare e verificar suas faixas com `ffprobe -show_streams`, duração e reprodução audível no dispositivo.
4. Verificar se `video/mp4` com áudio AAC está disponível naquele navegador. Quando `MediaRecorder` só produz WebM/Opus, o arquivo continuará codificado nesse formato; não afirmar AAC sem prova. FFmpeg.wasm pode ser adotado somente após testes de compatibilidade, desempenho e origem legal do áudio.
5. Não há neste PR vídeo de comprovação de duas publicações reais; nenhum teste físico ou publicação autenticada foi executado a partir de aparelho do usuário.

## Decisão técnica

Não substituir os arquivos existentes do aplicativo pelos HTMLs de demonstração e não utilizar o preview de 30 segundos de terceiros para sincronização não autorizada. Preservar Neon, Cloudflare e as mídias existentes.

Fontes de documentação: https://api.openverse.org/v1/ ; https://creativecommons.org/licenses/by/4.0/ ; https://creativecommons.org/faq/ ; https://docs.openverse.org/
