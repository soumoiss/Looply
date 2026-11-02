-- Gartic invitations: an invited player explicitly accepts or declines before joining.
CREATE TABLE IF NOT EXISTS public.looply_gartic_invites (
 game_id uuid NOT NULL REFERENCES public.looply_gartic_games(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 invited_by uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 minutes'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(game_id,user_id)
);
CREATE INDEX IF NOT EXISTS looply_gartic_invites_inbox
 ON public.looply_gartic_invites(user_id,status,created_at DESC);
ALTER TABLE public.looply_gartic_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_gartic_invites FROM PUBLIC,authenticated,anonymous;

-- The game view and action functions stay SECURITY DEFINER with explicit
-- membership checks. Invites never grant access to another conversation.
