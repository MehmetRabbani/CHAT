
GRANT EXECUTE ON FUNCTION public.channel_role(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_moderate(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner(UUID, UUID) TO authenticated;
