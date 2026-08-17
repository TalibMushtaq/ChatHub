-- Precomputed waveform amplitude samples for voice-message attachments so
-- playback renders the waveform without decoding the audio file client-side.
ALTER TABLE "Attachment" ADD COLUMN "waveformPeaks" JSONB;