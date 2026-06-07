
-- Lock SECURITY DEFINER helpers to internal RLS usage only
REVOKE EXECUTE ON FUNCTION public.channel_role(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_channel_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_moderate(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_owner(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Tighten invites UPDATE policy: anyone can bump uses only when joining (we'll do this via a server fn instead)
DROP POLICY IF EXISTS "invites bump uses" ON public.channel_invites;
