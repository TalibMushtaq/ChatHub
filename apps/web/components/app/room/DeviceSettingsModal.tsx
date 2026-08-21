"use client";

import { useDeviceManager } from "../useDeviceManager";
import { fieldLabel } from "../styles";
import { X } from "lucide-react";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-bg border border-border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold">Device Settings</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-surface-2 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
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

          {speakers.length > 0 && (
            <div>
              <label className={fieldLabel}>Speaker</label>
              <select
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
