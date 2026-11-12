import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketTransport } from "../src/transport/websocket";
import { TransportConfig } from "../src/transport/types";
import { FrameHello, FrameWelcome, FrameSendMessage } from "../src/protocol/frames";
import { encodeFrame } from "../src/transport/codec";
import { WelcomePayload } from "../src/protocol/types";

// Mock WebSocket class for testing
class MockWebSocket {
  public static lastInstance: MockWebSocket | null = null;
  public url: string;
  public protocols: string[];
  public binaryType: string = "blob";
  public sentFrames: Uint8Array[] = [];

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: any }) => void) | null = null;
  public onerror: ((event: { message: string }) => void) | null = null;
  public onclose: (() => void) | null = null;

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.lastInstance = this;
  }

  public send(data: Uint8Array): void {
    this.sentFrames.push(data);
  }

  public close(): void {
    if (this.onclose) {
      this.onclose();
    }
  }

  public serverEmit(frameType: number, payload?: any): void {
    if (this.onmessage) {
      const bytes = encodeFrame(frameType, payload);
      this.onmessage({ data: bytes });
    }
  }
}

describe("WebSocketTransport Lifecycle & Binary Framing", () => {
  const originalWebSocket = (globalThis as any).WebSocket;

  const validConfig: TransportConfig = {
    gatewayUrl: "ws://localhost:32001/ws",
    token: "valid-jwt-token",
    platform: "WEB",
    deviceId: "device-test-01",
    heartbeatIntervalMs: 5000,
    reconnectBaseDelayMs: 50,
    reconnectMaxDelayMs: 200,
    maxReconnectAttempts: 3,
    handshakeTimeoutMs: 1000,
  };

  beforeEach(() => {
    (globalThis as any).WebSocket = MockWebSocket;
    MockWebSocket.lastInstance = null;
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
  });

  it("fail-fast: throws immediately when missing required configuration", () => {
    expect(() => new WebSocketTransport({} as any)).toThrowError(/gatewayUrl/);
    expect(() => new WebSocketTransport({ ...validConfig, gatewayUrl: "http://invalid" })).toThrowError(/ws:\/\//);
    expect(() => new WebSocketTransport({ ...validConfig, token: "" })).toThrowError(/token/);
    expect(() => new WebSocketTransport({ ...validConfig, heartbeatIntervalMs: 0 })).toThrowError(/heartbeatIntervalMs/);
  });

  it("completes handshake flow: open socket -> send FrameHello -> receive FrameWelcome", async () => {
    const transport = new WebSocketTransport(validConfig);
    const connectPromise = transport.connect();

    const mockSocket = MockWebSocket.lastInstance;
    expect(mockSocket).not.toBeNull();
    expect(mockSocket?.protocols).toContain("pulse.protocol.v1.msgpack");

    mockSocket?.onopen?.();
    expect(mockSocket?.sentFrames.length).toBe(1);

    const welcomeInfo: WelcomePayload = {
      session_id: "sess_abc_123",
      user_id: "alice",
      cell_id: "cell_0",
    };
    mockSocket?.serverEmit(FrameWelcome, welcomeInfo);

    const session = await connectPromise;
    expect(session).toEqual(welcomeInfo);
    expect(transport.getState()).toBe("CONNECTED");
    expect(transport.getSession()).toEqual(welcomeInfo);

    transport.disconnect();
    expect(transport.getState()).toBe("DISCONNECTED");
  });

  it("allows sending binary frames when in CONNECTED state", async () => {
    const transport = new WebSocketTransport(validConfig);
    const connectPromise = transport.connect();
    const mockSocket = MockWebSocket.lastInstance!;
    mockSocket.onopen?.();
    mockSocket.serverEmit(FrameWelcome, { session_id: "s1", user_id: "u1", cell_id: "c0" });
    await connectPromise;

    transport.send(FrameSendMessage, { c: "conv_1", t: 101, x: { text: "hello" }, i: "msg_1" });
    expect(mockSocket.sentFrames.length).toBe(2);

    transport.disconnect();
  });

  it("rejects frame dispatch when not in CONNECTED state", () => {
    const transport = new WebSocketTransport(validConfig);
    expect(() => transport.send(FrameSendMessage, {})).toThrowError(/socket not connected/);
  });
});
