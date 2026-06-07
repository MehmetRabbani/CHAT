import { supabase } from './supabase-client';

export const uploadAvatar = async (file: File, userId: string): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}-${Date.now()}.${fileExt}`;
  const filePath = `avatars/${userId}/${fileName}`;

  const { error } = await supabase.storage.from('avatars').upload(filePath, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return data.publicUrl;
};

export const uploadChannelIcon = async (file: File, channelId: string): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${channelId}-${Date.now()}.${fileExt}`;
  const filePath = `channel-icons/${channelId}/${fileName}`;

  const { error } = await supabase.storage.from('channel-icons').upload(filePath, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from('channel-icons').getPublicUrl(filePath);
  return data.publicUrl;
};

export const uploadMedia = async (
  file: File,
  channelId: string
): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
  const filePath = `messages/${channelId}/${fileName}`;

  const { error } = await supabase.storage.from('messages').upload(filePath, file, {
    contentType: file.type,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from('messages').getPublicUrl(filePath);
  return data.publicUrl;
};

export const deleteFile = async (bucket: string, path: string): Promise<void> => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    throw error;
  }
};
