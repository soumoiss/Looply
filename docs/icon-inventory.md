# Inventário central de ícones — Looply

**Registro de referência:** Icons8. O aplicativo renderiza os SVGs locais de `src/icons.js`; os links abaixo levam a páginas de pesquisa do Icons8 para consultar variantes, não são dependências externas do site.

- Coleção UI: https://icons8.com/icons/collections/ui
- Documentação Icons8: https://icons.docs.icons8.com/
- Padrão Looply: SVG monocromático, `currentColor`, traço consistente, ícone com nome acessível quando necessário.
- Estados existentes no registro: `permissionDenied` (permissão negada), `offline` (sem conexão), `alert` (erro/atenção), `empty` (vazio), `sync` (pendente), `loader` (carregando) e `check` (confirmado/sucesso).
- Não usar caracteres Unicode como substitutos de ícones em controles. Emojis enviados pelo usuário no chat e símbolos matemáticos em textos não são ícones de interface.

| Nome interno | Função semântica | Referência Icons8 |
|---|---|---|
| `home` | Início | https://icons8.com/icons/set/home |
| `mail` | Mensagens | https://icons8.com/icons/set/mail |
| `music` | Músicas | https://icons8.com/icons/set/music |
| `bell` | Notificações | https://icons8.com/icons/set/bell |
| `chat` | Conversas | https://icons8.com/icons/set/chat |
| `user` | Perfil | https://icons8.com/icons/set/user |
| `users` | Pessoas e grupos | https://icons8.com/icons/set/users |
| `settings` | Configurações | https://icons8.com/icons/set/settings |
| `shield` | Segurança | https://icons8.com/icons/set/shield |
| `permissionDenied` | Permissão negada | https://icons8.com/icons/set/permission-denied |
| `star` | Favorito inativo | https://icons8.com/icons/set/star |
| `starFilled` | Favorito ativo | https://icons8.com/icons/set/star-filled |
| `more` | Mais opções | https://icons8.com/icons/set/more |
| `grid` | Grade/jogo | https://icons8.com/icons/set/grid |
| `back` | Voltar | https://icons8.com/icons/set/back |
| `forward` | Avançar | https://icons8.com/icons/set/forward |
| `circle` | Ação circular | https://icons8.com/icons/set/circle |
| `paperclip` | Anexar | https://icons8.com/icons/set/paperclip |
| `smile` | Emoji | https://icons8.com/icons/set/smile |
| `close` | Fechar | https://icons8.com/icons/set/close |
| `check` | Confirmar/sucesso | https://icons8.com/icons/set/check |
| `cancel` | Cancelar | https://icons8.com/icons/set/cancel |
| `plus` | Adicionar | https://icons8.com/icons/set/plus |
| `minus` | Remover/diminuir | https://icons8.com/icons/set/minus |
| `search` | Pesquisar | https://icons8.com/icons/set/search |
| `filter` | Filtrar | https://icons8.com/icons/set/filter |
| `refresh` | Atualizar | https://icons8.com/icons/set/refresh |
| `copy` | Copiar | https://icons8.com/icons/set/copy |
| `share` | Compartilhar | https://icons8.com/icons/set/share |
| `external` | Link externo | https://icons8.com/icons/set/external |
| `comment` | Comentários | https://icons8.com/icons/set/comment |
| `play` | Reproduzir | https://icons8.com/icons/set/play |
| `pause` | Pausar | https://icons8.com/icons/set/pause |
| `phone` | Chamada de voz | https://icons8.com/icons/set/phone |
| `video` | Vídeo | https://icons8.com/icons/set/video |
| `camera` | Câmera | https://icons8.com/icons/set/camera |
| `image` | Foto/imagem | https://icons8.com/icons/set/image |
| `rotateLeft` | Girar foto à esquerda | https://icons8.com/icons/set/rotate-left |
| `rotateRight` | Girar foto à direita | https://icons8.com/icons/set/rotate-right |
| `cameraOff` | Câmera desligada | https://icons8.com/icons/set/camera-off |
| `cameraSwitch` | Alternar câmera | https://icons8.com/icons/set/camera-switch |
| `mic` | Microfone | https://icons8.com/icons/set/mic |
| `micOff` | Microfone desligado | https://icons8.com/icons/set/mic-off |
| `volume` | Áudio ligado | https://icons8.com/icons/set/volume |
| `volumeOff` | Áudio silenciado | https://icons8.com/icons/set/volume-off |
| `hangup` | Encerrar chamada | https://icons8.com/icons/set/hangup |
| `pencil` | Editar | https://icons8.com/icons/set/pencil |
| `lock` | Proteção | https://icons8.com/icons/set/lock |
| `eye` | Mostrar | https://icons8.com/icons/set/eye |
| `eyeOff` | Ocultar | https://icons8.com/icons/set/eye-off |
| `send` | Enviar | https://icons8.com/icons/set/send |
| `trash` | Excluir | https://icons8.com/icons/set/trash |
| `upload` | Enviar arquivo | https://icons8.com/icons/set/upload |
| `save` | Salvar | https://icons8.com/icons/set/save |
| `menu` | Menu | https://icons8.com/icons/set/menu |
| `alert` | Erro/atenção | https://icons8.com/icons/set/alert |
| `offline` | Sem conexão | https://icons8.com/icons/set/offline |
| `empty` | Conteúdo vazio | https://icons8.com/icons/set/empty |
| `sync` | Sincronização pendente | https://icons8.com/icons/set/sync |
| `loader` | Carregamento | https://icons8.com/icons/set/loader |

## Cobertura de código inspecionada

| Área | Arquivos | Verificação |
|---|---|---|
| Navegação e tema | `src/page-runtime.js`, `styles.css` | Registro compartilhado, foco visível, alvo de toque e estilos herdados |
| Chat e chamadas | `src/chat.js`, `src/chat-enhancements.js`, `src/chat-calls.js` | Voltar, menu, favorito, configurações, jogo, áudio e vídeo |
| Feed e stories | `src/social.js`, `src/stories.js` | Ações e link externo |
| Perfil | `src/profiles.js` | Foto, recorte e fechar |
| Cartas | `src/letters-community.js`, `src/archived-cards.js` | Fechar e navegação |
| Música | `src/music.js`, `src/youtube-playlist.js` | Player, comentários, ações e links externos |
| Administração | `src/admin.js` | Formulários, anexos e links externos |
| Registro e testes | `src/icons.js`, `tests/icons-stage8.test.mjs` | Nomes semânticos, SVG e regressão |

## Limitações e pendências de validação

A revisão estática dos arquivos listados não equivale a abrir manualmente todas as páginas. Leitores de tela, teclado físico, contraste em cada tema, todos os modais, larguras responsivas, falhas de rede e sincronização entre dispositivos ainda precisam de teste de execução no navegador/dispositivo. Não classificar esses testes manuais como concluídos.
