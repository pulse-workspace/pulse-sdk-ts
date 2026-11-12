import { IStorageAdapter, StoredMessage } from "./storage/interface";
import { WebSocketTransport } from "./transport/websocket";
import { ConnectionState, TransportConfig, validateTransportConfig } from "./transport/types";
import { OutboxEngine } from "./engine/outbox";
import { SyncEngine } from "./engine/sync";
import { ConversationManager } from "./domain/conversation";
import { MessageManager } from "./domain/message";
import { UserManager } from "./domain/user";
import { WelcomePayload } from "./protocol/types";

/**
 * Required configuration for initializing PulseClient.
 * Rule: Fail-fast with zero fallback defaults. All fields must be explicitly supplied.
 */
export interface PulseClientConfig {
  gatewayUrl: string;             // WebSocket gateway URL (ws:// or wss://)
  token: string;                  // User JWT authentication token
  platform: string;               // Client platform identifier (e.g. "WEB", "IOS")
  deviceId: string;               // Unique device identifier
  storage: IStorageAdapter;       // Storage adapter implementation (IndexedDB or Memory)
  heartbeatIntervalMs: number;    // FramePing keepalive interval in ms
  reconnectBaseDelayMs: number;   // Initial reconnection delay in ms
  reconnectMaxDelayMs: number;    // Maximum reconnection delay in ms
  maxReconnectAttempts: number;   // Maximum retry attempts
  handshakeTimeoutMs: number;     // Maximum handshake wait time in ms
  ackTimeoutMs: number;           // Message acknowledgment timeout in ms
  typingStopDelayMs: number;      // Inactivity delay before typing cancellation in ms
}

/**
 * Primary entrypoint and facade for the Pulse Client SDK.
 * Unifies Binary Transport, Offline-First Persistent Storage, Optimistic UI Outbox,
 * and Monotonic Gapless Synchronization into a single developer API.
 */
export class PulseClient {
  private readonly config: PulseClientConfig;
  private readonly transport: WebSocketTransport;
  private readonly outbox: OutboxEngine;
  private readonly sync: SyncEngine;

  public readonly conversation: ConversationManager;
  public readonly message: MessageManager;
  public readonly user: UserManager;

  private readonly eventListeners = new Map<string, Set<Function>>();

  /**
   * Initializes PulseClient with fail-fast configuration validation.
   */
  constructor(config: PulseClientConfig) {
    if (!config) {
      throw new Error("PulseClient configuration cannot be null or undefined");
    }
    if (!config.storage) {
      throw new Error("Missing required configuration: storage adapter cannot be null");
    }
    if (typeof config.ackTimeoutMs !== "number" || config.ackTimeoutMs <= 0) {
      throw new Error("Missing required configuration: ackTimeoutMs must be a positive integer");
    }
    if (typeof config.typingStopDelayMs !== "number" || config.typingStopDelayMs <= 0) {
      throw new Error("Missing required configuration: typingStopDelayMs must be a positive integer");
    }

    const transportConfig: TransportConfig = {
      gatewayUrl: config.gatewayUrl,
      token: config.token,
      platform: config.platform,
      deviceId: config.deviceId,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      reconnectBaseDelayMs: config.reconnectBaseDelayMs,
      reconnectMaxDelayMs: config.reconnectMaxDelayMs,
      maxReconnectAttempts: config.maxReconnectAttempts,
      handshakeTimeoutMs: config.handshakeTimeoutMs,
    };
    validateTransportConfig(transportConfig);

    this.config = config;
    this.transport = new WebSocketTransport(transportConfig);
    this.outbox = new OutboxEngine(config.storage, this.transport, { ackTimeoutMs: config.ackTimeoutMs });
    this.sync = new SyncEngine(config.storage, this.transport);

    this.conversation = new ConversationManager(config.storage, this.transport);
    this.message = new MessageManager(config.storage, this.outbox);
    this.user = new UserManager(this.transport, { typingStopDelayMs: config.typingStopDelayMs });

    this.setupInternalEventBridges();
  }

  /**
   * Wires internal subsystem events to client event emitter.
   */
  private setupInternalEventBridges(): void {
    this.transport.onStateChange((state) => {
      this.emit("state:change", state);
      if (state === "CONNECTED") {
        const session = this.transport.getSession();
        if (session) {
          this.message.setCurrentUserID(session.user_id);
          this.emit("connected", session);
        }
      } else if (state === "DISCONNECTED") {
        this.emit("disconnected");
      } else if (state === "RECONNECTING") {
        this.emit("reconnecting");
      }
    });

    this.transport.onError((err) => this.emit("error", err));

    this.outbox.onEvent((event, msg) => {
      if (event === "optimistic") this.emit("message:optimistic", msg);
      else if (event === "sent") this.emit("message:sent", msg);
      else if (event === "failed") this.emit("message:failed", msg);
    });

    this.sync.onMessage((msg) => this.emit("message:new", msg));
    this.sync.onGap((convID, fromSeq, toSeq) => this.emit("sync:gap", { convID, fromSeq, toSeq }));
    this.sync.onResync((convID) => this.emit("sync:resync", { convID }));
  }

  /**
   * Subscribes to client lifecycle and messaging events.
   *
   * @param event Event name ('connected', 'disconnected', 'message:new', 'message:sent', etc.)
   * @param handler Callback listener
   * @returns Unsubscribe function
   */
  public on(event: string, handler: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
    return () => this.eventListeners.get(event)?.delete(handler);
  }

  /**
   * Dispatches events to registered listeners.
   */
  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(...args);
        } catch {
          // Suppress errors from external listeners
        }
      });
    }
  }

  /**
   * Initiates connection to Pulse Gateway and completes authentication handshake.
   */
  public async connect(): Promise<WelcomePayload> {
    return this.transport.connect();
  }

  /**
   * Explicitly closes connection and releases underlying transport resources.
   */
  public disconnect(): void {
    this.transport.disconnect();
  }

  /**
   * Retrieves current connection state.
   */
  public getState(): ConnectionState {
    return this.transport.getState();
  }

  /**
   * Retrieves active session details verified by Gateway.
   */
  public getSession(): WelcomePayload | null {
    return this.transport.getSession();
  }
}
