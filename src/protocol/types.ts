/**
 * Payload data structures for each binary Frame in the Pulse Wire Protocol.
 * Concise keys (t, p, d, c, x, i) correspond directly to compact MessagePack serialization.
 */

/**
 * Payload for FrameHello (1): Client sends immediately after WebSocket upgrade.
 */
export interface HelloPayload {
  t: string; // User authentication token (JWT)
  p: string; // Client platform ("WEB", "IOS", "ANDROID", "DESKTOP")
  d: string; // Unique device identifier
}

/**
 * Payload for FrameWelcome (2): Server acknowledges session establishment.
 */
export interface WelcomePayload {
  session_id: string; // Unique session ID at Gateway
  user_id: string;    // Authenticated user ID
  cell_id: string;    // Serving Cell ID
}

/**
 * Payload for FrameSendMessage (10): Client sends a new outbound message.
 */
export interface SendMsgPayload {
  c: string;               // Target conversation ID (convID)
  t: number;               // Content type code (e.g. ContentText = 101)
  x: Record<string, any>;  // Message content map
  i: string;               // Client-generated temporary message ID (clientMsgID)
}

/**
 * Payload for FrameMessageAck (11): Server confirms message persistence.
 */
export interface AckMsgPayload {
  convID: string;       // Conversation ID
  serverMsgID: string;  // Server-assigned authoritative message ID
  clientMsgID: string;  // Client temporary message ID for reconciliation
  seq: number;          // Strictly monotonic sequence counter (convSeq)
  sendTime: number;     // Server timestamp in milliseconds
  type?: string;        // Optional sub-type
  messages?: any[];     // Optional message list for history acks
}

/**
 * Payload for FrameMessageRecv (12): Server pushes an inbound message to recipients.
 */
export interface RecvMsgPayload {
  convID: string;              // Conversation ID
  serverMsgID: string;         // Authoritative server message ID
  clientMsgID?: string;        // Optional clientMsgID (if echo back to sender)
  senderID: string;            // Sender user ID
  contentType: number;         // Message content type
  content: Record<string, any>;// Message content payload
  seq: number;                 // Strictly monotonic sequence counter (convSeq)
  sendTime: number;            // Message send timestamp
}

/**
 * Payload for FrameMarkRead (14): Signals read status up to a specific message.
 */
export interface MarkReadPayload {
  c: string; // Conversation ID (convID)
  m: string; // Server message ID (serverMsgID)
}

/**
 * Payload for FrameTypingStart (20) & FrameTypingStop (21): Typing indicator.
 */
export interface TypingPayload {
  c: string; // Conversation ID (convID)
}

/**
 * Payload for FrameReactionAdd (30) & FrameReactionDel (31): Reaction interaction.
 */
export interface ReactionPayload {
  c: string; // Conversation ID (convID)
  m: string; // Message ID (serverMsgID)
  r: string; // Emoji character or code
}

/**
 * Payload for FramePresenceUpd (40): User online/offline presence update.
 */
export interface PresencePayload {
  user_id: string;      // User ID
  online: boolean;      // Online status
  last_seen?: number;   // Unix timestamp in milliseconds
}

/**
 * Payload for FrameError (100): Server error notification.
 */
export interface ErrorPayload {
  code: number;    // Numeric error code
  message: string; // Descriptive error message
}

/**
 * Payload for FrameResync (101): Server requires state resynchronization.
 */
export interface ResyncPayload {
  conv_id?: string;  // Specific conversation ID to resync, or omit for all
  from_seq?: number; // Starting sequence counter
}
