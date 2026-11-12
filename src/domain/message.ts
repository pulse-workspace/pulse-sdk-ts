import { IStorageAdapter, StoredMessage } from "../storage/interface";
import { OutboxEngine } from "../engine/outbox";
import { ContentText, ContentImage, ContentFile, ContentCustom } from "../protocol/events";

/**
 * MessageManager handles message construction, dispatch via OutboxEngine, and history querying.
 */
export class MessageManager {
  private readonly storage: IStorageAdapter;
  private readonly outbox: OutboxEngine;
  private currentUserID: string = "";

  /**
   * Initializes MessageManager with storage adapter and outbox engine.
   */
  constructor(storage: IStorageAdapter, outbox: OutboxEngine) {
    if (!storage || !outbox) {
      throw new Error("MessageManager initialization arguments cannot be null or undefined");
    }
    this.storage = storage;
    this.outbox = outbox;
  }

  /**
   * Sets the authenticated user ID upon successful handshake.
   */
  public setCurrentUserID(userID: string): void {
    if (!userID || userID.trim().length === 0) {
      throw new Error("userID cannot be empty");
    }
    this.currentUserID = userID;
  }

  /**
   * Sends a plain text message (ContentText = 101) with Optimistic UI dispatch.
   *
   * @param convID Target conversation ID
   * @param text Text message body
   * @returns StoredMessage in PENDING status
   */
  public async sendText(convID: string, text: string): Promise<StoredMessage> {
    this.ensureUserInitialized();
    if (!convID || convID.trim().length === 0) {
      throw new Error("convID cannot be empty");
    }
    if (!text || text.trim().length === 0) {
      throw new Error("Message text body cannot be empty");
    }

    return this.outbox.enqueueMessage(convID, this.currentUserID, ContentText, { text });
  }

  /**
   * Sends an image media message (ContentImage = 102).
   *
   * @param convID Target conversation ID
   * @param imageUrl Uploaded image URL
   * @param width Image width in pixels
   * @param height Image height in pixels
   * @param sizeBytes Image file size in bytes
   */
  public async sendImage(
    convID: string,
    imageUrl: string,
    width: number,
    height: number,
    sizeBytes: number
  ): Promise<StoredMessage> {
    this.ensureUserInitialized();
    if (!convID || !imageUrl) {
      throw new Error("convID and imageUrl cannot be empty");
    }
    if (width <= 0 || height <= 0 || sizeBytes <= 0) {
      throw new Error("Image dimensions and size must be positive numbers");
    }

    return this.outbox.enqueueMessage(convID, this.currentUserID, ContentImage, {
      url: imageUrl,
      width,
      height,
      size: sizeBytes,
    });
  }

  /**
   * Sends a generic file attachment message (ContentFile = 105).
   *
   * @param convID Target conversation ID
   * @param fileUrl Uploaded file URL
   * @param fileName File name display string
   * @param sizeBytes File size in bytes
   */
  public async sendFile(
    convID: string,
    fileUrl: string,
    fileName: string,
    sizeBytes: number
  ): Promise<StoredMessage> {
    this.ensureUserInitialized();
    if (!convID || !fileUrl || !fileName) {
      throw new Error("convID, fileUrl and fileName cannot be empty");
    }
    if (sizeBytes <= 0) {
      throw new Error("File size must be greater than zero bytes");
    }

    return this.outbox.enqueueMessage(convID, this.currentUserID, ContentFile, {
      url: fileUrl,
      fileName,
      size: sizeBytes,
    });
  }

  /**
   * Sends a custom application message payload (ContentCustom = 107).
   */
  public async sendCustom(convID: string, customData: Record<string, any>): Promise<StoredMessage> {
    this.ensureUserInitialized();
    if (!convID || !customData) {
      throw new Error("convID and customData cannot be empty");
    }

    return this.outbox.enqueueMessage(convID, this.currentUserID, ContentCustom, customData);
  }

  /**
   * Queries message history from local persistent storage (Offline-First).
   *
   * @param convID Target conversation ID
   * @param limit Maximum messages to retrieve
   * @param beforeSeq Pagination anchor for older messages
   */
  public async getHistory(convID: string, limit: number, beforeSeq?: number): Promise<StoredMessage[]> {
    if (!convID) {
      throw new Error("convID cannot be empty");
    }
    return this.storage.getMessages(convID, limit, beforeSeq);
  }

  /**
   * Validates user authentication state before dispatching messages.
   */
  private ensureUserInitialized(): void {
    if (!this.currentUserID || this.currentUserID.trim().length === 0) {
      throw new Error("Client cannot send message: user session has not been initialized");
    }
  }
}
