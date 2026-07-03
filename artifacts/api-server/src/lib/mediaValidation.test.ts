import { describe, expect, it } from "vitest";
import {
  MediaValidationError,
  validateAudioBase64,
  validateImageBase64,
} from "./mediaValidation";

describe("media validation", () => {
  it("accepts magic-byte-valid JPEG payloads", () => {
    const image = validateImageBase64("/9j/", 10);

    expect(image.mimeType).toBe("image/jpeg");
    expect(image.extension).toBe("jpg");
  });

  it("rejects malformed base64", () => {
    expect(() => validateImageBase64("not-base64", 10)).toThrow(
      MediaValidationError,
    );
  });

  it("rejects decoded payloads over the byte cap", () => {
    const payload = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(8),
    ]).toString("base64");

    try {
      validateImageBase64(payload, 4);
      throw new Error("expected validation failure");
    } catch (err) {
      expect(err).toBeInstanceOf(MediaValidationError);
      expect((err as MediaValidationError).code).toBe("payload_too_large");
    }
  });

  it("detects common audio containers", () => {
    const mp3 = validateAudioBase64(Buffer.from("ID3abc").toString("base64"), 20);
    const wav = validateAudioBase64(
      Buffer.from("RIFFxxxxWAVEdata").toString("base64"),
      32,
    );
    const ogg = validateAudioBase64(
      Buffer.from("OggSxxxxxxxx").toString("base64"),
      32,
    );

    expect(mp3.mimeType).toBe("audio/mpeg");
    expect(wav.mimeType).toBe("audio/wav");
    expect(ogg.mimeType).toBe("audio/ogg");
    expect(ogg.extension).toBe("ogg");
  });
});
