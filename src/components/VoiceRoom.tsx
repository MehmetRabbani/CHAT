import { useEffect, useState, useRef } from 'react';
import { VoiceRoomManager, AudioRecorder, PeerConnection } from '@/lib/webrtc';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceRoomProps {
  channelId: string;
  userId: string;
  userName: string;
  onClose: () => void;
}

export function VoiceRoom({ channelId, userId, userName, onClose }: VoiceRoomProps) {
  const t = useT();
  const [isConnecting, setIsConnecting] = useState(true);
  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceRoomRef = useRef<VoiceRoomManager | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    const initializeVoiceRoom = async () => {
      try {
        const manager = new VoiceRoomManager({
          channelId,
          userId,
          userName,
          onPeerConnect: (peer) => {
            setPeers((p) => [...p, peer]);
          },
          onPeerDisconnect: (peerId) => {
            setPeers((p) => p.filter((peer) => peer.userId !== peerId));
            peersRef.current.delete(peerId);
          },
          onStream: (peerId, stream) => {
            const peerConnection = manager.getPeer(peerId);
            if (peerConnection) {
              peerConnection.stream = stream;
              setPeers((p) =>
                p.map((peer) => (peer.userId === peerId ? { ...peer, stream } : peer))
              );
            }
          },
          onError: (error) => {
            setError(error.message);
          },
        });

        await manager.initialize({} as any);
        voiceRoomRef.current = manager;

        const localStream = manager.getLocalStream();
        if (videoRef.current && localStream) {
          videoRef.current.srcObject = localStream;
        }

        setIsConnecting(false);
      } catch (err) {
        setError((err as Error).message);
        setIsConnecting(false);
      }
    };

    initializeVoiceRoom();

    return () => {
      voiceRoomRef.current?.disconnect();
      audioRecorderRef.current = null;
    };
  }, [channelId, userId, userName]);

  const handleToggleMute = () => {
    const stream = voiceRoomRef.current?.getLocalStream();
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const handleToggleVideo = async () => {
    try {
      if (!isVideoEnabled) {
        await voiceRoomRef.current?.startVideo();
        const stream = voiceRoomRef.current?.getLocalStream();
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
        }
      } else {
        voiceRoomRef.current?.stopVideo();
      }
      setIsVideoEnabled(!isVideoEnabled);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStartRecording = async () => {
    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      audioRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStopRecording = () => {
    if (audioRecorderRef.current) {
      const audioBlob = audioRecorderRef.current.stop();
      // TODO: Upload audio blob to Supabase
      setIsRecording(false);
      audioRecorderRef.current = null;
    }
  };

  const handleEndCall = () => {
    voiceRoomRef.current?.disconnect();
    onClose();
  };

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button onClick={handleEndCall} className="mt-2" size="sm" variant="destructive">
          {t('voice.endCall')}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      {isConnecting && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">{t('chat.loading')}</span>
        </div>
      )}

      {/* Local Video */}
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          className={cn('w-full h-48 object-cover', !isVideoEnabled && 'hidden')}
        />
        {!isVideoEnabled && (
          <div className="w-full h-48 flex items-center justify-center bg-slate-800">
            <div className="text-center">
              <div className="text-2xl mb-2">👤</div>
              <p className="text-sm text-muted-foreground">{userName}</p>
            </div>
          </div>
        )}
      </div>

      {/* Remote Peers */}
      {peers.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {peers.map((peer) => (
            <div key={peer.userId} className="bg-black rounded-lg overflow-hidden">
              {peer.stream ? (
                <video
                  ref={(ref) => {
                    if (ref && peer.stream) {
                      ref.srcObject = peer.stream;
                      peersRef.current.set(peer.userId, ref);
                    }
                  }}
                  autoPlay
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center bg-slate-800">
                  <p className="text-xs text-muted-foreground">Connecting...</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 justify-center flex-wrap">
        <Button
          size="icon"
          variant={isMuted ? 'destructive' : 'default'}
          onClick={handleToggleMute}
          className="rounded-full"
        >
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant={isVideoEnabled ? 'default' : 'outline'}
          onClick={handleToggleVideo}
          className="rounded-full"
        >
          {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant={isRecording ? 'destructive' : 'outline'}
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          className="rounded-full"
        >
          🎙️
        </Button>
        <Button
          size="icon"
          variant="destructive"
          onClick={handleEndCall}
          className="rounded-full"
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>

      {/* Participants Count */}
      <div className="text-center text-xs text-muted-foreground">
        {t('voice.participants')}: {peers.length + 1}
      </div>
    </div>
  );
}
