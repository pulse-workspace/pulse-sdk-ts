import { IStorageAdapter, StoredMessage, OutboxItem } from "../storage/interface";
import { WebSocketTransport } from "../transport/websocket";
import { FrameSendMessage, FrameMessageAck } from "../protocol/frames";
import { SendMsgPayload, AckMsgPayload } from "../protocol/types";

export type OutboxEventListener = (event: "optimistic" | "sent" | "failed", msg: StoredMessage) => void;

/**
 * Configuration options for OutboxEngine.
 */
export interface OutboxConfig {
  ackTimeoutMs: number; // Duration to wait for FrameMessageAck before marking message as failed (ms)
}

/**
 * Manages the client-side Outbox Queue and Optimistic UI updates.
 * Provides immediate local UI response (0ms latency), persistent storage,
 * and automatic retry dispatch upon network recovery.
 */
export class OutboxEngine {
  private readonly storage: IStorageAdapter;
  private readonly transport: WebSocketTransport;
  private readonly config: OutboxConfig;
  private readonly listeners: Set<OutboxEventListener> = new Set();
  private readonly pendingTimers = new Map<string, any>();

  /**
   * Initializes OutboxEngine with storage adapter, transport, and timeout configuration.
   */
  constructor(storage: IStorageAdapter, transport: WebSocketTransport, config: OutboxConfig) {
    if (!storage || !transport || !config) {
      throw new Error("OutboxEngine initialization arguments cannot be null or undefined");
    }
    if (typeof config.ackTimeoutMs !== "number" || config.ackTimeoutMs <= 0) {
      throw new Error("ackTimeoutMs must be a positive integer greater than zero");
    }

    this.storage = storage;
    this.transport = transport;
    this.config = config;

    // Listen for incoming server frames
    this.transport.onFrame((frameType, payload) => {
      if (frameType === FrameMessageAck) {
        this.handleMessageAck(payload as AckMsgPayload);
      }
    });

    // Auto-flush pending queue when transport reconnects
    this.transport.onStateChange((state) => {
      if (state === "CONNECTED") {
        this.flushPendingQueue();
      }
    });
  }

  /**
   * Subscribes to message lifecycle events ('optimistic', 'sent', 'failed').
   */
  public onEvent(listener: OutboxEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Enqueues a message for transmission using Optimistic UI.
   *
   * @param convID Target conversation ID
   * @param senderID Current user ID
   * @param contentType Message content type
   * @param content Message payload map
   * @returns StoredMessage initialized with PENDING status
   */
  public async enqueueMessage(
    convID: string,
    senderID: string,
    contentType: number,
    content: Record<string, any>
  ): Promise<StoredMessage> {
    if (!convID || !senderID || !contentType || !content) {
      throw new Error("Invalid message parameters: convID, senderID, and content are required");
    }

    const clientMsgID = this.generateClientMsgID();
    const now = Date.now();

    const storedMsg: StoredMessage = {
      clientMsgID,
      convID,
      senderID,
      contentType,
      content,
      seq: -1,
      status: "PENDING",
      sendTime: now,
      createdAt: now,
    };

    const outboxItem: OutboxItem = {
      clientMsgID,
      convID,
      contentType,
      content,
      retryCount: 0,
      createdAt: now,
    };

    // 1. Persist to local storage
    await this.storage.saveMessage(storedMsg);
    await this.storage.saveOutbox(outboxItem);

    // 2. Emit optimistic event for immediate UI rendering
    this.emitEvent("optimistic", storedMsg);

    // 3. Dispatch immediately if transport is ready
    if (this.transport.getState() === "CONNECTED") {
      this.dispatchFrame(outboxItem);
    }

    return storedMsg;
  }

  /**
   * Transmits FrameSendMessage over WebSocket and arms acknowledgment timeout timer.
   */
  private dispatchFrame(item: OutboxItem): void {
    const payload: SendMsgPayload = {
      c: item.convID,
      t: item.contentType,
      x: item.content,
      i: item.clientMsgID,
    };

    try {
      this.transport.send(FrameSendMessage, payload);
      this.setupAckTimeout(item.clientMsgID);
    } catch {
      // Suppress immediate dispatch error; item remains in Outbox for reconnect flush
    }
  }

  /**
   * Sets up acknowledgment timeout guard for an in-flight message.
   */
  private setupAckTimeout(clientMsgID: string): void {
    if (this.pendingTimers.has(clientMsgID)) {
      clearTimeout(this.pendingTimers.get(clientMsgID));
    }

    const timer = setTimeout(async () => {
      this.pendingTimers.delete(clientMsgID);
      const msg = await this.storage.getMessageByClientId(clientMsgID);
      if (msg && msg.status === "PENDING") {
        await this.storage.updateMessageStatus(clientMsgID, "FAILED");
        const failedMsg = await this.storage.getMessageByClientId(clientMsgID);
        if (failedMsg) {
          this.emitEvent("failed", failedMsg);
        }
      }
    }, this.config.ackTimeoutMs);

    this.pendingTimers.set(clientMsgID, timer);
  }

  /**
   * Handles incoming FrameMessageAck from Gateway.
   * Updates status to SENT, assigns serverMsgID & seq, and clears Outbox item.
   */
  private async handleMessageAck(ack: AckMsgPayload): Promise<void> {
    if (!ack || !ack.clientMsgID) return;

    if (this.pendingTimers.has(ack.clientMsgID)) {
      clearTimeout(this.pendingTimers.get(ack.clientMsgID));
      this.pendingTimers.delete(ack.clientMsgID);
    }

    await this.storage.updateMessageStatus(
      ack.clientMsgID,
      "SENT",
      ack.serverMsgID,
      ack.seq
    );

    await this.storage.removeOutbox(ack.clientMsgID);

    const updated = await this.storage.getMessageByClientId(ack.clientMsgID);
    if (updated) {
      this.emitEvent("sent", updated);
    }
  }

  /**
   * Scans and flushes all pending Outbox items upon network reconnection.
   */
  public async flushPendingQueue(): Promise<void> {
    const pendingList = await this.storage.getPendingOutbox();
    for (const item of pendingList) {
      if (this.transport.getState() === "CONNECTED") {
        this.dispatchFrame(item);
      }
    }
  }

  /**
   * Generates a unique clientMsgID for client-side message identification.
   */
  private generateClientMsgID(): string {
    const randomPart = Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    return `cmsg_${timePart}_${randomPart}`;
  }

  /**
   * Emits outbox events to registered listeners.
   */
  private emitEvent(event: "optimistic" | "sent" | "failed", msg: StoredMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event, msg);
      } catch {
        // Suppress errors from external listeners
      }
    });
  }
}
