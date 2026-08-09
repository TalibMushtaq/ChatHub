"use client";

import { useState, useEffect } from "react";
import { api } from "../../app/lib/api";
import { getErrorMessage } from "../../app/lib/errors";

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  thumbnailKey?: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentRenderer({
  attachment,
}: {
  attachment: Attachment;
}) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/attachments/${attachment.id}`)
      .then((res) => {
        if (!cancelled) {
          setDownloadUrl(res.data.downloadUrl);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDownloadUrl(null);
          setError(getErrorMessage(err, "Attachment unavailable"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  const { mimeType, filename, size } = attachment;

  if (error) {
    return (
      <div className="max-w-[300px] px-3 py-2 rounded-lg bg-surface-2 border border-red-400/30 text-[12px] text-red-400">
        {error}
      </div>
    );
  }

  // Image
  if (mimeType.startsWith("image/")) {
    return (
      <div className="rounded-lg overflow-hidden max-w-[300px]">
        {downloadUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={downloadUrl}
            alt={filename}
            className="max-w-full h-auto object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-[200px] h-[150px] bg-surface-2 rounded-lg animate-pulse" />
        )}
      </div>
    );
  }

  // Video
  if (mimeType.startsWith("video/")) {
    return (
      <div className="rounded-lg overflow-hidden max-w-[300px]">
        {downloadUrl ? (
          <video controls className="max-w-full h-auto">
            <source src={downloadUrl} type={mimeType} />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="w-[200px] h-[150px] bg-surface-2 rounded-lg animate-pulse" />
        )}
      </div>
    );
  }

  // Audio (including voice)
  if (mimeType.startsWith("audio/")) {
    return (
      <div className="rounded-lg overflow-hidden max-w-[300px]">
        {downloadUrl ? (
          <audio controls className="w-full">
            <source src={downloadUrl} type={mimeType} />
            Your browser does not support the audio tag.
          </audio>
        ) : (
          <div className="w-[200px] h-[40px] bg-surface-2 rounded-lg animate-pulse" />
        )}
      </div>
    );
  }

  // Generic file
  return (
    <a
      href={downloadUrl || "#"}
      download={filename}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-white/10
        hover:border-white/20 transition-colors max-w-[300px]"
    >
      <span className="text-xl">📄</span>
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] text-text truncate">{filename}</span>
        <span className="text-[11px] text-muted">{formatFileSize(size)}</span>
      </div>
    </a>
  );
}
