import { encodeFrame } from "./codec";
import { FramePing } from "../protocol/frames";

/**
 * Manages periodic FramePing keepalive transmission over WebSocket.
 * Prevents intermediate proxies, firewalls, and ingress gateways from severing idle connections.
 */
export class HeartbeatController {
  private timer: any = null;
  private readonly intervalMs: number;
  private readonly sendFn: (bytes: Uint8Array) => void;
  private readonly onError: (err: Error) => void;

  /**
   * Initializes the HeartbeatController.
   *
   * @param intervalMs Ping interval duration in milliseconds
   * @param sendFn Callback to transmit binary frame over socket
   * @param onError Callback for dispatching transmission errors
   */
  constructor(
    intervalMs: number,
    sendFn: (bytes: Uint8Array) => void,
    onError: (err: Error) => void
  ) {
    if (intervalMs <= 0) {
      throw new Error("intervalMs must be a positive integer greater than zero");
    }
    this.intervalMs = intervalMs;
    this.sendFn = sendFn;
    this.onError = onError;
  }

  /**
   * Starts the recurring ping keepalive loop.
   */
  public start(): void {
    this.stop();
    this.timer = setInterval(() => {
      try {
        const pingBytes = encodeFrame(FramePing);
        this.sendFn(pingBytes);
      } catch (err: any) {
        this.onError(new Error(`Failed to transmit FramePing: ${err.message}`));
      }
    }, this.intervalMs);
  }

  /**
   * Terminates the keepalive interval and releases timers.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
