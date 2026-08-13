"use client";

/**
 * AvatarCropper
 *
 * Instagram/Discord-style square avatar editor. The user pans and zooms the
 * source image inside a 1:1 crop area, sees the crop live, then confirms to
 * get the exported 512px-max Blob.
 *
 * The cropper produces the Blob; the parent owns the actual S3 upload (and
 * its loading state) via `busy`.
 */

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { cropImageToBlob } from "../../app/lib/avatarCrop";
import { btnGhost, btnPrimary, btnSm } from "./styles";

import "react-easy-crop/react-easy-crop.css";

interface AvatarCropperProps {
  imageSrc: string;
  mimeType: string;
  busy?: boolean;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}

export default function AvatarCropper({
  imageSrc,
  mimeType,
  busy,
  onCancel,
  onDone,
}: AvatarCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null);

  // Captured on every crop change (the library already throttles this to
  // animation frames) so "Crop & upload" uses the exact visible selection.
  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixelCrop(areaPixels);
  }, []);

  const [processing, setProcessing] = useState(false);

  async function confirm() {
    if (!pixelCrop || processing) return;
    setProcessing(true);
    try {
      const blob = await cropImageToBlob(imageSrc, pixelCrop, mimeType);
      onDone(blob);
    } finally {
      setProcessing(false);
    }
  }

  const working = busy || processing;

  return (
    <div className="mt-2">
      <div className="relative h-[260px] w-full overflow-hidden rounded-2xl bg-black/70">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="rect"
          showGrid
          zoomWithScroll
          minZoom={1}
          maxZoom={4}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5 flex-none text-muted"
          aria-hidden="true"
        >
          <path
            d="M15 10.5l3-3m-6 3h.01M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-[var(--color-accent-btn)]"
          aria-label="Zoom"
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5 flex-none text-muted"
          aria-hidden="true"
        >
          <path
            d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm4-8h-8m4 4V7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className={`${btnGhost} ${btnSm}`}
          onClick={onCancel}
          disabled={working}
        >
          Cancel
        </button>
        <button
          className={`${btnPrimary} ${btnSm}`}
          onClick={() => void confirm()}
          disabled={working || !pixelCrop}
        >
          {working ? "Working…" : "Crop & upload"}
        </button>
      </div>
    </div>
  );
}
