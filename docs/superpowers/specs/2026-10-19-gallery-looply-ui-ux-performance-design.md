# Refatoração da Galeria Looply — UI/UX, gestos e performance

## Objetivo

Eliminar os vazamentos visuais e travamentos relatados na Galeria Looply, deixando a experiência mobile organizada em três fluxos coerentes: navegação da coleção, visualização full-screen e comentários em gaveta inferior. O comportamento deve continuar compatível com a galeria atual, com suas abas, filtros, álbuns, mídia da comunidade, mídia arquivada e permissões administrativas.

## Contexto atual

O repositório já contém uma implementação ampla em `assets/js/gallery.js` e `assets/css/pages/gallery.css`, incluindo filtros, grid/lista/mosaico, skeletons, URLs assinadas sob demanda, viewer, action sheet e modais de comentários. O trabalho será consolidar esse comportamento e corrigir os pontos em que a implementação ainda permite sobreposição, carregamento excessivo ou gestos inconsistentes. A camada Supabase já possui migrations de audiência, RPCs e políticas para comentários da galeria; qualquer ajuste de schema será incremental e acompanhado de teste de política.

## Decisões de produto e interface

### Galeria

- Manter as abas `Recentes`, `Privadas` e `Exclusivas`.
- Em larguras móveis, `Filtros` será a única entrada para filtros secundários; o painel será uma gaveta/bottom sheet com fechamento por backdrop, Escape e botão explícito.
- Todos os controles usarão `writing-mode: horizontal-tb`, `flex-direction: row` quando aplicável, `min-width: 0` e `white-space` controlado para impedir texto vertical ou vazando.
- Cada card terá área de mídia com proporção reservada, skeleton durante a busca e indicador acessível de comentários. O clique do indicador abrirá a gaveta de comentários da mídia sem reload.
- A grade usará metadados paginados e URLs de thumbnail transformadas quando o Storage suportar transformação; o caminho original será fallback. A mídia em resolução maior será resolvida apenas ao abrir o viewer.

### Viewer

- O viewer ocupará a viewport inteira, incluindo safe areas, e reservará uma área de mídia sem elementos flutuantes sobre a imagem.
- A barra terá somente Voltar, Curtir, Editar (admin) e `…`; navegação por swipe/setas continuará disponível sem competir visualmente com essas ações.
- `…` abrirá um action sheet com detalhes, compartilhamento, comentários, mover para pasta, edição de descrição e exclusão administrativa. Exclusão terá confirmação e estado de carregamento.
- O action sheet e a gaveta de comentários usarão foco restaurável, `aria-modal`, fechamento por Escape/backdrop e bloqueio de scroll do documento.

### Gestos

Será criado um controlador pequeno e independente para estado de zoom/pan. Ele manterá `scale`, `translateX`, `translateY` e o ponto de ancoragem do gesto. Pinch recalculará a escala em torno do centro entre os ponteiros; pan de um ponteiro será habilitado apenas com escala maior que 1; os limites serão calculados a partir do tamanho renderizado da mídia e do stage. Swipe de navegação só será reconhecido quando não houver zoom ativo. A transformação será aplicada como `translate3d(...) scale(...)` com `transform-origin` controlado, `touch-action: none` e `will-change: transform`.

## Dados e segurança

- A consulta de comentários continuará passando por RPC/políticas do Supabase, nunca por filtragem apenas no cliente.
- Comentários `selected` serão visíveis somente ao autor ou aos destinatários autorizados, e somente se o usuário também puder visualizar a mídia pai.
- O autor poderá ler seu comentário; um terceiro sem autorização não deverá receber nem metadados que revelem a existência do comentário.
- Não será usado `user_metadata` para autorização. Políticas deverão usar `auth.uid()` e funções privadas/invocadoras já existentes.
- Se faltar uma política no fluxo de mídia da comunidade ou do arquivo, será criada uma migration nova usando o fluxo de versionamento do Supabase e serão adicionados testes de contrato para autor, destinatário e terceiro.

## Fluxo de carregamento

1. Renderizar shell, filtros e skeletons imediatamente.
2. Buscar metadados paginados das fontes archive/community em paralelo.
3. Buscar apenas contagens/indicadores mínimos de comentários; não baixar corpos de comentários para todos os cards.
4. Resolver thumbnails quando entrarem no viewport, deduplicando requisições por mídia.
5. Resolver URL HD e comentários quando o viewer/gaveta for aberto; deduplicar chamadas pendentes.
6. Preservar estados de erro por seção, sem apagar conteúdo já carregado.

## Arquivos e limites

- `assets/js/gallery.js`: markup, estado, carregamento lazy, viewer, action sheet, comentários e integração com o controlador de gestos.
- `assets/js/gallery-gestures.js` (novo, se a extração reduzir acoplamento): controlador puro de pan/zoom testável sem DOM.
- `assets/css/pages/gallery.css`: layout mobile, bottom sheets, viewer, skeletons e correções de overflow.
- `tests/gallery-*.test.mjs`: contratos de markup, carregamento lazy, gestos e permissões.
- `supabase/migrations/*gallery*.sql`: somente se a auditoria das políticas demonstrar lacuna.

Não faz parte deste trabalho redesenhar outras páginas, substituir o sistema global de ícones ou alterar a estrutura de armazenamento de mídia sem necessidade comprovada.

## Tratamento de falhas e acessibilidade

- Falha de thumbnail mantém placeholder e permite abrir o viewer para tentar HD.
- Falha de comentários exibe mensagem na gaveta e não bloqueia a mídia.
- Falha de compartilhamento usa cópia de link como fallback e informa o resultado.
- Botões terão nomes acessíveis; foco será mantido ao abrir/fechar sheets; animações respeitarão `prefers-reduced-motion`.
- Não serão exibidos caracteres de implementação no DOM final; textos serão escapados e os templates serão testados por ausência de tokens acidentais.

## Verificação

- Testes unitários devem falhar antes da implementação para cada novo comportamento: filtros mobile, abertura de comentários, contrato do viewer e pan/pinch ancorado.
- Rodar `npm test` completo e `npm run build`.
- Revisar migrations e executar a verificação Supabase disponível para políticas/RLS.
- Validar manualmente em viewport estreita e larga: nenhum texto vertical, nenhum botão sobre a foto, action sheet deslizante, comentário sem reload e pan/pinch fora do centro.

