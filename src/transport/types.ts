/**
 * Types and configuration definitions for the WebSocket Transport layer.
 */

/**
 * Transport connection state enumeration.
 */
export type ConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "CLOSING";

/**
 * Required configuration for initializing the WebSocket Transport.
 * Rule: Fail-fast with zero fallback defaults. Every setting must be explicitly supplied.
 */
export interface TransportConfig {
  gatewayUrl: string;             // WebSocket gateway URL (ws:// or wss://)
  token: string;                  // User JWT authentication token
  platform: string;               // Client platform identifier (e.g. "WEB", "IOS")
  deviceId: string;               // Unique device identifier
  heartbeatIntervalMs: number;    // FramePing keepalive interval in milliseconds
  reconnectBaseDelayMs: number;   // Initial reconnection backoff delay in ms
  reconnectMaxDelayMs: number;    // Maximum reconnection backoff delay in ms
  maxReconnectAttempts: number;   // Maximum retry attempts before giving up
  handshakeTimeoutMs: number;     // Maximum handshake wait time (FrameHello -> Welcome)
}

/**
 * Validates Transport configuration according to the Fail-Fast rule.
 * Throws an explicit Error immediately if any setting is missing or invalid.
 *
 * @param config Transport configuration to validate
 * @throws Error if any required field is missing or invalid
 */
export function validateTransportConfig(config: TransportConfig): void {
  if (!config) {
    throw new Error("Transport configuration cannot be null or undefined");
  }

  if (typeof config.gatewayUrl !== "string" || config.gatewayUrl.trim().length === 0) {
    throw new Error("Missing required configuration: gatewayUrl must be a non-empty string");
  }

  if (!config.gatewayUrl.startsWith("ws://") && !config.gatewayUrl.startsWith("wss://")) {
    throw new Error(`Invalid gatewayUrl: must start with 'ws://' or 'wss://', got: ${config.gatewayUrl}`);
  }

  if (typeof config.token !== "string" || config.token.trim().length === 0) {
    throw new Error("Missing required configuration: token cannot be empty");
  }

  if (typeof config.platform !== "string" || config.platform.trim().length === 0) {
    throw new Error("Missing required configuration: platform cannot be empty (e.g. 'WEB')");
  }

  if (typeof config.deviceId !== "string" || config.deviceId.trim().length === 0) {
    throw new Error("Missing required configuration: deviceId cannot be empty");
  }

  if (typeof config.heartbeatIntervalMs !== "number" || config.heartbeatIntervalMs <= 0) {
    throw new Error("Missing required configuration: heartbeatIntervalMs must be a positive number");
  }

  if (typeof config.reconnectBaseDelayMs !== "number" || config.reconnectBaseDelayMs <= 0) {
    throw new Error("Missing required configuration: reconnectBaseDelayMs must be a positive number");
  }

  if (typeof config.reconnectMaxDelayMs !== "number" || config.reconnectMaxDelayMs < config.reconnectBaseDelayMs) {
    throw new Error("Invalid configuration: reconnectMaxDelayMs must be >= reconnectBaseDelayMs");
  }

  if (typeof config.maxReconnectAttempts !== "number" || config.maxReconnectAttempts < 0) {
    throw new Error("Missing required configuration: maxReconnectAttempts must be a non-negative integer");
  }

  if (typeof config.handshakeTimeoutMs !== "number" || config.handshakeTimeoutMs <= 0) {
    throw new Error("Missing required configuration: handshakeTimeoutMs must be a positive number");
  }
}
