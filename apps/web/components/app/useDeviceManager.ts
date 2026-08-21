"use client";

import { useCallback, useEffect, useState } from "react";
import { useCallStore } from "./callStore";

// ponytail: device enumeration + fallback. Re-uses existing localStorage prefs
// from the call store. Handles unplug events and gracefully falls back.

interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput" | "videoinput";
}

function deviceList(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceInfo["kind"],
): DeviceInfo[] {
  return devices
    .filter((d) => d.kind === kind && d.deviceId !== "default")
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `${kind} ${d.deviceId.slice(0, 8)}`,
      kind: d.kind,
    }));
}

export function useDeviceManager() {
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [hasPermission, setHasPermission] = useState(false);

  const selectedMicrophone = useCallStore((s) => s.selectedMicrophone);
  const selectedCamera = useCallStore((s) => s.selectedCamera);
  const selectedSpeaker = useCallStore((s) => s.selectedSpeaker);
  const setSelectedMicrophone = useCallStore((s) => s.setSelectedMicrophone);
  const setSelectedCamera = useCallStore((s) => s.setSelectedCamera);
  const setSelectedSpeaker = useCallStore((s) => s.setSelectedSpeaker);

  const enumerate = useCallback(async () => {
    try {
      // Request permission to get device labels (browsers hide labels without).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      stream.getTracks().forEach((t) => t.stop());
      setHasPermission(true);
    } catch {
      // Partial permission — try audio only.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
        setHasPermission(true);
      } catch {
        setHasPermission(false);
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = deviceList(devices, "audioinput");
    const cams = deviceList(devices, "videoinput");
    const spks = deviceList(devices, "audiooutput");

    setMicrophones(mics);
    setCameras(cams);
    setSpeakers(spks);

    // Auto-select first available if prefs are stale.
    if (
      mics.length > 0 &&
      !mics.find((m) => m.deviceId === selectedMicrophone)
    ) {
      setSelectedMicrophone(mics[0]!.deviceId);
    }
    if (cams.length > 0 && !cams.find((c) => c.deviceId === selectedCamera)) {
      setSelectedCamera(cams[0]!.deviceId);
    }
    if (spks.length > 0 && !spks.find((s) => s.deviceId === selectedSpeaker)) {
      setSelectedSpeaker(spks[0]!.deviceId);
    }
  }, [
    selectedMicrophone,
    selectedCamera,
    selectedSpeaker,
    setSelectedMicrophone,
    setSelectedCamera,
    setSelectedSpeaker,
  ]);

  // Listen for device changes (unplug/plug).
  useEffect(() => {
    navigator.mediaDevices?.addEventListener("devicechange", enumerate);
    enumerate();
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", enumerate);
    };
  }, [enumerate]);

  return {
    microphones,
    cameras,
    speakers,
    hasPermission,
    selectedMicrophone,
    selectedCamera,
    selectedSpeaker,
    setSelectedMicrophone,
    setSelectedCamera,
    setSelectedSpeaker,
    refresh: enumerate,
  };
}

// Build default MediaStreamConstraints from store prefs + device defaults.
export function buildMediaConstraints(opts: {
  audio?: boolean;
  video?: boolean;
  microphoneId?: string | null;
  cameraId?: string | null;
}): MediaStreamConstraints {
  const constraints: MediaStreamConstraints = {};

  if (opts.audio !== false) {
    constraints.audio = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(opts.microphoneId ? { deviceId: { exact: opts.microphoneId } } : {}),
    };
  }

  if (opts.video) {
    constraints.video = opts.cameraId
      ? { deviceId: { exact: opts.cameraId } }
      : true;
  }

  return constraints;
}
