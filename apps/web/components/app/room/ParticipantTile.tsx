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
      hasVideo: pubs.some((p) => p.source === Track.Source.Camera && p.track),
      hasScreenShare: pubs.some(
        (p) => p.source === Track.Source.ScreenShare && p.track,
      ),
      isMuted: !micPub?.track || micPub.isMuted,
    };
  }, [participant]);
  const [trackState, setTrackState] = useState(readTrackState);

  // Track the video source currently attached to the element so it can be
  // detached when the active source changes (e.g. a screen share stops and the
  // camera should take over) — otherwise LiveKit's srcObject swap leaves the
  // element frozen on the old, now-ended track.
  const videoAttachedRef = useRef<{
    track: TrackType;
    source: string;
  } | null>(null);

  // Attach the best available video source (screen share over camera) to the
  // <video> element. Called from LiveKit track events AND from a post-render
  // effect below: locally-published camera/screen-share tracks emit
  // `localTrackPublished`, which fires before React has rendered the <video>
  // element (it only exists once hasVideo/hasScreenShare is true), so the
  // element reference is null at event time.
  const attachBestVideo = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const pubs = participant.getTrackPublications();
    const videoPub =
      pubs.find((p) => p.source === Track.Source.ScreenShare && p.track) ??
      pubs.find((p) => p.source === Track.Source.Camera && p.track);
    const prev = videoAttachedRef.current;
    if (prev && prev.track !== videoPub?.track) {
      prev.track.detach(el);
      videoAttachedRef.current = null;
    }
    if (videoPub?.track && !videoPub.track.attachedElements.includes(el)) {
      videoPub.track.attach(el);
      videoAttachedRef.current = {
        track: videoPub.track,
        source: videoPub.source as string,
      };
    }
  }, [participant]);

  // Attach camera + screen-share video tracks to the video element, and
  // refresh derived UI state whenever LiveKit mutates track publications.
  // Local tracks publish via `localTrackPublished` (not `trackSubscribed`),
  // so both event families must be wired or locally-shared video never shows.
  useEffect(() => {
    const el = videoRef.current;
    const updateTrackState = () => setTrackState(readTrackState());

    attachBestVideo();
    participant.on("trackPublished", attachBestVideo);
    participant.on("trackSubscribed", attachBestVideo);
    participant.on("trackUnsubscribed", attachBestVideo);
    participant.on("localTrackPublished", attachBestVideo);
    participant.on("localTrackUnpublished", attachBestVideo);

    participant.on("trackPublished", updateTrackState);
    participant.on("trackUnpublished", updateTrackState);
    participant.on("trackSubscribed", updateTrackState);
    participant.on("trackUnsubscribed", updateTrackState);
    participant.on("trackMuted", updateTrackState);
    participant.on("trackUnmuted", updateTrackState);
    participant.on("localTrackPublished", updateTrackState);
    participant.on("localTrackUnpublished", updateTrackState);

    return () => {
      participant.off("trackPublished", attachBestVideo);
      participant.off("trackSubscribed", attachBestVideo);
      participant.off("trackUnsubscribed", attachBestVideo);
      participant.off("localTrackPublished", attachBestVideo);
      participant.off("localTrackUnpublished", attachBestVideo);

      participant.off("trackPublished", updateTrackState);
      participant.off("trackUnpublished", updateTrackState);
      participant.off("trackSubscribed", updateTrackState);
      participant.off("trackUnsubscribed", updateTrackState);
      participant.off("trackMuted", updateTrackState);
      participant.off("trackUnmuted", updateTrackState);
      participant.off("localTrackPublished", updateTrackState);
      participant.off("localTrackUnpublished", updateTrackState);

      if (el) {
        videoAttachedRef.current?.track.detach(el);
        videoAttachedRef.current = null;
      }
    };
  }, [participant, readTrackState, attachBestVideo]);

  // Re-run the attach after every render where a video source is visible. The
  // event-driven attach above can't reach the element when the local track is
  // published before the <video> mounts; this closes that race.
  useEffect(() => {
    attachBestVideo();
  }, [attachBestVideo, trackState.hasVideo, trackState.hasScreenShare]);

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
