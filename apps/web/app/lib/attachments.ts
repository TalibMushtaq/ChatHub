import { api } from "./api";

/** Upload context accepted by the presign endpoint. */
export type AttachmentContext = "dm" | "room";

export interface UploadedAttachments {
  attachmentIds: string[];
  /** Message type derived from the first file, matching the server enum. */
  messageType: string;
}

const DEFAULT_MIME = "application/octet-stream";

/**
 * Presign-and-upload flow shared by every composer: ask the API for a
 * presigned PUT per file, upload straight to S3, and report the ids so the
 * caller can attach them to a message.
 */
export async function uploadAttachments(
  context: AttachmentContext,
  contextId: string,
  files: FileList,
): Promise<UploadedAttachments> {
  const attachmentIds: string[] = [];

  for (const file of Array.from(files)) {
    const presignRes = await api.post("/attachments/presign", {
      context,
      contextId,
      filename: file.name,
      mimeType: file.type || DEFAULT_MIME,
      size: file.size,
    });

    const { presignedUrl, attachmentId } = presignRes.data;

    const uploadRes = await fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || DEFAULT_MIME },
    });
    if (!uploadRes.ok) {
      throw new Error(`Upload of ${file.name} failed (${uploadRes.status})`);
    }

    attachmentIds.push(attachmentId);
  }

  return { attachmentIds, messageType: messageTypeFor(files[0]) };
}

/**
 * Presign-and-upload a single voice recording.
 *
 * Uses the `voice` context so the file lands under `attachments/voice/` and
 * the server validates the duration cap. The recorded blob is uploaded
 * straight to S3 via the presigned PUT; duration + waveform peaks are sent at
 * presign time so they're persisted as playback metadata without the server
 * ever decoding the audio.
 */
export async function uploadVoiceAttachment(
  context: AttachmentContext,
  contextId: string,
  blob: Blob,
  durationSeconds: number,
  waveformPeaks: number[],
): Promise<string> {
  const mimeType = blob.type || pickAudioMime();
  const ext = mimeType === "audio/mp4" ? "m4a" : "webm";

  const presignRes = await api.post("/attachments/presign", {
    context: "voice",
    contextId,
    filename: `voice-${Date.now()}.${ext}`,
    mimeType,
    size: blob.size,
    durationSeconds,
    waveformPeaks,
  });

  const { presignedUrl, attachmentId } = presignRes.data;

  const uploadRes = await fetch(presignedUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": mimeType },
  });
  if (!uploadRes.ok) {
    throw new Error(`Voice upload failed (${uploadRes.status})`);
  }

  return attachmentId as string;
}

/**
 * Choose a MediaRecorder MIME type that actually works in this browser.
 * WebM/Opus is the standard everywhere except Safari, which has no WebM
 * muxer and falls back to MP4/AAC. The server's ALLOWED_VOICE_MIME_TYPES
 * accepts both (plus Ogg).
 */
export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  const found = candidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (found) return found.split(";")[0]!;
  return "audio/webm";
}

/**
 * Downsample the analyser's current time-domain samples into `bars` amplitude
 * bars (0..1). The recorder samples this on an interval while recording; the
 * latest snapshot becomes the persisted `waveformPeaks` so playback renders
 * the same shape without decoding the file.
 */
export function computeWaveformPeaks(
  analyser: AnalyserNode,
  bars: number,
): number[] {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  const bucket = Math.floor(data.length / bars);
  const peaks: number[] = [];
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    for (let j = 0; j < bucket; j++) {
      const v = data[i * bucket + j]!;
      // Time-domain bytes are centred on 128; convert to a 0..1 amplitude.
      sum += Math.abs(v - 128) / 128;
    }
    peaks.push(Math.min(1, sum / bucket));
  }
  return peaks;
}

function messageTypeFor(file: File | undefined): string {
  if (file?.type.startsWith("image/")) return "IMAGE";
  if (file?.type.startsWith("video/")) return "VIDEO";
  if (file?.type.startsWith("audio/")) return "AUDIO";
  return "FILE";
}
