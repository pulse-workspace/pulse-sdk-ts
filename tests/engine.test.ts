import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../src/storage/memory";
import { WebSocketTransport } from "../src/transport/websocket";
import { OutboxEngine } from "../src/engine/outbox";
import { SyncEngine } from "../src/engine/sync";
import { AckMsgPayload, RecvMsgPayload } from "../src/protocol/types";

describe("OutboxEngine & SyncEngine (Optimistic UI & Gapless Sequencing)", () => {
  let storage: MemoryStorageAdapter;
  let transport: WebSocketTransport;
  let outbox: OutboxEngine;
  let sync: SyncEngine;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    transport = new WebSocketTransport({
      gatewayUrl: "ws://localhost:32001/ws",
      token: "dummy-token",
      platform: "WEB",
      deviceId: "dev-01",
      heartbeatIntervalMs: 10000,
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 500,
      maxReconnectAttempts: 2,
      handshakeTimeoutMs: 1000,
    });
    outbox = new OutboxEngine(storage, transport, { ackTimeoutMs: 500 });
    sync = new SyncEngine(storage, transport);
  });

  it("Outbox: sending message immediately emits optimistic event and stores local PENDING message", async () => {
    let optimisticEmitted = false;
    outbox.onEvent((event, msg) => {
      if (event === "optimistic") {
        optimisticEmitted = true;
        expect(msg.status).toBe("PENDING");
        expect(msg.seq).toBe(-1);
      }
    });

    const msg = await outbox.enqueueMessage("conv_10", "alice", 101, { text: "Hello Bob" });

    expect(optimisticEmitted).toBe(true);
    const stored = await storage.getMessageByClientId(msg.clientMsgID);
    expect(stored?.status).toBe("PENDING");

    const pendingOutbox = await storage.getPendingOutbox();
    expect(pendingOutbox.length).toBe(1);
  });

  it("Outbox: upon receiving FrameMessageAck, updates status to SENT and removes from outbox", async () => {
    const msg = await outbox.enqueueMessage("conv_10", "alice", 101, { text: "Hi" });

    let sentEmitted = false;
    outbox.onEvent((event, updatedMsg) => {
      if (event === "sent") {
        sentEmitted = true;
        expect(updatedMsg.status).toBe("SENT");
        expect(updatedMsg.serverMsgID).toBe("server_msg_999");
        expect(updatedMsg.seq).toBe(1);
      }
    });

    const ack: AckMsgPayload = {
      convID: "conv_10",
      serverMsgID: "server_msg_999",
      clientMsgID: msg.clientMsgID,
      seq: 1,
      sendTime: Date.now(),
    };

    await (outbox as any).handleMessageAck(ack);

    expect(sentEmitted).toBe(true);
    const stored = await storage.getMessageByClientId(msg.clientMsgID);
    expect(stored?.status).toBe("SENT");
    expect(stored?.seq).toBe(1);

    const pending = await storage.getPendingOutbox();
    expect(pending.length).toBe(0);
  });

  it("SyncEngine: ingests sequential messages seq=1 and seq=2 and updates conversation", async () => {
    const receivedMsgs: any[] = [];
    sync.onMessage((m) => receivedMsgs.push(m));

    const msg1: RecvMsgPayload = {
      convID: "c1",
      serverMsgID: "s1",
      clientMsgID: "c1",
      senderID: "bob",
      contentType: 101,
      content: { text: "Message 1" },
      seq: 1,
      sendTime: 1000,
    };
    const msg2: RecvMsgPayload = {
      convID: "c1",
      serverMsgID: "s2",
      clientMsgID: "c2",
      senderID: "bob",
      contentType: 101,
      content: { text: "Message 2" },
      seq: 2,
      sendTime: 2000,
    };

    await (sync as any).handleMessageRecv(msg1);
    await (sync as any).handleMessageRecv(msg2);

    expect(receivedMsgs.length).toBe(2);
    expect(receivedMsgs[0].seq).toBe(1);
    expect(receivedMsgs[1].seq).toBe(2);

    const conv = await storage.getConversation("c1");
    expect(conv?.lastSeq).toBe(2);
  });

  it("SyncEngine: detects sequence Gap when receiving seq=5 while at seq=1", async () => {
    await (sync as any).handleMessageRecv({
      convID: "c1",
      serverMsgID: "s1",
      clientMsgID: "c1",
      senderID: "bob",
      contentType: 101,
      content: { text: "Message 1" },
      seq: 1,
      sendTime: 1000,
    });

    let gapDetected = false;
    sync.onGap((convID, fromSeq, toSeq) => {
      gapDetected = true;
      expect(convID).toBe("c1");
      expect(fromSeq).toBe(2);
      expect(toSeq).toBe(4);
    });

    await (sync as any).handleMessageRecv({
      convID: "c1",
      serverMsgID: "s5",
      clientMsgID: "c5",
      senderID: "bob",
      contentType: 101,
      content: { text: "Message 5" },
      seq: 5,
      sendTime: 5000,
    });

    expect(gapDetected).toBe(true);

    await sync.applyCatchUpMessages("c1", [
      { convID: "c1", serverMsgID: "s2", clientMsgID: "c2", senderID: "bob", contentType: 101, content: {}, seq: 2, sendTime: 2000 },
      { convID: "c1", serverMsgID: "s3", clientMsgID: "c3", senderID: "bob", contentType: 101, content: {}, seq: 3, sendTime: 3000 },
      { convID: "c1", serverMsgID: "s4", clientMsgID: "c4", senderID: "bob", contentType: 101, content: {}, seq: 4, sendTime: 4000 },
    ]);

    const conv = await storage.getConversation("c1");
    expect(conv?.lastSeq).toBe(5);
  });
});
