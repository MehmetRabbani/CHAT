
-- Drop old 4-digit constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tag_format;

-- ENUMS
DO $$ BEGIN CREATE TYPE public.channel_visibility AS ENUM ('public','invite','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.channel_member_role AS ENUM ('owner','mod','member','banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PROFILES extend
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS policy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'tr';

UPDATE public.profiles SET tag = LPAD(regexp_replace(tag, '\D', '', 'g'), 6, '0');
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tag_format CHECK (tag ~ '^[0-9]{6}$');

-- RESERVED TAGS
CREATE TABLE IF NOT EXISTS public.reserved_tags (
  username TEXT NOT NULL, tag TEXT NOT NULL,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (username, tag)
);
GRANT SELECT ON public.reserved_tags TO authenticated;
GRANT ALL ON public.reserved_tags TO service_role;
ALTER TABLE public.reserved_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserved_tags readable by auth" ON public.reserved_tags;
CREATE POLICY "reserved_tags readable by auth" ON public.reserved_tags FOR SELECT TO authenticated USING (true);

-- CHANNELS extend
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS visibility public.channel_visibility NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS slug TEXT;
UPDATE public.channels SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;
UPDATE public.channels SET is_official = true WHERE name IN ('genel','oyun','müzik');
ALTER TABLE public.channels ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS channels_slug_key ON public.channels(slug);

-- CHANNEL_MEMBERS
CREATE TABLE IF NOT EXISTS public.channel_members (
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.channel_member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_members TO authenticated;
GRANT ALL ON public.channel_members TO service_role;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.channel_invites (
  code TEXT PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, max_uses INT, uses INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_invites TO authenticated;
GRANT ALL ON public.channel_invites TO service_role;
ALTER TABLE public.channel_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.channel_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#7c3aed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_tags TO authenticated;
GRANT ALL ON public.channel_tags TO service_role;
ALTER TABLE public.channel_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.member_tags (
  channel_id UUID NOT NULL, user_id UUID NOT NULL,
  tag_id UUID NOT NULL REFERENCES public.channel_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_tags TO authenticated;
GRANT ALL ON public.member_tags TO service_role;
ALTER TABLE public.member_tags ENABLE ROW LEVEL SECURITY;

-- helpers
CREATE OR REPLACE FUNCTION public.channel_role(_user UUID, _channel UUID)
RETURNS public.channel_member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.channel_members WHERE channel_id = _channel AND user_id = _user
$$;
CREATE OR REPLACE FUNCTION public.is_channel_member(_user UUID, _channel UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id=_channel AND user_id=_user AND role<>'banned')
    OR EXISTS (SELECT 1 FROM public.channels WHERE id=_channel AND visibility='public')
$$;
CREATE OR REPLACE FUNCTION public.can_moderate(_user UUID, _channel UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id=_channel AND user_id=_user AND role IN ('owner','mod'))
$$;
CREATE OR REPLACE FUNCTION public.is_owner(_user UUID, _channel UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.channels WHERE id=_channel AND owner_id=_user)
$$;

-- channels policies
DROP POLICY IF EXISTS "Channels viewable by authenticated" ON public.channels;
DROP POLICY IF EXISTS "Authenticated can create channels" ON public.channels;
DROP POLICY IF EXISTS "channels select" ON public.channels;
DROP POLICY IF EXISTS "channels insert" ON public.channels;
DROP POLICY IF EXISTS "channels update owner" ON public.channels;
DROP POLICY IF EXISTS "channels delete owner" ON public.channels;
CREATE POLICY "channels select" ON public.channels FOR SELECT TO authenticated
USING (visibility='public' OR is_official=true OR public.is_channel_member(auth.uid(), id));
CREATE POLICY "channels insert" ON public.channels FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() AND is_official = false);
CREATE POLICY "channels update owner" ON public.channels FOR UPDATE TO authenticated
USING (owner_id = auth.uid() AND is_official = false)
WITH CHECK (owner_id = auth.uid() AND is_official = false);
CREATE POLICY "channels delete owner" ON public.channels FOR DELETE TO authenticated
USING (owner_id = auth.uid() AND is_official = false);

-- members policies
CREATE POLICY "members select" ON public.channel_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.channels c WHERE c.id=channel_id AND (c.visibility='public' OR c.is_official=true))
  OR public.is_channel_member(auth.uid(), channel_id)
);
CREATE POLICY "members join self public" ON public.channel_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND role='member'
  AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id=channel_id AND (c.visibility='public' OR c.is_official=true))
);
CREATE POLICY "members insert by mod" ON public.channel_members FOR INSERT TO authenticated
WITH CHECK (public.can_moderate(auth.uid(), channel_id) AND role IN ('member','mod'));
CREATE POLICY "members leave self" ON public.channel_members FOR DELETE TO authenticated
USING (user_id = auth.uid() AND role <> 'owner');
CREATE POLICY "members remove by owner" ON public.channel_members FOR DELETE TO authenticated
USING (public.is_owner(auth.uid(), channel_id) AND user_id <> auth.uid());
CREATE POLICY "members update by owner" ON public.channel_members FOR UPDATE TO authenticated
USING (public.is_owner(auth.uid(), channel_id)) WITH CHECK (public.is_owner(auth.uid(), channel_id));

-- invites policies
CREATE POLICY "invites read auth" ON public.channel_invites FOR SELECT TO authenticated USING (true);
CREATE POLICY "invites insert by mod" ON public.channel_invites FOR INSERT TO authenticated
WITH CHECK (public.can_moderate(auth.uid(), channel_id) AND created_by = auth.uid());
CREATE POLICY "invites delete by mod" ON public.channel_invites FOR DELETE TO authenticated
USING (public.can_moderate(auth.uid(), channel_id));
CREATE POLICY "invites bump uses" ON public.channel_invites FOR UPDATE TO authenticated
USING (true) WITH CHECK (true);

-- tags
CREATE POLICY "ctags select" ON public.channel_tags FOR SELECT TO authenticated
USING (public.is_channel_member(auth.uid(), channel_id));
CREATE POLICY "ctags mod write" ON public.channel_tags FOR ALL TO authenticated
USING (public.can_moderate(auth.uid(), channel_id)) WITH CHECK (public.can_moderate(auth.uid(), channel_id));
CREATE POLICY "mtags select" ON public.member_tags FOR SELECT TO authenticated
USING (public.is_channel_member(auth.uid(), channel_id));
CREATE POLICY "mtags mod write" ON public.member_tags FOR ALL TO authenticated
USING (public.can_moderate(auth.uid(), channel_id)) WITH CHECK (public.can_moderate(auth.uid(), channel_id));

-- messages policies
DROP POLICY IF EXISTS "Messages viewable by authenticated" ON public.messages;
DROP POLICY IF EXISTS "Users insert own messages" ON public.messages;
DROP POLICY IF EXISTS "Users delete own messages" ON public.messages;
CREATE POLICY "messages select members" ON public.messages FOR SELECT TO authenticated
USING (public.is_channel_member(auth.uid(), channel_id));
CREATE POLICY "messages insert member" ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_channel_member(auth.uid(), channel_id)
  AND COALESCE(public.channel_role(auth.uid(), channel_id)::text, 'member') <> 'banned'
);
CREATE POLICY "messages delete own or mod" ON public.messages FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.can_moderate(auth.uid(), channel_id));

-- profile guard
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tag <> OLD.tag THEN RAISE EXCEPTION 'tag değiştirilemez'; END IF;
  IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'id değiştirilemez'; END IF;
  IF NEW.username <> OLD.username THEN
    IF EXISTS (SELECT 1 FROM public.reserved_tags r WHERE r.username = NEW.username AND r.tag = NEW.tag) THEN
      RAISE EXCEPTION 'bu kullanıcı adı + etiket kombinasyonu rezerve';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_guard_update ON public.profiles;
CREATE TRIGGER profiles_guard_update BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- handle_new_user (6-digit)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base_username TEXT; attempt INT := 0; new_tag TEXT;
BEGIN
  base_username := COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  base_username := regexp_replace(base_username, '[^A-Za-z0-9_ğüşıöçĞÜŞİÖÇ.-]', '', 'g');
  IF char_length(base_username) < 2 THEN base_username := 'kullanici'; END IF;
  IF char_length(base_username) > 24 THEN base_username := substring(base_username, 1, 24); END IF;
  LOOP
    new_tag := LPAD((floor(random()*1000000))::int::text, 6, '0');
    IF EXISTS (SELECT 1 FROM public.reserved_tags WHERE username=base_username AND tag=new_tag) THEN
      attempt := attempt + 1; IF attempt>50 THEN RAISE EXCEPTION 'tag bulunamadı'; END IF; CONTINUE;
    END IF;
    BEGIN
      INSERT INTO public.profiles(id, username, tag, avatar_url)
      VALUES (NEW.id, base_username, new_tag, NEW.raw_user_meta_data->>'avatar_url');
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1; IF attempt>50 THEN RAISE; END IF;
    END;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- channel owner auto-member
CREATE OR REPLACE FUNCTION public.add_owner_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.channel_members(channel_id, user_id, role)
      VALUES (NEW.id, NEW.owner_id, 'owner')
      ON CONFLICT (channel_id, user_id) DO UPDATE SET role='owner';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS channels_add_owner ON public.channels;
CREATE TRIGGER channels_add_owner AFTER INSERT ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_member();

-- realtime
ALTER TABLE public.channel_members REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='channel_members';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='channels';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.channels; END IF;
END $$;

-- storage policies (buckets are created via tool)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='avatars public read') THEN
    CREATE POLICY "avatars public read" ON storage.objects FOR SELECT USING (bucket_id='avatars'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='avatars user write') THEN
    CREATE POLICY "avatars user write" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='avatars user update') THEN
    CREATE POLICY "avatars user update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='avatars user delete') THEN
    CREATE POLICY "avatars user delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='cicons public read') THEN
    CREATE POLICY "cicons public read" ON storage.objects FOR SELECT USING (bucket_id='channel-icons'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='cicons owner write') THEN
    CREATE POLICY "cicons owner write" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id='channel-icons' AND EXISTS (
        SELECT 1 FROM public.channels c WHERE c.id::text = (storage.foldername(name))[1] AND c.owner_id = auth.uid())); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='cicons owner update') THEN
    CREATE POLICY "cicons owner update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id='channel-icons' AND EXISTS (
        SELECT 1 FROM public.channels c WHERE c.id::text = (storage.foldername(name))[1] AND c.owner_id = auth.uid())); END IF;
END $$;
