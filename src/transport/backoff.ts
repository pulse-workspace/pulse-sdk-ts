/**
 * Exponential Backoff with Full Jitter controller.
 * Manages exponential reconnection delays with randomized jitter to prevent thundering herds on the Gateway.
 */
export class BackoffController {
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private currentAttempt: number = 0;

  /**
   * Initializes the BackoffController with strict validation.
   *
   * @param baseDelayMs Initial base delay in milliseconds
   * @param maxDelayMs Maximum capped delay in milliseconds
   * @param maxAttempts Maximum retry attempts before stopping
   */
  constructor(baseDelayMs: number, maxDelayMs: number, maxAttempts: number) {
    if (baseDelayMs <= 0 || maxDelayMs < baseDelayMs || maxAttempts < 0) {
      throw new Error("Invalid arguments provided to BackoffController");
    }
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Retrieves current retry attempt count.
   */
  public get attemptCount(): number {
    return this.currentAttempt;
  }

  /**
   * Determines if another retry attempt is permitted within the configured ceiling.
   */
  public canRetry(): boolean {
    return this.currentAttempt < this.maxAttempts;
  }

  /**
   * Computes the next delay using exponential growth and Full Jitter.
   * Formula: random_between(0, min(maxDelay, baseDelay * 2^attempt))
   *
   * @returns Delay duration in milliseconds
   * @throws Error if maximum retry ceiling has been reached
   */
  public nextDelayMs(): number {
    if (!this.canRetry()) {
      throw new Error(`Maximum reconnection attempts (${this.maxAttempts}) exceeded`);
    }

    const exponentialDelay = this.baseDelayMs * Math.pow(2, this.currentAttempt);
    const cappedDelay = Math.min(this.maxDelayMs, exponentialDelay);
    const jitteredDelay = Math.floor(Math.random() * cappedDelay);

    this.currentAttempt += 1;
    return jitteredDelay;
  }

  /**
   * Resets the attempt counter to zero after a successful connection.
   */
  public reset(): void {
    this.currentAttempt = 0;
  }
}
