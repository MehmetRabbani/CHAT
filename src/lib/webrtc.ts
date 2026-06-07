import SimplePeer from 'simple-peer';

export interface PeerConnection {
  peer: SimplePeer.Instance;
  userId: string;
  stream?: MediaStream;
}

export interface VoiceRoomConfig {
  channelId: string;
  userId: string;
  userName: string;
  onPeerConnect: (peer: PeerConnection) => void;
  onPeerDisconnect: (userId: string) => void;
  onStream: (userId: string, stream: MediaStream) => void;
  onError: (error: Error) => void;
}

export class VoiceRoomManager {
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private config: VoiceRoomConfig;
  private signalingChannel: any;

  constructor(config: VoiceRoomConfig) {
    this.config = config;
  }

  async initialize(signalingChannel: any): Promise<void> {
    this.signalingChannel = signalingChannel;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch (error) {
      this.config.onError(new Error('Failed to get audio permission'));
      throw error;
    }
  }

  async startVideo(): Promise<MediaStream> {
    if (!this.localStream) {
      throw new Error('Voice room not initialized');
    }
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: 1280, height: 720 },
      });
      // Combine audio and video streams
      const combinedStream = new MediaStream([
        ...this.localStream.getAudioTracks(),
        ...videoStream.getVideoTracks(),
      ]);
      this.localStream = combinedStream;
      return combinedStream;
    } catch (error) {
      this.config.onError(new Error('Failed to get video permission'));
      throw error;
    }
  }

  stopVideo(): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => track.stop());
    }
  }

  createPeer(initiator: boolean, userId: string): SimplePeer.Instance {
    const peer = new SimplePeer({
      initiator,
      trickleIce: true,
      stream: this.localStream!,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
    });

    peer.on('signal', (data) => {
      this.signalingChannel.emit('signal', {
        to: userId,
        from: this.config.userId,
        signal: data,
      });
    });

    peer.on('stream', (stream: MediaStream) => {
      this.config.onStream(userId, stream);
    });

    peer.on('error', (error) => {
      this.config.onError(error);
      this.removePeer(userId);
    });

    peer.on('close', () => {
      this.removePeer(userId);
    });

    const peerConnection: PeerConnection = {
      peer,
      userId,
      stream: undefined,
    };

    this.peers.set(userId, peerConnection);
    this.config.onPeerConnect(peerConnection);

    return peer;
  }

  handleSignal(data: any): void {
    let peer = this.peers.get(data.from)?.peer;
    if (!peer) {
      peer = this.createPeer(false, data.from);
    }
    peer.signal(data.signal);
  }

  removePeer(userId: string): void {
    const peerConnection = this.peers.get(userId);
    if (peerConnection) {
      peerConnection.peer.destroy();
      this.peers.delete(userId);
      this.config.onPeerDisconnect(userId);
    }
  }

  disconnect(): void {
    this.peers.forEach((peer) => {
      peer.peer.destroy();
    });
    this.peers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getPeer(userId: string): PeerConnection | undefined {
    return this.peers.get(userId);
  }

  getAllPeers(): PeerConnection[] {
    return Array.from(this.peers.values());
  }
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        this.chunks.push(event.data);
      };

      this.mediaRecorder.start();
    } catch (error) {
      throw new Error('Failed to start recording');
    }
  }

  stop(): Blob {
    if (!this.mediaRecorder) {
      throw new Error('Recording not started');
    }

    this.mediaRecorder.stop();
    const blob = new Blob(this.chunks, { type: 'audio/webm' });
    this.chunks = [];

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    return blob;
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}
