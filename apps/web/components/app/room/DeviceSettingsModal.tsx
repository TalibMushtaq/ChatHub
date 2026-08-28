"use client";

import { useDeviceManager } from "../useDeviceManager";
import { fieldLabel } from "../styles";
import { X } from "lucide-react";
import { useFocusTrap } from "../useFocusTrap";
import { useEffect } from "react";

// Device settings modal: microphone, camera, speaker selection.
// Renders inside the call view when the settings gear is clicked.

interface DeviceSettingsModalProps {
  onClose: () => void;
}

export default function DeviceSettingsModal({
  onClose,
}: DeviceSettingsModalProps) {
  const {
    microphones,
    cameras,
    speakers,
    selectedMicrophone,
    selectedCamera,
    selectedSpeaker,
    setSelectedMicrophone,
    setSelectedCamera,
    setSelectedSpeaker,
    refresh,
  } = useDeviceManager();

  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  // Close on Escape, matching native dialog behavior for keyboard users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Backdrop click closes the dialog; inner dialog stops propagation so
    // clicking inside the card never bubbles up to dismiss it.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-settings-title"
        className="w-full max-w-sm rounded-2xl bg-bg border border-border p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="device-settings-title" className="text-base font-extrabold">
            Device Settings
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-surface-2 transition-colors"
            aria-label="Close device settings"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="device-mic" className={fieldLabel}>
              Microphone
            </label>
            <select
              id="device-mic"
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
            <label htmlFor="device-cam" className={fieldLabel}>
              Camera
            </label>
            <select
              id="device-cam"
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

          {speakers.length > 0 && (
            <div>
              <label htmlFor="device-speaker" className={fieldLabel}>
                Speaker
              </label>
              <select
                id="device-speaker"
                value={selectedSpeaker ?? ""}
                onChange={(e) => setSelectedSpeaker(e.target.value || null)}
                className="w-full rounded-xl border-[1.5px] border-border bg-bg px-3 py-2 text-sm"
              >
                {speakers.map((s) => (
                  <option key={s.deviceId} value={s.deviceId}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={refresh}
          className="text-sm text-accent solid font-bold hover:underline"
        >
          Refresh devices
        </button>
      </div>
    </div>
  );
}
