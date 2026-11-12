/**
 * Binary data normalization utility across environments.
 * Converts browser ArrayBuffer, Blob, Node.js Buffer, or Uint8Array into a unified Uint8Array
 * suitable for MessagePack decoding.
 *
 * @param data Inbound socket data
 * @returns Unified Uint8Array
 * @throws Error if data is not a recognizable binary format
 */
export async function toUint8Array(data: any): Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error("Invalid socket message format: expected binary data");
}
