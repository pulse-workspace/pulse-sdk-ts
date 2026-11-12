import { IStorageAdapter, StoredMessage, StoredConversation } from "../storage/interface";
import { WebSocketTransport } from "../transport/websocket";
import { FrameMessageRecv, FrameResync } from "../protocol/frames";
import { RecvMsgPayload, ResyncPayload } from "../protocol/types";

export type MessageReceivedListener = (msg: StoredMessage) => void;
export type GapDetectedListener = (convID: string, fromSeq: number, toSeq: number) => void;
export type ResyncRequestListener = (convID?: string) => void;

/**
 * Manages monotonic sequence ordering (Gapless Sequencing) based on DB-assigned convSeq counters.
 * Prevents message ordering inversion, handles out-of-order delivery, and triggers catch-up resyncs.
 */
export class SyncEngine {
  private readonly storage: IStorageAdapter;
  private readonly transport: WebSocketTransport;
  private readonly bufferByConv = new Map<string, RecvMsgPayload[]>();

  private readonly msgListeners: Set<MessageReceivedListener> = new Set();
  private readonly gapListeners: Set<GapDetectedListener> = new Set();
  private readonly resyncListeners: Set<ResyncRequestListener> = new Set();

  /**
   * Initializes SyncEngine with storage and transport dependencies.
   */
  constructor(storage: IStorageAdapter, transport: WebSocketTransport) {
    if (!storage || !transport) {
      throw new Error("SyncEngine initialization arguments cannot be null or undefined");
    }
    this.storage = storage;
    this.transport = transport;

    this.transport.onFrame((frameType, payload) => {
      if (frameType === FrameMessageRecv) {
        this.handleMessageRecv(payload as RecvMsgPayload);
      } else if (frameType === FrameResync) {
        this.handleResync(payload as ResyncPayload);
      }
    });
  }

  /**
   * Subscribes to verified, correctly-ordered incoming messages.
   */
  public onMessage(listener: MessageReceivedListener): () => void {
    this.msgListeners.add(listener);
    return () => this.msgListeners.delete(listener);
  }

  /**
   * Subscribes to detected sequence gap events.
   */
  public onGap(listener: GapDetectedListener): () => void {
    this.gapListeners.add(listener);
    return () => this.gapListeners.delete(listener);
  }

  /**
   * Subscribes to full state resynchronization events.
   */
  public onResync(listener: ResyncRequestListener): () => void {
    this.resyncListeners.add(listener);
    return () => this.resyncListeners.delete(listener);
  }

  /**
   * Validates inbound message sequence counter against conversation's latest recorded seq.
   */
  private async handleMessageRecv(payload: RecvMsgPayload): Promise<void> {
    if (!payload || !payload.convID || typeof payload.seq !== "number") {
      return;
    }

    const { convID, seq } = payload;
    const currentSeq = await this.storage.getLatestSeq(convID);

    // Case 1: Sequential delivery (seq == currentSeq + 1) or initial message
    if (currentSeq === 0 || seq === currentSeq + 1) {
      await this.persistAndEmit(payload);
      await this.drainBuffer(convID);
      return;
    }

    // Case 2: Duplicate frame (seq <= currentSeq) -> Idempotent ignore
    if (seq <= currentSeq) {
      return;
    }

    // Case 3: Sequence gap detected (seq > currentSeq + 1) -> Buffer and trigger gap event
    const buffer = this.bufferByConv.get(convID) || [];
    buffer.push(payload);
    buffer.sort((a, b) => a.seq - b.seq);
    this.bufferByConv.set(convID, buffer);

    this.emitGap(convID, currentSeq + 1, seq - 1);
  }

  /**
   * Persists message to storage and updates conversation metadata.
   */
  private async persistAndEmit(payload: RecvMsgPayload): Promise<void> {
    const clientMsgID = payload.clientMsgID || payload.serverMsgID || `recv_${payload.convID}_${payload.seq}`;

    const storedMsg: StoredMessage = {
      clientMsgID,
      serverMsgID: payload.serverMsgID,
      convID: payload.convID,
      senderID: payload.senderID,
      contentType: payload.contentType,
      content: payload.content,
      seq: payload.seq,
      status: "SENT",
      sendTime: payload.sendTime,
      createdAt: Date.now(),
    };

    await this.storage.saveMessage(storedMsg);

    let conv = await this.storage.getConversation(payload.convID);
    if (!conv) {
      conv = {
        convID: payload.convID,
        convType: 1,
        unreadCount: 1,
        lastSeq: payload.seq,
        lastMessage: storedMsg,
        updatedAt: payload.sendTime,
      };
    } else {
      conv.lastSeq = Math.max(conv.lastSeq, payload.seq);
      conv.lastMessage = storedMsg;
      conv.updatedAt = payload.sendTime;
      conv.unreadCount += 1;
    }

    await this.storage.saveConversation(conv);
    this.emitMessage(storedMsg);
  }

  /**
   * Drains sequential buffered messages after filling gap.
   */
  private async drainBuffer(convID: string): Promise<void> {
    const buffer = this.bufferByConv.get(convID);
    if (!buffer || buffer.length === 0) return;

    let currentSeq = await this.storage.getLatestSeq(convID);

    while (buffer.length > 0 && buffer[0].seq === currentSeq + 1) {
      const nextMsg = buffer.shift()!;
      await this.persistAndEmit(nextMsg);
      currentSeq = nextMsg.seq;
    }

    if (buffer.length === 0) {
      this.bufferByConv.delete(convID);
    }
  }

  /**
   * Ingests catch-up messages fetched from REST sync endpoint to fill sequence gaps.
   */
  public async applyCatchUpMessages(convID: string, messages: RecvMsgPayload[]): Promise<void> {
    messages.sort((a, b) => a.seq - b.seq);
    for (const msg of messages) {
      const currentSeq = await this.storage.getLatestSeq(convID);
      if (msg.seq === currentSeq + 1 || currentSeq === 0) {
        await this.persistAndEmit(msg);
      }
    }
    await this.drainBuffer(convID);
  }

  /**
   * Dispatches resync signal.
   */
  private handleResync(payload?: ResyncPayload): void {
    this.resyncListeners.forEach((l) => {
      try {
        l(payload?.conv_id);
      } catch {
        // Suppress listener error
      }
    });
  }

  /**
   * Dispatches message received event.
   */
  private emitMessage(msg: StoredMessage): void {
    this.msgListeners.forEach((l) => {
      try {
        l(msg);
      } catch {
        // Suppress listener error
      }
    });
  }

  /**
   * Dispatches gap detected event.
   */
  private emitGap(convID: string, fromSeq: number, toSeq: number): void {
    this.gapListeners.forEach((l) => {
      try {
        l(convID, fromSeq, toSeq);
      } catch {
        // Suppress listener error
      }
    });
  }
}
