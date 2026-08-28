"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant, Track as TrackType } from "livekit-client";
import { Track } from "livekit-client";
import { MicOff, MonitorUp, User } from "lucide-react";

// Renders a single participant's video tile or avatar fallback.
// Attaches LiveKit track publications directly to media elements — LiveKit
// stays authoritative for media state (no Socket.IO duplication).

interface ParticipantTileProps {
  participant: Participant;
  isLocal?: boolean;
  isSpeaking?: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export default function ParticipantTile({
  participant,
  isLocal = false,
  isSpeaking = false,
  displayName,
  avatarUrl,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Derived visuals (video present, screen share, muted) live in state rather
  // than a forceUpdate counter so React re-renders only when these actually
  // change — the anti-pattern also made debugging harder.
  const readTrackState = useCallback(() => {
    const pubs = participant.getTrackPublications();
    const micPub = participant.getTrackPublication(Track.Source.Microphone);
    return {
      hasVideo: pubs.some(
        (p) => p.source === Track.Source.Camera && p.track,
      ),
      hasScreenShare: pubs.some(
        (p) => p.source === Track.Source.ScreenShare && p.track,
      ),
      isMuted: !micPub?.track || micPub.isMuted,
    };
  }, [participant]);
  const [trackState, setTrackState] = useState(readTrackState);

  // Attach camera + screen-share video tracks to the video element.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const attached: { track: TrackType; source: string }[] = [];

    const attachVideo = () => {
      const pubs = participant.getTrackPublications();
      // Prioritize screen share over camera so shared content always renders.
      const videoPub =
        pubs.find((p) => p.source === Track.Source.ScreenShare && p.track) ??
        pubs.find((p) => p.source === Track.Source.Camera && p.track);
      if (videoPub?.track && !videoPub.track.attachedElements.includes(el)) {
        videoPub.track.attach(el);
        attached.push({
          track: videoPub.track,
          source: videoPub.source as string,
        });
      }
    };

    // Refresh derived UI state whenever LiveKit mutates track publications.
    const updateTrackState = () => setTrackState(readTrackState());

    attachVideo();
    participant.on("trackPublished", attachVideo);
    participant.on("trackSubscribed", attachVideo);
    participant.on("trackUnsubscribed", attachVideo);

    // React to track state changes to update visual indicators
    participant.on("trackPublished", updateTrackState);
    participant.on("trackUnpublished", updateTrackState);
    participant.on("trackSubscribed", updateTrackState);
    participant.on("trackUnsubscribed", updateTrackState);
    participant.on("trackMuted", updateTrackState);
    participant.on("trackUnmuted", updateTrackState);
    participant.on("localTrackPublished", updateTrackState);
    participant.on("localTrackUnpublished", updateTrackState);

    return () => {
      participant.off("trackPublished", attachVideo);
      participant.off("trackSubscribed", attachVideo);
      participant.off("trackUnsubscribed", attachVideo);

      participant.off("trackPublished", updateTrackState);
      participant.off("trackUnpublished", updateTrackState);
      participant.off("trackSubscribed", updateTrackState);
      participant.off("trackUnsubscribed", updateTrackState);
      participant.off("trackMuted", updateTrackState);
      participant.off("trackUnmuted", updateTrackState);
      participant.off("localTrackPublished", updateTrackState);
      participant.off("localTrackUnpublished", updateTrackState);

      attached.forEach(({ track }) => track.detach(el));
    };
  }, [participant, readTrackState]);

  // Attach microphone audio track to the audio element (remote only).
  useEffect(() => {
    if (isLocal) return;
    const el = audioRef.current;
    if (!el) return;

    const attachAudio = () => {
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);
      if (audioPub?.track && !audioPub.track.attachedElements.includes(el)) {
        audioPub.track.attach(el);
      }
    };

    attachAudio();
    participant.on("trackPublished", attachAudio);
    participant.on("trackSubscribed", attachAudio);
    participant.on("trackUnsubscribed", attachAudio);

    return () => {
      participant.off("trackPublished", attachAudio);
      participant.off("trackSubscribed", attachAudio);
      participant.off("trackUnsubscribed", attachAudio);
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);
      audioPub?.track?.detach(el);
    };
  }, [participant, isLocal]);

  const { hasVideo, hasScreenShare, isMuted } = trackState;

  return (
    <div
      aria-label={`${isLocal ? `${displayName} (you)` : displayName}${isSpeaking ? ", speaking" : ""}${isMuted ? ", muted" : ""}`}
      className={`relative flex flex-col items-center justify-center rounded-xl overflow-hidden bg-surface-2 transition-all ${isSpeaking ? "ring-2 ring-[oklch(0.65_0.2_180)]" : ""}`}
    >
      {/* Video or avatar fallback */}
      {hasVideo || hasScreenShare ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex items-center justify-center w-full aspect-video">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <User size={32} className="text-muted" />
          )}
        </div>
      )}

      {/* Audio element for remote participants */}
      {!isLocal && <audio ref={audioRef} autoPlay />}

      {/* Bottom overlay: name + indicators */}
      <div className="absolute bottom-0 inset-x-0 flex items-center gap-1.5 px-2 py-1.5 bg-black/50 text-white text-xs font-bold">
        <span className="truncate flex-1">
          {isLocal ? `${displayName} (You)` : displayName}
        </span>
        {isMuted && <MicOff size={12} className="text-danger opacity-90" />}
        {hasScreenShare && (
          <MonitorUp size={12} className="text-success opacity-90" />
        )}
      </div>
    </div>
  );
}
