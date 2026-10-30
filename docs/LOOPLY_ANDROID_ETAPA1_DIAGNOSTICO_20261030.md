# Looply Android — etapa 1 de 6: diagnóstico e controle de publicação

Data de referência: 2026-10-30. Este registro é o checkpoint verificável da etapa 1, **não** um aceite funcional do APK.

## Base de código e integração

- `main` examinada em `0472f86c51388142a7486c028cc60adc63f620cf`.
- PR #181: `codex/looply-android-fcm-302` (`0b09edd2041cd1379452eb36d53db2455b172169`), aberta/draft, contém WebView, Firebase e sharesheet.
- PR #182: `fix/looply-android-runtime-20261030` (`cf10b99167347790f53c6f9fd376498c2730a439`), empilhada na #181, inclui ícone oficial, recuperação de carregamento e ajustes musicais.
- PR #183: `fix/looply-auth-push-calls-stickers-20261030` (`6afbf382ad74f773c422aa8fd1fbf5ec43a37439`), empilhada na #182, inclui auth, figurinhas, fila de mensagens e WebRTC.
- Esta branch foi criada **sobre o último commit da PR #183** para não sobrescrever nenhuma dessas implementações.
- As PRs não estão mescladas à `main`. Nenhum merge/publicação de produção é autorizado pela etapa 1.

## Constatações fundamentadas

| Área | Evidência inspecionada | Resultado da etapa 1 |
| --- | --- | --- |
| Notificações | `backend/cloudflare/android-push-worker.mjs`, Neon, listagem Cloudflare Workers | Projeto Neon conectado tem tabela de tokens e 3 registros de dispositivo, mais trigger `looply_v19_chat_notification_on_insert` presente; **Worker FCM não aparece** entre os scripts implantados na conta consultada. Falta implantação/configuração segura; entrega de push não aprovada. |
| Figurinhas | Migração `20261030_shared_admin_sticker_pack.sql` e consulta de leitura Neon | 534 registros marcados como compartilhados no projeto Neon consultado; acesso e envio por usuário comum no APK ainda não validados. |
| Criação/login de contas | `src/neon-login-identity.js`, `src/admin.js`, testes PR #183 | Mapeamento nome de usuário para alias técnico existente no código; login real em contas novas ainda não aprovado. |
| Chamadas | `src/chat-calls.js`, `MainActivity.kt` | Captura local e autorização WebView são implementadas na PR empilhada; áudio, vídeo, sinalização, recebimento e conexão bidirecional exigem teste adicional. |
| Mensagens de voz | `MainActivity.kt` e capturas recebidas | Permissões Android + WebChromeClient presentes; gravação, upload, decodificação e reprodução não foram demonstrados em aparelho. |
| Compartilhamento externo | `ShareReceiverActivity.kt`, `share.html`, `scripts/build.mjs` | Formulário empacotado e Intents previstos em código; print 404 representa falha de versão anterior, correção ainda não verificada em instalação real. |
| Playlist administrativa | `src/music-admin-playlists.js`, `assets/css/pages/music.css`, PR #182 | Há regras mobile-first e player sob demanda; faltam screenshots de todos os tamanhos exigidos. |
| Stories/músicas | `src/story-music-picker.js`, PR #182 | Apple, Deezer, Audius e faixas licenciadas no seletor; prévia promocional **não** prova direito de sincronização/publicação. |
| Ícone | `android/icon-source/Looply-official.webp`, gerador de recursos, PR #182 | Geração baseada na arte fornecida já está em código; falta conferência no launcher Android. |
| Travamento no carregamento | `MainActivity.kt`, PR #182 | Watchdog, tela de erro e recarregamento nativo presentes no código; falta reproduzir e verificar recuperação física. |
| Publicação | `.github/workflows/android-apk.yml` | Workflow 3.0.4 ainda nomeava um artefato Release 3.0.3 e possuía publicação automática de prévia 3.0.3 com binário 3.0.4. Isso precisa ser desativado nesta etapa até o aceite do pacote final. |

A consulta Neon foi somente leitura ao projeto `looply-v3-migration`; os números são um retrato do momento, **não** um teste de entrega de notificações a um usuário. Nenhuma senha, token, e-mail pessoal ou URI de conexão é reproduzida neste relatório.

## Divisão fixa em seis etapas

1. **Diagnóstico e segurança de entrega (esta etapa):** revisão do histórico, PRs e integrações; registrar matriz; impedir publicação automática com versão incorreta; criar teste de regressão para o workflow.
2. **Câmera/microfone e chamadas:** validar e corrigir captura, mensagens de voz, WebView, permissões, WebRTC e sinalização web/Android, inclusive casos de falha.
3. **Notificações, login e figurinhas:** concluir Worker FCM com secrets autorizados, integração Neon, testes de criação de contas e acessos por usuário comum; nenhuma elevação indevida de privilégios.
4. **Compartilhamento e interface Android:** resolver e testar Intents/reels/404, playlist mobile, ícone oficial, carregamento e recarregamento nativo; telas de vários tamanhos.
5. **Stories e regressões:** revisar busca multiprovedor, licenças, áudio publicável, autoplay permitido, câmera 1x, publicações e regressão nas demais abas.
6. **Validação e publicação:** suíte total, Android real/emulador, status por requisito, merge somente de mudanças seguras, GitHub Pages verificado, APK Release com assinatura persistente, SHA-256 e GitHub Releases baixado novamente sem autenticação.

## Matriz de aceitação inicial

- **Aprovado:** leitura das branches e PRs; confirmação de artefatos de código e tabelas/trigger no projeto Neon consultado; listagem dos Workers da conta; revisão do problema de nomenclatura do workflow.
- **Não executado:** instalação 3.0.4 num aparelho, câmera real, microfone real, chamadas, upload real, logout/login, compartilhamento de Reel, fotos e vídeos, testes de viewport e playback musical final.
- **Bloqueado por dependência externa:** envio FCM em segundo plano até existir Worker implantado e segredos de conta de serviço configurados; APK Release até existir assinatura persistente autorizada.
- **Validação manual reservada:** chamada e comunicação bidirecional usando dois telefones físicos.

## Revisão complementar da etapa 1 — 30/10/2026

- **CI da PR #184 confirmado como sucesso:** o workflow `Verify Looply`, execução [41111570518](https://github.com/soumoiss/Looply/actions/runs/41111570518), terminou `completed/success` para o commit `7c5faab03af2086ca43a23a43554f15eea5b9315`. Isso comprova as verificações efetivamente executadas por esse workflow, **não** aprova o Android em aparelho nem a Release assinada. A compilação Android tem workflow distinto e deve ser avaliada separadamente.
- **Atualização de `main`:** a referência consultada passou a `0472f86c51388142a7486c028cc60adc63f620cf`, seis commits além do ancestral `e2f3707` usados no início da pilha. Comparação GitHub entre `main` e a branch da etapa 1: `diverged`, com **96 commits da pilha** e **6 commits somente em `main`**. Os arquivos tocados pela `main` nesse intervalo são `src/story-studio.js`, `assets/css/pages/story-reels-viewport-fix.css` e quatro testes de Stories/câmera. **Antes de integrar as PRs, reconciliar e testar essas mudanças; não dar merge forçado nem sobrescrever silenciosamente a correção de enquadramento e áudio.**
- **Cloudflare revalidada em modo leitura:** a conta conectada contém `looply-original-login-staging`, `looply-original-neon-staging`, `looply-original-realtime-staging`, `looply-story-music-search` e `looply-v3-staging`. Não há Worker FCM de despacho implantado entre esses scripts. Não expor nem pedir credenciais privadas em código público; documentar dependência de implantação/secrets para a etapa 3.
- **Neon revalidado sem escrita:** em `looply-v3-migration`, `public.android_fcm_tokens` contém **3** registros, `public.android_fcm_deliveries` contém **0**, `public.sticker_catalog` contém **534** registros `is_shared=true`, `public.chat_notifications` contém **33** registros e o trigger `looply_v19_chat_notification_on_insert` está presente/ativo. Nenhum desses números comprova entrega push ao telefone ou envio de figurinhas por conta comum.
- **Nova regressão de layout relatada:** botão nativo de recarregar sobrepõe o botão do leque/menu de configurações na tela Android. Incluir inspeção de `WindowInsets`, áreas seguras, z-index, posicionamento, dimensões de toque e testes em 320–428 px na etapa 4; não resolver reduzindo a área clicável nem escondendo funcionalidade.

## Regras de continuidade

Não realizar alterações de banco, apagar registros, criar serviços pagos ou acessar segredos em claro. Executar novos testes antes de marcar qualquer fluxo como aprovado. Registrar commit, artefato, execução e eventual bloqueio. **Não mesclar nem publicar automaticamente** durante as etapas 1–5. O usuário avançará com a palavra `continue`.
