# Auditoria final de integração — Looply Android (etapa 6/6)

Verificação de 30/10/2026, sem acesso físico ao telefone do proprietário. **Não é um certificado de operação 100%.**

## Controle de versões e integração
- `main` no início da integração: `0472f86c51388142a7486c028cc60adc63f620cf`.
- PRs anteriores em sequência: #181, #182, #183, #184, #185, #186, #187, #188. Todas foram analisadas como conjunto e permanecem disponíveis para rastreabilidade.
- Etapa 6 de trabalho: branch `fix/looply-stage6-audit-release-20261030`, PR #189 (em conflito com os seis commits recentes da main).
- Foi criada a branch **`integrate/looply-android-six-stages-20261030`**, preservando dois pais no commit `b6a8fbdc80c55c4c0cc5fca4e4df51c98e045819`: a main e a cadeia de etapas. PR #190 aponta para a main, é mergeable, mas continua DRAFT.
- Comparação com a main após a resolução: 159 commits à frente, 0 atrás, 70 arquivos impactados e **nenhuma remoção**. Foram confrontadas as seis alterações originais de câmera feitas na main; as diferenças em `src/story-studio.js` correspondem à captura de microfone e à mixagem introduzidas nas etapas posteriores.
- Nova lógica da etapa 6: seleção Apple/Deezer/Spotify com **arquivo de áudio fornecido pelo usuário e declaração de autorização**; título/artista conservados no texto e trilha codificada por `MediaRecorder`, sem download de prévia da plataforma. Spotify foi ligado a uma **busca opcional de metadados** pelo endpoint Neon autenticado já existente `/spotify/search`, sem expor segredos; a busca retorna resultados somente se o backend tiver a configuração de desenvolvedor necessária. Audius conserva o streaming vinculado; áudio comercial Spotify/Apple/Deezer não é afirmado como diretamente sincronizável.
- `src/stories.js` permite novo `play()` via `pointerdown` na própria mídia, quando a WebView recusa o gesto inicial. Não abre modal ou player sobreposto. Uma restrição do SO não é silenciosamente ignorada.

## Matriz de cobertura, sem resultados inventados

| Área | Trabalho implementado | Evidência | Situação final nesta auditoria |
| --- | --- | --- | --- |
| Etapa 1 — branches, PR #181, CI, versionamento | Preservação de PRs, controle de nomenclatura 3.0.4 e remoção de preview 3.0.3 indevida | PR #184; testes estágio 1 | Implementado no código |
| Etapa 2 — permissões / microfone | Autorização Android + WebChromeClient, fallback FormData e permissão negada, recarga nativa sem sobreposição | PR #185; Node/web; Android Debug build anterior | **Microfone físico não validado** |
| Etapa 2 — chamadas web + Android | Duplo clique, ciclo de vida das streams, canal autenticado, erros WebRTC | PR #185; contratos de regressão | **Sinalização e chamada real entre aparelhos não aprovadas** |
| Etapa 3 — Firebase FCM | Cache por conta, logout, Worker e fila segura, 0 duplicata em testes de contrato | PR #186, role restrita em Neon staging | **Bloqueado para produção**: sem Worker `looply-android-push` implantado, sem credenciais privadas e sem prova de entrega |
| Etapa 3 — usuários novos | Alias Neon real corrigido; validação de duplicidade antes do Better Auth | PR #186; 8 perfis e 8 identidades no banco principal | **Login de uma conta nova criada pelo painel não testado E2E** |
| Etapa 3 — figurinhas | Política de permissões corrigida em branch de teste Neon; acesso global separado do administrativo | PR #186; 534 figurinhas `is_shared` ativas no Neon principal | **Pendente migração de produção e sessão de usuário comum com envio/recebimento** |
| Etapa 4 — Reel / vídeo compartilhado | EXTRA_TEXT com MIME `video/*`, ClipData, formulário local; fallback sem 404 | PR #187; emulador instalou e abriu as Activities em execução posterior | **Instagram real e upload persistido não testados E2E** |
| Etapa 4 — playlist | CSS responsivo 320–1024, player controlado | Chromium com 8 viewports e screenshots no Actions #41117557406 | Aprovado apenas em fixture de layout |
| Etapa 4 — ícone e travamento | Ícone branco oficial e safe-zone, watchdog, botão de recuperação sem cobrir menu | PRs #182, #185, #187, build Debug | **Launcher físico e falhas reais de rede não testados no celular do usuário** |
| Etapa 5 — áudio / câmera Stories | Zoom 1x, microfone em fallback, áudio exportado com ganho e verificação de trilha | CI #41118882735: WebM VP8 + Opus, 33.710 bytes, pico -17,4 dB | Mídia sintética de teste **aprovada**; áudio e câmera físicos pendentes |
| Etapa 5 — catálogos | Apple/Deezer/Audius, faixas próprias/CC, sem tratar preview comercial como licença | PR #188 | Streaming Audius individual e fontes externas ainda podem falhar; Spotify não tem sincronização comercial |
| Etapa 6 — toque para som | Reprodução direta após abertura e retry pela imagem quando navegador bloqueia gesto inicial | Código + testes novos em `tests/android-stage6-music-playback-ownership.test.mjs` | CI da integração foi acionado; resultado final depende do workflow |
| Etapa 6 — APK | Build Debug 3.0.4 existente: Actions #41119401837 | `apksigner verify` e assets check aprovados nesse build; artefato privado de Actions | **Não é Release assinada; não é APK final** |
| Etapa 6 — assinatura/publicação | Workflow manual `android-final-release.yml` preparado com gates de main, suite, keystore, cert fingerprint, ZIP, SHA-256 e redownload público | GitHub Actions workflow no código | **Bloqueado por secrets de assinatura persistente e critérios E2E não comprovados** |
| Etapa 6 — GitHub Pages | Integração em PR draft, main inalterada | PR #190 | Não publicado; merge prematuro poderia quebrar dados e recursos |

## Evidências diretas confirmadas

- GitHub Actions `Verify Looply` da etapa 5: https://github.com/soumoiss/Looply/actions/runs/41119408050, 691/691 testes aprovados.
- GitHub Actions Android Debug: https://github.com/soumoiss/Looply/actions/runs/41119401837, compilação/verificação de pacote OK; **assinatura Release pulada**.
- Mídia real de teste sintético: https://github.com/soumoiss/Looply/actions/runs/41118882735/artifacts/13007352130; `ffprobe` VP8/Opus e `volumedetect` -17,4 dB.
- UI Chromium (fixture) 320/360/375/390/412/428/768/1024: https://github.com/soumoiss/Looply/actions/runs/41117557406/artifacts/13007540080.
- Consulta Neon de somente leitura neste checkpoint: 3 dispositivos FCM, 0 entregas com status sent, 534 figurinhas compartilhadas, 8 identidades Auth e 8 perfis.
- Consulta Cloudflare de somente leitura: Worker realtime e Worker search Stories existem; `looply-android-push` **não existe na conta conectada**.

## Restrições técnicas reais

Amostra promocional NÃO é licença de sincronização, mesmo que o vídeo use apenas 15–30 segundos. Apple proíbe baixar, armazenar ou sincronizar suas amostras promocionais com vídeo; Spotify veta sincronizar conteúdo Spotify com mídia visual e o campo preview_url é opcional/descontinuado. Esta branch não contorna DRM, não cria áudio comercial fictício e não promete reproduzir todas as gravações existentes. A solução implementada para catálogo Apple/Deezer é **metadados + arquivo licenciado pelo usuário**, codificado em Story. Nenhuma música comercial é baixada ou transformada clandestinamente.

## Antes de afirmar "APK final"
1. GitHub Actions da **PR #190** concluídos, sem falhas.
2. Configuração autorizada do signer persistente, com fingerprint do certificado conhecido.
3. Revisão de segurança/migrações e implantação dos Workers realmente exigidos; credenciais somente em secrets.
4. Confirmação de login de uma conta recém-criada, envio de figurinhas e notificações reais.
5. Validação de gravação de câmera/microfone e reprodução de Story no aparelho real. Chamadas entre dois aparelhos têm ressalva de validação manual permitida pelo proprietário.
6. Merge seguro em `main` após requisitos atendidos, validação das páginas publicadas.
7. Workflow `.github/workflows/android-final-release.yml` executado **manualmente a partir da main**, download Release verificado publicamente e checksum entregue.

Nenhum dado de usuário foi apagado ou modificado na etapa 6. A `main` continua preservada. A PR #190 é a unidade de integração, não um APK final já publicado.
