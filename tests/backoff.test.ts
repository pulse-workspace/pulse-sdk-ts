import { describe, it, expect } from "vitest";
import { BackoffController } from "../src/transport/backoff";

describe("BackoffController (Exponential Backoff with Full Jitter)", () => {
  it("computes delay within valid bounds and tracks attempts", () => {
    const controller = new BackoffController(100, 1000, 3);
    expect(controller.attemptCount).toBe(0);
    expect(controller.canRetry()).toBe(true);

    const delay1 = controller.nextDelayMs();
    expect(delay1).toBeGreaterThanOrEqual(0);
    expect(delay1).toBeLessThanOrEqual(100);
    expect(controller.attemptCount).toBe(1);

    const delay2 = controller.nextDelayMs();
    expect(delay2).toBeGreaterThanOrEqual(0);
    expect(delay2).toBeLessThanOrEqual(200);

    const delay3 = controller.nextDelayMs();
    expect(delay3).toBeGreaterThanOrEqual(0);
    expect(delay3).toBeLessThanOrEqual(400);

    expect(controller.canRetry()).toBe(false);
    expect(() => controller.nextDelayMs()).toThrowError(/Maximum reconnection attempts/);
  });

  it("resets counter to zero after successful connection", () => {
    const controller = new BackoffController(100, 1000, 2);
    controller.nextDelayMs();
    expect(controller.attemptCount).toBe(1);

    controller.reset();
    expect(controller.attemptCount).toBe(0);
    expect(controller.canRetry()).toBe(true);
  });
});
