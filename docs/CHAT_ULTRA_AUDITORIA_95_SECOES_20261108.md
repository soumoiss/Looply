# Looply Chat Ultra — Auditoria fiel das 95 seções (2026-11-08)

**Fonte:** `docs/CHAT_ULTRA_MAPEAMENTO_20261107.md`, 95 seções completas. **Escopo:** código conectado no GitHub `main` e alterações das PRs #270 e #271. **Este documento NÃO declara paridade 100%.** `Implementado no código` significa presença de código e, quando citado, contrato automatizado; não equivale a teste com dois aparelhos reais. `Parcial` significa que há UI/integração encontrada, mas faltam garantia e/ou casos do mapeamento.

## Resultado da revisão

- Implementados nesta PR: digitação autenticada e temporária, exclusão somente para mim, mensagens salvas/fixadas por conta, bloqueios diretos obrigatórios no servidor, voice note R2 real, preservação da edição após erro, central de atividades Neon, UUID de envio estável.
- Já presentes na base: histórico paginado, mensagens e mídia Neon/R2, chamada WebRTC, 8 opções de enquete no banco, cron de mensagens programadas, games Neon/Cloudflare, papel de parede por conta, notificações FCM (sem E2E de aparelho nesta análise).
- Evolução nesta PR #271: TTL autenticado via trigger Neon (#42), lembrete remoto de não lida (#69), limite por conta para limpar e ocultar (#72-73), transferência e saída de grupo, exportação paginada JSON/TXT/ZIP com mídia opcional (#76), rascunhos remotos e recuperação local (#84). Essas integrações ainda exigem testes E2E reais. Lacunas mais críticas: chamadas/FCM/jogos em dois dispositivos (#43-53, #89-90), acessibilidade/teclado e auditoria integral de privacidade (#86).

## Matriz de 95 seções

| # | Seção do mapeamento | Situação | Evidência / diferença a corrigir |
|---:|---|---|---|
| 1 | Visão geral e limites do modelo | Parcial/integrado; E2E pendente | Visual Ultra ligado ao Neon; há simuladores e estados locais residuais no HTML. |
| 2 | Identidade visual, aparência, ergonomia e temas globais | Parcial/integrado; E2E pendente | Tema/glass existentes; falta auditoria A11Y e parâmetros globais em todos os submódulos. |
| 3 | Cabeçalho global: logo, nome, avatar e central de atividades | Parcial/integrado; E2E pendente | Cabeçalho do modelo existe; sino agora conectado a notificações reais. |
| 4 | Menu do avatar da conta | Parcial/integrado; E2E pendente | Foto de perfil roteada ao editor real; ainda requer E2E Android. |
| 5 | Barra inferior de navegação — sete abas | Parcial/integrado; E2E pendente | Dock do modelo usa sete destinos; validar todas as rotas, navegação e histórico. |
| 6 | Título e resumo da caixa de entrada | Parcial/integrado; E2E pendente | Resumo usa conversas reais; validar semântica de contagem/arquivadas/silenciadas. |
| 7 | Faixa horizontal de pessoas online | Parcial/integrado; E2E pendente | Presence Neon v37 com heartbeat; em dois aparelhos não testado. |
| 8 | Busca geral de conversas | Parcial/integrado; E2E pendente | Busca da caixa de entrada depende das conversas carregadas, não full-text remoto. |
| 9 | Filtros da caixa de entrada | Parcial/integrado; E2E pendente | Chips visuais e preferências parcialmente no servidor; validar combinação de filtros. |
| 10 | Lista de conversas e cartões individuais | Parcial/integrado; E2E pendente | Lista Neon e prévias reais; atualização/paginação e scroll sob volume exigem E2E. |
| 11 | Pressão prolongada e menu contextual de conversa | Parcial/integrado; E2E pendente | Menu de pressão longa visual; certos controles ainda podem ser locais. |
| 12 | Botão flutuante `+ Nova conversa` | Parcial/integrado; E2E pendente | Neon/Cloudflare create_direct/create_group; validar convites, bloqueios e duplicatas. |
| 13 | Tela de conversa — estrutura e navegação | Parcial/integrado; E2E pendente | Navegação/scroll e histórico paginado; validar teclado Android e posição após reação. |
| 14 | Cabeçalho interno da conversa: todos os controles | Parcial/integrado; E2E pendente | Cabeçalho real, chamadas via WebRTC; presença digitando implementada. |
| 15 | Busca dentro da conversa | Parcial/integrado; E2E pendente | Busca do modelo foca mensagens carregadas; precisa busca paginada/full-text autorizada. |
| 16 | Linha do tempo, separadores, avatares e balões | Parcial/integrado; E2E pendente | Bolhas e mensagens reais; faltam testes de todos formatos e casos offline. |
| 17 | Estados de envio, entrega, leitura e não lidas | Parcial/integrado; E2E pendente | Campos delivered_at/read_at reais, idempotência na nova PR; sem testes ponta a ponta. |
| 18 | Indicador `digitando…` e presença contextual | Implementado no código nesta PR; E2E pendente | Novo RPC v41 e indicador efêmero que expira; integrado ao modelo. |
| 19 | Área de composição — campo de mensagem e botões | Parcial/integrado; E2E pendente | Compositor real/voice R2; validação de teclado, acesso e áudio pendente. |
| 20 | Alfinete — leque de 15 opções, uma a uma | Parcial/integrado; E2E pendente | 15 ações no alfinete; nem todas têm teste de produção em dois usuários. |
| 21 | Cartas em envelopes: escrita, aparência, abertura e resposta | Parcial/integrado; E2E pendente | Carta estruturada/envelope visual persistido em chat_messages; verificar repost/resposta. |
| 22 | Mensagens de texto e formatação inline | Parcial/integrado; E2E pendente | Formatador local de texto; revisão de links, quebras e segurança pendente. |
| 23 | Responder a mensagem, gesto de arrastar e referência | Parcial/integrado; E2E pendente | reply_to real e rascunho; verificar gestos e preview de original excluído. |
| 24 | Reações rápidas e menu de mensagem | Parcial/integrado; E2E pendente | Reações na tabela Neon; verificar long press e estado otimista. |
| 25 | Editar mensagem | Implementado no código nesta PR; E2E pendente | Edição Neon, agora texto preservado até confirmação; verificar permissão. |
| 26 | Apagar mensagem — para todos, só para mim e mensagens de terceiros | Implementado no código nesta PR; E2E pendente | Remover só para mim via v41, para todos mediante autorização; verificar UI e históricos longos. |
| 27 | Encaminhar e compartilhar mensagem | Parcial/integrado; E2E pendente | Share sheet e URL; encaminhar para chats separados ainda não plenamente validado. |
| 28 | Fixar mensagens e mensagens salvas | Implementado no código nesta PR; E2E pendente | Novos flags salvas/fixadas via RPC v42 com limite de três fixadas por pessoa. |
| 29 | Emojis: aba `Emojis`, campo de busca, categorias e inserção | Parcial/integrado; E2E pendente | Seletor emoji visual existente; verificar buscas/categorias/completude Unicode. |
| 30 | Figurinhas: catálogo, guias, envio, lupa e favoritos | Parcial/integrado; E2E pendente | Catálogo Neon/R2 de figurinhas e favoritos; validação de imagem no APK pendente. |
| 31 | Importar figurinha própria | Parcial/integrado; E2E pendente | Importação de figurinhas real com direitos declarados; verificar compressão e falhas. |
| 32 | Enviar foto pela galeria | Parcial/integrado; E2E pendente | Galeria usa seletor real e upload R2; testar permissão Android. |
| 33 | Enviar vídeo | Parcial/integrado; E2E pendente | Vídeo usa upload R2/visualizador; testar duração e encaixe. |
| 34 | Enviar arquivo e baixar anexos | Parcial/integrado; E2E pendente | Anexos persistidos com links assinados; testar download em WebView. |
| 35 | Mensagens de voz — gravar, cancelar, enviar e ouvir | Implementado no código nesta PR; E2E pendente | MediaRecorder agora enviado via fluxo real de anexos; não apenas IndexedDB. |
| 36 | Notas enviadas no chat | Parcial/integrado; E2E pendente | Notas como payload chat persistido; conferir formatação/versões. |
| 37 | Compartilhar música | Parcial/integrado; E2E pendente | Músicas por catálogo/preview; reprodução completa depende de direitos e fonte. |
| 38 | Localização | Parcial/integrado; E2E pendente | Link de mapa por endereço informado; GPS preciso não integrado. |
| 39 | Compartilhar contato | Parcial/integrado; E2E pendente | Compartilhamento de perfil autorizado, cartão real; validar deep-link. |
| 40 | Enquetes, alternativas, porcentagens e voto | Parcial/integrado; E2E pendente | Até 8 opções com votos Neon v38; validar múltiplos dispositivos e sincronização. |
| 41 | Agendar mensagem | Parcial/integrado; E2E pendente | Cloudflare Cron e Neon chat_scheduled_messages; testar app fechado. |
| 42 | Mensagens temporárias | Implementado no servidor; E2E pendente | Trigger define expires_at nas novas mensagens por prazo da conversa; SELECT RLS oculta expiradas. URLs assinadas são limitadas ao tempo restante. Caches, pushes já entregues e bytes baixados não são revogáveis retroativamente. |
| 43 | Central `Looply Games`: acesso, janelas e estados compartilhados | Parcial/integrado; E2E pendente | Menu Games usa integração Neon; validar experiência desde convite até fim. |
| 44 | Jogo da Velha — criar e enviar convite | Parcial/integrado; E2E pendente | Jogo da Velha usa convite validado no servidor; testar duas contas. |
| 45 | Jogo da Velha — tabuleiro, jogadas, pontuação e bot | Parcial/integrado; E2E pendente | Tabuleiro/jogadas Neon; IA/bot e recuperação offline precisam verificação. |
| 46 | Gartic — convite, escolha de tema e preparação | Parcial/integrado; E2E pendente | Gartic convite/categorias online; validar chegada de convite. |
| 47 | Gartic — tela da partida em tempo real no modelo | Parcial/integrado; E2E pendente | Tela Gartic real em jogo; verificar estados e latência em dois telefones. |
| 48 | Gartic — pincel, cores, tamanho, zoom e desenho | Parcial/integrado; E2E pendente | Canvas zoom/desenho com sinais; validar toque e reconexão. |
| 49 | Gartic — palpites, dicas, pontuação, resultados e rodada seguinte | Parcial/integrado; E2E pendente | Palpites/dicas/pontuação Neon; validar normalização de respostas. |
| 50 | Microfone dentro do Gartic | Parcial/integrado; E2E pendente | Áudio WebRTC do Gartic; testar duas contas e permissões APK. |
| 51 | Chamadas de voz — botão de telefone e tela própria | Parcial/integrado; E2E pendente | WebRTC audio suportado por módulos reais; validar rede celular/TURN. |
| 52 | Videochamada — botão no cabeçalho e câmera local | Parcial/integrado; E2E pendente | WebRTC vídeo suportado por módulos reais; validar câmera e fullscreen. |
| 53 | Chamadas recebidas, atender, recusar, perdidas e registros | Parcial/integrado; E2E pendente | Atender/recusar e notificações: conexão real existe, ainda sem teste dispositivo. |
| 54 | Central de atividades — botão do sino, filtros e notificações | Implementado no código nesta PR; E2E pendente | Central agora lê chat_notifications Neon e atualiza read_at. |
| 55 | Simular eventos recebidos | Parcial/integrado; E2E pendente | Simuladores não são funcionalidade de produção; ocultar/neutralizar vestígios. |
| 56 | Banners de notificação dentro da interface | Parcial/integrado; E2E pendente | Banners visuais presentes; verificar avatar/preview e chegada push. |
| 57 | Tela `Configurações da conversa` — visão geral e cabeçalho | Parcial/integrado; E2E pendente | Configurações do modelo; estado híbrido antigo ainda exige limpeza. |
| 58 | Quatro tiles rápidos das configurações | Parcial/integrado; E2E pendente | Tiles chamam serviços nativos; verificar todas ações. |
| 59 | Nome de grupo e apelido de contato | Parcial/integrado; E2E pendente | Nome de grupo/apelido salvos no servidor; validar autenticação por usuário. |
| 60 | Cor das mensagens | Parcial/integrado; E2E pendente | Cores por conversa em preferências Neon; verificar temas globais. |
| 61 | Papel de parede por cor ou foto da galeria | Parcial/integrado; E2E pendente | Papel de parede Neon/R2 com URL assinada; validar reentrada e outro aparelho. |
| 62 | Foto de grupo — seletor e editor circular | Parcial/integrado; E2E pendente | Foto de grupo usa editor native profile+upload R2; validar recorte no APK. |
| 63 | Participantes do grupo — listagem e presença | Parcial/integrado; E2E pendente | Participantes são do backend, indicador online v37; conferir privacidade. |
| 64 | Adicionar participantes | Parcial/integrado; E2E pendente | Adicionar membro por RPC v36; validar permissões/criador. |
| 65 | Remover participantes | Parcial/integrado; E2E pendente | Remover membro por RPC v36; validar confirmação e grupos grandes. |
| 66 | Silenciar notificações da conversa | Parcial/integrado; E2E pendente | Silenciar preferências por conta via Neon; verificar FCM e avisos locais. |
| 67 | Fixar conversa no topo | Parcial/integrado; E2E pendente | Fixar conversa em preferências Neon; diferenciar de fixar mensagem. |
| 68 | Arquivar e restaurar conversa | Parcial/integrado; E2E pendente | Arquivar conversa em preferências Neon; validar notificações e retorno. |
| 69 | Marcar como não lida | Implementado no servidor; E2E pendente | Flag de lembrete por conta via v44_chat_mark_unread, separada dos recibos já enviados. |
| 70 | Bloquear e desbloquear contato | Implementado no código nesta PR; E2E pendente | Bloqueio Neon v43 + gatilho antes do envio direto/letter; chamadas E2E pendentes. |
| 71 | Denunciar conversa ou contato | Parcial/integrado; E2E pendente | Denúncias reais em chat_conversation_reports; validar moderação. |
| 72 | Limpar conversa | Implementado no servidor; E2E pendente | Cutoff individual por usuário; RLS oculta mensagens anteriores sem apagar mensagens dos demais. Confirmação na configuração e no menu longo. |
| 73 | Excluir conversa individual; sair e excluir grupo | Implementado no servidor; E2E pendente | Ocultar lista por usuário, sair do grupo por RPC, dono transfere administração antes de sair se houver outros membros. |
| 74 | Ferramenta `Fotos e arquivos` das configurações | Parcial/integrado; E2E pendente | Galeria de fotos/arquivos da conversa parcial, busca não paginada por tipo. |
| 75 | Ferramenta `Mensagens salvas` | Parcial/integrado; E2E pendente | Mensagens salvas via Neon v42; lista visual precisa verificar filtragem entre páginas. |
| 76 | `Exportar histórico` | Implementado no código; E2E pendente | Exportação paginada RLS com JSON, texto ou ZIP; ZIP pode incluir anexos R2 ainda disponíveis. Limite de 240 MiB/50 mil mensagens, disponibilidade/CORS dependem do dispositivo. |
| 77 | Seção `Experiência Premium` das configurações | Parcial/integrado; E2E pendente | Experiência Premium visual; ações de fundo e atividades já são reais. |
| 78 | Folhas modais, janelas, confirmações e fechamento | Parcial/integrado; E2E pendente | Folhas/modais mantêm handlers locais; revisão de confirmação/fechamento pendente. |
| 79 | Gestos do smartphone | Parcial/integrado; E2E pendente | Gestos mobile presentes; validação Android sem scroll involuntário pendente. |
| 80 | Animações e efeitos visuais existentes | Parcial/integrado; E2E pendente | Animações CSS presentes; acessibilidade e redução de movimento parcial. |
| 81 | Teclado, altura da viewport e rolagem estável | Parcial/integrado; E2E pendente | visualViewport e teclado tratados; teste físico WebView pendente. |
| 82 | Botões de estado vazio, alertas e indicadores auxiliares | Parcial/integrado; E2E pendente | Estados de vazio/erro ainda precisam política consistente de offline e retentativas. |
| 83 | Persistência: localStorage, IndexedDB, URIs e limitações | Parcial/integrado; E2E pendente | Histórico vem do Neon e uploads do R2; há estado local legado e cache a revisar. Cutoff e lembretes no servidor, drafts remotos com recuperação local. |
| 84 | Rascunhos por conversa | Implementado no código; E2E pendente | Rascunho privado via v45_chat_read_drafts/save_draft; debounce e fallback local. Conflitos entre duas edições concorrentes ainda dependem de política de reconciliação. |
| 85 | Informações da mensagem | Parcial/integrado; E2E pendente | Informações usam timestamp e recibos reais; grupo por membro ainda parcial. |
| 86 | Privacidade, dados pessoais e segurança — o que não está implementado | Parcial, auditoria pendente | Controles RLS de leitura, expiração e edição de autor; acesso a anexos e autenticação Neon. Não há E2EE auditado nem teste de penetração/IDOR completo. |
| 87 | Arquitetura mínima para levar este modelo ao Looply online | Parcial/integrado; E2E pendente | Neon/R2/Cloudflare, migrações v41-v45; separação de estado autoritativo do protótipo avançou, ainda restam handlers legados. |
| 88 | Contrato funcional esperado das mensagens em produção | Parcial/integrado; E2E pendente | Envio idempotente por UUID e leitura real; filas offline/delivery completo pendentes. |
| 89 | Eventos de chamada que o outro usuário deve realmente receber | Parcial/integrado; E2E pendente | WebRTC com sinalização; testes two-device e TURN/cobertura FCM pendentes. |
| 90 | Comportamento das notificações que o outro usuário deve receber | Parcial/integrado; E2E pendente | Chat notifications e FCM; auditoria de latência, privacidade e usuário ausente pendente. |
| 91 | Critérios de prontidão para produção — funcionalidade por funcionalidade | Parcial/integrado; E2E pendente | CI unitário/visual verifica contratos, não demonstra 100% E2E. |
| 92 | Melhorias prioritárias, em ordem sugerida | Parcial/integrado; E2E pendente | Priorizados P0 privacidade, envio, edição, bloqueio e áudio; outros itens remanescentes. |
| 93 | Casos específicos que exigem correção no código atual | Parcial/integrado; E2E pendente | Corrigidos blocos simulados relevantes, mas local runtime ainda contém chamadas legadas. |
| 94 | Glossário de estados para não confundir o usuário final | Parcial/integrado; E2E pendente | Estados online, digitando, salvo e bloqueado agora têm origem Neon; demais precisam revisar. |
| 95 | Resumo executivo da arquitetura pretendida | Parcial/integrado; E2E pendente | Arquitetura modular mantida com backend real; dívida legado/UI permanece. |

## Critério mínimo para chamar 100%

Cada ação deve ser testada em **duas contas reais em dois smartphones Android/WebView**, incluindo reconexão, tela bloqueada, push, R2, perfis bloqueados, permissões, grupos e sessões concorrentes, além dos testes `node --test`, build e validação visual. Nenhum teste simulado de navegador substitui a confirmação de serviço externo.
