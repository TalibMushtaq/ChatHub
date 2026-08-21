"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDeviceManager, buildMediaConstraints } from "../useDeviceManager";
import { btnPrimary, btnGhost, fieldLabel } from "../styles";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

// Lightweight pre-join preview: local camera/mic check before connecting to LiveKit.
// Uses local media only — no LiveKit connection until the user clicks Join.

interface PreJoinPreviewProps {
  channelName: string;
  onJoin: () => void;
  onCancel: () => void;
}

export default function PreJoinPreview({
  channelName,
  onJoin,
  onCancel,
}: PreJoinPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [localMuted, setLocalMuted] = useState(false);
  const [localCamOff, setLocalCamOff] = useState(false);

  const {
    microphones,
    cameras,
    selectedMicrophone,
    selectedCamera,
    setSelectedMicrophone,
    setSelectedCamera,
  } = useDeviceManager();

  const startPreview = useCallback(async () => {
    // Stop any existing preview tracks.
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const constraints = buildMediaConstraints({
      audio: !localMuted,
      video: !localCamOff,
      microphoneId: selectedMicrophone,
      cameraId: selectedCamera,
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // Fallback: audio only if video fails.
      if (!localCamOff) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: constraints.audio,
          });
          streamRef.current = stream;
        } catch {
          // No media available — user can still join audio-only.
        }
      }
    }
  }, [localMuted, localCamOff, selectedMicrophone, selectedCamera]);

  useEffect(() => {
    startPreview();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startPreview]);

  const toggleMute = () => {
    setLocalMuted((prev) => {
      const next = !prev;
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  };

  const toggleCam = () => {
    setLocalCamOff((prev) => {
      const next = !prev;
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  };

  const handleJoin = () => {
    // Stop preview tracks — LiveKit will create its own.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onJoin();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-bg border border-border p-6 flex flex-col items-center gap-4">
        <h2 className="text-lg font-extrabold">{channelName}</h2>

        {/* Video preview */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-surface-2 flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover ${localCamOff ? "hidden" : ""}`}
          />
          {localCamOff && <div className="text-muted text-sm">Camera off</div>}
        </div>

        {/* Device selectors */}
        <div className="w-full flex flex-col gap-3">
          <div>
            <label className={fieldLabel}>Microphone</label>
            <select
              value={selectedMicrophone ?? ""}
              onChange={(e) => setSelectedMicrophone(e.target.value || null)}
              className="w-full rounded-xl border-[1.5px] border-border bg-bg px-3 py-2 text-sm"
            >
              {microphones.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </option>
              ))}
              {microphones.length === 0 && (
                <option value="">No microphones found</option>
              )}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Camera</label>
            <select
              value={selectedCamera ?? ""}
              onChange={(e) => setSelectedCamera(e.target.value || null)}
              className="w-full rounded-xl border-[1.5px] border-border bg-bg px-3 py-2 text-sm"
            >
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </option>
              ))}
              {cameras.length === 0 && (
                <option value="">No cameras found</option>
              )}
            </select>
          </div>
        </div>

        {/* Preview controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full transition-colors ${localMuted ? "bg-danger-soft text-danger" : "bg-surface-2 text-fg hover:bg-surface-3"}`}
            title={localMuted ? "Unmute" : "Mute"}
          >
            {localMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            onClick={toggleCam}
            className={`p-3 rounded-full transition-colors ${localCamOff ? "bg-danger-soft text-danger" : "bg-surface-2 text-fg hover:bg-surface-3"}`}
            title={localCamOff ? "Turn camera on" : "Turn camera off"}
          >
            {localCamOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
        </div>

        {/* Join / Cancel */}
        <div className="flex items-center gap-3 w-full">
          <button onClick={onCancel} className={`${btnGhost} flex-1`}>
            Cancel
          </button>
          <button onClick={handleJoin} className={`${btnPrimary} flex-1`}>
            Join Voice
          </button>
        </div>
      </div>
    </div>
  );
}
