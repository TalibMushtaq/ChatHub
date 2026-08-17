import { describe, expect, it } from "vitest";
import { computeWaveformPeaks, pickAudioMime } from "../app/lib/attachments";
import { fmtDuration, lastText } from "../components/app/helpers";

describe("fmtDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(fmtDuration(0)).toBe("0:00");
    expect(fmtDuration(12)).toBe("0:12");
    expect(fmtDuration(75)).toBe("1:15");
    expect(fmtDuration(300)).toBe("5:00");
  });

  it("formats hours as h:mm:ss", () => {
    expect(fmtDuration(3600)).toBe("1:00:00");
    expect(fmtDuration(3661)).toBe("1:01:01");
  });

  it("clamps negative and fractional input", () => {
    expect(fmtDuration(-5)).toBe("0:00");
    expect(fmtDuration(12.6)).toBe("0:13");
  });
});

describe("computeWaveformPeaks", () => {
  // Minimal fake AnalyserNode: an 8-sample time-domain buffer centred on 128.
  const makeAnalyser = (samples: number[]) => ({
    fftSize: samples.length,
    getByteTimeDomainData: (data: Uint8Array) => {
      samples.forEach((v, i) => {
        data[i] = v;
      });
    },
  });

  it("downsamples time-domain data into amplitude bars in 0..1", () => {
    const analyser = makeAnalyser([128, 128, 160, 96, 128, 200, 56, 128]);
    const peaks = computeWaveformPeaks(analyser as unknown as AnalyserNode, 4);
    expect(peaks).toHaveLength(4);
    expect(peaks[0]).toBe(0); // [128,128] -> no deviation
    expect(peaks[1]).toBe(0.25); // [160,96] -> avg 32/128
    expect(peaks[3]).toBe(0.28125); // [56,128] -> avg 72/128 / 2
    peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it("clamps bar height to 1 for full-scale input", () => {
    const analyser = makeAnalyser([0, 0]);
    const peaks = computeWaveformPeaks(analyser as unknown as AnalyserNode, 1);
    expect(peaks[0]).toBe(1);
  });
});

describe("pickAudioMime", () => {
  it("prefers WebM/Opus when supported", () => {
    (globalThis as Record<string, unknown>).MediaRecorder = {
      isTypeSupported: (m: string) => m === "audio/webm;codecs=opus",
    };
    expect(pickAudioMime()).toBe("audio/webm");
  });

  it("falls back to mp4 when WebM is unsupported (Safari)", () => {
    (globalThis as Record<string, unknown>).MediaRecorder = {
      // Safari accepts MP4/AAC but not WebM; the recorder should pick mp4.
      isTypeSupported: (m: string) => m === "audio/mp4",
    };
    expect(pickAudioMime()).toBe("audio/mp4");
  });

  it("returns a sane default when MediaRecorder is missing", () => {
    delete (globalThis as Record<string, unknown>).MediaRecorder;
    expect(pickAudioMime()).toBe("audio/webm");
  });
});

describe("lastText (conversation-list previews)", () => {
  it("renders a voice message preview with its duration", () => {
    expect(
      lastText({
        content: null,
        messageType: "VOICE",
        attachments: [{ duration: 12 }],
      }),
    ).toBe("🎤 Voice message (0:12)");
  });

  it("renders a bare voice preview when duration is unknown", () => {
    expect(
      lastText({ content: null, messageType: "VOICE", attachments: [] }),
    ).toBe("🎤 Voice message");
  });

  it("falls back to content for text and labels for other media", () => {
    expect(
      lastText({ content: "hello", messageType: "TEXT", attachments: [] }),
    ).toBe("hello");
    expect(
      lastText({ content: null, messageType: "IMAGE", attachments: [] }),
    ).toBe("Photo");
    expect(lastText(null)).toBe("");
  });
});
