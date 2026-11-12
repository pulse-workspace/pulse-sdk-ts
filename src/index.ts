/**
 * Entrypoint exporting all public APIs for Pulse TypeScript Client SDK (@pulse/client-sdk).
 */

// Primary Facade Client
export { PulseClient } from "./client";
export type { PulseClientConfig } from "./client";

// Transport & Codec
export { WebSocketTransport } from "./transport/websocket";
export type { FrameListener, StateListener, ErrorListener } from "./transport/websocket";
export { encodeFrame, decodeFrame, decodeRawFrame } from "./transport/codec";
export type { RawFrame, DecodedFrame } from "./transport/codec";
export { validateTransportConfig } from "./transport/types";
export type { ConnectionState, TransportConfig } from "./transport/types";
export { BackoffController } from "./transport/backoff";

// Offline-First Local Storage Adapters
export type {
  IStorageAdapter,
  StoredMessage,
  StoredConversation,
  OutboxItem,
  MessageStatus,
} from "./storage/interface";
export { MemoryStorageAdapter } from "./storage/memory";
export { IndexedDBAdapter } from "./storage/indexeddb";

// Core Engines
export { OutboxEngine } from "./engine/outbox";
export type { OutboxConfig, OutboxEventListener } from "./engine/outbox";
export { SyncEngine } from "./engine/sync";
export type {
  MessageReceivedListener,
  GapDetectedListener,
  ResyncRequestListener,
} from "./engine/sync";

// Domain Managers
export { ConversationManager } from "./domain/conversation";
export { MessageManager } from "./domain/message";
export { UserManager } from "./domain/user";
export type { UserManagerConfig } from "./domain/user";

// Protocol Wire Constants & Payload Models
export * from "./protocol/frames";
export * from "./protocol/events";
export * from "./protocol/types";
