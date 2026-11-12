import { WebSocketTransport } from "../transport/websocket";
import {
  FrameTypingStart,
  FrameTypingStop,
  FrameReactionAdd,
  FrameReactionDel,
} from "../protocol/frames";
import { TypingPayload, ReactionPayload } from "../protocol/types";

/**
 * Configuration options for UserManager.
 */
export interface UserManagerConfig {
  typingStopDelayMs: number; // Delay before automatically sending TypingStop after last keystroke (ms)
}

/**
 * UserManager handles user-driven real-time interactions:
 * Debounced typing indicators and emoji reactions.
 */
export class UserManager {
  private readonly transport: WebSocketTransport;
  private readonly config: UserManagerConfig;
  private readonly typingTimers = new Map<string, any>();

  /**
   * Initializes UserManager.
   */
  constructor(transport: WebSocketTransport, config: UserManagerConfig) {
    if (!transport || !config) {
      throw new Error("UserManager initialization arguments cannot be null or undefined");
    }
    if (typeof config.typingStopDelayMs !== "number" || config.typingStopDelayMs <= 0) {
      throw new Error("typingStopDelayMs must be a positive integer greater than zero");
    }
    this.transport = transport;
    this.config = config;
  }

  /**
   * Signals typing activity within a conversation.
   * Sends FrameTypingStart and arms a timer to automatically transmit FrameTypingStop if idle.
   *
   * @param convID Target conversation ID
   * @param isTyping True to indicate active typing, false to immediately cancel
   */
  public setTyping(convID: string, isTyping: boolean): void {
    if (!convID || convID.trim().length === 0) {
      throw new Error("convID cannot be empty");
    }

    if (this.transport.getState() !== "CONNECTED") return;

    const payload: TypingPayload = { c: convID };

    if (!isTyping) {
      if (this.typingTimers.has(convID)) {
        clearTimeout(this.typingTimers.get(convID));
        this.typingTimers.delete(convID);
      }
      this.transport.send(FrameTypingStop, payload);
      return;
    }

    if (!this.typingTimers.has(convID)) {
      this.transport.send(FrameTypingStart, payload);
    } else {
      clearTimeout(this.typingTimers.get(convID));
    }

    const timer = setTimeout(() => {
      this.typingTimers.delete(convID);
      if (this.transport.getState() === "CONNECTED") {
        this.transport.send(FrameTypingStop, payload);
      }
    }, this.config.typingStopDelayMs);

    this.typingTimers.set(convID, timer);
  }

  /**
   * Appends an emoji reaction to a message.
   *
   * @param convID Target conversation ID
   * @param serverMsgID Target message ID
   * @param emoji Emoji glyph or code (e.g. "👍", "❤️")
   */
  public addReaction(convID: string, serverMsgID: string, emoji: string): void {
    if (!convID || !serverMsgID || !emoji) {
      throw new Error("convID, serverMsgID and emoji cannot be empty");
    }

    if (this.transport.getState() === "CONNECTED") {
      const payload: ReactionPayload = {
        c: convID,
        m: serverMsgID,
        r: emoji,
      };
      this.transport.send(FrameReactionAdd, payload);
    }
  }

  /**
   * Removes an existing emoji reaction from a message.
   *
   * @param convID Target conversation ID
   * @param serverMsgID Target message ID
   * @param emoji Emoji to remove
   */
  public removeReaction(convID: string, serverMsgID: string, emoji: string): void {
    if (!convID || !serverMsgID || !emoji) {
      throw new Error("convID, serverMsgID and emoji cannot be empty");
    }

    if (this.transport.getState() === "CONNECTED") {
      const payload: ReactionPayload = {
        c: convID,
        m: serverMsgID,
        r: emoji,
      };
      this.transport.send(FrameReactionDel, payload);
    }
  }
}
