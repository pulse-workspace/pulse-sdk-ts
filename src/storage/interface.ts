/**
 * Interfaces and entity models for the Offline-First Local Storage layer.
 */

/**
 * Message transmission status on the client.
 */
export type MessageStatus = "PENDING" | "SENT" | "FAILED";

/**
 * Stored message representation in client-side persistent storage.
 */
export interface StoredMessage {
  clientMsgID: string;            // Temporary client-generated ID
  serverMsgID?: string;           // Authoritative server-generated ID
  convID: string;                 // Conversation ID
  senderID: string;               // Sender user ID
  contentType: number;            // Content type identifier
  content: Record<string, any>;   // Content payload
  seq: number;                    // convSeq counter (-1 if PENDING)
  status: MessageStatus;          // Transmission state
  sendTime: number;               // Timestamp in ms
  createdAt: number;              // Local creation timestamp in ms
}

/**
 * Stored conversation representation in client storage.
 */
export interface StoredConversation {
  convID: string;                 // Conversation ID
  convType: number;               // Conversation type (1: single, 2: group)
  title?: string;                 // Conversation title
  unreadCount: number;            // Unread messages count
  lastSeq: number;                // Highest convSeq recorded
  lastMessage?: StoredMessage;    // Latest message preview
  updatedAt: number;              // Last updated timestamp
}

/**
 * Outbox queue item awaiting dispatch to the Gateway.
 */
export interface OutboxItem {
  clientMsgID: string;            // Client temporary tracking ID
  convID: string;                 // Target conversation ID
  contentType: number;            // Content type
  content: Record<string, any>;   // Content payload
  retryCount: number;             // Dispatch retry counter
  createdAt: number;              // Outbox insertion timestamp
}

/**
 * Contract for persistent storage adapters (IndexedDB, In-Memory, SQLite).
 */
export interface IStorageAdapter {
  /**
   * Persists or updates a message in local storage.
   */
  saveMessage(msg: StoredMessage): Promise<void>;

  /**
   * Queries message by client-generated ID.
   */
  getMessageByClientId(clientMsgID: string): Promise<StoredMessage | null>;

  /**
   * Retrieves messages for a conversation ordered chronologically with optional pagination.
   */
  getMessages(convID: string, limit: number, beforeSeq?: number): Promise<StoredMessage[]>;

  /**
   * Updates message status upon receiving FrameMessageAck from Gateway.
   */
  updateMessageStatus(
    clientMsgID: string,
    status: MessageStatus,
    serverMsgID?: string,
    seq?: number
  ): Promise<void>;

  /**
   * Saves or updates conversation metadata.
   */
  saveConversation(conv: StoredConversation): Promise<void>;

  /**
   * Retrieves conversation metadata by convID.
   */
  getConversation(convID: string): Promise<StoredConversation | null>;

  /**
   * Retrieves all conversations sorted by updatedAt descending.
   */
  getAllConversations(): Promise<StoredConversation[]>;

  /**
   * Retrieves the highest convSeq for a conversation.
   */
  getLatestSeq(convID: string): Promise<number>;

  /**
   * Inserts an item into the Outbox dispatch queue.
   */
  saveOutbox(item: OutboxItem): Promise<void>;

  /**
   * Retrieves all pending Outbox items awaiting dispatch.
   */
  getPendingOutbox(): Promise<OutboxItem[]>;

  /**
   * Removes an item from Outbox after confirmed delivery.
   */
  removeOutbox(clientMsgID: string): Promise<void>;

  /**
   * Wipes all stored client data (e.g. on user logout).
   */
  clearAll(): Promise<void>;
}
