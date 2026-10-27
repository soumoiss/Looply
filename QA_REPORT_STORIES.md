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


## 9:16 — PR #163: editor, visualizador e música no arquivo

- Módulos de produção: `src/story-studio.js`, `src/stories.js`, `assets/css/pages/home.css` e `assets/css/pages/story-studio.css`.
- Câmera: pede ideal 1080 × 1920 e razão 9:16, com `resizeMode: none`. O navegador pode retornar outra resolução se o sensor ou suas políticas não suportarem a configuração. Câmera frontal continua espelhada só onde apropriado; o flip encerra as tracks antigas.
- Captura de fotografia e composição: canvas 1080 × 1920 com primeiro plano preservado via `contain` e fundo desfocado. Não há zoom inicial.
- Story com foto + música: duração solicitada de 7 segundos no MediaRecorder. Vídeo com música: duração de até 30 segundos ou duração original, mantendo a faixa sonora autorizada incorporada ao arquivo.
- Novo módulo `src/story-audio-mixer.js` é utilizado pelo editor real. Exige que o áudio selecionado tenha amostras não silenciosas antes de adicionar o track ao `MediaStreamDestination`. O gravador é iniciado antes do início da música.
- Visualizador: cabeçalho e barra de progresso no topo, pausa/retomada junto ao fechar, mídia em toda a superfície por `contain`, fundo borrado em fotos, legendas e controles de resposta sobre a mídia, sem faixas que redimensionam o vídeo.
- Editor: barra de ferramentas e controles otimizados para largura estreita; seletor de música interno em painel claro mantendo busca, prévia e importação legal já implementadas.

### Validação de arquivos pelo navegador e ffprobe

O script `scripts/check-story-posted-audio.mjs` grava vídeo 9:16 REAL com o mesmo módulo de mixagem importado pelo editor, analisa codecs, dimensões, duração e volume com `ffprobe` e `ffmpeg -af volumedetect` e armazena amostras no artefato `stories-9x16-audio-video` do GitHub Actions.

A execução final de QA em Chrome (`40436583288`) foi concluída com sucesso, com **405 testes Node aprovados** e todos os passos de validação do workflow passando, incluindo gravação audiovisual, inspeção de arquivo pelo FFmpeg/ffprobe, verificação visual das linhas musicais, AR e inicialização real do MediaPipe. Os clipes medidos são **360 × 640 (9:16)**, usados para comprovar codificação e áudio, enquanto a aplicação solicita 1080 × 1920 para captura real conforme suporte do dispositivo.

| Arquivo de teste | Duração aferida | Vídeo | Áudio | Pico sonoro |
|---|---:|---|---|---:|
| Fotografia + música | 7,173286 s | VP8 / WebM | Opus | −12,3 dB |
| Vídeo + música | 3,807 s | VP8 / WebM | Opus | −7,4 dB |

Os dois arquivos de mídia foram gerados e mantidos no artefato **stories-9x16-audio-video** do GitHub Actions. O teste de vídeo calcula a duração a partir dos pacotes codificados quando o contêiner WebM não informa `format.duration`.

**Alcance da evidência:** são arquivos de teste criados no Chrome automatizado, sem músicas comerciais; não equivalem a publicar conteúdo real com uma sessão de usuário, baixar o objeto do R2 e reproduzi-lo no celular. A revalidação com duas contas e inspeção do arquivo recuperado do armazenamento permanece pendente. Não há confirmação de AAC/MP4 universal; o Chrome do CI produziu WebM/Opus. Não foi integrado FFmpeg.wasm nesta etapa.

### Evidências de CI

- PR: https://github.com/soumoiss/Looply/pull/163
- Primeira amostra real com som e duração confirmados: https://github.com/soumoiss/Looply/actions/runs/40436151325
- Validação completa e vídeos: https://github.com/soumoiss/Looply/actions/runs/40436583288 (artefato: `stories-9x16-audio-video`, retenção de 7 dias).
- Artefato da API do GitHub: https://api.github.com/repos/soumoiss/Looply/actions/artifacts/12704078808/zip
