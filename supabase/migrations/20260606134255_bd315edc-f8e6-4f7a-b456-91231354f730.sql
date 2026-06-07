
-- Profiles: add tag + updated_at
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tag TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Sanitize existing usernames
UPDATE public.profiles
SET username = CASE
  WHEN char_length(regexp_replace(username, '[^A-Za-z0-9_ğüşıöçĞÜŞİÖÇ.-]', '', 'g')) < 2
    THEN 'kullanici' || substring(id::text, 1, 4)
  ELSE substring(regexp_replace(username, '[^A-Za-z0-9_ğüşıöçĞÜŞİÖÇ.-]', '', 'g'), 1, 24)
END
WHERE username !~ '^[A-Za-z0-9_ğüşıöçĞÜŞİÖÇ.-]+$' OR char_length(username) NOT BETWEEN 2 AND 24;

-- Backfill tags
UPDATE public.profiles SET tag = LPAD((floor(random()*10000))::int::text, 4, '0') WHERE tag IS NULL;

ALTER TABLE public.profiles ALTER COLUMN tag SET NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_tag_unique UNIQUE (username, tag);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tag_format CHECK (tag ~ '^[0-9]{4}$');
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format CHECK (char_length(username) BETWEEN 2 AND 24 AND username ~ '^[A-Za-z0-9_ğüşıöçĞÜŞİÖÇ.-]+$');

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
CREATE POLICY "Users update own messages" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  attempt INT := 0;
  new_tag TEXT;
BEGIN
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );
  base_username := regexp_replace(base_username, '[^A-Za-z0-9_ğüşıöçĞÜŞİÖÇ.-]', '', 'g');
  IF char_length(base_username) < 2 THEN base_username := 'kullanici'; END IF;
  IF char_length(base_username) > 24 THEN base_username := substring(base_username, 1, 24); END IF;

  LOOP
    new_tag := LPAD((floor(random()*10000))::int::text, 4, '0');
    BEGIN
      INSERT INTO public.profiles (id, username, tag, avatar_url)
      VALUES (NEW.id, base_username, new_tag, NEW.raw_user_meta_data->>'avatar_url');
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt > 20 THEN RAISE; END IF;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_touch_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
