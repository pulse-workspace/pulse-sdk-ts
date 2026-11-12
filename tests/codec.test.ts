import { describe, it, expect } from "vitest";
import { encodeFrame, decodeRawFrame, decodeFrame } from "../src/transport/codec";
import { FrameHello, FrameWelcome, FrameSendMessage } from "../src/protocol/frames";
import { HelloPayload, SendMsgPayload } from "../src/protocol/types";

describe("Pulse Frame Codec (Binary 6-byte Header + MessagePack)", () => {
  it("encodes and decodes FrameHello with payload successfully", () => {
    const payload: HelloPayload = {
      t: "test-jwt-token",
      p: "WEB",
      d: "device-123",
    };

    const encoded = encodeFrame(FrameHello, payload);
    expect(encoded.byteLength).toBeGreaterThan(6);

    const raw = decodeRawFrame(encoded);
    expect(raw.frameType).toBe(FrameHello);
    expect(raw.payloadBytes.byteLength).toBe(encoded.byteLength - 6);

    const decoded = decodeFrame<HelloPayload>(encoded);
    expect(decoded.frameType).toBe(FrameHello);
    expect(decoded.payload).toEqual(payload);
  });

  it("encodes and decodes frame without body successfully", () => {
    const FramePingCode = 80;
    const encoded = encodeFrame(FramePingCode);
    expect(encoded.byteLength).toBe(6);

    const decoded = decodeFrame(encoded);
    expect(decoded.frameType).toBe(FramePingCode);
    expect(decoded.payload).toBeNull();
  });

  it("encodes and decodes complex FrameSendMessage frame", () => {
    const payload: SendMsgPayload = {
      c: "conv_test_999",
      t: 101,
      x: { text: "Hello Pulse IM!", meta: { clientTs: 1700000000 } },
      i: "client_uuid_456",
    };

    const encoded = encodeFrame(FrameSendMessage, payload);
    const decoded = decodeFrame<SendMsgPayload>(encoded);

    expect(decoded.frameType).toBe(FrameSendMessage);
    expect(decoded.payload?.c).toBe("conv_test_999");
    expect(decoded.payload?.t).toBe(101);
    expect(decoded.payload?.x.text).toBe("Hello Pulse IM!");
    expect(decoded.payload?.i).toBe("client_uuid_456");
  });

  it("throws fail-fast error when frame is smaller than 6 bytes", () => {
    const corruptData = new Uint8Array([0, 1, 2]);
    expect(() => decodeRawFrame(corruptData)).toThrowError(/smaller than minimum header size/);
  });

  it("throws fail-fast error when payload is truncated relative to header declaration", () => {
    const buffer = new Uint8Array(8);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, FrameWelcome, false);
    view.setUint32(2, 50, false);

    expect(() => decodeRawFrame(buffer)).toThrowError(/Truncated frame/);
  });
});
