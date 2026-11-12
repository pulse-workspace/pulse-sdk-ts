import { IStorageAdapter, StoredMessage, StoredConversation, OutboxItem, MessageStatus } from "./interface";

/**
 * In-memory storage adapter implementation.
 * Suitable for Unit Testing, Node.js SSR, and non-browser runtimes.
 */
export class MemoryStorageAdapter implements IStorageAdapter {
  private messagesByClient = new Map<string, StoredMessage>();
  private messagesByConv = new Map<string, StoredMessage[]>();
  private conversations = new Map<string, StoredConversation>();
  private outbox = new Map<string, OutboxItem>();

  /**
   * Persists message to memory maps.
   */
  public async saveMessage(msg: StoredMessage): Promise<void> {
    if (!msg || (!msg.clientMsgID && !msg.serverMsgID) || !msg.convID) {
      throw new Error("Failed to save message: invalid message structure");
    }

    if (!msg.clientMsgID && msg.serverMsgID) {
      msg.clientMsgID = msg.serverMsgID;
    }

    this.messagesByClient.set(msg.clientMsgID, { ...msg });

    const list = this.messagesByConv.get(msg.convID) || [];
    const existingIndex = list.findIndex((m) => m.clientMsgID === msg.clientMsgID);

    if (existingIndex >= 0) {
      list[existingIndex] = { ...msg };
    } else {
      list.push({ ...msg });
    }

    // Sort ascending by sequence counter
    list.sort((a, b) => {
      if (a.seq !== -1 && b.seq !== -1) return a.seq - b.seq;
      return a.createdAt - b.createdAt;
    });

    this.messagesByConv.set(msg.convID, list);
  }

  /**
   * Retrieves message by clientMsgID from memory.
   */
  public async getMessageByClientId(clientMsgID: string): Promise<StoredMessage | null> {
    const found = this.messagesByClient.get(clientMsgID);
    return found ? { ...found } : null;
  }

  /**
   * Retrieves paginated messages for a conversation.
   */
  public async getMessages(convID: string, limit: number, beforeSeq?: number): Promise<StoredMessage[]> {
    if (limit <= 0) {
      throw new Error("Limit argument must be a positive integer");
    }

    const list = this.messagesByConv.get(convID) || [];
    let filtered = list;

    if (typeof beforeSeq === "number") {
      filtered = list.filter((m) => m.seq !== -1 && m.seq < beforeSeq);
    }

    const start = Math.max(0, filtered.length - limit);
    return filtered.slice(start).map((m) => ({ ...m }));
  }

  /**
   * Updates message status upon receiving server acknowledgment.
   */
  public async updateMessageStatus(
    clientMsgID: string,
    status: MessageStatus,
    serverMsgID?: string,
    seq?: number
  ): Promise<void> {
    const existing = this.messagesByClient.get(clientMsgID);
    if (!existing) {
      return;
    }

    existing.status = status;
    if (serverMsgID) existing.serverMsgID = serverMsgID;
    if (typeof seq === "number") existing.seq = seq;

    await this.saveMessage(existing);
  }

  /**
   * Persists conversation metadata to memory.
   */
  public async saveConversation(conv: StoredConversation): Promise<void> {
    if (!conv || !conv.convID) {
      throw new Error("Failed to save conversation: convID cannot be empty");
    }
    this.conversations.set(conv.convID, { ...conv });
  }

  /**
   * Retrieves conversation metadata by convID.
   */
  public async getConversation(convID: string): Promise<StoredConversation | null> {
    const conv = this.conversations.get(convID);
    return conv ? { ...conv } : null;
  }

  /**
   * Retrieves all conversations sorted by updatedAt descending.
   */
  public async getAllConversations(): Promise<StoredConversation[]> {
    const all = Array.from(this.conversations.values());
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    return all.map((c) => ({ ...c }));
  }

  /**
   * Retrieves highest sequence counter for a conversation.
   */
  public async getLatestSeq(convID: string): Promise<number> {
    const conv = this.conversations.get(convID);
    if (conv) return conv.lastSeq;

    const list = this.messagesByConv.get(convID) || [];
    let max = 0;
    for (const m of list) {
      if (m.seq > max) max = m.seq;
    }
    return max;
  }

  /**
   * Inserts an item into the Outbox queue.
   */
  public async saveOutbox(item: OutboxItem): Promise<void> {
    if (!item || !item.clientMsgID) {
      throw new Error("Failed to save Outbox item: clientMsgID cannot be empty");
    }
    this.outbox.set(item.clientMsgID, { ...item });
  }

  /**
   * Retrieves pending items from the Outbox queue.
   */
  public async getPendingOutbox(): Promise<OutboxItem[]> {
    const all = Array.from(this.outbox.values());
    all.sort((a, b) => a.createdAt - b.createdAt);
    return all.map((i) => ({ ...i }));
  }

  /**
   * Deletes an item from the Outbox queue.
   */
  public async removeOutbox(clientMsgID: string): Promise<void> {
    this.outbox.delete(clientMsgID);
  }

  /**
   * Clears all in-memory structures.
   */
  public async clearAll(): Promise<void> {
    this.messagesByClient.clear();
    this.messagesByConv.clear();
    this.conversations.clear();
    this.outbox.clear();
  }
}
