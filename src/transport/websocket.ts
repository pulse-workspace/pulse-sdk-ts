import { ConnectionState, TransportConfig, validateTransportConfig } from "./types";
import { BackoffController } from "./backoff";
import { HeartbeatController } from "./heartbeat";
import { toUint8Array } from "./binary-converter";
import { TransportEventBus, FrameListener, StateListener, ErrorListener } from "./event-bus";
import { encodeFrame, decodeFrame } from "./codec";
import { FrameHello, FrameWelcome, FramePong } from "../protocol/frames";
import { HelloPayload, WelcomePayload } from "../protocol/types";

export type { FrameListener, StateListener, ErrorListener };

/**
 * Manages the WebSocket lifecycle and binary communication with Pulse Gateway.
 * Handles FrameHello/Welcome handshake, ping/pong heartbeats, and exponential reconnect.
 */
export class WebSocketTransport {
  private readonly config: TransportConfig;
  private readonly backoff: BackoffController;
  private readonly eventBus: TransportEventBus = new TransportEventBus();
  private heartbeat: HeartbeatController | null = null;
  private socket: any = null;
  private handshakeTimer: any = null;
  private sessionInfo: WelcomePayload | null = null;
  private isExplicitDisconnect: boolean = false;

  /**
   * Initializes WebSocketTransport with strict configuration validation.
   */
  constructor(config: TransportConfig) {
    validateTransportConfig(config);
    this.config = config;
    this.backoff = new BackoffController(
      config.reconnectBaseDelayMs,
      config.reconnectMaxDelayMs,
      config.maxReconnectAttempts
    );
  }

  /**
   * Retrieves current connection state.
   */
  public getState(): ConnectionState {
    return this.eventBus.getState();
  }

  /**
   * Retrieves verified session details after successful handshake.
   */
  public getSession(): WelcomePayload | null {
    return this.sessionInfo;
  }

  /**
   * Subscribes to inbound frames.
   */
  public onFrame(listener: FrameListener): () => void {
    return this.eventBus.onFrame(listener);
  }

  /**
   * Subscribes to connection state changes.
   */
  public onStateChange(listener: StateListener): () => void {
    return this.eventBus.onStateChange(listener);
  }

  /**
   * Subscribes to connection errors.
   */
  public onError(listener: ErrorListener): () => void {
    return this.eventBus.onError(listener);
  }

  /**
   * Establishes connection to Gateway and awaits FrameHello -> Welcome handshake.
   */
  public async connect(): Promise<WelcomePayload> {
    this.isExplicitDisconnect = false;
    return new Promise<WelcomePayload>((resolve, reject) => {
      this.initiateConnection(resolve, reject);
    });
  }

  /**
   * Creates the underlying WebSocket instance and registers event handlers.
   */
  private initiateConnection(
    onHandshakeSuccess?: (info: WelcomePayload) => void,
    onHandshakeFailure?: (err: Error) => void
  ): void {
    const WSClass = (globalThis as any).WebSocket;
    if (!WSClass) {
      const err = new Error("Current environment does not support native WebSocket");
      this.eventBus.emitError(err);
      onHandshakeFailure?.(err);
      return;
    }

    this.eventBus.setState("CONNECTING");

    try {
      this.socket = new WSClass(this.config.gatewayUrl, ["pulse.protocol.v1.msgpack"]);
      this.socket.binaryType = "arraybuffer";
    } catch (err: any) {
      this.eventBus.setState("DISCONNECTED");
      const error = new Error(`Failed to initialize WebSocket: ${err.message}`);
      this.eventBus.emitError(error);
      onHandshakeFailure?.(error);
      return;
    }

    this.setupHandshakeTimeout(onHandshakeFailure);
    this.bindSocketEvents(onHandshakeSuccess);
  }

  /**
   * Sets up handshake timeout guard.
   */
  private setupHandshakeTimeout(onHandshakeFailure?: (err: Error) => void): void {
    this.handshakeTimer = setTimeout(() => {
      if (this.getState() === "CONNECTING") {
        const timeoutErr = new Error(`Handshake timed out after ${this.config.handshakeTimeoutMs}ms`);
        this.eventBus.emitError(timeoutErr);
        onHandshakeFailure?.(timeoutErr);
        this.cleanupSocket();
        this.handleReconnect();
      }
    }, this.config.handshakeTimeoutMs);
  }

  /**
   * Binds socket open, message, error, and close listeners.
   */
  private bindSocketEvents(onHandshakeSuccess?: (info: WelcomePayload) => void): void {
    this.socket.onopen = () => {
      const payload: HelloPayload = {
        t: this.config.token,
        p: this.config.platform,
        d: this.config.deviceId,
      };
      this.socket.send(encodeFrame(FrameHello, payload));
    };

    this.socket.onmessage = async (event: any) => {
      await this.handleSocketMessage(event.data, onHandshakeSuccess);
    };

    this.socket.onerror = (event: any) => {
      this.eventBus.emitError(new Error(`WebSocket network error: ${event.message || "Unknown"}`));
    };

    this.socket.onclose = () => {
      this.clearTimers();
      if (!this.isExplicitDisconnect) {
        this.handleReconnect();
      } else {
        this.eventBus.setState("DISCONNECTED");
      }
    };
  }

  /**
   * Processes binary payload, deserializes frame, and emits events.
   */
  private async handleSocketMessage(
    rawMessage: any,
    onHandshakeSuccess?: (info: WelcomePayload) => void
  ): Promise<void> {
    try {
      const buffer = await toUint8Array(rawMessage);
      const decoded = decodeFrame(buffer);

      if (decoded.frameType === FrameWelcome) {
        this.clearHandshakeTimer();
        this.sessionInfo = decoded.payload as WelcomePayload;
        this.backoff.reset();
        this.eventBus.setState("CONNECTED");
        this.startHeartbeat();
        onHandshakeSuccess?.(this.sessionInfo);
        this.eventBus.emitFrame(decoded.frameType, decoded.payload);
        return;
      }

      if (decoded.frameType === FramePong) return;

      this.eventBus.emitFrame(decoded.frameType, decoded.payload);
    } catch (err: any) {
      this.eventBus.emitError(new Error(`Frame decoding error: ${err.message}`));
    }
  }

  /**
   * Dispatches a binary frame over the WebSocket.
   */
  public send(frameType: number, payload?: any): void {
    if (this.getState() !== "CONNECTED" || !this.socket) {
      throw new Error(`Cannot send frame ${frameType}: socket not connected (state=${this.getState()})`);
    }
    const bytes = encodeFrame(frameType, payload);
    this.socket.send(bytes);
  }

  /**
   * Starts recurring heartbeat keepalive timer.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = new HeartbeatController(
      this.config.heartbeatIntervalMs,
      (bytes) => {
        if (this.getState() === "CONNECTED" && this.socket) {
          this.socket.send(bytes);
        }
      },
      (err) => this.eventBus.emitError(err)
    );
    this.heartbeat.start();
  }

  /**
   * Stops recurring heartbeat keepalive timer.
   */
  private stopHeartbeat(): void {
    if (this.heartbeat) {
      this.heartbeat.stop();
      this.heartbeat = null;
    }
  }

  /**
   * Schedules reconnection attempt with exponential backoff and jitter.
   */
  private handleReconnect(): void {
    this.cleanupSocket();

    if (!this.backoff.canRetry()) {
      this.eventBus.setState("DISCONNECTED");
      this.eventBus.emitError(new Error(`Exceeded maximum reconnection attempts (${this.config.maxReconnectAttempts})`));
      return;
    }

    this.eventBus.setState("RECONNECTING");
    const delay = this.backoff.nextDelayMs();

    setTimeout(() => {
      if (!this.isExplicitDisconnect) {
        this.initiateConnection();
      }
    }, delay);
  }

  /**
   * Explicitly closes connection and cleans up all active timers.
   */
  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.clearTimers();
    this.cleanupSocket();
    this.eventBus.setState("DISCONNECTED");
  }

  /**
   * Cleans up the native socket instance.
   */
  private cleanupSocket(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        this.socket.close();
      } catch {
        // Suppress socket close exceptions
      }
      this.socket = null;
    }
  }

  /**
   * Clears all running timers.
   */
  private clearTimers(): void {
    this.stopHeartbeat();
    this.clearHandshakeTimer();
  }

  /**
   * Clears handshake timeout timer.
   */
  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }
}
