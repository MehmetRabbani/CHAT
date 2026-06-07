-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  tag TEXT UNIQUE NOT NULL, -- Format: 0000-9999 (4-letter + 4-digit like Discord #tag)
  avatar_url TEXT,
  bio TEXT,
  policy_accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Reserved tags for deleted accounts
CREATE TABLE reserved_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL,
  tag TEXT UNIQUE NOT NULL,
  reserved_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Channels table
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon_url TEXT,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'invite', 'private')),
  is_official BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Channel members table
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'mod', 'member', 'banned')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Channel invites table
CREATE TABLE channel_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  max_uses INTEGER,
  uses INTEGER DEFAULT 0
);

-- Channel tags (for member badges/roles)
CREATE TABLE channel_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#5865F2',
  UNIQUE(channel_id, name)
);

-- Member tags (assign tags to members)
CREATE TABLE member_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES channel_tags(id) ON DELETE CASCADE,
  UNIQUE(channel_id, user_id, tag_id)
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'gif', 'audio', 'file')),
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserved_tags ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_channels_owner_id ON channels(owner_id);
CREATE INDEX idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX idx_messages_channel_id ON messages(channel_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- RLS Policies

-- Profiles: Everyone can read, only owner can update
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Channels: Public channels readable by all, private/invite by members
CREATE POLICY "Public channels are readable by all"
  ON channels FOR SELECT
  USING (visibility = 'public' OR auth.uid() IN (
    SELECT user_id FROM channel_members WHERE channel_id = channels.id
  ));

CREATE POLICY "Users can create channels"
  ON channels FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Channel owners can update"
  ON channels FOR UPDATE
  USING (auth.uid() = owner_id AND NOT is_official)
  WITH CHECK (auth.uid() = owner_id AND NOT is_official);

-- Channel members
CREATE POLICY "Members can view channel members"
  ON channel_members FOR SELECT
  USING (user_id = auth.uid() OR channel_id IN (
    SELECT id FROM channels WHERE visibility = 'public' OR id IN (
      SELECT channel_id FROM channel_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can join public channels"
  ON channel_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Messages
CREATE POLICY "Messages are readable by channel members"
  ON messages FOR SELECT
  USING (user_id = auth.uid() OR channel_id IN (
    SELECT id FROM channels WHERE visibility = 'public' OR id IN (
      SELECT channel_id FROM channel_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can post messages to channels they're in"
  ON messages FOR INSERT
  WITH CHECK (user_id = auth.uid() AND channel_id IN (
    SELECT id FROM channels WHERE id IN (
      SELECT channel_id FROM channel_members WHERE user_id = auth.uid() AND role != 'banned'
    )
  ));

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('channel-icons', 'channel-icons', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('messages', 'messages', true);

-- Storage policies
CREATE POLICY "Avatar uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatar reads" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
