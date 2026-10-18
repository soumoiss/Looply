-- Índices para leitura do placar e integridade de consultas por participante.
create index if not exists chat_ttt_results_conversation_created_idx
  on public.chat_ttt_results (conversation_id, created_at desc);
create index if not exists chat_ttt_results_x_player_idx
  on public.chat_ttt_results (x_player);
create index if not exists chat_ttt_results_o_player_idx
  on public.chat_ttt_results (o_player);
create index if not exists chat_ttt_results_winner_idx
  on public.chat_ttt_results (winner_id);
