# Roteiro de aceitação do Looply

Este roteiro registra 26 fluxos para validar a aplicação completa. Em 16 de outubro de 2026, a migração do acervo foi aplicada no Supabase, a Edge Function `looply-admin` está na versão 5 e a interface de importação está no código local. Ainda não houve importação de conteúdo nem testes de navegador com contas reais. Build verde e testes estáticos não comprovam integração ponta a ponta.

## Preparação

1. Confirme que o projeto Supabase selecionado é `qixocgetiwlrsbadpbvh`, configure Site URL e redirecionamentos da prévia e mantenha o cadastro público desativado.
2. As quatro contas `patati`, `misol`, `yara` e `peixinho` já existem no Auth e seus perfis estão associados. Não recrie usuários nem copie senhas para o código, commits ou roteiro. Login não depende de SMTP.
3. Os UUIDs foram gerados pelo Supabase. Peixinho já está associado ao grupo administrativo por backend confiável; confira essa permissão antes do fluxo de teste.
4. Abra duas sessões independentes com contas diferentes. Use dados descartáveis e não íntimos nos testes; não registre senha, token, OTP ou URL assinada.
5. Antes de importar, gere o inventário com `node scripts/audit-legacy-archive.mjs`. Importe somente arquivos presentes no índice e associados aos quatro perfis ativos.

## Fluxos obrigatórios

| # | Ação | Resultado esperado | Estado |
|---|---|---|---|
| 1 | Abra o app, compare a tela de login com o ZIP e tente cadastro público e login com uma conta provisionada. | Login mantém a aparência antiga, não oferece cadastro e usa Auth; cadastro público é recusado. | Não executado |
| 2 | Entre, saia e tente reabrir uma área autenticada pelo histórico. | Logout encerra a sessão e retorna ao login. | Não executado |
| 3 | Recarregue uma sessão válida e abra a mesma conta em outro navegador/dispositivo. | Sessão e dados do perfil são recuperados pelo Supabase sem guardar senha no app. | Não executado |
| 4 | Entre com cada usuário e confira seu perfil. | Username, nome de exibição e UUID pertencem à conta certa; perfis não se misturam. | Não executado |
| 5 | Abra a coleção antiga de cartas, contagem, estado de leitura, filtros, calendário e modal. | Textos e metadados são preservados exatamente; contagem e estado correspondem à conta. | Pendente: importar o conteúdo e verificar por usuário |
| 6 | Crie e envie uma carta no desktop para o destinatário escolhido, com privacidade e data. | Prévia, envio, feedback e persistência funcionam sem duplicar ou sobrescrever carta importada. | Não executado |
| 7 | Crie e envie uma carta em viewport móvel, inclusive com anexo permitido. | Fluxo cabe em 390 px, permite seleção nativa de arquivo e persiste no backend. | Não executado |
| 8 | Envie fotografia para a galeria pelo desktop e celular. | Arquivo privado, associação ao registro, progresso, visualização e persistência funcionam. | Não executado |
| 9 | Envie um vídeo MP4/WebM pela galeria e abra-o após recarregar. | Validação de tipo/tamanho, upload e reprodução funcionam após nova sessão autorizada. | Não executado |
| 10 | Publique um post público e um privado/selecionado. | Apenas o público autorizado recebe o conteúdo; metadados e arquivo seguem a mesma permissão. | Não executado |
| 11 | Publique comentário de texto e comentário com foto/vídeo pelo seletor do celular. | Comentários persistem uma vez, anexo respeita a visibilidade do post e apresenta estados de envio/erro. | Não executado |
| 12 | Responda a um comentário, recarregue e tente anexar arquivos acima do limite. | Resposta mantém relação com o comentário/post; arquivo inválido é recusado e não deixa registro órfão. | Não executado |
| 13 | Abra comentário e anexo de post privado com outra conta sem permissão. | Post, comentários, respostas e arquivos ficam inacessíveis pela UI, API e URL direta. | Não executado |
| 14 | Abra a playlist atribuída ao usuário, use a busca/player e reproduza um item da biblioteca. | Playlist do YouTube, incluindo a de Peixinho, abre; itens pessoais vêm do perfil autenticado. | Player incorporado; ainda não executado no navegador |
| 15 | Envie uma dedicatória musical para outra pessoa e abra-a nas duas contas. | Remetente/destinatário veem a dedicatória conforme a política; terceiros não a veem. | Não executado |
| 16 | Comente uma dedicatória como privado e depois compartilhe com os participantes. | Comentário privado começa visível só ao autor; compartilhamento persiste apenas para participantes. | Não executado |
| 17 | Inicie conversa privada entre duas contas, envie texto, recarregue e consulte histórico. | Conversa única, participantes corretos e mensagens persistentes. | Não executado |
| 18 | Envie foto/vídeo permitido no chat e tente abrir o objeto como não participante. | Anexo privado é acessível apenas aos participantes e usa URL temporária. | Não executado |
| 19 | Mantenha duas sessões abertas e envie mensagens/notificações sem recarregar. | Realtime atualiza mensagens, notificações e leitura em ambos os lados. | Não executado |
| 20 | Envie carta especial para Peixinho e responda pela conversa correspondente. | Só remetente e Peixinho veem a carta; autoria e histórico ficam corretos e o acesso é auditado. | Não executado |
| 21 | Como Peixinho, abra conteúdo privado informando motivo válido; repita como usuário comum. | Leitura administrativa exige verificação server-side e auditoria anterior à entrega; usuário comum é negado. | Não executado |
| 22 | Publique comentário administrativo numa publicação privada e em uma mídia antiga exclusiva. | Peixinho permanece autor dos comentários; a auditoria registra pedido, sucesso ou falha. | Não executado |
| 23 | Teste UUID e caminho de Storage conhecidos com conta não autorizada; repita com URL assinada expirada. | Conhecer ID/caminho não dá acesso; URL assinada expirada não funciona. | Não executado |
| 24 | Desconecte a rede durante upload, comentário e envio de mensagem; reconecte e tente novamente. | A UI não mostra sucesso falso, explica a falha e a repetição segura não cria duplicatas. | Não executado |
| 25 | Capture e compare todas as páginas em desktop e em 390 px; repita fluxos principais depois das correções. | Layout, textos, temas e interações permanecem fiéis ao ZIP, sem corte, rolagem horizontal ou regressões. | Pendente de screenshots/teste móvel |
| 26 | No painel de Peixinho, selecione a pasta extraída, informe um motivo e execute a importação; repita após interromper a rede. | Importa 97 cartas e 256 arquivos indexados, mostra erros por arquivo, retoma sem duplicatas e mantém o bucket privado. | Pendente: ação do usuário no navegador |

## Registro e critério de conclusão

Marque cada fluxo `Passou` somente depois de executá-lo. Registre data, username de teste e evidência sanitizada (por exemplo, screenshot sem conteúdo íntimo). Em falha, registre o resultado observado, corrija a causa e repita os fluxos relacionados. Nunca registre e-mail pessoal adicional, senha, OTP, token de sessão, conteúdo de carta privada ou URL assinada.

O PR permanece em rascunho até os 25 fluxos relevantes terem evidência, a identidade administrativa estar verificada, a comparação de telas estar aprovada e as lacunas de dados terem sido explicitadas.

