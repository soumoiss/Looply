# LOOPLY CHAT ULTRA 3.0 — INVENTÁRIO COMPLETO DE INTERFACE, FUNCIONALIDADES, COMPORTAMENTO ONLINE E APRIMORAMENTOS

**Documento de especificação funcional e auditoria técnica do modelo HTML de 7 de novembro de 2026.**

**Fonte examinada:** `Looply_Chat_ULTRA.html`, 3.754 linhas, complementado pela leitura de `ultra.js`, `LEIA-ME.txt` e `RELATORIO-VALIDACAO.txt` do pacote entregue. Este documento descreve o que o código efetivamente mostra ou executa. Quando menciona o comportamento futuro conectado ao servidor, identifica-o explicitamente como **ESPERADO ONLINE**, não como recurso já implementado. As sugestões são requisitos de evolução, não promessas de que o modelo já as cumpre.

## 1. Visão geral e limites do modelo

O Looply Chat Ultra 3.0 é um protótipo mobile-first de mensageiro com caixa de entrada, conversas individuais, grupos, envio de formatos diversos, cartas em envelopes, enquetes, catálogo de figurinhas, notas, músicas por link, dois jogos, personalização, central de atividades e interfaces de chamadas. A base foi ampliada em três camadas JavaScript: o modelo de mensagens original, a extensão de jogos/mídia/figurinhas e a extensão Ultra de cartas/atividades/videochamadas/papéis de parede/gestos. O HTML incorpora CSS e JavaScript e acompanha uma biblioteca de imagens na pasta `Stickers`.

**ESTADO ATUAL:** o usuário ativo de demonstração está fixado no código como `marina` (nome Marina). Os demais participantes também são fictícios para o teste: Ana, Leo, Bia, Caio, Duda e Peixinho. Os diálogos iniciais e os estados de presença são gerados pelo próprio JavaScript; não há autenticação real de contas, sessão compartilhada entre dispositivos, servidor de mensagens nem banco online conectado por este HTML. Os dados de conversas são guardados principalmente no `localStorage` do navegador, enquanto anexos e a foto de fundo podem usar `IndexedDB`. O modelo salva parte de suas preferências no aparelho, mas não sincroniza com outro aparelho. Mensagens de terceiros que aparecem automaticamente são respostas de demonstração.

**ESPERADO ONLINE:** autenticar cada pessoa por sua identidade real; carregar os dados da conta, fotos, apelidos, permissões, relações e grupos do backend; abrir o mesmo histórico em vários dispositivos autorizados; transmitir eventos em tempo real; guardar anexos de maneira persistente, privada e autorizada; tratar estados offline; sincronizar contadores, notificações, jogos e chamadas. O código visual deve integrar-se à infraestrutura real do projeto, e nunca tratar a pessoa simulada `Marina` como identidade permanente de produção.

**APRIMORAR:** separar claramente UI, estado, serviços de API e sinalização; substituir IDs de demonstração por IDs de autenticação; criar tipagem e contratos de eventos; adicionar testes E2E em dois aparelhos; resolver inconsistências causadas por várias funções reescritas por camadas sucessivas; implementar migração de dados local/servidor; estabelecer política de retenção, backup, recuperação e controle de acesso. Não prometer confidencialidade, criptografia ponta a ponta ou entrega remota antes de realmente implementá-las.

## 2. Identidade visual, aparência, ergonomia e temas globais

**ESTADO ATUAL:** a interface usa roxo como cor de destaque, superfícies claras ou escuras, tipografia Inter em componentes, fontes decorativas em títulos e cartas, bordas arredondadas, gradientes, elementos em vidro translúcido e animações suaves. Os cabeçalhos global e da conversa têm fundos semitransparentes, bordas luminosas, saturação de fundo e desfoque reduzido; a extensão Ultra declara aproximadamente 2,5 px como intensidade óptica base de blur. Há sombras internas, reflexo de superfície, efeitos de pressão, aparição, expansão de folhas modais, bolhas de mensagens e cartões. O tema claro/escuro segue preferências CSS e também pode ser alternado pelo menu de conta; a extensão anterior guarda essa escolha localmente.

**ESPERADO ONLINE:** herdar as cores, fontes e modos claro/escuro definidos nas configurações globais do Looply; manter a mesma linguagem visual em toda a aplicação, com consistência em mensagens, jogos, cartas, editor de imagem, notificações e chamadas. O comportamento de telas pequenas deve respeitar áreas seguras, barras do sistema, notch e teclado Android/iOS.

**APRIMORAR:** oferecer contraste mínimo acessível, controle da intensidade do vidro, ajuste de tamanho da fonte e respeito à redução de movimentos do sistema. Evitar blur intenso sobre aparelhos de baixo desempenho, textos difíceis de ler em fotos e movimentos que prejudiquem acessibilidade. Conferir comportamento em modo paisagem, fontes ampliadas, leitores de tela, animações reduzidas e aparelhos de entrada.

## 3. Cabeçalho global: logo, nome, avatar e central de atividades

**ESTADO ATUAL:** o topo da caixa de entrada mostra a marca Looply, uma ilustração circular em animação, o nome e a assinatura `MoissWorld`. O elemento da marca é um link com destino `#`; não leva a uma página real do app. O avatar no lado direito é um botão que abre um menu de conta. A extensão Ultra coloca um botão de sino imediatamente antes do avatar, com um selo numérico de atividades ainda não visualizadas (limitado visualmente a `99+`). O vidro do cabeçalho responde ao movimento do ponteiro, e o efeito muda ligeiramente quando há rolagem.

**ESPERADO ONLINE:** o nome e avatar devem refletir o perfil autenticado; o logo pode abrir o início do aplicativo; o sino deve abrir um centro de notificações reais; o contador deve refletir eventos elegíveis e ser atualizado em tempo real. Todas as ações devem funcionar com autorização, conexão e navegação próprias, sem depender de simulações.

**APRIMORAR:** explicitar a diferença entre notificações globais e atividades do chat, permitir indicador de falha de conexão e não recriar desnecessariamente o cabeçalho em cada evento. Revisar a luminosidade do vidro sobre imagens variadas. Tornar animações opcionais.

## 4. Menu do avatar da conta

**ESTADO ATUAL:** ao tocar no avatar, abre-se um menu flutuante com `Trocar minha foto`, `Simular mensagem recebida` e `Alternar tema`. A troca de foto abre o seletor de imagens do dispositivo e usa uma URL temporária do arquivo selecionado para apresentar o avatar nesta sessão; não grava a foto no perfil online. A simulação escolhe um contato elegível e injeta uma mensagem fictícia; o tema alterna claro/escuro. Tocar fora do menu o fecha.

**ESPERADO ONLINE:** a foto deve passar pelo editor de perfil, upload e persistência autorizada; cada usuário deve poder controlar sua aparência global; a função de simular mensagem deve ser removida da experiência de produção ou ficar estritamente num painel de teste administrador/desenvolvedor.

**APRIMORAR:** adicionar acesso efetivo ao perfil, conta, privacidade, notificações e ajuda; evitar que simulações façam parecer que uma pessoa real enviou algo; oferecer confirmação de upload com erro e progresso; exibir menu de conta acessível ao teclado.

## 5. Barra inferior de navegação — sete abas

**ESTADO ATUAL:** a dock apresenta sete botões: `Início`, `Reels`, `Cartas`, `Músicas`, `Galeria`, `Chat` e `Avisos`. A indicação de aba ativa aparece sobre uma cápsula com animação de deslocamento. `Chat` é a aba implementada neste arquivo e pode ter contador de mensagens não lidas. Nos outros seis botões, o código apenas mostra um aviso de que o modelo permite interagir com o Chat; não há conteúdo funcional dessas páginas dentro deste HTML. A aba `Cartas` da dock é distinta da função **Enviar carta em envelope dentro da conversa**.

**ESPERADO ONLINE:** cada botão deve abrir a rota ou módulo real do aplicativo; a navegação precisa conservar histórico, rolagem, estado da tela e permissões. A aba Cartas deve oferecer o módulo completo de cartas do Looply, enquanto a carta enviada no chat deve ser um formato de mensagem com envelope. Notificações globais e avisos devem corresponder ao módulo de avisos, sem confundir com o sino de atividades da conversa.

**APRIMORAR:** definir roteador único, comportamento da tecla Voltar do Android, URLs válidas de cada aba e carregamento sob demanda; evitar perda de rascunhos ao navegar; preservar a aba atual em recarga e eliminar placeholders de produção.

## 6. Título e resumo da caixa de entrada

**ESTADO ATUAL:** a tela principal mostra o título `Chat` e um subtítulo que calcula quantas conversas individuais incluem pessoas marcadas como online e quantas mensagens ainda não foram lidas nas conversas consideradas pelo contador. Esse contador ignora chats silenciados ou arquivados no cálculo global, mesmo que ainda possam conter itens não lidos.

**ESPERADO ONLINE:** exibir uma contagem consistente entre dispositivos, informando conversas ou mensagens não lidas sem ambiguidade. Usar a presença de pessoas reais, respeitando suas permissões de privacidade.

**APRIMORAR:** separar claramente `X conversas não lidas` de `Y mensagens não lidas`; explicar por que conversas arquivadas/silenciadas podem não aparecer no total; evitar alterações abruptas do cabeçalho quando chegam eventos.

## 7. Faixa horizontal de pessoas online

**ESTADO ATUAL:** avatares circulares com nomes aparecem numa faixa que pode ser rolada horizontalmente. O ponto verde indica `on:1` no objeto local do usuário. Tocar num avatar abre a conversa individual existente ou cria uma nova. O nome e a foto são fictícios, e o estado online não é consultado ao servidor. Também há ponto verde nos avatares de mensagens/listas e um ponto verde ao lado de `online agora` no cabeçalho da conversa individual.

**ESPERADO ONLINE:** a presença deve vir de sessões conectadas e expirar por heartbeat ou presença do servidor; o status deve respeitar quem pode ver `online`, `visto por último` e `digitando`; a indicação deve se atualizar sem recarregar a tela.

**APRIMORAR:** introduzir estados `online`, `ausente`, `offline` e `desconhecido`, com estratégia de reconexão, debounce e tolerância a queda de rede. Não inferir que estar online significa disponível para receber chamadas.

## 8. Busca geral de conversas

**ESTADO ATUAL:** há um campo `Buscar conversas e pessoas…`. O código filtra as conversas por título e pelo texto de prévia da última mensagem; não consulta o histórico inteiro nem pesquisa todos os usuários do servidor. A busca reage a cada digitação, sem botão de confirmação. A lista mostra estado vazio quando não encontra resultados.

**ESPERADO ONLINE:** permitir busca de conversas, pessoas autorizadas, grupos e, se apropriado, mensagens passadas. A busca remota deve ter paginação, controle de permissões, realce dos resultados, suporte a acentos e recuperação do contexto.

**APRIMORAR:** separar abas `Conversas`, `Pessoas` e `Mensagens`; adicionar debounce, cancelamento de requisições anteriores e busca por nome de usuário; preservar a digitação ao voltar de uma conversa; não indexar conteúdo ao qual a pessoa não tenha acesso.

## 9. Filtros da caixa de entrada

**ESTADO ATUAL:** os chips de filtro são `Todas`, `Não lidas`, `Grupos`, `Fixadas`, `Favoritas` e `Arquivadas`. `Todas` lista as conversas não arquivadas; `Não lidas` mantém só as que possuem contador acima de zero; `Grupos` mostra apenas grupos; `Fixadas` mostra as marcadas; `Favoritas` mostra as favoritadas; `Arquivadas` mostra os chats arquivados. Os filtros são alternados por um único valor, e a rolagem é horizontal.

**ESPERADO ONLINE:** os filtros devem operar sobre a lista real do usuário, com paginação, contadores corretos, prioridade de conversas fixadas e sincronização entre dispositivos. Ser arquivado não deve apagar mensagens.

**APRIMORAR:** permitir pastas personalizadas, filtros combinados, regras para grupos silenciados e prioridade entre fixadas/arquivadas. Exibir chips com contagem coerente; restaurar o filtro após sair da conversa e lidar com longas listas sem travamentos.

## 10. Lista de conversas e cartões individuais

**ESTADO ATUAL:** cada cartão contém avatar, nome do contato ou grupo, horário ou data da última mensagem, prévia textual, símbolos de entrega/leitura se a última mensagem for enviada pelo próprio usuário, ícone de fixação, ícone de silenciamento e, quando necessário, um selo numérico de mensagens não lidas. Conversas fixadas são ordenadas primeiro; as demais, por atividade recente. A extensão Ultra diferencia as não lidas por fundo em degradê suave, borda com cor de destaque, faixa vertical e maior peso tipográfico. As fixadas recebem reforço visual e a etiqueta `📌 Fixada`. Mensagens de cartas e enquetes têm prévias específicas. Há animação de entrada dos cartões na carga inicial.

**ESPERADO ONLINE:** a prévia deve vir do último evento visível e autorizado, incluindo remetente, tipo de conteúdo, estado da mensagem, rascunho e horário correto. Cada alteração deve chegar por assinatura realtime, sem reorganização brusca que prejudique a leitura. Mensagens apagadas para todos precisam aparecer com a descrição apropriada.

**APRIMORAR:** incluir indicação `Rascunho` quando houver texto não enviado, prévias de mensagens de voz/carta/convite/chamada e tratamento de menções. Unificar badges com contadores reais. Não abrir a conversa involuntariamente após um gesto longo; implementar testes de acessibilidade para itens com várias informações.

## 11. Pressão prolongada e menu contextual de conversa

**ESTADO ATUAL:** manter o dedo pressionado por aproximadamente 480 ms, ou abrir menu de contexto no desktop, exibe ações: `Fixar no topo / Desafixar`, `Silenciar / Reativar notificações`, `Marcar como lida / Marcar como não lida` e `Limpar conversa`. A implementação local atualiza as flags da conversa; a limpeza remove do estado local todas as mensagens do chat, sem diálogo confirmatório nesse menu específico.

**ESPERADO ONLINE:** as ações devem pertencer à conta que as solicitou. Marcar como lida deve atualizar um cursor de leitura e preferências de recibos. Limpar deve atuar somente sobre a visão/histórico permitido, com confirmação e regras de retenção; não deve apagar mensagens de outros usuários nem interferir em backups sem aviso.

**APRIMORAR:** exigir confirmação para operação destrutiva; acrescentar `Arquivar`, `Favoritar` e `Informações`; tratar gestos de swipe na lista e opção de desfazer; garantir consistência com os toggles presentes na página de configurações.

## 12. Botão flutuante `+ Nova conversa`

**ESTADO ATUAL:** abre uma folha modal `Nova conversa`, com busca de pessoas, lista de avatares e indicação de online/visto por último. Tocar num nome o seleciona; tocar novamente o desseleciona. Com uma pessoa, o botão de ação diz `Conversar` e abre ou cria um chat individual. Com duas ou mais, muda para `Criar grupo com N` e mostra campo `Nome do grupo (opcional)`. Ao confirmar, cria o grupo no armazenamento local e abre imediatamente a conversa. Se nada está selecionado, a ação fica desabilitada.

**ESPERADO ONLINE:** a lista deve vir da base de contatos/usuários elegíveis; a criação individual precisa reutilizar o canal existente; a criação de grupos deve registrar integrantes no banco, aplicar permissões e notificar os participantes somente após confirmação/autorização da plataforma.

**APRIMORAR:** adicionar confirmação de participantes, foto/nome na criação, seleção de administradores, validação de nome, limite de membros, buscas paginadas e identificação de contas bloqueadas, removidas ou indisponíveis. Não permitir criar grupos com membros sem autorização nem duplicar conversas 1:1.

## 13. Tela de conversa — estrutura e navegação

**ESTADO ATUAL:** uma conversa ocupa a tela inteira, com cabeçalho de vidro no topo, histórico no centro e compositor fixo embaixo. O fundo contém pontos e gradientes suaves ou um papel de parede selecionado. A interface desliza horizontalmente ao abrir/fechar. Há áreas seguras no topo e embaixo, rolagem vertical do histórico e tentativa de adaptação ao teclado por `visualViewport` e `ResizeObserver`. A rolagem do histórico é separada da folha de configurações e do seletor de figuras.

**ESPERADO ONLINE:** abrir uma conversa deve carregar primeiro as mensagens recentes e buscar páginas antigas sob demanda; ter cursor de leitura e estados de conexão; continuar na mesma posição quando uma nova mensagem chega, salvo se a pessoa estava perto do final; preservar rascunhos e trabalho não enviado.

**APRIMORAR:** remover renderizações integrais do histórico em cada evento (atualmente o HTML é refeito com `innerHTML`), adicionar paginação e virtualização; garantir que renderizar uma reação não provoque salto da rolagem; tratar teclado, seleção de texto e leitor de tela de forma consistente.

## 14. Cabeçalho interno da conversa: todos os controles

**ESTADO ATUAL:** da esquerda para a direita existem: `Voltar`, bloco com avatar, nome e status, `Buscar na conversa`, `Ligar` (ícone telefônico), `Videochamada` (ícone de câmera de vídeo, adicionado pela extensão Ultra) e `Mais` (três pontos). Tocar no nome/avatar ou em `Mais` abre as configurações da conversa. Tocar no telefone inicia uma ligação de áudio demonstrativa; tocar no vídeo inicia uma videochamada demonstrativa. O ponto verde identifica participantes marcados como online. Nos grupos, o subtítulo lista os integrantes em vez de mostrar o status individual. O cabeçalho fica mais compacto em larguras de até 400 px.

**ESPERADO ONLINE:** `Voltar` deve retornar à lista, respeitando a navegação do aparelho. O nome e o avatar devem levar aos detalhes daquele chat. A busca deve consultar mensagens daquele chat. Áudio e vídeo precisam passar por disponibilidade, permissão de contato, sinalização e infraestrutura de chamadas. `Mais` deve mostrar opções de contexto, acessíveis e sem ações indevidas a não administradores.

**APRIMORAR:** estados `Chamando`, `Conectando`, `Conectado`, `Reconectando`, `Falhou`; confirmação de vídeo em redes lentas; status de grupo mais informativo (`N participantes`, online quando autorizado); espaço mínimo de toque no Android; reduzir a chance de tocar no ícone errado em telas de 320 px.

## 15. Busca dentro da conversa

**ESTADO ATUAL:** a lupa abre uma barra abaixo do cabeçalho, contendo campo `Buscar nesta conversa`, contador de ocorrências, seta para ocorrência anterior e seta para próxima. O conteúdo textual correspondente recebe realce de marcador. Ao digitar, o HTML reconstruirá as mensagens e criará uma coleção de trechos encontrados, navegando por `Anterior` e `Próxima`. Tocar novamente na lupa fecha e limpa a busca. O atalho `Ctrl+K`/`Cmd+K` abre a busca da conversa atual, ou foca a busca geral se não há conversa aberta.

**ESPERADO ONLINE:** buscar textos de mensagens armazenadas remotamente sem baixar o histórico inteiro; permitir filtrar por pessoa, intervalo de datas e tipo de mídia; abrir o resultado em contexto e recuperar mensagens anteriores/posteriores.

**APRIMORAR:** indexação full-text com regras de privacidade, busca por termos acentuados e normalizados, estados carregando/erro, navegação consistente entre páginas de resultados e realce que não quebre formatação/links. A implementação atual depende das mensagens já presentes no modelo.

## 16. Linha do tempo, separadores, avatares e balões

**ESTADO ATUAL:** as mensagens aparecem organizadas por datas (`Hoje`, `Ontem` ou data extensa). Mensagens próprias são alinhadas à direita com cor da conversa; mensagens alheias ficam à esquerda, com fundo distinto, avatar e, no grupo, nome do remetente. Mensagens próximas da mesma pessoa têm espaçamento/raios de borda ajustados. Existem animações de aparecimento, horários no canto, estado de edição, reação, status de leitura, encaminhamento e referência de resposta. O texto permite quebras de linha, caracteres Unicode e alguns marcadores de formatação. URLs em mensagens de texto tornam-se links. Mensagens do sistema usam uma cápsula central, sem balão de remetente.

**ESPERADO ONLINE:** ordenação determinística por sequência no servidor, desempate por identificador, mensagens pendentes, reenvio em caso de falha, deduplicação de eventos, integridade de encaminhamentos e sincronização de edições/apagamentos.

**APRIMORAR:** diferenciar hora do dispositivo e hora confiável do servidor; adicionar visualização de falha, botão `Tentar novamente`, status `Enviando`, otimização de agrupamento e rolagem sem saltos. Mensagens de sistemas não devem ser tratadas como mensagens enviadas por perfis fictícios.

## 17. Estados de envio, entrega, leitura e não lidas

**ESTADO ATUAL:** uma mensagem enviada passa a ter um check para `sent`, dois checks para `deliv` e dois checks coloridos para `read`. A função demonstrativa `settle` altera os estados automaticamente após pequenos atrasos e pode gerar resposta simulada. Ao abrir um chat, o contador `unread` é zerado e mensagens recebidas podem ser marcadas localmente como lidas. Se havia mensagens não lidas, o histórico insere o divisor `Mensagens não lidas` e tenta posicionar a tela nele. Quando a pessoa está longe do fim, o botão `Ir para o fim` aparece e pode incluir indicação local de chegadas recentes.

**ESPERADO ONLINE:** enviar evento com ID idempotente; servidor confirma recebimento; dispositivo destinatário confirma entrega; leitura depende de abertura efetiva, visibilidade e configuração de privacidade. As contagens devem representar mensagens efetivamente não vistas e manter precisão no uso simultâneo de vários dispositivos.

**APRIMORAR:** substituir timers artificiais por recibos autenticados; modelar estados `queued`, `sending`, `sent`, `delivered`, `read`, `failed`; prever grupos (leituras por participante) e mensagens enviadas offline; corrigir diferenciação entre marcar toda conversa como lida e registrar leitura individual de mensagens.

## 18. Indicador `digitando…` e presença contextual

**ESTADO ATUAL:** se um contato fictício está no estado `typing`, o subtítulo da conversa pode mostrar `digitando…`, a lista mostra prévia `digitando…` e o histórico exibe três pontinhos animados dentro de um balão. As simulações ativam e removem esse estado em intervalos curtos. Se não está digitando, aparece `online agora` ou visto por último, conforme os dados estáticos.

**ESPERADO ONLINE:** transmitir eventos efêmeros `typing:start` e `typing:stop` apenas quando permitido; expirar automaticamente, sem persistir como mensagem; suportar múltiplos participantes digitando em grupo, sem divulgar informação privada a usuários não autorizados.

**APRIMORAR:** debounce e timeout; não exibir indicador parado indefinidamente; controlar consumo de rede, desativação de conexão e visibilidade da aba. Aplicar acessibilidade sem leitura repetitiva pela tecnologia assistiva.

## 19. Área de composição — campo de mensagem e botões

**ESTADO ATUAL:** o compositor fica na parte inferior, em painel translúcido. Contém: botão de alfinete (abre menu de anexos), botão `Games` incorporado pela camada 2.0, botão de emoji/figurinhas, campo de texto `Mensagem` que cresce até uma altura limite, botão circular de enviar ou de microfone (o ícone muda quando o texto está vazio), área de contexto `Respondendo a…`/`Editando mensagem`, e painel de gravação quando há áudio ativo. Quando a conversa é bloqueada, parte do compositor é substituída por um aviso e botão de desbloqueio. Enter no desktop, em ambiente com cursor/hover, pode enviar; Shift+Enter mantém nova linha.

**ESPERADO ONLINE:** validação de tamanho, rate limiting, rascunho seguro, anexo de mídia e envio otimista com status; respeito ao teclado Android/iOS, cursor, seleção, colagem, emojis e acessibilidade. A função de envio deve preservar o conteúdo caso haja erro, exibindo botão de reenviar.

**APRIMORAR:** não apagar texto antes de confirmação quando online; oferecer prévia do anexo e barra de progresso; selecionar múltiplas mídias; modo `mencionar`/`responder`; gestos de gravação de voz (segurar, deslizar para cancelar, travar) e um indicador de envio pendente.

## 20. Alfinete — leque de 15 opções, uma a uma

**ESTADO ATUAL:** tocar no alfinete abre um painel animado, posicionado acima do compositor, organizado em três colunas com 15 botões, cada qual com emoji e legenda. O próprio alfinete gira levemente quando aberto; tocar fora ou pressionar Escape fecha. A seleção de qualquer ferramenta fecha o leque e executa a ação da opção. A ação é bloqueada em conversas bloqueadas.

1. **Carta 💌:** abre editor de carta selada, com título, corpo, assinatura, papel, selo e prévia; ao enviar, cria mensagem de tipo `letter`.
2. **Foto 🖼️:** abre o seletor de imagens do aparelho; gera uma mensagem de imagem e tenta preservar o arquivo localmente no IndexedDB.
3. **Vídeo 🎞️:** configura o seletor de arquivos para vídeos; o chat renderiza um vídeo com controles HTML5 e reprodução inline.
4. **Arquivo 📎:** abre um seletor sem filtro de formato; a mensagem apresenta nome, tamanho e botão de baixar.
5. **Áudio 🎙️:** inicia a captura do microfone, se o navegador conceder a permissão; pode gerar um áudio local reproduzível.
6. **Figurinhas 🎨:** expande o painel de emojis/figurinhas diretamente na aba de figurinhas.
7. **Nota 📝:** abre formulário de título e texto; envia um cartão de nota na conversa.
8. **Música 🎵:** abre formulário para nome, artista e URL HTTPS opcional; envia um cartão musical com link para ouvir.
9. **Games 🎮:** abre a central de jogos com Jogo da Velha e Gartic.
10. **Enquete 📊:** abre editor de pergunta e alternativas; gera opções votáveis com porcentagens.
11. **Agendar 🕒:** abre editor de mensagem futura com opções predeterminadas de horário.
12. **Local 📍:** envia descrição de lugar como link do Google Maps ou tenta ler as coordenadas permitidas pelo navegador.
13. **Contato 👤:** abre a relação local de usuários fictícios e envia uma mensagem textual com o nome escolhido.
14. **Compartilhar 🔗:** invoca a folha nativa de compartilhamento (`navigator.share`) ou copia a descrição da conversa; não gera convite de acesso funcional nem URL privada real.
15. **Atividades 🔔:** abre a central de atividades do modelo.

**ESPERADO ONLINE:** cada ferramenta deve gerar seu próprio evento/payload válido e autorizado; o destinatário deve receber uma renderização equivalente, com permissões e armazenamento persistentes. Anexos, carta, local e contato não devem ser reduzidos a textos sem estrutura se o módulo online exigir ações próprias. Compartilhamento deve usar links seguros e com escopo, quando houver autorização.

**APRIMORAR:** busca entre ferramentas, reordenação dos favoritos, persistência da última ação, rótulos acessíveis, animações curtas, fechamento ao trocar de conversa, preparação para acessos por uma só mão e suporte a seleção de vários anexos. Manter o jogo acessível tanto pelo botão direto como pelo alfinete, sem redundância confusa.

## 21. Cartas em envelopes: escrita, aparência, abertura e resposta

**ESTADO ATUAL:** `Escrever carta` abre uma folha com campo de título (até 100 caracteres), texto (até 10.000), assinatura (até 80, inicialmente `Marina`), quatro papéis (`cream`/creme, `rose`/rosa, `lavender`/lavanda, `sky`/azul-claro), oito selos (`💜`, `💌`, `🌷`, `🦋`, `🌙`, `⭐`, `🕊️`, `❤️`) e prévia ao vivo. `Selar e enviar carta` exige conteúdo com pelo menos dois caracteres, cria a mensagem `kind: letter` e um registro local de atividade. Na conversa, o texto integral não fica exposto de início: aparece uma ilustração de envelope com o título, um selo de cera e convite `Toque para abrir`. Tocando no envelope, uma folha `Carta` mostra a data, o título, todo o texto, o papel escolhido, a assinatura e uma animação de abertura. Botões `Responder` e `Fechar` permitem transformar a carta em referência de resposta ou encerrar a leitura.

**ESPERADO ONLINE:** a carta deve ser enviada como objeto estruturado com remetente real, destinatários/grupo, timestamps do servidor, papel e selo; a autorização de leitura deve ser checada no servidor. O contato deve receber uma notificação de carta selada com prévia adequada à privacidade. `Abrir` pode registrar o primeiro acesso; `Responder` deve vincular a mensagem correta. A carta no chat não deve se confundir com o módulo independente Cartas da navegação inferior.

**APRIMORAR:** permitir salvar rascunho da carta, pré-visualização no tamanho real, editor com tipografia e fundos extras, seleção de selo por catálogo completo de emojis, privacidade de prévia, suporte a destinatários individuais dentro de grupos, edição antes do envio, limite de anexos, opção de reenviar/encaminhar, impressão/exportação e acessibilidade. Se desejar cartas criptografadas ou com senha, isso exige especificação e backend próprios — não existem no HTML atual. O `Abrir` atual não comprova que um destinatário remoto leu a carta.

## 22. Mensagens de texto e formatação inline

**ESTADO ATUAL:** texto comum aceita múltiplas linhas e emojis; a renderização interpreta alguns formatos simples: `*texto*` como negrito, `_texto_` como itálico e `~texto~` como tachado, em determinados limites de palavra. Links iniciados por `http://` ou `https://` ganham âncora clicável. O histórico preserva a ordem aparente e mostra horário e status.

**ESPERADO ONLINE:** servidor e cliente devem compartilhar regras de formatação, validação e segurança de URLs; a mensagem original deve permanecer como texto ou AST estruturada, evitando HTML arbitrário recebido do usuário.

**APRIMORAR:** ampliar formatação (código, citações, listas, spoiler), prévia segura de links, detecção de menções, colagem de texto, tratamento de RTL, links perigosos, limite de caracteres e seleção/cópia nativas. Evitar desencontro entre busca com realce e formatação.

## 23. Responder a mensagem, gesto de arrastar e referência

**ESTADO ATUAL:** selecionar `Responder` no menu ou deslizar uma mensagem para a direita ativa uma caixa de contexto acima do compositor, com remetente e resumo. O botão `X` cancela a referência. Ao enviar, a nova mensagem guarda o ID da anterior e exibe uma pequena citação destacada, que pode ser tocada para rolar até a original. Há duas implementações complementares de swipe: uma baseada em toque com gesto de borda para voltar e outra baseada em Pointer Events; ambas procuram preservar a alternativa no menu.

**ESPERADO ONLINE:** referências devem apontar para IDs permanentes; caso a mensagem original tenha sido apagada ou esteja inacessível, o cartão deve mostrar um placeholder seguro. O gesto precisa coexistir com a rolagem e com o voltar do sistema Android.

**APRIMORAR:** unificar handlers redundantes para evitar resposta dupla; indicar visualmente o alcance do gesto e emitir feedback tátil apenas quando permitido; permitir responder mídia e carta com resumo correto; tratar histórico paginado e rolagem para mensagens que não estejam carregadas.

## 24. Reações rápidas e menu de mensagem

**ESTADO ATUAL:** um toque/tap próximo ao balão abre, após pequeno atraso, um menu de mensagem; o toque duplo pode reagir com coração. No menu aparece uma linha com reações `❤️`, `😂`, `😮`, `😢`, `👍` e `🔥`, quando a mensagem não foi apagada. Tocar na mesma reação alterna/remova a reação daquele usuário local. O menu contém `Responder`, `Copiar` (texto ou figurinha nas regras da base), `Encaminhar`, `Editar` (apenas texto próprio), `Apagar`, `Salvar mensagem`, `Fixar mensagem`, `Compartilhar conteúdo` e, pela camada Ultra, `Informações da mensagem`. As ações variam conforme autoria, tipo e estado de exclusão. Reações aparecem sob a bolha, com contagem quando mais de uma pessoa usa o mesmo emoji.

**ESPERADO ONLINE:** reações precisam ser exclusivas por autor/reação conforme regra de produto, sincronizadas em tempo real, com tratamento de remoção e permissão. Menus devem respeitar autoria e políticas de edição/exclusão; copiar/compartilhar não pode incluir conteúdo de chats aos quais o usuário não tem acesso.

**APRIMORAR:** permitir seletor de todos os emojis para reação, mostrar quem reagiu, atualizar sem reconstruir toda a tela, permitir múltiplas reações se a regra permitir, reduzir conflito entre toque, longa pressão e arraste e garantir que menus não cubram o teclado em telas pequenas.

## 25. Editar mensagem

**ESTADO ATUAL:** a opção `Editar` aparece no menu de mensagens de texto enviadas pela própria identidade de demonstração. O texto original é colocado no compositor, com faixa `Editando mensagem` e botão de cancelamento. `Enviar` altera o texto da mesma mensagem, acrescenta a indicação `editada` e redesenha o histórico. Não há prazo máximo para edição nem histórico de versões.

**ESPERADO ONLINE:** validar propriedade da mensagem e janela de edição no servidor, manter consistência em grupos e assinaturas; registrar nova versão e distribuir atualização; conservar horário de edição e trilha de auditoria quando necessário.

**APRIMORAR:** preservar rascunho anterior enquanto edita, exibir cancelamento claro, tratar concorrência, informar destinatário de edição e definir regra de mensagens temporárias/citadas/encaminhadas.

## 26. Apagar mensagem — para todos, só para mim e mensagens de terceiros

**ESTADO ATUAL:** ao selecionar `Apagar` numa mensagem própria, a folha oferece `Apagar para todos` ou `Apagar só para mim`. A primeira marca localmente `del:true`, esvazia texto e reações, e mostra `Mensagem apagada`. A segunda retira a mensagem do array local. Para mensagens alheias, o modelo permite apagar apenas do próprio histórico local. Uma mensagem já marcada apagada pode ser removida completamente. A camada Ultra registra um item de atividade quando a ação `Apagar para todos` é escolhida.

**ESPERADO ONLINE:** `Apagar para todos` deve ser evento do servidor com autorização e janela de tempo definida, propagado a todos os participantes/dispositivos. `Apagar só para mim` deve ser uma máscara de visibilidade por usuário, e não exclusão física do banco compartilhado. A remoção deve contemplar anexos, caches, backups e retenção legal com regras claras.

**APRIMORAR:** exigir confirmação em situações sensíveis, oferecer desfazer quando tecnicamente possível, preservar um tombstone coerente no histórico remoto, tratar mensagens encaminhadas e evitar que a atividade local seja interpretada como notificação efetivamente entregue a outros usuários.

## 27. Encaminhar e compartilhar mensagem

**ESTADO ATUAL:** `Encaminhar` abre a folha `Encaminhar para…`, com todas as conversas disponíveis; tocar num destino cria uma nova mensagem com a propriedade `fwd:true` e selo `Encaminhada`. `Compartilhar conteúdo` usa o compartilhamento nativo do dispositivo ou tenta copiar a descrição da mensagem. Esses fluxos operam sobre o estado local e podem acionar uma resposta automática fictícia.

**ESPERADO ONLINE:** encaminhamentos devem enviar um novo payload a chats autorizados, preservar o tipo original e anexos sem violar permissões; mostrar informação suficiente de origem, limitar abuso e enviar notificações ao destino.

**APRIMORAR:** seleção de múltiplos destinos, busca, nota de encaminhamento, prevenção de links quebrados e respeito a mensagens de visualização única/temporárias. Confirmar envio a cada destinatário e relatar falha parcial.

## 28. Fixar mensagens e mensagens salvas

**ESTADO ATUAL:** `Fixar mensagem` alterna uma flag no item, exibindo 📌 no balão e uma barra de mensagem fixada imediatamente abaixo do cabeçalho. A barra mostra o último item fixado e, ao tocar, rola até ele com animação. O código limita a no máximo três mensagens fixadas, desafixando outra ao exceder esse limite. `Salvar mensagem` alterna ⭐ e inclui o item na folha `Mensagens salvas` disponível nas configurações. Tocar numa mensagem salva leva ao ponto correspondente no histórico. Fixação de conversas é uma funcionalidade separada da fixação de mensagens.

**ESPERADO ONLINE:** definir se fixação é visível para todos os membros do grupo ou apenas para o usuário, manter ordenação estável, permissões e prazos; mensagens salvas devem ser pessoais e sincronizadas com a conta. A barra fixada precisa recuperar mensagens que não estejam carregadas.

**APRIMORAR:** carrossel das até três fixadas, título/autor/data, botão desafixar direto, diferenciação visual de conversa fixada versus mensagem fixada, busca por salvas e sincronização segura entre dispositivos.

## 29. Emojis: aba `Emojis`, campo de busca, categorias e inserção

**ESTADO ATUAL:** o botão sorridente abre um painel expansível no compositor com abas `Emojis` e `Figurinhas`. Na aba Emojis há um campo de busca, chips `Todos`, `Rostos`, `Pessoas`, `Gestos`, `Natureza`, `Animais`, `Comidas`, `Esportes`, `Viagem`, `Símbolos`, `Objetos` e `Extras`. O JavaScript percorre faixas de Unicode, combina com um conjunto de símbolos e emojis especiais e apresenta os primeiros 220; `Mostrar mais` acrescenta outros 220. A busca usa correspondência direta do caractere e alguns aliases em português (`coração`, `amor`, `risada`, `triste`, `brasil`, `festa`, `música`, `gato`, `flor`). Ao tocar em um emoji, ele é inserido na posição atual do cursor, em vez de virar mensagem separada. O compositor recupera o foco.

**ESPERADO ONLINE:** o seletor deve ser compatível com Unicode atualizado, sequência com modificadores de tons de pele, gêneros, famílias e bandeiras, sem quebrar graphemes; a mensagem deve transmitir o texto Unicode íntegro. Não depende de um servidor de emojis, mas o cliente deve permitir atualização e renderização consistente entre plataformas.

**APRIMORAR:** não afirmar que a lista atual contém literalmente todos os emojis existentes: o algoritmo por intervalos e os aliases simples não cobrem todas as sequências combinadas. Criar dataset Unicode versionado, busca por palavras-chave em português, favoritos/recentes, seleção de tom de pele e navegação de teclado.

## 30. Figurinhas: catálogo, guias, envio, lupa e favoritos

**ESTADO ATUAL:** a aba `Figurinhas` abre um catálogo de cartões com imagem, nome pequeno e estrela de favorito. As categorias são `Todas`, `★ Favoritas`, `Recentes`, `Do ZIP`, `CC0` e `Minhas`. Há `Buscar figurinhas`, botão `＋ Importar` e paginação `Mais figurinhas (N)`, com acréscimos de 32 cartões. A biblioteca disponibilizada contém 137 figurinhas originais da pasta do projeto e quatro recursos CC0, totalizando ao menos 141 itens predefinidos, além das customizadas importadas. Tocar na imagem envia uma mensagem de tipo `sticker` referenciando sua imagem; tocar na estrela favorita/desfavorita; os recentes são atualizados ao enviar. Os arquivos reais aparecem sem balão colorido, com largura visual até aproximadamente 112 px. Tocar numa figurinha já enviada abre sua prévia ampliada em uma folha com botão `Fechar`.

**ESPERADO ONLINE:** catálogo e pacotes de figurinhas devem ter IDs globais, URL/CDN e regras de visibilidade, podendo ser acessados por destinatário mesmo sem possuir o arquivo local. Favoritos e recentes podem ser sincronizados por conta; as figurinhas recebidas podem ser adicionadas a coleções pessoais conforme direitos de uso.

**APRIMORAR:** botão `Adicionar às minhas figurinhas` diretamente no balão, pacotes e criadores, buscador semântico, figurinhas animadas com desempenho controlado, remoção/renomeação das customizadas, compartilhamento e upload persistente de criações. Tratar pasta `Stickers` ausente no ZIP extraído e evitar mensagens com imagem quebrada.

## 31. Importar figurinha própria

**ESTADO ATUAL:** o botão `＋ Importar` abre o seletor do sistema e admite arquivos PNG, JPEG ou WebP, inclusive seleção múltipla. Cada arquivo individual maior que 5 MB é ignorado; as imagens válidas são desenhadas num canvas 256×256, redimensionadas para caber em 240 px e exportadas para WebP com compressão. O conteúdo convertido entra na aba `Minhas` e no estado local da pessoa. Há notificação de quantos itens foram importados; imagens inválidas ou muito grandes podem ser rejeitadas.

**ESPERADO ONLINE:** importar deve enviar a figurinha para um armazenamento remoto autorizado, guardar metadados e disponibilizar versões otimizadas. O servidor deve validar tipo real de arquivo, dimensões, tamanho, segurança, moderação e propriedade do conteúdo.

**APRIMORAR:** editor de recorte, remoção de fundo, animação, prévia antes de salvar, nome/pacote/etiquetas, barra de progresso, confirmação de exclusão e migração entre aparelhos. O `localStorage` atual tem limite reduzido: muitas figurinhas convertidas para data URI podem excedê-lo.

## 32. Enviar foto pela galeria

**ESTADO ATUAL:** o seletor de fotos aceita arquivos do aparelho; o JavaScript classifica o anexo como `img`, acrescenta uma mensagem ao histórico e usa URL de objeto no preview imediato. A extensão 2.0 tenta armazenar o conteúdo no IndexedDB e recuperá-lo por ID após recarregar. Mensagens antigas do modelo podem mostrar placeholder `foto indisponível neste preview` quando a mídia não pode ser recuperada. O tamanho máximo geral do arquivo no modelo é de 30 MB. Não há editor de imagem completo para cada foto enviada na conversa.

**ESPERADO ONLINE:** antes do upload, pré-visualizar, redimensionar e anexar legenda, aplicar orientação correta, remover metadados sensíveis quando apropriado e enviar por API autorizada. O destinatário recebe uma miniatura, pode abrir em tela cheia, aplicar zoom, baixar ou encaminhar segundo as regras de privacidade. O armazenamento deve suportar imagens originais e miniaturas derivadas.

**APRIMORAR:** suporte a várias fotos, legendas por mídia, editor de crop/rotação/marcação, compressão adaptativa, EXIF e carregamento progressivo; modal de visualização com zoom e salvar; upload cancelável, retomável e sem perda de rascunho.

## 33. Enviar vídeo

**ESTADO ATUAL:** `Vídeo` abre seleção de arquivo com `accept=video/*`. Uma mensagem `kind: video` é criada e mostra um componente `<video>` com controles nativos, `playsinline` e metadados; o arquivo é recuperado do IndexedDB se ainda existir. O modelo não faz transcodificação, streaming adaptativo, produção de thumbnail nem upload remoto.

**ESPERADO ONLINE:** upload resiliente com progressão, validação de formato, codificação compatível, miniatura, duração, largura/altura, reprodução inline em smartphone e transferência de arquivo para mídia persistente. Nos aparelhos com rede lenta, carregar metadados e thumbnail antes do arquivo inteiro.

**APRIMORAR:** limitar duração/tamanho de maneira explícita, tratar formatos HEVC, MOV e WebM por plataforma, gerar miniaturas, opção de cortar o vídeo, pausar a reprodução ao sair do chat, vídeo vertical sem barras indesejadas e download com regras de acesso.

## 34. Enviar arquivo e baixar anexos

**ESTADO ATUAL:** `Arquivo` aceita seleção genérica, registra o nome e tamanho e apresenta um cartão com ícone de clipe e botão `Baixar arquivo`. O botão tenta recuperar o Blob salvo em IndexedDB e aciona download com o nome original. O modelo rejeita arquivos acima de 30 MB. O armazenamento local pode falhar por permissões ou quota, caso em que o anexo pode ficar disponível somente durante a sessão.

**ESPERADO ONLINE:** anexos devem ser armazenados em objeto privado, verificados por tipo/tamanho, vinculados à mensagem por ID estável, disponibilizados ao destinatário via URL temporária autorizada ou proxy autenticado. Downloads precisam ser auditáveis e protegidos de acesso de terceiros.

**APRIMORAR:** ícones conforme MIME, preview de PDF/documentos quando autorizado, indicador de transferência, confirmação antes de baixar executáveis, scan de malware, tratamento de nomes longos e expiração de links. O HTML demonstra a UI, não protege arquivos de maneira equivalente a um armazenamento seguro na nuvem.

## 35. Mensagens de voz — gravar, cancelar, enviar e ouvir

**ESTADO ATUAL:** quando o campo está vazio, o botão de envio exibe microfone; a opção `Áudio` no alfinete chama a mesma gravação. Na camada mais recente, a gravação real usa `getUserMedia({audio:…})` e `MediaRecorder` quando o browser oferece suporte e o usuário concede permissão. A interface mostra ponto pulsante, duração `00:00`, indicação `Gravando áudio…`, botão `X` para cancelar e botão de envio para finalizar. Há limite de 180 segundos programado. O áudio é preservado como Blob e associado à mensagem no IndexedDB quando possível. No histórico, o cartão de áudio inclui reproduzir/pausar, 30 barras de onda visual calculadas, duração e progresso; para áudios reais, a barra avança conforme `Audio.currentTime`, e tocar nela permite buscar uma posição. Para áudios fictícios do seed, o player pode apenas simular progresso, pois não existe gravação correspondente.

**ESPERADO ONLINE:** mensagem de voz deve ser realmente enviada ao destinatário, com MIME compatível, URL de mídia autorizada, duração, waveform calculada do sinal real ou fornecida por metadados, reprodução eficiente, cancelamento e controle de progresso. A gravação precisa sobreviver a variações do teclado, bloquear envio vazio e lidar com interrupções por chamada telefônica.

**APRIMORAR:** visualização da onda verdadeira em vez de barras derivadas do ID; gravar ao segurar, deslizar para cancelar, travar gravação, ouvir antes de enviar, velocidade 1×/1,5×/2×, reduzir ruído e tratar permissão negada sem inventar gravação. Não confundir captura do microfone com transmissão de áudio ao outro usuário: no modelo, ela é local.

## 36. Notas enviadas no chat

**ESTADO ATUAL:** `Nota` abre folha `Enviar nota` com título opcional e área para texto. A camada Ultra aceita até 2.800 caracteres no corpo e até 90 no título; a camada anterior tinha limites semelhantes, mas não idênticos. Sem conteúdo não envia. A mensagem resultante aparece como cartão `📝 Nota`, com título maior e texto em múltiplas linhas. É um tipo próprio `kind: note`.

**ESPERADO ONLINE:** notas devem ser eventos estruturados transmitidos aos integrantes; podem ter autor, edição, arquivo anexo, formatação e busca; a prévia no inbox deve mostrar o título.

**APRIMORAR:** remover divergências entre editores duplicados, possibilitar editar nota, anexos, checklist, colaboração opcional, fixação, exportação e histórico de versões. Definir se `Nota` é somente formato de mensagem ou uma entidade independente sincronizada.

## 37. Compartilhar música

**ESTADO ATUAL:** `Música` abre formulário com nome da faixa, artista e link HTTPS opcional. Exige nome; se há URL, exige início com `https://`. A mensagem exibe cartão com disco estilizado, título, artista e link `Ouvir música`, que abre um endereço externo. Não há busca em catálogo Apple/Deezer/Spotify, player real embutido, prévia automática nem trecho sincronizado.

**ESPERADO ONLINE:** buscar músicas por fontes licenciadas/permitidas, mostrar arte de capa, artista, duração e origem, validar links, oferecer prévia quando a licença permitir, preservar o preview para quem recebe e diferenciar compartilhamento de música de upload de áudio protegido.

**APRIMORAR:** integrar busca, autocomplete e artes oficiais; controlar reprodução concorrente; exibir estado de indisponibilidade regional; gerenciar permissões e evitar promessas de autoplay sem gesto do usuário quando o navegador bloquear.

## 38. Localização

**ESTADO ATUAL:** `Local` abre folha com campo para cidade/local/endereço, `Enviar local` e `Usar localização do aparelho`. No primeiro caso, gera uma mensagem textual com endereço e URL do Google Maps; no segundo, chama a API de geolocalização do navegador e constrói link com latitude/longitude arredondadas. Se a permissão for negada ou a API não existir, aparece aviso. Não há mapa embutido, localização em tempo real, geofencing ou compartilhamento contínuo.

**ESPERADO ONLINE:** compartilhar coordenadas estáticas com prévia de mapa, opção de compartilhar por período e revogação clara; exigir consentimento explícito para precisão e tempo, além de respeitar configurações do aparelho. A mensagem deve ser um tipo `location` com coordenadas e metadados de privacidade, não apenas um texto impossível de gerenciar.

**APRIMORAR:** prévia visual de mapa, busca de pontos de interesse, confirmação antes de enviar localização precisa, precisão ajustável, expiração e botão `Parar de compartilhar`; não armazenar localização exata desnecessariamente.

## 39. Compartilhar contato

**ESTADO ATUAL:** `Contato` abre lista de usuários fictícios e permite tocar em um. O modelo envia texto `👤 Contato Looply: Nome`. Não há cartão interativo de perfil, ID estável no payload, telefone, convite ou adição à agenda.

**ESPERADO ONLINE:** selecionar um perfil autorizado, gerar mensagem `contact` com ID interno, avatar e nome exibível; ao tocar, abrir o perfil com botões apropriados (conversar, adicionar, seguir). Dados privados como telefone só devem circular se o titular permitir.

**APRIMORAR:** cartão de contato real, verificação de disponibilidade, estados de contato removido/bloqueado, opção de compartilhar somente informações públicas e destino de perfil seguro.

## 40. Enquetes, alternativas, porcentagens e voto

**ESTADO ATUAL:** `Enquete` abre `Nova enquete`, com pergunta de até 240 caracteres, duas opções iniciais de até 95 cada e botão `+ Adicionar opção`, limitado a oito alternativas. `Publicar enquete` exige pergunta e no mínimo duas opções não vazias. A mensagem mostra pergunta, uma linha clicável para cada alternativa, marcador de escolha, quantidade de votos e porcentagem com faixa de preenchimento. Tocar numa opção registra um voto associado ao usuário fictício Marina; tocar novamente na mesma remove o voto; escolher outra muda o voto. No modelo não há votação remota e nem outros votos autênticos.

**ESPERADO ONLINE:** cada voto deve ser associado ao ID autenticado e validado no servidor, com contagem consistente e suporte a permissão de votar/alterar. O evento deve ser replicado em tempo real aos participantes e poder ser aberto depois de recarregar o app.

**APRIMORAR:** escolha de voto único ou múltiplo, enquete anônima, prazo de encerramento, ação `Encerrar`, quem votou (quando permitido), impedir opções repetidas, validação contra manipulação, visualização de resultados, acessibilidade e push de nova enquete.

## 41. Agendar mensagem

**ESTADO ATUAL:** `Agendar` abre uma folha com área de texto e quatro horários predefinidos: `Em 1 min (teste)`, `Em 1 hora`, `Hoje 20h` e `Amanhã 8h`. O botão `Agendar` cria uma mensagem de texto com propriedade `sched`, exibida no histórico com borda pontilhada, ícone de relógio e contagem regressiva. Um `setInterval` a cada segundo verifica quando a data chegou, substitui o horário agendado pelo efetivo e chama a simulação de envio/resposta. **O agendamento só é processado enquanto uma página do modelo estiver rodando**: se o navegador estiver fechado, não existe trabalhador do servidor que execute a entrega no momento exato.

**ESPERADO ONLINE:** registrar agendamento no servidor com timezone definido, estado `pending/processing/sent/failed/cancelled`, job confiável mesmo com aplicativo fechado e comprovante de entrega; impedir disparo duplicado em reexecuções e respeitar bloqueios/permissões na hora efetiva.

**APRIMORAR:** data e hora personalizáveis, lista de agendadas, editar/cancelar, fuso horário, conflito com mensagens temporárias, processamento idempotente, cron de backend e notificações de sucesso/falha. A opção de um minuto deve ser exclusiva do modo de teste.

## 42. Mensagens temporárias

**ESTADO ATUAL:** em Configurações → `Mensagens temporárias`, abre uma lista: `Desativadas`, `30 segundos (modo teste)`, `24 horas`, `7 dias` e `90 dias`. A seleção altera a configuração `ttl` da conversa e gera um aviso de sistema. Novas mensagens enviadas pelo método principal recebem `exp=agora+ttl` e um ícone de relógio; um intervalo local remove mensagens expiradas do array. Mensagens anteriores não são alteradas. Como diferentes formas de envio geram payloads por caminhos diferentes, nem todo formato tem necessariamente o mesmo tratamento de expiração no código atual.

**ESPERADO ONLINE:** aplicar política de expiração no servidor a todas as classes de mensagem elegíveis, de forma consistente por destinatário/dispositivo, com revogação de acesso à mídia e clareza sobre screenshots/backups. Os timers locais devem ser complementares, nunca a fonte da verdade.

**APRIMORAR:** definir quando começa a contagem (envio, entrega ou leitura), quais tipos expiram, acesso a mídias antigas, compatibilidade com fixadas e backups, aviso de mudança de configuração e rotina de limpeza de cache.

## 43. Central `Looply Games`: acesso, janelas e estados compartilhados

**ESTADO ATUAL:** o botão de gamepad ao lado do compositor, a opção `Games` do alfinete e `Games` nas ferramentas da conversa abrem uma folha `Looply Games`. Ela contém dois cartões: `Jogo da Velha` (ícone ✕○, descrição de convite) e `Gartic` (ícone de desenho). Ao existir partida no estado da conversa, o cartão informa que há partida salva e exibe seu status. A folha tem botão `Voltar aos jogos`; as partidas e placares são gravados dentro do objeto da conversa no armazenamento local. O modelo explica que os jogos funcionam em demonstração e não têm sincronização real.

**ESPERADO ONLINE:** os jogos devem ser sessões autenticadas, vinculadas ao chat de origem e a um ou vários participantes autorizados, com convites recebidos no outro aparelho, aceitação/recusa, estado sincronizado, expiração e reconexão. O chat deve receber avisos de convite, início, resultado, encerramento e retomada.

**APRIMORAR:** uma interface única de lobby, indicador `Aguardando participante`, push de convite, limite de convites simultâneos, cancelamento pelo remetente, reconexão após queda, proteção contra ações duplicadas e link profundo para reabrir uma partida do histórico.

## 44. Jogo da Velha — criar e enviar convite

**ESTADO ATUAL:** tocar em `Jogo da Velha` sem partida abre `Convidar para jogar`, com seletor de participante entre os membros da conversa e botão `Enviar convite`. O jogo é salvo como status `invited`; uma mensagem de sistema registra o convite. A tela seguinte mostra `Convite enviado`, o nome do convidado e dois botões: `Aceitar convite` e `Recusar`. No modo modelo, **o próprio operador do navegador clica em Aceitar/Recusar para simular a ação do convidado**; nada é enviado ao aparelho de outra pessoa. Recusar muda para uma tela de `Convite recusado`, com `Convidar novamente`.

**ESPERADO ONLINE:** só o usuário convidado pode aceitar/recusar; o remetente vê `Aguardando resposta` e pode cancelar. O estado deve ser validado em transação e transportado em tempo real para todos os dispositivos da partida.

**APRIMORAR:** expiração do convite, seleção por avatar, contagem de participantes, botão cancelar, informação de aceitação apenas no dispositivo do destinatário, prevenção de convites repetidos e mecanismo de recuperação caso o destinatário aceite offline.

## 45. Jogo da Velha — tabuleiro, jogadas, pontuação e bot

**ESTADO ATUAL:** após o aceite demonstrativo aparece um tabuleiro 3×3. O usuário local joga com `X`; o oponente fictício é `O`. Acima aparecem os dois avatares, nomes, símbolos, placar de vitórias e contador de empates. O status mostra `Sua vez`, `Vez de…`, `Você venceu`, `… venceu` ou `Empate`. Cada célula é um botão com rótulo acessível e só aceita um toque quando está vazia, a partida está ativa e é a vez do X. O JavaScript identifica combinações vencedoras nas oito linhas possíveis; células vencedoras ganham destaque. A jogada do oponente é calculada automaticamente por uma rotina local que tenta ganhar, bloquear, ocupar o centro e escolher cantos. Depois da rodada, há `Nova rodada`, `Reiniciar placar` e `Outro convite`. Resultados também podem aparecer como evento no chat.

**ESPERADO ONLINE:** as jogadas dos dois usuários reais devem ser eventos assinados, validados no servidor e aplicados na ordem correta; o servidor deve decidir vitória/empate e placar, evitando que dois dispositivos joguem simultaneamente no mesmo turno.

**APRIMORAR:** usar bot somente em modalidade explicitamente `Jogar contra o computador`, não simular a jogada de pessoa real; cronômetro por jogada, abandonar/voltar, revanche de ambos os lados, estado de `convidado desconectado`, ranking opcional e animação de vitória acessível.

## 46. Gartic — convite, escolha de tema e preparação

**ESTADO ATUAL:** tocar em `Gartic` sem partida abre `Nova partida`, com seletor de adversário, tema e duração por rodada. As durações são 45, 75, 90 ou 120 segundos. O catálogo carregado do ZIP contém 420 palavras distribuídas em 12 temas: `Animais`, `Filmes`, `Doramas`, `Desenhos`, `Objetos`, `Comidas`, `Ações e verbos`, `Profissões`, `Lugares`, `Esportes`, `Natureza` e `Tecnologia`. Cada opção mostra sua quantidade de palavras. `Enviar convite` gera uma mensagem de sistema e abre uma tela com `Aceitar convite`/`Recusar`, sendo a decisão representada pelo operador no modelo local. Após aceitar, aparece `Preparar partida`, com tema e duração editáveis e botão `Iniciar partida`.

**ESPERADO ONLINE:** o criador escolhe as regras, o destinatário recebe convite real, só participantes elegíveis podem entrar, e a sala só inicia após aceite. Palavras, papéis de desenhista/adivinhador e cronômetro devem ser distribuídos pelo backend sem revelar a resposta indevidamente a quem está adivinhando.

**APRIMORAR:** ampliar o catálogo conforme critério do produto (o código atual não tem mais de 200 palavras por tema), permitir configuração de rodadas, modo com grupos, dificuldade, categoria aleatória, espectador, convite com expiração e lobby com disponibilidade dos jogadores.

## 47. Gartic — tela da partida em tempo real no modelo

**ESTADO ATUAL:** a tela de Gartic possui etiquetas de tema, papel (`Você desenha`/`Você adivinha`) e rodada; blocos de tempo restante e pontos; palavra visível para quem desenha ou letras mascaradas para quem adivinha; canvas branco de proporção 4:3; slider de zoom de 1× a 3×; chat interno com mensagens; campo de palpite/mensagem e botão `Enviar`; e rodapé com microfone, próxima rodada e encerrar. O código troca de papéis com os botões `Adivinhar (teste)` e `Desenhar (teste)`, explicitamente demonstrativos. As mensagens internas são guardadas na partida local, não enviadas a outra conta.

**ESPERADO ONLINE:** desenhista e adivinhadores devem ver estados diferentes; o servidor mantém horário de início, expiração, pontos, rodadas, palavra secreta e sequência de traços. Mensagens e desenhos são eventos de baixa latência, com reconexão e deduplicação. A palavra não deve ficar acessível no payload do adversário enquanto a rodada está em andamento.

**APRIMORAR:** sincronização eficiente dos strokes, desenho incremental, taxa limitada de eventos, presença de jogadores, chat separado dos palpites, envio imediato de acerto, chat com latência monitorada e reconexão sem apagar desenhos já feitos.

## 48. Gartic — pincel, cores, tamanho, zoom e desenho

**ESTADO ATUAL:** quem está no modo de desenho vê uma paleta de cores (preto, roxo, rosa, vermelho, amarelo, verde, azul e branco), controle de espessura do pincel de 2 a 20 e botões `Desfazer`, `Apagar tudo` e `Adivinhar (teste)`. Desenhar com o dedo ou mouse cria traços com pontos normalizados; o quadro pode armazenar centenas de traços e aplica um limite para evitar crescimento ilimitado. Duas pontas de toque permitem alterar zoom por pinch; há também o slider `Zoom`. O desenho é persistido no estado local da partida. No modo de adivinhação, a aplicação produz formas automáticas simples no canvas para simular um adversário desenhando.

**ESPERADO ONLINE:** o desenhista envia traços incrementalmente, preservando posição e proporção; os demais recebem atualização contínua sem custo excessivo de banda. Zoom é operação local de visualização, que não altera as coordenadas canônicas dos traços.

**APRIMORAR:** ferramenta de borracha verdadeira (não apenas pincel branco), balde, desfazer/refazer, reset com confirmação, limite de tamanho e memória, estabilização de traço, zoom com pan e coordenadas corretas, prevenção de pinch acidental e suporte a stylus.

## 49. Gartic — palpites, dicas, pontuação, resultados e rodada seguinte

**ESTADO ATUAL:** no modo de adivinhação, o campo permite palpite ou mensagem. O código compara palavras após remover acentos, espaços, sinais e diferenças entre maiúsculas/minúsculas; isso permite variações normalizadas. `💡 Dica` revela aleatoriamente uma letra ainda não revelada, registrando o evento no chat da partida. Um acerto encerra a rodada e atribui no mínimo 25 pontos, variando com os segundos restantes; o tempo encerrado gera aviso e mostra a resposta. A tela final exibe palavra, placares, `Próxima rodada` e `Nova partida`. Há também `Próxima rodada`/pular e `Encerrar` durante a partida.

**ESPERADO ONLINE:** validar palpites pelo servidor sem expor a palavra, registrar o primeiro acertador, aplicar pontos por regra compartilhada e emitir o resultado a todos ao mesmo tempo. Dicas devem obedecer aos limites de rodada, podendo penalizar pontuação se previsto.

**APRIMORAR:** não permitir que o desenhista envie a palavra como palpite, evitar resultados discordantes, melhorar a lógica de empate, registrar ranking por partida, penalizar repetição abusiva, permitir denúncias de desenho e reiniciar corretamente ao reconectar.

## 50. Microfone dentro do Gartic

**ESTADO ATUAL:** `🎙️ Microfone OFF/ON` pede autorização para captura local de áudio com cancelamento de eco e redução de ruído. Quando concedida, muda o texto para ON; tocar novamente encerra as trilhas de captura. Fechar o jogo ou voltar ao hub também interrompe o microfone. **O som capturado não é transmitido ao adversário:** falta canal WebRTC ou equivalente de áudio de jogo.

**ESPERADO ONLINE:** cada jogador decide ativar ou desativar seu microfone; o áudio é transmitido aos participantes autorizados da sala com sinalização, transporte protegido, cancelamento de eco, estado de conexão e controles de volume. Ativar ou desativar o microfone de uma pessoa não deve silenciar automaticamente o áudio recebido de outros.

**APRIMORAR:** canal de voz verdadeiro, testes em dois smartphones, troca de saída de áudio quando suportada, medidor de volume, detecção de silêncio, indicadores de quem está falando, moderação e reconexão segura após perda de permissão.

## 51. Chamadas de voz — botão de telefone e tela própria

**ESTADO ATUAL:** tocar no telefone do cabeçalho ou na opção `Ligar` das configurações abre tela de chamada cobrindo o app. Ela exibe avatar, nome, status `Chamando…`, uma identificação explícita de `Modo demonstração · sem conexão remota`, ondas animadas e botões `Silenciar microfone`, `Alto-falante` e `Encerrar`. Se o contato fictício está `online`, a interface considera a chamada conectada após cerca de 2,6 segundos e inicia cronômetro; se não está, produz status de chamada perdida após alguns segundos. Encerrar cria uma mensagem de sistema com chamada de voz cancelada, realizada com duração, recusada ou perdida, conforme o fluxo.

**ESPERADO ONLINE:** iniciar sessão de chamada com identificação real dos participantes; sinalizar oferta/aceite/recusa/finalização; estabelecer transporte de áudio via WebRTC, com STUN/TURN; tratar permissões, áudio do dispositivo, chamadas em segundo plano e limpeza dos recursos. O receptor deve ver chamada recebida mesmo quando não estava visualizando aquela conversa, conforme plataforma e push.

**APRIMORAR:** o botão visual de microfone atualmente não garante mute de uma trilha remota de chamada porque não há transporte real; idem para alto-falante, que apenas muda aparência. Implementar controles efetivos, reconexão, timeout, erro, histórico por usuário, alternância de saída de áudio, permissões de chamadas em grupo e teste em Android WebView.

## 52. Videochamada — botão no cabeçalho e câmera local

**ESTADO ATUAL:** o botão `Videochamada` foi incluído ao lado do telefone no cabeçalho da conversa. Também pode ser iniciado pelo tile `Vídeo` da tela de configurações. A tela de videochamada tem o mesmo avatar, nome, estados e cronômetro da chamada de voz, com um quadro adicional `Câmera desligada` no canto superior. O botão `Ativar câmera` usa `getUserMedia({video:{facingMode:'user'},audio:false})` e, se permitido, reproduz a imagem **local** em `<video autoplay muted playsinline>`. Tocar novamente interrompe as trilhas. `Silenciar microfone`, `Alto-falante` e `Encerrar` estão presentes, mas não existe vídeo remoto nem áudio remoto. Em grupos, o código ainda utiliza uma tela conceitualmente semelhante, sem grade real de participantes.

**ESPERADO ONLINE:** câmera e microfone locais associados a uma conexão WebRTC, recepção do vídeo do outro usuário, controles de mute/câmera, troca de câmeras dianteira/traseira, qualidade adaptativa, estados da sessão, ICE/DTLS/SRTP, TURN quando necessário, e tratamento de múltiplos participantes por SFU ou arquitetura adequada quando o grupo exigir.

**APRIMORAR:** controles reais de áudio e vídeo, grade de participantes, miniatura arrastável, vídeo principal em tela cheia, alternar câmera, câmera desligada com avatar, indicação de qualidade/conectividade, vídeo recebido, fallback para chamada de voz, tela de chamada em segundo plano, permissões no APK e proteção contra chamadas duplicadas.

## 53. Chamadas recebidas, atender, recusar, perdidas e registros

**ESTADO ATUAL:** a central de atividades permite `Simular recebimento` de chamada de vídeo ou voz. O método de chamada recebida abre a tela com botão `Atender`, `Encerrar`, microfone e outros controles; após cerca de 11 segundos sem aceite, registra uma chamada perdida no modelo. `Atender` inicia um cronômetro local e remove o botão de aceite. `Encerrar` antes de atender pode marcar como recusada. Ao finalizar, o HTML insere no chat uma cápsula de sistema `Chamada de vídeo/voz cancelada`, `… perdida`, `… recusada` ou `… · mm:ss`; cria também um item na central de atividades. Essas mensagens representam estados visuais locais, não eventos vistos em outro dispositivo.

**ESPERADO ONLINE:** chamada recebida precisa de identificação do remetente, sessão e prazo; aceitar/recusar deve ser exclusivo do destino, com cancelamento imediato no originador; chamadas perdidas devem depender de confirmação de sinalização e horário real. O histórico por conversa deve indicar direção, tipo, participante, início, fim, duração e motivo de término.

**APRIMORAR:** histórico em aba própria, botão `Retornar chamada`, notificações de sistema, prioridade de toque, controle de privacidade de prévia, integração de notificações push/call-style, estados de `ocupado`, `sem rede`, `sem permissão`, `recusada` e `cancelada`, e evitar falsos registros de `perdida` quando foi erro de conexão.

## 54. Central de atividades — botão do sino, filtros e notificações

**ESTADO ATUAL:** o sino no cabeçalho global abre a folha `Atividades`, com filtros `Todas`, `Não vistas` e `Chamadas`. Cada item é um botão que contém emoji/categoria, nome da conversa, descrição, data/hora e destaque se não foi visualizado. Tocar no item marca-o como visto e abre sua conversa. O rodapé oferece `Marcar todas como vistas` e `Simular evento`. A lista de atividades é mantida no `localStorage`, limitada às 160 mais recentes. O código categoriza eventos `message`, `letter`, `video`, `audio`, `missed`, `deletion`, `pinned`, `group`, `poll` e `game`; alguns desses tipos são acrescentados somente em caminhos específicos do modelo. Não existe central remota, FCM nem serviço de notificação do navegador configurado neste HTML.

**ESPERADO ONLINE:** a central deve reunir eventos reais e autorizados, de preferências e escopo definidos; sincronizar `visto` entre dispositivos; abrir a conversa ou mensagem exata; evitar duplicatas com push; receber notificação quando a pessoa estiver fora do aplicativo, respeitando consentimento e permissões.

**APRIMORAR:** filtros por categoria, agrupamento por conversa, exclusão/arquivamento de atividades, botão `Marcar todas as mensagens como lidas` separado de `Marcar atividade como vista`, paginação, links profundos, busca, prioridade de chamadas, preferências de som e vibração, e logs de entrega/rejeição.

## 55. Simular eventos recebidos

**ESTADO ATUAL:** o menu `Simular recebimento` oferece: `Carta selada recebida`, `Mensagem não lida`, `Videochamada recebida`, `Chamada de voz recebida`, `Chamada de vídeo perdida`, `Mensagem apagada pelo contato`, `Enquete recebida` e `Convite de jogo`. A rotina escolhe a conversa aberta ou uma conversa disponível, cria mensagens fictícias de alguns tipos, incrementa não lidas quando apropriado, registra atividade e pode mostrar banner. Para chamadas recebidas, chama diretamente a tela de chamadas. É um utilitário de demonstração para visualizar cenários de UI sem outro telefone.

**ESPERADO ONLINE:** **essa ferramenta não deve ser exposta a usuários comuns**. Apenas eventos reais, validados no backend, podem alterar contadores, histórico ou estados de chamadas; se for mantida para QA, deve funcionar em ambiente isolado e não contaminar dados de produção.

**APRIMORAR:** separar dados de demonstração de produção, proteger o acionamento por feature flag, gerar cenários de teste reprodutíveis, não produzir notificações enganosas e preservar dados reais em ambiente de homologação.

## 56. Banners de notificação dentro da interface

**ESTADO ATUAL:** quando uma mensagem fictícia chega em conversa não ativa, o modelo pode mostrar um banner sobreposto com avatar do remetente, nome da conversa, indicação `agora` e prévia de até duas linhas. Tocar no banner abre o chat correspondente. O banner desaparece automaticamente após cerca de cinco segundos; pode acionar uma vibração leve do navegador quando permitida. Chats silenciados ou arquivados não exibem o banner por esta rotina.

**ESPERADO ONLINE:** banner em primeiro plano para eventos reais; notificações nativas e push quando em segundo plano; foto, nome, conteúdo resumido conforme preferências de privacidade e ações de resposta/abrir quando a plataforma permitir.

**APRIMORAR:** múltiplos banners em fila, agrupamento por conversa, tempo de exibição acessível, opção de ocultar conteúdo sensível na tela bloqueada, ações de silenciar, notificação de chamada diferenciada e sincronização com leitura do chat.

## 57. Tela `Configurações da conversa` — visão geral e cabeçalho

**ESTADO ATUAL:** ao tocar no nome/avatar da conversa ou no botão de três pontos, abre-se uma página dedicada que desliza de baixo para cima e pode rolar verticalmente. No topo existem um botão `X` para fechar, avatar grande, nome de contato/grupo e resumo: quantidade de participantes para grupos, ou estado de conversa online/offline para chats individuais. Em grupos, o avatar grande pode virar um botão com ícone de câmera para trocar a foto. A tela reúne tiles de ações rápidas, personalização, participantes, preferências, privacidade, ferramentas e, na extensão Ultra, `Experiência Premium`.

**ESPERADO ONLINE:** os detalhes devem ser montados com dados, permissões e estados reais da conversa; telas de configuração devem refletir imediatamente alterações vindas de outros membros; ações de administrador precisam aparecer apenas para quem possui autoridade.

**APRIMORAR:** dividir a página em seções com hierarquia clara, manter cabeçalho fixo sem travar metade da rolagem, indicar alterações pendentes, oferecer ajuda contextual quando necessário e revisar a duplicação entre `Papel de parede` antigo e `Foto e papel de parede` novo.

## 58. Quatro tiles rápidos das configurações

**ESTADO ATUAL:** a grade de quatro botões mostra `Ligar`, `Vídeo`, `Buscar` e `Favorita`. `Ligar` abre chamada de voz; `Vídeo` abre videochamada; `Buscar` fecha as configurações e abre a barra de busca da conversa; `Favorita` alterna a propriedade `fav`, influencia o filtro de Favoritas e apresenta estado visual de estrela marcada quando ativo.

**ESPERADO ONLINE:** ligar e vídeo precisam usar sessão real; buscar deve poder pesquisar mensagens paginadas; favoritar deve ser configuração pessoal sincronizada com a conta, sem obrigatoriamente afetar a lista de outras pessoas.

**APRIMORAR:** estados desabilitados para bloqueio/sem permissão, sinalização da rede e de chamada em andamento, alternar Favorita com feedback acessível e confirmação visual sem redesenhar toda a página.

## 59. Nome de grupo e apelido de contato

**ESTADO ATUAL:** em `Personalização`, o item `Apelido` (conversa individual) ou `Nome do grupo` abre folha com campo editável, botão `Salvar` e, para apelidos existentes, `Remover apelido`. O texto explicativo do modelo diz que apelidos são vistos só pelo próprio usuário, enquanto o nome do grupo é compartilhado. A mudança é guardada no objeto local da conversa e aplicada ao cabeçalho e inbox.

**ESPERADO ONLINE:** apelido privado deve pertencer às preferências do usuário; nome de grupo deve ser alteração de entidade compartilhada, autorizada por papel e replicada a todos. Registrar quem alterou o nome e quando pode ser apropriado em grupos.

**APRIMORAR:** evitar nomes vazios ou abusivos, determinar tamanho máximo, tratar caracteres visuais problemáticos, histórico de alterações, permissões e prévia. Nunca usar a frase `Todos os participantes veem` sem backend realmente sincronizado.

## 60. Cor das mensagens

**ESTADO ATUAL:** abaixo do nome/apelido existe um seletor com 10 cores hexadecimais: variações de roxo, azul, rosa, verde, vermelho e laranja. Tocar numa amostra modifica a variável CSS `--mine` da conversa e a propriedade `color` armazenada localmente; os balões de mensagens próprias mudam de cor. O efeito é imediato.

**ESPERADO ONLINE:** a cor pode ser preferência individual ou compartilhada, conforme regra explícita de produto; ela deve seguir o tema global com contraste suficiente e persistir entre sessões/dispositivos autorizados.

**APRIMORAR:** criar paleta acessível calculando contraste, opção `Usar cor do tema global`, cor customizada com limite seguro, prévia em fundo claro/escuro e modo para daltonismo. Unificar cor dos balões e papel de parede para evitar ilegibilidade.

## 61. Papel de parede por cor ou foto da galeria

**ESTADO ATUAL:** a ferramenta antiga `Papel de parede` oferece nove opções de cor, mas a extensão Ultra intercepta a abertura e apresenta a folha mais completa `Personalizar conversa`. Nela existem preview com mensagem demonstrativa, nove amostras incluindo padrão e cores claras/escuras, botão `🖼️ Foto da galeria`, botão `Restaurar padrão` e controle deslizante `Escurecer imagem`, de aproximadamente 4% a 65%. Ao escolher foto, o navegador abre o seletor de imagens; arquivo de até 25 MB pode ser redimensionado para no máximo 1.440 px no maior lado e convertido em JPEG com qualidade cerca de 84%. A foto é guardada como Blob no IndexedDB; há fallback limitado para navegadores que não aceitam IndexedDB. A conversa usa a imagem como fundo coberto por um véu de escurecimento. O papel de parede é individual por conversa e por navegador.

**ESPERADO ONLINE:** oferecer escolha entre tema global e fundo personalizado, com persistência sincronizada por usuário, mas sem obrigar que destinatários vejam a mesma foto; aplicar critérios de legibilidade e privacidade. Se a imagem não for enviada ao servidor, deve ficar claro que não aparecerá em outro aparelho.

**APRIMORAR:** editor de posicionamento/crop/zoom do fundo, prévia de balões reais, opção de desfoque e transparência, recuperação ao trocar de aparelho e limite por conta. Corrigir eventuais falhas de armazenamento/permissão, remover arquivos obsoletos e sincronizar a escolha caso o usuário deseje.

## 62. Foto de grupo — seletor e editor circular

**ESTADO ATUAL:** em grupos, a foto do topo ou o item `Foto do grupo` abre seletor `image/*`. Ao escolher imagem válida de até 25 MB, aparece folha `Editar imagem`, com canvas quadrado de 500×500, sobreposição circular do recorte, slider `Zoom` de 1× a 3×, arraste com o dedo/mouse, botão `Centralizar` e `Salvar imagem`. Ao salvar, gera JPEG aproximado de 280×280 e guarda a data URI em `c.photo`. O avatar do grupo é atualizado na caixa de entrada, no cabeçalho e na tela de configurações. A foto é local, não um upload remoto.

**ESPERADO ONLINE:** alterar foto deve exigir permissão de membro/administrador conforme regra do grupo, enviar imagem otimizada para storage e atualizar URL/metadados da conversa para todos os membros. O histórico pode registrar `Fulano alterou a foto do grupo`.

**APRIMORAR:** editor com pinça de zoom, rotação, escolher arquivo/câmera, prévia antes de publicar, remover foto, progresso de upload, verificação de orientação e fallback quando o arquivo falhar. Evitar data URIs grandes no `localStorage`.

## 63. Participantes do grupo — listagem e presença

**ESTADO ATUAL:** a seção `Participantes` lista cada membro com avatar, nome e legenda `online/offline`; o usuário atual recebe `(você)`. A quantidade total aparece no cabeçalho da página. A lista é gerada do array local `members`. Por padrão, os grupos demonstrativos não possuem um modelo robusto de cargos/administradores.

**ESPERADO ONLINE:** listagem autorizada, pesquisa, papéis (`dono`, `administrador`, `membro`) e ações condicionadas; convite aceito, remoção e saída devem gerar eventos com consistência em todos os aparelhos.

**APRIMORAR:** mostrar cargos e permissões, opção de abrir perfil, busca em grupo grande, contador online, convite pendente, data de entrada, política de membros bloqueados e proteção contra remoção do último administrador.

## 64. Adicionar participantes

**ESTADO ATUAL:** `Adicionar participantes` abre folha com campo de busca, lista dos usuários fictícios que ainda não estão no grupo, círculos de seleção e botão `Adicionar N`, desabilitado sem seleção. Ao confirmar, insere os IDs no array local, mostra aviso de sistema `N participante(s) adicionado(s)` e atualiza lista/cabeçalho. O recurso não envia convite ao aparelho de ninguém e não verifica cargo administrativo.

**ESPERADO ONLINE:** validar autoridade do solicitante, usuário destino, limite do grupo, restrições de privacidade e estados de convite; aplicar alteração em transação no servidor e entregar evento de inclusão aos participantes. O usuário adicionado deve obter acesso somente ao histórico que a política permite.

**APRIMORAR:** convite com aceitar/recusar quando aplicável, busca de perfis com paginação, seleção em massa, prévia dos selecionados, relatório de sucesso/falha e mensagem de entrada. Impedir adição duplicada, remoção de bloqueios e exclusão acidental por condições de corrida.

## 65. Remover participantes

**ESTADO ATUAL:** `Remover participantes` abre a mesma folha de seleção, mas lista membros atuais exceto o usuário local; o botão `Remover N` usa destaque destrutivo. Ao confirmar, remove IDs do array local, insere aviso de sistema e redesenha a conversa. A implementação demonstrativa não verifica privilégios nem exige confirmação adicional.

**ESPERADO ONLINE:** somente administrador autorizado deve remover alguém; a remoção deve invalidar a permissão do membro removido, interromper canais, atualizar acesso a arquivos e informar todos. A pessoa removida não deve continuar recebendo mensagens nem arquivos novos.

**APRIMORAR:** folha de confirmação com nomes explícitos, proteção a administradores/dono, registro de auditoria, opção de transferência de propriedade e revogação imediata de acesso realtime. A ausência de controle de permissão é uma lacuna crítica antes da produção.

## 66. Silenciar notificações da conversa

**ESTADO ATUAL:** em `Preferências`, `Silenciar notificações` alterna o campo booleano `mute` e um switch visual. Conversas silenciadas mostram ícone próprio no inbox e deixam de exibir os banners locais normais. O código ainda permite chegar mensagem e manter histórico, mas o contador global ignora não lidas dessas conversas.

**ESPERADO ONLINE:** silenciar deve ser configuração pessoal, aplicada a banners, sons e push conforme opção `por 1 hora`, `8 horas`, `sempre` ou equivalente. Emergências e chamadas podem ter políticas independentes, se o usuário escolher.

**APRIMORAR:** controle de duração e exceções, política específica para menções e chamadas, reconciliação de contadores, visibilidade de que há mensagens mesmo silenciadas e sincronização com notificações nativas do Android.

## 67. Fixar conversa no topo

**ESTADO ATUAL:** `Fixar no topo` alterna `pin` e muda imediatamente a ordenação da lista de conversas. O cartão recebe ícone/etiqueta e borda destacada. Essa ação aparece tanto no menu de pressão prolongada quanto nas configurações e é independente de fixar uma mensagem dentro do histórico.

**ESPERADO ONLINE:** fixação deve ser preferência individual persistente, com limite opcional e ordem definida pelo usuário; conversas fixadas mantêm posição mesmo quando outras recebem mensagens novas.

**APRIMORAR:** reordenar fixadas por arraste, limitar com indicação clara, sincronização de preferências e comportamento esperado ao arquivar uma conversa fixada.

## 68. Arquivar e restaurar conversa

**ESTADO ATUAL:** `Arquivar` alterna `arch` e move a conversa para o filtro `Arquivadas`; quando desarquivada, volta à lista normal. O histórico não é removido pelo arquivamento. O contador global trata arquivadas de maneira distinta, excluindo suas não lidas.

**ESPERADO ONLINE:** arquivar deve apenas alterar o estado de organização pessoal. Definir se novas mensagens retornam automaticamente a conversa ao inbox ou permanecem arquivadas; entregar notificações conforme preferência.

**APRIMORAR:** botão `Restaurar` explícito na aba Arquivadas, opção de arquivar por gesto, regra para novos eventos, múltipla seleção e sincronização de pastas.

## 69. Marcar como não lida

**ESTADO ATUAL:** a configuração `Marcar como não lida` coloca `unread=1`, fecha a conversa e faz o cartão voltar ao estado destacado. No menu de linha também é possível marcar como lida ou não lida. Isso afeta principalmente o indicador visual e não altera recibos remotos, já que não existem.

**ESPERADO ONLINE:** essa opção deve funcionar como lembrete pessoal; não deve revogar um recibo de leitura já enviado ao remetente. Contadores precisam considerar o último item marcado e cursor de leitura, evitando estados impossíveis.

**APRIMORAR:** separar `Marcar como não lida para mim` de `Marcar mensagens como não visualizadas`; preservar posição de leitura e considerar uma flag de lembrete, não simplesmente sobrescrever o contador com 1.

## 70. Bloquear e desbloquear contato

**ESTADO ATUAL:** em conversa individual, `Bloquear contato` abre confirmação; ao confirmar, grava `blocked=1`, desabilita ações do compositor e mostra barra `Você bloqueou este contato` com botão `Desbloquear`. O código impede alguns envios e chamadas locais; `Desbloquear` remove a flag. A configuração também muda o rótulo para desbloqueio. Essa ação não bloqueia nenhuma identidade fora daquele HTML.

**ESPERADO ONLINE:** o backend precisa impedir comunicação conforme política do produto, incluindo mensagens, convites, chamadas, presença, reações e acessos indevidos. Bloqueio deve ser pessoal e resistente a múltiplos aparelhos.

**APRIMORAR:** definir o tratamento para grupos em comum, histórico anterior, perfis, notificações e conteúdos compartilhados. Implementar listas de bloqueados, proteção antiabuso, erro coerente ao remetente e autorização no servidor, não somente ocultação de botões.

## 71. Denunciar conversa ou contato

**ESTADO ATUAL:** a folha `Denunciar` apresenta motivos `Spam`, `Assédio ou bullying`, `Conteúdo impróprio`, `Golpe ou fraude` e `Outro motivo`, um campo de detalhes opcionais e botão `Enviar denúncia`, que só é habilitado após escolher motivo. Ao clicar, o modelo incrementa `reports` na conversa local e mostra toast agradecendo. **Não existe envio a moderadores, protocolo real ou fila de moderação.**

**ESPERADO ONLINE:** gerar denúncia persistente no backend, registrar relator, alvo, motivo, conteúdo selecionado e evidências mínimas com regras de privacidade e retenção; oferecer status de protocolo quando apropriado e mecanismos contra denúncias abusivas.

**APRIMORAR:** anexar mensagens específicas, descrição do que será compartilhado, política de privacidade, rastreio de protocolo, dashboard administrativo, revisão humana, contestação e proteção de dados. Remover a expressão `Denúncia enviada` se o envio real falhar ou não existir.

## 72. Limpar conversa

**ESTADO ATUAL:** `Limpar conversa` nas configurações abre confirmação com texto de que todas as mensagens serão apagadas só para a pessoa. Confirmando, zera o array `msgs`, salva o estado e atualiza o histórico. O menu de pressão prolongada da caixa de entrada também tem limpeza, porém sem essa confirmação intermediária.

**ESPERADO ONLINE:** apenas apagar/ocultar o histórico do solicitante segundo a política estabelecida, sem destruir dados de outros integrantes; manter consistência de mídia e backups e evitar que eventos tardios ressuscitem incorretamente mensagens antigas.

**APRIMORAR:** confirmação em todos os pontos de entrada, opção de exportar antes, undo durante janela curta, limpeza seletiva de mídias, retenção, comunicação clara sobre efeitos em outros dispositivos.

## 73. Excluir conversa individual; sair e excluir grupo

**ESTADO ATUAL:** `Excluir conversa` ou `Sair e excluir o grupo` abre confirmação destrutiva. Confirmando, remove o objeto de conversa do array local e retorna à inbox. Em grupos, a descrição usa `Sair e excluir`, mas o código essencialmente remove a conversa da lista da pessoa do modelo, sem operação real de saída para os outros participantes.

**ESPERADO ONLINE:** sair de grupo é uma mudança de vínculo autenticada e notificada, distinta de simplesmente ocultar o chat; excluir do próprio histórico é uma operação pessoal. O dono/admin deve ter tratamento especial para transferir responsabilidade ou encerrar grupo, conforme política.

**APRIMORAR:** separar em ações diferentes `Sair do grupo`, `Apagar conversa do meu dispositivo`, `Excluir grupo` (se permitido), com avisos específicos, armazenamento e revogação de permissões corretos.

## 74. Ferramenta `Fotos e arquivos` das configurações

**ESTADO ATUAL:** abre folha `Mídias e arquivos` e filtra mensagens da conversa dos tipos foto, vídeo, arquivo e áudio. Cada item vira um cartão com emoji do tipo e nome/descrição curta; tocar fecha a folha e rola o histórico até a mensagem correspondente. Se não há anexos, exibe `Nenhum anexo nesta conversa`.

**ESPERADO ONLINE:** buscar anexos paginados no servidor, com miniaturas, categorias de mídia, documento/link/áudio e acesso autorizado a partir da mensagem original.

**APRIMORAR:** grade de miniaturas reais, filtros separados (`Fotos e vídeos`, `Arquivos`, `Áudios`, `Links`), ordenação por data, pesquisa, downloads em lote autorizados e rolagem para mensagens ainda não carregadas.

## 75. Ferramenta `Mensagens salvas`

**ESTADO ATUAL:** lista mensagens que receberam a estrela ⭐ no menu contextual, com resumo e horário. Tocar numa mensagem fecha a folha e a destaca no histórico. Quando está vazia, exibe `Nenhuma mensagem salva`. A implementação é por conversa, não uma pasta global pesquisável em todas as conversas.

**ESPERADO ONLINE:** mensagens salvas devem ser preferências pessoais sincronizadas, possivelmente com tela global e coleções; salvar não deve dar acesso permanente a conteúdo ao qual a pessoa perdeu autorização.

**APRIMORAR:** busca entre salvas, etiquetas, pastas, filtro por tipo, exportação de itens autorizados e alerta para mensagem original excluída/expirada.

## 76. `Exportar histórico`

**ESTADO ATUAL:** gera um arquivo JSON local com nome do chat, tipo, lista de nomes de membros, data de exportação e mensagens contendo ID, autor, data, tipo, texto, nome do arquivo, reações e flags de edição/exclusão. O navegador inicia o download com nome `looply-ID-data.json`. O export atual **não incorpora os bytes dos anexos**, não exporta arquivos de áudio/vídeo e pode não incluir todos os metadados necessários para restaurar a conversa integralmente.

**ESPERADO ONLINE:** exportação deve ser autorizada pela conta, respeitar mensagens temporárias, exclusões e políticas de privacidade, oferecer formatos legíveis e pacote opcional de mídia, com tratamento seguro de tamanho e permissão.

**APRIMORAR:** HTML/TXT/JSON/ZIP, seleção de datas, checagem de espaço livre, indicação explícita de inclusão de mídia, tratamento de conteúdo sensível, controle de integridade e senha no pacote quando necessário.

## 77. Seção `Experiência Premium` das configurações

**ESTADO ATUAL:** adiciona quatro itens ao final da tela: `Foto e papel de parede` (abre a folha de cor/galeria), `Histórico de atividades` (abre a central), `Enviar carta` (abre o editor de envelope) e `Simular evento recebido` (abre o catálogo de cenários fictícios). É uma camada de atalhos; algumas funções também são acessíveis pelo alfinete.

**ESPERADO ONLINE:** os três primeiros atalhos podem permanecer como acessos reais; `Simular evento recebido` não deve aparecer para contas comuns. A existência de dois caminhos para a mesma funcionalidade não deve gerar configurações contraditórias.

**APRIMORAR:** organizar atalhos por frequência, remover descrições excessivas no app final se a diretriz visual exigir, consolidar duplicatas e colocar simulações exclusivamente em área de desenvolvimento.

## 78. Folhas modais, janelas, confirmações e fechamento

**ESTADO ATUAL:** boa parte dos recursos é apresentada dentro de um único elemento `<dialog id="sh">`, cujo conteúdo `#shBox` é reescrito dinamicamente. O componente exibe uma folha com bordas arredondadas no alto, uma pequena alça visual e espaço seguro na base. É usado para: menu contextual de conversa, nova conversa/grupo, reações e menu de mensagem, encaminhamento, confirmação de exclusão, editor de agendamento, temas temporários, denúncia, edição de nome, seleção de membros, mídias, salvas, exportação, editor de foto, emojis/figurinhas, jogos, convite/placar, nota, música, carta, leitura de carta, enquete, localização, contatos, central de atividades e detalhamento de mensagem. Clicar no backdrop fecha o dialog. Algumas funções adicionam `onclick` ao mesmo `#shBox`, e outras camadas também usam listeners com captura.

**ESPERADO ONLINE:** folhas devem respeitar ordem de foco, Escape/Back, anúncio de título por leitor de tela, transição reduzida, rolagem, teclado virtual e eventuais formulários longos. Ao trocar entre modos, não devem sobrar handlers ou timers do formulário anterior.

**APRIMORAR:** centralizar gerenciador de modal em componente único, limpar listeners, evitar sobrescrever handlers indevidamente, confirmar perda de conteúdo não salvo e impedir que uma notificação externa feche um editor importante sem aviso.

## 79. Gestos do smartphone

**ESTADO ATUAL:** há clique/toque para abrir, pressão prolongada em cartão de conversa, toque duplo para coração, deslizar mensagem à direita para responder, gesto de borda esquerda para fechar uma conversa, arraste e pinch-to-zoom no desenho do Gartic, arraste no editor de imagem, toque nas barras de áudio para avançar e deslizar conteúdos em faixas horizontais de pessoas/abas. Algumas interações usam `pointerdown`/`pointermove`, outras usam `touchstart`/`touchmove`; isso pode introduzir sobreposição de lógicas em certos aparelhos.

**ESPERADO ONLINE:** cada gesto deve ter objetivo e zona de ativação claros, sem conflitar com rolagem natural, teclado, navegação do sistema e seleção de texto. Para acessibilidade, toda ação por gesto deve possuir alternativa de botão/menu.

**APRIMORAR:** consolidar manipulação de touch/pointer; testes físicos em Samsung/Android WebView, iPhone/Safari e Chrome; feedback tátil sutil, thresholds consistentes, ajustes para canhotos e pessoas com dificuldade motora, e suporte a `prefers-reduced-motion`.

## 80. Animações e efeitos visuais existentes

**ESTADO ATUAL:** há animação contínua do símbolo da marca; realce de reflexo em vidro por movimento do cursor; cards entrando com deslocamento/fade; efeitos de pressão e escala em botões; transição da cápsula da dock; abertura lateral da conversa; folhas modais com subida e zoom; indicador de digitação com três pontos; balões de mensagens novas; botão de gravação pulsante; badges de não lidas; envelope e carta abrindo; menu de alfinete distribuído em leque com atraso escalonado; ondas em tela de chamada; feedback de rolagem para mensagens citadas/fixadas; realce do tabuleiro vencedor; transições de estados de chips e seleções; e leves alterações no blur quando o topo rola. Existe suporte CSS a `prefers-reduced-motion` para reduzir algumas dessas animações.

**ESPERADO ONLINE:** efeitos devem indicar transições reais do sistema (enviando, entregue, salvo, convite aceito) sem esconder latência nem simular sucesso antes da confirmação do backend.

**APRIMORAR:** verificar 60 fps em aparelhos modestos, restringir `backdrop-filter` em superfícies grandes, limitar animações simultâneas, evitar piscar/reflow ao receber mensagens e usar animações com propósito. Testar `prefers-reduced-motion` também nos efeitos JS, não somente nos CSS.

## 81. Teclado, altura da viewport e rolagem estável

**ESTADO ATUAL:** a conversa usa dimensões calculadas a partir de `100dvh` e, em navegadores compatíveis, observa `visualViewport.height` e `offsetTop` para ajustar a tela ao teclado. O compositor fica na base, enquanto a lista de mensagens ocupa a área livre. Um `ResizeObserver` mede a altura do compositor e atualiza a reserva de espaço `--cb`; outro mecanismo tenta preservar a posição da rolagem quando o tamanho visível muda. Isso foi criado justamente para reduzir o problema de compositor distante do teclado e rolagem que pisca/desce sozinha.

**ESPERADO ONLINE:** funcionar com teclado Gboard/Samsung, entrada por voz, seleção de emojis e teclado externo sem mover indevidamente o histórico; ao abrir a caixa, o campo deve permanecer acima do teclado sem espaço excessivo.

**APRIMORAR:** validar em telefones reais com variações de navegação por gestos/3 botões, altura de IME, zoom de acessibilidade e rotação. A reconstrução total das mensagens ainda pode interferir na rolagem, mesmo com os ajustes existentes; um render incremental é mais robusto.

## 82. Botões de estado vazio, alertas e indicadores auxiliares

**ESTADO ATUAL:** o modelo mostra estados vazios para inbox sem conversas, filtro/busca sem resultado, conversa sem mensagens, mídias inexistentes, figurinhas não encontradas, salvas vazias e atividades sem registros. Há `toast` temporário para ações como `Salvo`, `Atualizado`, `Conversa arquivada`, falhas de microfone, fotos indisponíveis, importação de figurinhas e outras alterações. Há um pequeno indicador `MODELO LOCAL`, inserido pela segunda camada, para distinguir a demonstração de um mensageiro real.

**ESPERADO ONLINE:** acrescentar estados de carregamento, offline, falha recuperável, sem permissão, item removido, usuário inativo e erro do serviço, com comandos úteis (`Tentar novamente`, `Reabrir`, `Atualizar`). Não expor mensagens genéricas falsamente positivas.

**APRIMORAR:** mensagens de erro compreensíveis, toasts acessíveis com tempo adequado, confirmação de ações destrutivas, indicador de sincronização e distinção visual entre sucesso comprovado e ação apenas solicitada.

## 83. Persistência: localStorage, IndexedDB, URIs e limitações

**ESTADO ATUAL:** o array de conversas usa a chave `looply-chat-modelo-v1` no `localStorage`. A preferência visual de tema e estado de figurinhas usam chaves específicas da segunda camada; a extensão Ultra guarda atividades na chave `looply-ultra-activity-v3`, rascunhos na chave `looply-ultra-drafts-v3` e preferências internas na chave `looply-ultra-preferences-v3`. Arquivos enviados e áudios podem ficar no IndexedDB `looply-model-media-v2`; fotos de papel de parede também usam armazenamento de blobs. Algumas imagens temporárias são referenciadas por `blob:` URL, válidas apenas na sessão, e necessitam recuperação persistente após recarregar. Fotos de perfil alteradas pelo menu da conta não são salvas como registro de conta. Muitos dados do jogo estão contidos no objeto da conversa.

**ESPERADO ONLINE:** o servidor é a fonte confiável de mensagens, convites e permissões; preferências podem ser sincronizadas ou permanecer locais por decisão explícita; mídia pertence ao armazenamento remoto sob autorização e cache offline controlado. O cliente deve saber quando algo ainda não foi sincronizado.

**APRIMORAR:** migrações de esquema, versionamento, limpeza de caches e URLs de objeto, política de quota, backup, concorrência entre abas e proteção contra perda de histórico ao limpar dados do navegador. Se a camada offline for mantida, usar filas idempotentes e conflitos resolvíveis, não um array inteiro sobrescrito a cada envio.

## 84. Rascunhos por conversa

**ESTADO ATUAL:** a extensão Ultra escuta alterações do campo de texto e guarda rascunhos por ID da conversa, até aproximadamente 12.000 caracteres. Ao abrir outro chat, o texto anterior é preservado; ao voltar, o rascunho é restaurado. Ao enviar a mensagem daquela conversa, o rascunho correspondente é removido. A lógica evita gravar o texto de edição como rascunho normal. A declaração CSS para `#draftPill` existe, mas o código examinado não monta um indicador visual de rascunho em todos os cartões da inbox.

**ESPERADO ONLINE:** rascunhos podem ser locais ou sincronizados entre dispositivos conforme decisão do usuário, mas não devem ser enviados automaticamente a destinatários. Devem sobreviver a fechamento e navegação sem confundir com mensagens já enviadas.

**APRIMORAR:** exibir `Rascunho` na prévia da caixa de entrada, preservar contexto de resposta/anexo, evitar perda de texto quando alterna edição, revisar limpeza de rascunho em falha de rede e, se sincronizado, proteger conteúdo privado.

## 85. Informações da mensagem

**ESTADO ATUAL:** o menu contextual inclui `Informações da mensagem`; a folha correspondente mostra conteúdo/resumo, horário de envio, estado de entrega e estado de leitura. A própria interface alerta que os estados são simulados; `Entregue (simulado)` e `Lida (simulado)` não indicam confirmações de outro aparelho.

**ESPERADO ONLINE:** apresentar timestamps confiáveis de enfileiramento, entrega, leitura e falha, com informação por destinatário em grupos, conforme preferências de privacidade e regras do app.

**APRIMORAR:** histórico de tentativas, razões de falha, opções de reenvio, recibos em grupo, informação de mensagem agendada/temporária e controle de acesso para mensagens próprias versus alheias.

## 86. Privacidade, dados pessoais e segurança — o que não está implementado

**ESTADO ATUAL:** o HTML escapa vários textos antes de injetar no DOM e restringe alguns links a HTTPS nas ferramentas musicais. Há validações locais de tamanho e tipo de arquivo. Porém, não existe backend autenticado, trilha de auditoria, criptografia ponta a ponta real, autorização de acesso a anexos, moderação remota, proteção de API, antispam ou gerenciamento real de sessões. O bloqueio, denúncia, exclusão e convites são operações locais; o estado `online` é fictício.

**ESPERADO ONLINE:** autenticação forte conforme o login do Looply; cada endpoint valida a sessão e o vínculo do usuário à conversa; proteção de objetos por assinatura curta, URLs que expiram, limites de tamanho, detecção de conteúdo malicioso, controles de abuso, logs mínimos e recuperação de incidentes. Se o produto prometer E2EE, implementar protocolo criptográfico apropriado com gestão de chaves e auditoria — não basta dizer que HTTPS equivale a criptografia ponta a ponta.

**APRIMORAR:** primeiro definir modelo de ameaças, autorização, política de retenção e LGPD, depois implementar controles; testes de IDOR (acesso a conversa por ID alheio), upload malicioso, links falsos, XSS, corrida de exclusão, convites forjados, abuso de chamadas e vazamento de presença/localização.

## 87. Arquitetura mínima para levar este modelo ao Looply online

**ESTADO ATUAL:** o HTML concentra interface, objetos de estado, renderização e lógica demonstrativa. Não faz chamadas reais aos serviços Neon/Cloudflare/R2/FCM do projeto. Os arquivos são adequados como referência de front-end, não como substituto automático de todos os módulos online.

**ESPERADO ONLINE:** manter o HTML/CSS como referência visual, mas integrar às camadas seguintes:

1. **Identidade e sessão:** usuário autenticado, renovação de sessão, permissões de grupos e bloqueios.
2. **Modelo de dados:** conversas, participantes, papéis, mensagens, versões, recibos, reações, fixações, favoritos, anexos, cartas, enquetes, votos, notificações, convites e partidas.
3. **API e realtime:** mensagens idempotentes, paginação, operações de grupo, atualização de perfil e notificações efêmeras `typing/presence`.
4. **Armazenamento de mídia:** upload autorizado de fotos, vídeos, arquivos, voz, imagem de grupo e figurinhas, com metadados e URLs de leitura com escopo.
5. **Eventos de notificação:** fila de eventos, push Android quando autorizado, preferências por conversa, deeplink e deduplicação.
6. **Sinalização de chamadas:** offer/answer/ICE, TURN/STUN, sessões, aceite/recusa/cancelamento, durações reais, reconexão e fallback.
7. **Games:** convite/aceite autenticado, estado autoritativo, cronômetro no servidor, broadcast de jogadas, armazenamento de traços e chat de partida.
8. **Agendamento:** worker/cron/queue para mensagens programadas com app fechado e expiração de mensagens temporárias.
9. **Observabilidade:** erros, métricas de latência, logs com cuidado de privacidade, rate limit e trilhas de depuração.
10. **Compatibilidade WebView:** permissões de mídia, câmera, microfone, notificações, upload, download, back button e políticas do Android.

**APRIMORAR:** reutilizar a infraestrutura gratuita existente onde fizer sentido, com isolamento por ambiente e migração sem apagar dados. Evitar sincronizar o `localStorage` como blob monolítico. As chaves das relações entre mensagens, cartas, enquetes e mídias devem ser IDs estáveis, com validação no backend.

## 88. Contrato funcional esperado das mensagens em produção

Cada mensagem online deveria ter um identificador imutável, identificador da conversa, autor autenticado, tipo, data/hora de criação do servidor, conteúdo estruturado (texto, carta, mídia, enquete, localização etc.), referência opcional a uma mensagem respondida, identidade de encaminhamento quando permitido, status de exclusão, versão de edição, prazo de expiração e atributos de entrega. Reações, recibos e fixações devem ser entidades ou relacionamentos que representem corretamente quem reagiu, quem leu e quem fixou.

**Fluxo de envio ideal:** pessoa compõe → cliente valida e cria ID provisório → envia a API com token e chave de idempotência → servidor valida autoria/permissão, grava a mensagem e emite evento → remetente recebe confirmação → destinatários recebem pelo canal realtime/push → aplicativo renderiza e, quando apropriado, confirma entrega/leitura. Em erro, a mensagem permanece visível como `Falhou`, com `Tentar novamente`, sem ser fingida como entregue.

**Fluxo de edição/apagamento ideal:** cliente solicita mudança em objeto existente → API valida autoria/janela/permissão → grava nova versão/tombstone → transmite evento → cada aparelho reconcilia estado local sem duplicar mensagem.

**Fluxo de mídia ideal:** cliente solicita autorização de upload → envia arquivo/partes → backend valida e atribui objeto seguro → cliente associa mídia à mensagem → destinatário obtém URL temporária de leitura → cache obedece revogações/expiração.

## 89. Eventos de chamada que o outro usuário deve realmente receber

No modelo online, não basta criar texto local `Chamada de vídeo perdida`. O evento precisa ser produzido pelo estado da sessão de chamada. Uma chamada pode passar por `criando`, `oferecida ao destino`, `tocando`, `aceita`, `conectando mídia`, `em andamento`, `encerrada`, `recusada`, `cancelada`, `sem resposta`, `ocupado` e `falhou`. Só os estados adequados devem gerar a descrição correspondente no histórico.

Ao receber chamada de vídeo, o destinatário deve ver avatar, nome, indicação `Videochamada`, botões de aceitar/recusar e comportamento de notificação compatível com o plano de permissões. Se aceitar, vê vídeo remoto e controles reais. Se recusar, originador recebe `Recusada`; se o originador cancelar antes, o destinatário deixa de tocar e vê `Cancelada`; se o prazo expirar sem resposta, ambos veem `Não atendida/Perdida` conforme direção. Se o WebRTC falhar depois do aceite, o registro deve indicar falha/reconexão, **não fingir** que o destinatário recusou.

**APRIMORAR:** correlação por `callId`, idempotência, proteção de múltiplos dispositivos tocando, push fora do app, relógio confiável, duração efetiva, callbacks de ICE e limpeza de trilhas. Grupos precisam de convites e estados por participante, não uma única flag de conectado.

## 90. Comportamento das notificações que o outro usuário deve receber

**Mensagem comum:** push/bandeira com avatar, remetente, prévia do conteúdo se autorizado; toque abre conversa na mensagem. **Carta:** `Você recebeu uma carta` ou título se permitido, sem expor corpo de envelope lacrado em prévia privada. **Imagem/vídeo/arquivo:** ícone e descrição do tipo, miniatura opcional quando permitido. **Voz:** `Mensagem de voz` com duração quando disponível. **Reação:** identificar o emoji e mensagem de origem, respeitando silenciamento. **Mensagem apagada:** atualizar/tombstone no dispositivo; enviar push apenas se a política exigir, evitando notificação excessiva. **Fixação e mudanças no grupo:** aviso com autor e ação, sem notificar silenciosamente por engano. **Enquete:** nova pergunta e aviso de voto quando pertinente, com agregação. **Jogo:** convite com aceitar/recusar, cancelamento, início e resultado; notificações não devem fingir aceitações. **Chamadas:** categoria de alta prioridade, com regras próprias, não um simples toast de chat.

**APRIMORAR:** tela de configuração por conversa, som e vibração realmente controláveis, modo silencioso, prévia na tela bloqueada, foto de perfil, prioridade, resumo agrupado, hora correta e deeplink para o alvo. No HTML há uma variável local `preferences` com valores iniciais de som/vibração/redução de movimento, mas não há tela completa de gestão desses ajustes nem integração com push real.

## 91. Critérios de prontidão para produção — funcionalidade por funcionalidade

**Identidade:** duas contas reais distintas conseguem entrar e sair de sessão e consultar apenas suas conversas. **Mensagem:** A envia → B recebe imediatamente ou ao reconectar; recibos refletem confirmação real. **Resposta/reação/edição/exclusão:** ambos os aparelhos mostram a mesma alteração segundo permissões. **Arquivos:** upload e download autorizados sobrevivem a recarga, logout e mudança de aparelho. **Carta:** A sela, B recebe envelope, abre e responde; corpo não é exposto como prévia se a regra proibir. **Enquete:** A cria, B vota; ambas as telas mostram o mesmo total. **Grupo:** A autorizado adiciona/remove B; permissões e histórico acompanham a decisão. **Figurinhas:** B consegue baixar e visualizar pacote mesmo sem a pasta local original. **Áudio:** B escuta gravação real de A, com duração e waveform coerentes. **Chamada:** dois smartphones enviam/recebem áudio e vídeo de verdade e terminam sem travar. **Games:** convite chega ao destinatário, só ele aceita, jogadas e traços são compartilhados com baixa latência. **Agendamento:** mensagem marcada para horário futuro é entregue com o aplicativo fechado. **Push:** B recebe aviso fora do aplicativo e o toque abre o chat correto. **Privacidade:** bloqueio, denúncia e autorizações funcionam no servidor. **Teclado:** compositor permanece próximo ao IME Android e histórico não fica saltando. **Acessibilidade:** todas as funções por gesto possuem alternativa acionável por toque/teclado, com foco e rótulos adequados.

## 92. Melhorias prioritárias, em ordem sugerida

### Prioridade P0 — obrigatórias antes de uso real

1. Remover dependência de identidades fictícias e autenticar usuários corretamente.
2. Garantir autorização no backend para mensagens, anexos, conversas e membros.
3. Implementar mensagens e histórico em tempo real, com reenvio/idempotência, estados confiáveis e paginação.
4. Transferir mídia ao storage remoto e garantir acesso privado; não depender apenas do armazenamento do navegador.
5. Implementar bloqueio, denúncia e operações de grupo com permissões reais.
6. Integrar push e deeplinks, evitando notificações falsas/duplicadas.
7. Substituir a simulação de chamadas por WebRTC funcional (áudio/vídeo) com sinalização e TURN/STUN.
8. Executar mensagens agendadas e expiração de mídias por serviço no backend.
9. Implementar convites e jogos com dois usuários reais, com estado autoritativo e isolamento de palavra secreta no Gartic.
10. Corrigir bugs críticos de teclado, rolagem, renderização, carregamento de anexo e recuperação após rede instável.

### Prioridade P1 — qualidade premium indispensável

11. Unificar as três camadas de código e remover handlers duplicados.
12. Tornar a renderização incremental e virtualizar históricos grandes.
13. Implementar rascunhos de cartas, agendamentos editáveis, indicador `Rascunho` na inbox e anexos com legenda.
14. Aperfeiçoar seletor Unicode e figurinhas com busca, pacotes, favoritos sincronizados e edição própria.
15. Implementar visualização de fotos/vídeos em tela cheia, zoom, miniaturas, progresso de envio e downloads confiáveis.
16. Criar central real de chamadas e atividades, com filtros e políticas de notificação.
17. Implementar gerenciamento de grupo com administradores, convites, confirmação de remoção e histórico de alterações.
18. Adicionar preview de mensagem, menções, link cards seguros e filtros avançados de busca.
19. Uniformizar cores, papéis de parede e temas com acessibilidade e configurações globais.
20. Testar telas e interações em vários Android WebView, Chrome e Safari, com microfone, câmera e teclado físicos.

### Prioridade P2 — diferenciais e refinamento avançado

21. Coleções de figurinhas, busca semântica, animações e ferramentas de criação.
22. Cartas com papel adicional, envelopes avançados, selo por catálogo, rascunho, assinatura e recebimento direcionado em grupos.
23. Enquetes com prazo, múltiplos votos, visibilidade de votantes e resultados históricos.
24. Notas com checklists, formatação, edição e colaboração quando desejada.
25. Compartilhamento de contatos/perfis e localização em cartões estruturados, com privacidade.
26. Busca global por pessoa, data, conteúdo e mídia, com resultados paginados.
27. Modo de jogos com ranking, torneios, vários participantes e voz real.
28. Múltiplas fixadas em carrossel, categorias personalizadas e organização avançada da inbox.
29. Chamada com alternância de câmera, miniplayer, qualidade adaptativa e indicadores de rede.
30. Preferências de animação, acessibilidade, toque e personalização detalhada do vidro.

## 93. Casos específicos que exigem correção no código atual

1. O código atribui a identidade atual à string fixa `marina`; não usar isso conectado a contas reais.
2. A barra inferior inclui seis atalhos sem páginas implementadas neste HTML.
3. A presença online, o visto por último, os recibos e o `digitando` são dados ou eventos simulados.
4. Chamadas não estabelecem mídia remota, e botões de microfone/alto-falante da chamada são visuais.
5. O microfone do Gartic apenas capta áudio local e não transmite voz.
6. Convites de jogo são aceitos/recusados pelo próprio operador da demonstração; falta destinatário remoto.
7. O Gartic local contém 420 palavras distribuídas em 12 temas, não mais de 200 palavras em cada tema.
8. O Jogo da Velha usa lógica de adversário automatizado; não é partida entre contas reais.
9. A carta do chat tem oito selos pré-definidos, não seletor Unicode completo no editor.
10. A ferramenta `Compartilhar conversa` compartilha o título/texto, não um link real de acesso.
11. `Enviar contato` e `Enviar localização` usam principalmente mensagens de texto com detalhes, não cartões estruturados completos.
12. `Exportar histórico` não inclui o arquivo binário dos anexos.
13. `Denunciar` incrementa um número local e exibe confirmação, sem sistema de moderação remoto.
14. `Limpar conversa` possui confirmação nas configurações, mas não necessariamente no menu longo da inbox.
15. `Sair e excluir grupo` local não é operação real de saída de membership de grupo compartilhado.
16. O agendamento depende de setInterval com a página aberta; falta entrega pelo servidor.
17. Mensagens temporárias dependem da lógica local e caminhos diferentes de criação podem não compartilhar o TTL.
18. A foto do avatar pessoal trocada pelo menu não atualiza perfil online persistente.
19. A foto de fundo da galeria fica no dispositivo, e a troca de aparelho não a recupera automaticamente.
20. O modo de rascunho não exibe, em todos os casos, a etiqueta `Rascunho` na prévia da inbox.
21. A lógica do emoji por faixas Unicode não inclui todas as sequências compostas de emoji.
22. O `localStorage` pode atingir quota em dados grandes ou muitas figurinhas importadas.
23. Mensagens enviadas podem gerar respostas automáticas que parecem vir de pessoas, mas são fictícias.
24. Há substituições sucessivas de funções e listeners de UI em três camadas; consolidar antes da produção.
25. Os testes citados no pacote foram automatizados em viewport móvel, não validações reais com dois smartphones e servidor online.

## 94. Glossário de estados para não confundir o usuário final

**Implementado no modelo:** o botão existe, abre a interface e produz alteração local ou usa a API nativa do navegador quando permitida. **Demonstrativo:** a tela imita a experiência do destinatário, mas tudo acontece no mesmo navegador. **Local persistente:** conteúdo pode ser recuperado no mesmo navegador por localStorage/IndexedDB, sujeito a quota e limpeza do dispositivo. **Captura local real:** câmera/microfone funcionam quando autorizados, mas não significam transmissão a outro dispositivo. **Esperado online:** comportamento especificado para futura conexão com servidores e usuários reais. **Pendente:** não existe no código atual ou depende de integração, autorização, segurança e testes adicionais.

## 95. Resumo executivo da arquitetura pretendida

A interface final desejada deve unir a simplicidade de toque de um mensageiro moderno à identidade visual do Looply. A caixa de entrada reúne conversas individuais e grupos com presença online, não lidas, fixadas, favoritas, arquivadas, busca e criação de chats. Cada conversa oferece mensagens de texto e arquivos, respostas, reações, edições, exclusões, cartas seladas, notas, músicas, enquetes, localização, contatos, figurinhas, áudio de voz, agendamento e histórico de chamadas. Um alfinete organiza as 15 ferramentas e um gamepad abre Jogo da Velha e Gartic. As configurações de cada chat reúnem nome/apelido, avatar de grupo, membros, cor dos balões, foto de fundo, notificações, temporárias, fixação, privacidade, salvas, mídia e exportação. O cabeçalho oferece buscar, voz, vídeo e detalhes; a central de atividades reúne mensagens, cartas, jogos, ações do grupo e chamadas.

**A diferença decisiva:** o arquivo HTML entregue demonstra uma grande quantidade de interações locais, mas a experiência completa descrita acima somente será um mensageiro real quando mensagens, identidades, arquivos, permissões, jogos, chamadas e notificações forem conectados a uma infraestrutura segura, com testes de ponta a ponta em pelo menos dois dispositivos distintos. A interface atual é a referência; o comportamento online esperado é o contrato que ainda deve ser implementado.

---

**FIM DO MAPEAMENTO.** Este documento serve como catálogo funcional, checklist de implementação e base para refatoração do chat do Looply, preservando claramente a diferença entre recursos visuais existentes e recursos online ainda pendentes.