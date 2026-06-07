import { useState, useRef } from 'react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { uploadMedia } from '@/lib/storage';
import { ImageIcon, Music, File } from 'lucide-react';
import { toast } from 'sonner';

interface MediaUploaderProps {
  channelId: string;
  onMediaUploaded: (url: string, type: 'image' | 'gif' | 'audio' | 'file') => void;
}

export function MediaUploader({ channelId, onMediaUploaded }: MediaUploaderProps) {
  const t = useT();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    file: File,
    type: 'image' | 'gif' | 'audio' | 'file'
  ) => {
    setIsUploading(true);
    try {
      const url = await uploadMedia(file, channelId);
      onMediaUploaded(url, type);
      toast.success(t('media.imageUploaded'));
    } catch (error) {
      toast.error(t('media.uploadError'));
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) handleFileUpload(file, 'image');
        }}
        disabled={isUploading}
      />
      <input
        ref={gifInputRef}
        type="file"
        accept="image/gif"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) handleFileUpload(file, 'gif');
        }}
        disabled={isUploading}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) handleFileUpload(file, 'audio');
        }}
        disabled={isUploading}
      />

      <Button
        size="icon"
        variant="ghost"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        title={t('media.uploadImage')}
      >
        <ImageIcon className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => gifInputRef.current?.click()}
        disabled={isUploading}
        title={t('media.uploadGif')}
      >
        🎬
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => audioInputRef.current?.click()}
        disabled={isUploading}
        title={t('media.record')}
      >
        <Music className="h-4 w-4" />
      </Button>
    </div>
  );
}
