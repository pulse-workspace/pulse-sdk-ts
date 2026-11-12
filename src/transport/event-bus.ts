import { ConnectionState } from "./types";

export type FrameListener = (frameType: number, payload: any) => void;
export type StateListener = (state: ConnectionState) => void;
export type ErrorListener = (error: Error) => void;

/**
 * Manages event listeners and connection state transitions for the Transport layer.
 * Separates listener dispatch mechanics from socket management (Single Responsibility Principle).
 */
export class TransportEventBus {
  private state: ConnectionState = "DISCONNECTED";
  private readonly frameListeners: Set<FrameListener> = new Set();
  private readonly stateListeners: Set<StateListener> = new Set();
  private readonly errorListeners: Set<ErrorListener> = new Set();

  /**
   * Retrieves current connection state.
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Transitions connection state and notifies registered state listeners.
   */
  public setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((listener) => {
        try {
          listener(newState);
        } catch {
          // Suppress errors from external listeners to protect loop
        }
      });
    }
  }

  /**
   * Subscribes to inbound frames received from Gateway.
   */
  public onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /**
   * Subscribes to connection state transitions.
   */
  public onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribes to transport errors.
   */
  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Dispatches inbound frame to all registered frame listeners.
   */
  public emitFrame(frameType: number, payload: any): void {
    this.frameListeners.forEach((listener) => {
      try {
        listener(frameType, payload);
      } catch {
        // Suppress errors from external listeners
      }
    });
  }

  /**
   * Dispatches transport error to all registered error listeners.
   */
  public emitError(err: Error): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(err);
      } catch {
        // Suppress errors from external listeners
      }
    });
  }
}
