# Looply — Etapa 8: auditoria final de ícones, janelas e componentes

## Escopo verificável

A revisão estática desta etapa conferiu o registro compartilhado `src/icons.js`, o inventário Icons8 em `docs/icon-inventory.md`, os estilos comuns em `styles.css`, o runtime de navegação em `src/page-runtime.js` e os testes automatizados `tests/icons-stage8.test.mjs`. Os módulos de chat, chamadas, stories, feed, cartas, perfil, música e administração também são verificados por referências nos testes de regressão.

## Matriz por página e componente

| Página / componente | Arquivos centrais | Cobertura estática | Validação manual pendente |
|---|---|---|---|
| Entrada / login | `index.html`, `login.html` | Build e navegação de entrada | Teclado, leitor de tela, estados de rede |
| Início / feed / stories | `home.html`, `src/social.js`, `src/stories.js` | Registro de ícones e ações principais | Modais, tema, responsividade e falhas reais |
| Músicas / player | `musicas.html`, `src/music.js`, `src/youtube-playlist.js` | Fechar, reproduzir, comentar, compartilhar e abrir externo | Player real, foco modal, teclado e falhas da API |
| Chat / conversa / chamadas | `chat.html`, `conversa.html`, `src/chat.js`, `src/chat-enhancements.js`, `src/chat-calls.js` | Voltar, menu, favorito, mídia e chamada | Permissões reais, conexão, chamadas e dispositivos |
| Cartas | `cartas.html`, `src/letters-community.js`, `src/archived-cards.js` | Fechar e navegação entre cartas | Navegação por teclado e todos os diálogos |
| Notificações | `notificacoes.html`, `src/page-runtime.js` | Ícone e badge da navegação | Estados vazios, sincronização e dados reais |
| Pessoas | `usuarios.html`, `src/page-runtime.js` | Navegação e ícones compartilhados | Busca, permissões e estados vazios |
| Perfil | `perfil.html`, `src/profiles.js`, `assets/css/pages/profile.css` | Foto, recorte, fechar e ações principais | Upload real, rede instável e teste entre dispositivos |
| Configurações / temas | `configuracoes.html`, `src/theme.js`, `styles.css` | Cores herdadas, foco e alvos de toque | Todos os temas e tamanhos de tela |
| Administração | `admin.html`, `src/admin.js` | Registro compartilhado e links externos | Permissões com contas reais e todos os formulários |
| Cabeçalho / navegação | `src/page-runtime.js`, `styles.css` | Ícones semânticos, foco visível, menu de conta | Teste manual de teclado/leitor de tela |
| Registro central | `src/icons.js`, `docs/icon-inventory.md` | Nomes únicos, SVG, estados e URLs Icons8 | Comparação visual humana de cada glifo |

## Padronização e acessibilidade

- Ícones locais são SVGs monocromáticos com `currentColor`, sem dependência de carregamento de ícones externos.
- Rótulos fornecidos ao gerador de SVG são escapados para atributo HTML.
- Ícones decorativos permanecem ocultos da árvore acessível; controles devem fornecer nome acessível no próprio botão/link.
- Foco visível e área mínima de toque de 44 px são definidos nos estilos comuns para os controles listados.
- O estado de carregamento tem animação respeitando `prefers-reduced-motion`.
- Os links do inventário Icons8 são referências de consulta; o site não baixa nem executa recursos Icons8 em tempo de execução.

## Testes e limites

O workflow `.github/workflows/pages.yml` executa `npm test` antes de publicar o artefato estático em GitHub Pages. Os testes automatizados verificam invariantes do código, não substituem navegador real.

**Não declarar como concluído sem execução manual:** contraste em cada tema, leitor de tela, navegação por teclado em todos os modais, comportamento em larguras móveis, permissões de câmera/microfone, desconexão, sincronização entre dispositivos e cada estado de erro. A publicação depende de GitHub Pages estar habilitado para o repositório com origem GitHub Actions; a execução do workflow é a evidência final de publicação.
