import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PulseClient } from "../src/client";
import { MemoryStorageAdapter } from "../src/storage/memory";

const API_BASE = "http://localhost:32011";
const WS_GATEWAY = "ws://localhost:32001/ws";

/**
 * Obtains Admin Token from local Pulse cluster.
 */
async function getAdminToken(): Promise<string> {
  const loginRes = await fetch(`${API_BASE}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userID: "admin", password: "Pulse@Admin1" }),
  });
  if (!loginRes.ok) {
    throw new Error(`Admin login failed: ${loginRes.status}`);
  }
  const json = await loginRes.json();
  return json.data.adminToken;
}

/**
 * Registers user and mints client authentication token.
 */
async function setupUser(adminTok: string, userID: string, nickname: string): Promise<string> {
  await fetch(`${API_BASE}/api/v1/user/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminTok}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userID, nickname, email: `${userID}@example.com` }),
  });

  const tokenRes = await fetch(`${API_BASE}/api/v1/auth/userToken`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminTok}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userID, platform: "WEB" }),
  });
  const json = await tokenRes.json();
  return json.data.token;
}

/**
 * Creates 1-on-1 conversation between Alice and Bob.
 */
async function createConversation(userTok: string, aliceID: string, bobID: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/conversation/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userTok}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      participants: [aliceID, bobID],
      type: 1,
    }),
  });
  const json = await res.json();
  if (!json.data) {
    throw new Error(`Create conversation failed: ${JSON.stringify(json)}`);
  }
  return json.data.ConvID || json.data.convID;
}

let hasLiveCluster = false;
try {
  const checkRes = await fetch(`${API_BASE}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userID: "admin", password: "Pulse@Admin1" }),
    signal: AbortSignal.timeout(400),
  });
  hasLiveCluster = checkRes.ok;
} catch {
  hasLiveCluster = false;
}

describe.skipIf(!hasLiveCluster)("Live E2E Integration: PulseClient vs Real Pulse Cluster", () => {
  let aliceClient: PulseClient;
  let bobClient: PulseClient;
  let convID: string;

  beforeAll(async () => {
    const adminToken = await getAdminToken();
    const ts = Date.now() % 100000;
    const aliceID = `alice_${ts}`;
    const bobID = `bob_${ts}`;

    const aliceToken = await setupUser(adminToken, aliceID, "Alice Live");
    const bobToken = await setupUser(adminToken, bobID, "Bob Live");

    convID = await createConversation(aliceToken, aliceID, bobID);

    aliceClient = new PulseClient({
      gatewayUrl: WS_GATEWAY,
      token: aliceToken,
      platform: "WEB",
      deviceId: `device_alice_${ts}`,
      storage: new MemoryStorageAdapter(),
      heartbeatIntervalMs: 15000,
      reconnectBaseDelayMs: 200,
      reconnectMaxDelayMs: 1000,
      maxReconnectAttempts: 3,
      handshakeTimeoutMs: 5000,
      ackTimeoutMs: 5000,
      typingStopDelayMs: 1000,
    });

    bobClient = new PulseClient({
      gatewayUrl: WS_GATEWAY,
      token: bobToken,
      platform: "WEB",
      deviceId: `device_bob_${ts}`,
      storage: new MemoryStorageAdapter(),
      heartbeatIntervalMs: 15000,
      reconnectBaseDelayMs: 200,
      reconnectMaxDelayMs: 1000,
      maxReconnectAttempts: 3,
      handshakeTimeoutMs: 5000,
      ackTimeoutMs: 5000,
      typingStopDelayMs: 1000,
    });
  });

  afterAll(() => {
    aliceClient?.disconnect();
    bobClient?.disconnect();
  });

  it("Alice and Bob connect to live Gateway and complete handshake", async () => {
    const aliceSession = await aliceClient.connect();
    expect(aliceSession.session_id).toBeDefined();
    expect(aliceClient.getState()).toBe("CONNECTED");

    const bobSession = await bobClient.connect();
    expect(bobSession.session_id).toBeDefined();
    expect(bobClient.getState()).toBe("CONNECTED");
  });

  it("Alice sends message -> receives Ack with seq -> Bob receives message in real time", async () => {
    const uniqueText = `Hello Bob! Live test timestamp ${Date.now()}`;

    const bobReceivedPromise = new Promise<any>((resolve) => {
      bobClient.on("message:new", (msg: any) => {
        if (msg.convID === convID && msg.content.text === uniqueText) {
          resolve(msg);
        }
      });
    });

    const aliceAckPromise = new Promise<any>((resolve) => {
      aliceClient.on("message:sent", (msg: any) => {
        if (msg.convID === convID && msg.content.text === uniqueText) {
          resolve(msg);
        }
      });
    });

    const pendingMsg = await aliceClient.message.sendText(convID, uniqueText);
    expect(pendingMsg.status).toBe("PENDING");

    const confirmedMsg = await aliceAckPromise;
    expect(confirmedMsg.status).toBe("SENT");
    expect(confirmedMsg.serverMsgID).toBeDefined();
    expect(confirmedMsg.seq).toBeGreaterThan(0);

    const bobMsg = await bobReceivedPromise;
    expect(bobMsg.content.text).toBe(uniqueText);
    expect(bobMsg.serverMsgID).toBe(confirmedMsg.serverMsgID);
    expect(bobMsg.seq).toBe(confirmedMsg.seq);

    const bobConvs = await bobClient.conversation.getConversations();
    expect(bobConvs.length).toBeGreaterThan(0);
    expect(bobConvs[0].lastSeq).toBe(confirmedMsg.seq);
  });
});
