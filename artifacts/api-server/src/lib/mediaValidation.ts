export class MediaValidationError extends Error {
  constructor(
    public readonly code: "invalid_media" | "payload_too_large",
    message: string,
  ) {
    super(message);
  }
}

type DecodedMedia = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

function decodeBase64(value: unknown, maxBytes: number): Buffer {
  if (typeof value !== "string") {
    throw new MediaValidationError("invalid_media", "Expected base64 string");
  }
  const input = value.trim();
  if (!input) {
    throw new MediaValidationError("invalid_media", "Expected base64 string");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input) || /=[^=]/.test(input)) {
    throw new MediaValidationError("invalid_media", "Invalid base64 payload");
  }

  const buffer = Buffer.from(input, "base64");
  const normalizedInput = input.replace(/=+$/, "");
  const normalizedRoundTrip = buffer.toString("base64").replace(/=+$/, "");
  if (!buffer.length || normalizedInput !== normalizedRoundTrip) {
    throw new MediaValidationError("invalid_media", "Invalid base64 payload");
  }
  if (buffer.length > maxBytes) {
    throw new MediaValidationError("payload_too_large", "Payload is too large");
  }
  return buffer;
}

function hasPrefix(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function isMp4Like(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

function isWav(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  );
}

function isMp3(buffer: Buffer): boolean {
  return (
    hasPrefix(buffer, [0x49, 0x44, 0x33]) ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  );
}

export function validateImageBase64(value: unknown, maxBytes: number): DecodedMedia {
  const buffer = decodeBase64(value, maxBytes);
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) {
    return { buffer, mimeType: "image/jpeg", extension: "jpg" };
  }
  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { buffer, mimeType: "image/png", extension: "png" };
  }
  if (isWebp(buffer)) {
    return { buffer, mimeType: "image/webp", extension: "webp" };
  }
  throw new MediaValidationError("invalid_media", "Unsupported image payload");
}

export function validateAudioBase64(value: unknown, maxBytes: number): DecodedMedia {
  const buffer = decodeBase64(value, maxBytes);
  if (isMp3(buffer)) {
    return { buffer, mimeType: "audio/mpeg", extension: "mp3" };
  }
  if (isMp4Like(buffer)) {
    return { buffer, mimeType: "audio/mp4", extension: "m4a" };
  }
  if (isWav(buffer)) {
    return { buffer, mimeType: "audio/wav", extension: "wav" };
  }
  if (hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { buffer, mimeType: "audio/webm", extension: "webm" };
  }
  // "OggS" — Ogg container (Opus/Vorbis). Firefox's MediaRecorder produces
  // audio/ogg on the web path, and Whisper accepts .ogg uploads.
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return { buffer, mimeType: "audio/ogg", extension: "ogg" };
  }
  throw new MediaValidationError("invalid_media", "Unsupported audio payload");
}

export function mediaErrorStatus(err: MediaValidationError): 400 | 413 {
  return err.code === "payload_too_large" ? 413 : 400;
}
