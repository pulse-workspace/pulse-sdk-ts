/**
 * Frame type catalog for Pulse wire protocol.
 * Synchronized with authoritative definitions in pkg/protocol/frames.go of Pulse server.
 * Uses subprotocol `pulse.protocol.v1.msgpack` over WebSocket.
 */

// Handshake & Session Management frames
export const FrameHello = 1;          // C -> S: Initial hello frame after WS upgrade
export const FrameWelcome = 2;        // S -> C: Welcome response carrying session_id and cell_id
export const FrameSubscribe = 3;      // C -> S: Subscribe to event stream
export const FrameUnsubscribe = 4;    // C -> S: Unsubscribe from event stream

// Messaging frames
export const FrameSendMessage = 10;   // C -> S: Dispatch an outbound message to a conversation
export const FrameMessageAck = 11;    // S -> C: Server confirmation of message persistence (serverMsgID, seq)
export const FrameMessageRecv = 12;   // S -> C: Real-time inbound message dispatch to recipients
export const FrameMessageRead = 13;   // S -> C: Notification that a recipient marked messages as read
export const FrameMarkRead = 14;      // C -> S: Client signals read status up to a specific seq/msgID

// Typing indicator frames
export const FrameTypingStart = 20;   // C -> S: Client begins typing in conversation
export const FrameTypingStop = 21;    // C -> S: Client stops typing

// Reaction frames
export const FrameReactionAdd = 30;   // C -> S: Add emoji reaction to message
export const FrameReactionDel = 31;   // C -> S: Remove reaction from message
export const FrameReactionUpd = 32;   // S -> C: Broadcast reaction update to participants

// Entities & Presence frames
export const FramePresenceUpd = 40;   // S -> C: Online/offline status updates
export const FrameConvUpd = 50;       // S -> C: Conversation metadata update
export const FrameGroupUpd = 60;      // S -> C: Group details update
export const FrameGroupMember = 61;   // S -> C: Group member join/kick/role update

// Keepalive frames
export const FramePing = 80;          // C -> S: Client keepalive ping
export const FramePong = 81;          // S -> C: Gateway pong response

// Control & Resync frames
export const FrameError = 100;        // S -> C: Error frame with numeric code and message
export const FrameResync = 101;       // S -> C: Signal requiring full state resynchronization

// Session Handoff frames
export const FrameHandoffReq = 102;   // C -> S: Request session takeover by new gateway instance
export const FrameHandoffReady = 103; // S -> C: Prior gateway state snapshot prepared
export const FrameHandoffDone = 104;  // Both: Session handoff completed

// Audio / Video Calling & WebRTC signaling frames
export const FrameCallRing = 110;     // Both: Initiate or broadcast incoming call
export const FrameCallAccept = 111;   // Both: Accept call invitation
export const FrameCallReject = 112;   // Both: Reject or busy call
export const FrameCallHangup = 113;   // Both: Terminate active call
export const FrameCallCandidate = 114;// Both: ICE candidate exchange

export type FrameType =
  | typeof FrameHello
  | typeof FrameWelcome
  | typeof FrameSubscribe
  | typeof FrameUnsubscribe
  | typeof FrameSendMessage
  | typeof FrameMessageAck
  | typeof FrameMessageRecv
  | typeof FrameMessageRead
  | typeof FrameMarkRead
  | typeof FrameTypingStart
  | typeof FrameTypingStop
  | typeof FrameReactionAdd
  | typeof FrameReactionDel
  | typeof FrameReactionUpd
  | typeof FramePresenceUpd
  | typeof FrameConvUpd
  | typeof FrameGroupUpd
  | typeof FrameGroupMember
  | typeof FramePing
  | typeof FramePong
  | typeof FrameError
  | typeof FrameResync
  | typeof FrameHandoffReq
  | typeof FrameHandoffReady
  | typeof FrameHandoffDone
  | typeof FrameCallRing
  | typeof FrameCallAccept
  | typeof FrameCallReject
  | typeof FrameCallHangup
  | typeof FrameCallCandidate;
