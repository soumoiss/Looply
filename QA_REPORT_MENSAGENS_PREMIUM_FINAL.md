# Looply · Mensagens Premium — verificação local (04/11/2026)

## Entrega

Código-fonte completo mantido, incluindo páginas de entrada, modelos, todos os controladores de mensagens, infraestrutura Neon/Cloudflare, temas globais, IDs e recursos existentes. Nenhuma tabela existente ou dado de produção foi alterado. A compilação gera a pasta `dist/` localmente; ela não precisa integrar o ZIP de código-fonte.

## Alterações implementadas

- A lista no celular agora utiliza a rolagem do documento, inclusive stories, pesquisa, filtros e todas as conversas. Não há uma metade fixa limitando o scroll da lista.
- Sincronização da sidebar faz reconciliação por IDs e atualiza somente campos alterados, sem substituir o componente, suas miniaturas, o estado dos filtros ou o scroll. Preserva nicknames e fixados.
- Atualização de mensagens mantém os nós da thread e só rola ao fim quando o usuário já está no fim e chegaram novas mensagens. Não reposiciona automaticamente enquanto uma pessoa lê mensagens antigas.
- A área de conversa usa `visualViewport.height` e `offsetTop` para a altura e posição realmente visíveis durante o teclado Android; o compositor fica no fundo da área visível sem somar duas vezes o espaço seguro.
- Câmera no avatar de grupo continua ligada ao seletor nativo e ao fluxo de edição/upload, `chat_media`, `group_covers` e `v10_set_group_cover`.
- Cards de carta, stickers e áudio usam superfícies sem balão textual; stickers respeitam máximo de 112px. Mensagens de áudio incluem forma de onda, progresso contínuo, seek, pausa e velocidade.
- Pressionar prolongadamente oferece reações flutuantes e ações; posicionamento respeita o visual viewport inclusive com teclado aberto.
- Navegação por volta de conversa, lista e home preservada com entrada direta em `conversa.html`.

## Comandos executados localmente

```sh
npm run build
node --test tests/
```

A suíte inclui 917 testes de código/integridade, com regressões adicionais para as nove exigências. O arquivo `tests/index.js` fornece o entrypoint de diretório necessário em Node 22, mantendo todos os testes originais.

## Limites da validação

A verificação cobre build e testes automatizados do repositório, mas **não substitui testes manuais em Android/WebView ou dois usuários reais conectados a Neon e Cloudflare**. O navegador Chromium headless disponível no ambiente não finalizou a execução da fixture; por isso não há afirmação de teste visual concluído. Nenhuma publicação no GitHub Pages ou migração de produção foi realizada como parte desta entrega de ZIP.
