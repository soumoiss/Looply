# Looply — Etapa 5/6: Stories, câmera, música e validação de áudio

Data de referência: 2026-10-30. Branch `fix/looply-stage5-story-audio-camera-20261030` sobre a PR #187. Este documento descreve **mudanças reais no código e testes verificados**, não uma confirmação de funcionamento completo em todos os celulares.

## Erros investigados e mudanças

### Câmera e microfone

Arquivo: `src/story-studio.js`.

O fallback anterior podia deixar o usuário com uma câmera para foto, mas sem microfone para gravação de vídeo, pois removia `audio:true` prematuramente ao relaxar restrições de vídeo. Foi adicionado `storyCameraCaptureAttempts` com 3 tentativas:
1. Resolução/sensor ideais e microfone ativo.
2. Vídeo com `facingMode` simples e **microfone ativo**.
3. Vídeo para fotografias sem microfone, somente quando os dois primeiros falham.

O fluxo avisa claramente quando existe câmera para fotos, mas a autorização de microfone está ausente. Gravação de vídeo sem trilha de áudio continua rejeitada antes de `MediaRecorder`. A prévia continua usando enquadramento contido sem zoom digital automático. A câmera real do dispositivo do proprietário precisa ser testada fisicamente.

### Trilha e áudio original na publicação

Arquivos: `src/story-audio-mixer.js` e `src/story-studio.js`.

`attachStoryMusic` agora valida o volume e, quando possível, utiliza um `GainNode` real ligado ao `MediaStreamDestination`. Se o vídeo contém voz/áudio original, a trilha adicional recebe 35% de ganho; para Story com música própria sem voz, 85%. A faixa de áudio original conserva seu ganho normal e é encaminhada ao mesmo destino da gravação. Nenhum áudio comercial é copiado para o vídeo. `hasAudibleStorySamples` segue rejeitando arquivos PCM silenciosos.

Testes reais de mídia, não mera inspeção estática:
- GitHub Actions `Looply stage 5 real recorded soundtrack`: https://github.com/soumoiss/Looply/actions/runs/41118882735
- Artefato `original-licensed-mix.webm` e `proof.json`: https://github.com/soumoiss/Looply/actions/runs/41118882735/artifacts/13007352130
- Foi gravada uma fixture de áudio **original e sintético**, em Chromium com `MediaRecorder`, `AudioContext` e canvas. `ffprobe` confirmou trilhas **VP8 (vídeo)** e **Opus (áudio)**, 33.710 bytes, e `ffmpeg volumedetect` mediu pico **-17,4 dB**. Isso demonstra que o encoder pode gerar som audível com a mixagem nova; não comprova upload real ou todas as faixas de usuários.

### Catálogos e licenças

Arquivos: `src/story-music-picker.js` e `src/stories.js`.

- Busca existente com Apple Music, Deezer, Audius e faixas com licença declarada foi preservada.
- Picker distingue melhor **vincular streaming Audius** de **incorporar faixa própria/licenciada**.
- Audição de Apple/Deezer mostra link do provedor ao lado da prévia, em vez de sugerir publicação do áudio.
- O formato antigo `[[looply-story-v3]]` permitia tocar prévia promocional do iTunes como áudio oculto no Story público, embora ela não tivesse sido incorporada legalmente ao arquivo. Esse caminho foi desativado; o conteúdo visual permanece. Story com áudio próprio/licenciado usa trilha codificada no arquivo; streaming Audius continua vinculado por ID.
- Spotify não foi anunciado como fonte de áudio gravável ou liberada: a documentação atual do Spotify descreve URLs `preview_url` como opcionais/descontinuadas e proíbe extração de músicas. Sem autorização ou fonte sonora licenciada, não declarar publicação sincronizada Spotify como aprovada.

### Regressão de workflow Android

Arquivo: `.github/workflows/android-smoke.yml`.

O smoke da etapa 4 efetivamente instalou o pacote, abriu as Activities e capturou screenshots, mas terminou com erro de sintaxe `expecting "fi"`. A action `reactivecircus/android-emulator-runner` executa cada linha de `script:` isoladamente. O bloco `if/fi` foi substituído por uma verificação de log sem bloco condicional multilinha. Novo smoke acionado e resultado final ainda precisa ser consultado. Os workflows de APK e emulador passaram a incluir esta branch.

## Evidências de testes e estado

- Node/web `Verify Looply` em https://github.com/soumoiss/Looply/actions/runs/41119050494: **691 testes aprovados, zero falhas** (commit `31248fa370140da55ee683247cbc7d4fd910d0eb`).
- Testes de câmera 1x, direitos promocionais, opções autorizadas, fonte sonora, proteção de clique de publicação e normalização musical incluídos em `tests/android-stage5-story-regression.test.mjs`.
- Testes anteriores que exigiam texto literal de `attachStoryMusic` foram atualizados para validar a interface que agora recebe volume: comportamento revisado, não removido.
- Artefato media real com análise `ffprobe` e screenshot/fixture disponível na execução acima.
- Build Android da última mudança, smoke de emulador e integração musical com mídia real em Neon/R2 devem ser verificados antes do aceite na etapa 6.

## Preservação e limitações

Não houve edição de contas, mensagens, cartas, Stories existentes, objetos do R2, políticas de produção ou segredos. PRs anteriores seguem empilhadas, sem merge. Site público e APK instalado não são modificados nesta etapa.

Aprovação pendente até ter evidência física: microfone e câmera Android real, vídeo com voz gravado no celular, seleção de faixa própria/CC, upload, reprodução do Story por outro usuário, música de streaming em redes restritas e chamadas entre aparelhos. Todas as dependências da etapa 3 (Firebase Worker + credenciais de banco limitadas) permanecem relevantes à etapa 6.

## Etapa 6

Revisão integral das PRs #181–#188, finalização do CI/Android, integração segura da branch, teste do site publicado, assinatura persistente autorizada, lançamento de novo APK no GitHub Releases com verificação do checksum e download sem autenticação. Se credenciais ou validações físicas estiverem ausentes, declarar bloqueios com precisão e jamais rotular um Debug como Release testado.
