import { IStorageAdapter, StoredConversation } from "../storage/interface";
import { WebSocketTransport } from "../transport/websocket";
import { FrameMarkRead } from "../protocol/frames";
import { MarkReadPayload } from "../protocol/types";

/**
 * ConversationManager manages conversation queries, local cache reads, and read receipt signaling.
 */
export class ConversationManager {
  private readonly storage: IStorageAdapter;
  private readonly transport: WebSocketTransport;

  /**
   * Initializes ConversationManager.
   */
  constructor(storage: IStorageAdapter, transport: WebSocketTransport) {
    if (!storage || !transport) {
      throw new Error("ConversationManager initialization arguments cannot be null or undefined");
    }
    this.storage = storage;
    this.transport = transport;
  }

  /**
   * Retrieves all conversations from local storage sorted by updatedAt descending.
   * Instant 0ms response served from local persistent cache (Offline-First).
   */
  public async getConversations(): Promise<StoredConversation[]> {
    return this.storage.getAllConversations();
  }

  /**
   * Retrieves conversation metadata by convID.
   */
  public async getConversation(convID: string): Promise<StoredConversation | null> {
    if (!convID || convID.trim().length === 0) {
      throw new Error("convID cannot be empty");
    }
    return this.storage.getConversation(convID);
  }

  /**
   * Marks a conversation as read up to serverMsgID.
   * Resets local unreadCount to 0 and dispatches FrameMarkRead to Gateway if connected.
   *
   * @param convID Target conversation ID
   * @param serverMsgID Last read server message ID
   */
  public async markAsRead(convID: string, serverMsgID: string): Promise<void> {
    if (!convID || !serverMsgID) {
      throw new Error("convID and serverMsgID cannot be empty when marking as read");
    }

    // 1. Update local storage
    const conv = await this.storage.getConversation(convID);
    if (conv) {
      conv.unreadCount = 0;
      await this.storage.saveConversation(conv);
    }

    // 2. Transmit FrameMarkRead to Gateway if connected
    if (this.transport.getState() === "CONNECTED") {
      const payload: MarkReadPayload = {
        c: convID,
        m: serverMsgID,
      };
      this.transport.send(FrameMarkRead, payload);
    }
  }
}
