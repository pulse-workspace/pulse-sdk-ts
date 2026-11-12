import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PulseClient } from "../src/client";
import { MemoryStorageAdapter } from "../src/storage/memory";
import { FrameWelcome, FrameMessageAck, FrameMessageRecv } from "../src/protocol/frames";
import { encodeFrame } from "../src/transport/codec";
import { WelcomePayload, AckMsgPayload, RecvMsgPayload } from "../src/protocol/types";

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
    if (this.onclose) this.onclose();
  }

  public serverEmit(frameType: number, payload?: any): void {
    if (this.onmessage) {
      const bytes = encodeFrame(frameType, payload);
      this.onmessage({ data: bytes });
    }
  }
}

describe("PulseClient High-Level Facade E2E", () => {
  const originalWebSocket = (globalThis as any).WebSocket;

  beforeEach(() => {
    (globalThis as any).WebSocket = MockWebSocket;
    MockWebSocket.lastInstance = null;
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
  });

  const createClient = (storage = new MemoryStorageAdapter()) => {
    return new PulseClient({
      gatewayUrl: "ws://localhost:32001/ws",
      token: "jwt-token-alice",
      platform: "WEB",
      deviceId: "browser-alice-01",
      storage,
      heartbeatIntervalMs: 15000,
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 1000,
      maxReconnectAttempts: 3,
      handshakeTimeoutMs: 2000,
      ackTimeoutMs: 1000,
      typingStopDelayMs: 500,
    });
  };

  it("fail-fast: throws when missing required configuration", () => {
    expect(() => new PulseClient({} as any)).toThrowError(/storage/);
  });

  it("connects successfully and emits 'connected' with session info", async () => {
    const client = createClient();
    let connectedSession: WelcomePayload | null = null;
    client.on("connected", (s: WelcomePayload) => {
      connectedSession = s;
    });

    const connectPromise = client.connect();
    const ws = MockWebSocket.lastInstance!;
    ws.onopen?.();

    const welcome: WelcomePayload = {
      session_id: "sess_001",
      user_id: "alice",
      cell_id: "cell_0",
    };
    ws.serverEmit(FrameWelcome, welcome);

    const res = await connectPromise;
    expect(res).toEqual(welcome);
    expect(connectedSession).toEqual(welcome);
    expect(client.getState()).toBe("CONNECTED");

    client.disconnect();
  });

  it("sends optimistic message -> receives FrameMessageAck -> marks SENT", async () => {
    const storage = new MemoryStorageAdapter();
    const client = createClient(storage);

    const connectPromise = client.connect();
    const ws = MockWebSocket.lastInstance!;
    ws.onopen?.();
    ws.serverEmit(FrameWelcome, { session_id: "s1", user_id: "alice", cell_id: "c0" });
    await connectPromise;

    let optimisticCaught = false;
    let sentCaught = false;

    client.on("message:optimistic", (m: any) => {
      optimisticCaught = true;
      expect(m.status).toBe("PENDING");
      expect(m.content.text).toBe("Hello Bob!");
    });

    client.on("message:sent", (m: any) => {
      sentCaught = true;
      expect(m.status).toBe("SENT");
      expect(m.serverMsgID).toBe("server_msg_777");
      expect(m.seq).toBe(10);
    });

    const pendingMsg = await client.message.sendText("conv_bob", "Hello Bob!");
    expect(optimisticCaught).toBe(true);
    expect(ws.sentFrames.length).toBe(2);

    const ack: AckMsgPayload = {
      convID: "conv_bob",
      serverMsgID: "server_msg_777",
      clientMsgID: pendingMsg.clientMsgID,
      seq: 10,
      sendTime: Date.now(),
    };
    ws.serverEmit(FrameMessageAck, ack);

    await new Promise((r) => setTimeout(r, 10));
    expect(sentCaught).toBe(true);

    client.disconnect();
  });

  it("receives inbound message and emits 'message:new'", async () => {
    const storage = new MemoryStorageAdapter();
    const client = createClient(storage);

    const connectPromise = client.connect();
    const ws = MockWebSocket.lastInstance!;
    ws.onopen?.();
    ws.serverEmit(FrameWelcome, { session_id: "s1", user_id: "alice", cell_id: "c0" });
    await connectPromise;

    let newMsgCaught: any = null;
    client.on("message:new", (m: any) => {
      newMsgCaught = m;
    });

    const incoming: RecvMsgPayload = {
      convID: "conv_bob",
      serverMsgID: "s_bob_1",
      clientMsgID: "c_bob_1",
      senderID: "bob",
      contentType: 101,
      content: { text: "Hello Alice!" },
      seq: 1,
      sendTime: 123456,
    };
    ws.serverEmit(FrameMessageRecv, incoming);

    await new Promise((r) => setTimeout(r, 10));
    expect(newMsgCaught).not.toBeNull();
    expect(newMsgCaught.content.text).toBe("Hello Alice!");

    const convs = await client.conversation.getConversations();
    expect(convs.length).toBe(1);
    expect(convs[0].unreadCount).toBe(1);

    await client.conversation.markAsRead("conv_bob", "s_bob_1");
    const updatedConvs = await client.conversation.getConversations();
    expect(updatedConvs[0].unreadCount).toBe(0);

    client.disconnect();
  });
});
