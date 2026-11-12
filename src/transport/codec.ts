import { encode, decode } from "@msgpack/msgpack";

/**
 * Raw binary frame decoding result.
 */
export interface RawFrame {
  frameType: number;
  payloadBytes: Uint8Array;
}

/**
 * Fully decoded frame with deserialized MessagePack payload.
 */
export interface DecodedFrame<T = any> {
  frameType: number;
  payload: T | null;
}

const HEADER_SIZE_BYTES = 6;

/**
 * Encodes a frame into Pulse wire protocol binary format.
 * Frame layout: 2 bytes frameType (uint16 BigEndian) + 4 bytes payload length (uint32 BigEndian) + MsgPack body.
 *
 * @param frameType 16-bit integer identifying frame category
 * @param payload Object payload to serialize via MessagePack
 * @returns Serialized Uint8Array ready for transmission over WebSocket
 */
export function encodeFrame(frameType: number, payload?: any): Uint8Array {
  let bodyBytes: Uint8Array | null = null;
  if (payload !== undefined && payload !== null) {
    bodyBytes = encode(payload);
  }

  const bodyLength = bodyBytes ? bodyBytes.length : 0;
  const totalLength = HEADER_SIZE_BYTES + bodyLength;
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Write uint16 frameType (Big-Endian)
  view.setUint16(0, frameType, false);
  // Write uint32 payloadLength (Big-Endian)
  view.setUint32(2, bodyLength, false);

  // Copy MsgPack body payload
  if (bodyBytes && bodyLength > 0) {
    buffer.set(bodyBytes, HEADER_SIZE_BYTES);
  }

  return buffer;
}

/**
 * Extracts the 6-byte header and slices the raw payload bytes.
 * Validates header bounds and payload completeness.
 *
 * @param raw Raw binary packet received from WebSocket
 * @returns RawFrame containing frameType and sliced payloadBytes
 * @throws Error if buffer length is smaller than header or declared payload size
 */
export function decodeRawFrame(raw: Uint8Array): RawFrame {
  if (raw.byteLength < HEADER_SIZE_BYTES) {
    throw new Error(
      `Invalid frame: received ${raw.byteLength} bytes, smaller than minimum header size (${HEADER_SIZE_BYTES} bytes)`
    );
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const frameType = view.getUint16(0, false);
  const declaredLength = view.getUint32(2, false);

  const availablePayloadLength = raw.byteLength - HEADER_SIZE_BYTES;
  if (availablePayloadLength < declaredLength) {
    throw new Error(
      `Truncated frame: header declared ${declaredLength} bytes but only ${availablePayloadLength} bytes received`
    );
  }

  const payloadBytes = raw.subarray(HEADER_SIZE_BYTES, HEADER_SIZE_BYTES + declaredLength);
  return { frameType, payloadBytes };
}

/**
 * Decodes a complete binary frame including its MessagePack payload.
 *
 * @param raw Raw binary packet
 * @returns DecodedFrame with frameType and deserialized payload
 */
export function decodeFrame<T = any>(raw: Uint8Array): DecodedFrame<T> {
  const { frameType, payloadBytes } = decodeRawFrame(raw);

  if (payloadBytes.byteLength === 0) {
    return { frameType, payload: null };
  }

  const payload = decode(payloadBytes) as T;
  return { frameType, payload };
}
