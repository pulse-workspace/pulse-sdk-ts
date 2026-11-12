import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../src/storage/memory";
import { StoredMessage, StoredConversation, OutboxItem } from "../src/storage/interface";

describe("MemoryStorageAdapter (Offline-First State Persistence)", () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it("persists and queries messages by clientMsgID and convID", async () => {
    const msg: StoredMessage = {
      clientMsgID: "client_uuid_1",
      convID: "conv_100",
      senderID: "alice",
      contentType: 101,
      content: { text: "Hello Bob!" },
      seq: 1,
      status: "SENT",
      sendTime: 1700000000,
      createdAt: 1700000000,
    };

    await storage.saveMessage(msg);

    const retrieved = await storage.getMessageByClientId("client_uuid_1");
    expect(retrieved).toEqual(msg);

    const list = await storage.getMessages("conv_100", 10);
    expect(list.length).toBe(1);
    expect(list[0]).toEqual(msg);
  });

  it("updates message status from PENDING to SENT with serverMsgID and seq", async () => {
    const pendingMsg: StoredMessage = {
      clientMsgID: "client_temp_99",
      convID: "conv_100",
      senderID: "alice",
      contentType: 101,
      content: { text: "Sending..." },
      seq: -1,
      status: "PENDING",
      sendTime: 1700000001,
      createdAt: 1700000001,
    };

    await storage.saveMessage(pendingMsg);
    expect((await storage.getMessageByClientId("client_temp_99"))?.status).toBe("PENDING");

    await storage.updateMessageStatus("client_temp_99", "SENT", "server_msg_id_888", 2);

    const updated = await storage.getMessageByClientId("client_temp_99");
    expect(updated?.status).toBe("SENT");
    expect(updated?.serverMsgID).toBe("server_msg_id_888");
    expect(updated?.seq).toBe(2);
  });

  it("manages Outbox queue: add, retrieve pending, and delete when finished", async () => {
    const item: OutboxItem = {
      clientMsgID: "outbox_1",
      convID: "conv_100",
      contentType: 101,
      content: { text: "Offline message" },
      retryCount: 0,
      createdAt: Date.now(),
    };

    await storage.saveOutbox(item);
    const pending = await storage.getPendingOutbox();
    expect(pending.length).toBe(1);
    expect(pending[0].clientMsgID).toBe("outbox_1");

    await storage.removeOutbox("outbox_1");
    expect((await storage.getPendingOutbox()).length).toBe(0);
  });

  it("saves and retrieves conversations sorted by updatedAt descending", async () => {
    const conv1: StoredConversation = {
      convID: "c1",
      convType: 1,
      title: "Conversation 1",
      unreadCount: 0,
      lastSeq: 5,
      updatedAt: 1000,
    };
    const conv2: StoredConversation = {
      convID: "c2",
      convType: 1,
      title: "Conversation 2",
      unreadCount: 2,
      lastSeq: 10,
      updatedAt: 2000,
    };

    await storage.saveConversation(conv1);
    await storage.saveConversation(conv2);

    const all = await storage.getAllConversations();
    expect(all.length).toBe(2);
    expect(all[0].convID).toBe("c2");
    expect(all[1].convID).toBe("c1");
  });
});
