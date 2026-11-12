import { IStorageAdapter, StoredMessage, StoredConversation, OutboxItem, MessageStatus } from "./interface";

/**
 * Browser IndexedDB storage adapter implementation.
 * Provides high-capacity, persistent local storage for the Offline-First architecture.
 */
export class IndexedDBAdapter implements IStorageAdapter {
  private readonly dbName: string;
  private readonly dbVersion: number;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initializes IndexedDBAdapter.
   *
   * @param dbName IndexedDB database name (e.g. "pulse_db_alice")
   * @param dbVersion Database schema version
   */
  constructor(dbName: string, dbVersion: number) {
    if (!dbName || typeof dbName !== "string" || dbName.trim().length === 0) {
      throw new Error("IndexedDB database name cannot be empty");
    }
    if (typeof dbVersion !== "number" || dbVersion <= 0) {
      throw new Error("dbVersion must be a positive integer greater than zero");
    }
    this.dbName = dbName;
    this.dbVersion = dbVersion;
  }

  /**
   * Opens the IndexedDB connection and provisions object stores.
   */
  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const idb = (globalThis as any).indexedDB;
      if (!idb) {
        reject(new Error("Current environment does not support IndexedDB"));
        return;
      }

      const req = idb.open(this.dbName, this.dbVersion);

      req.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains("messages")) {
          const msgStore = db.createObjectStore("messages", { keyPath: "clientMsgID" });
          msgStore.createIndex("convID", "convID", { unique: false });
          msgStore.createIndex("serverMsgID", "serverMsgID", { unique: false });
          msgStore.createIndex("seq", "seq", { unique: false });
        }
        if (!db.objectStoreNames.contains("conversations")) {
          const convStore = db.createObjectStore("conversations", { keyPath: "convID" });
          convStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const outboxStore = db.createObjectStore("outbox", { keyPath: "clientMsgID" });
          outboxStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(`Failed to open IndexedDB: ${req.error?.message}`));
    });

    return this.dbPromise;
  }

  /**
   * Persists message to the 'messages' object store.
   */
  public async saveMessage(msg: StoredMessage): Promise<void> {
    if (!msg.clientMsgID && msg.serverMsgID) {
      msg.clientMsgID = msg.serverMsgID;
    }
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      const req = store.put(msg);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error(`Failed to save message: ${req.error?.message}`));
    });
  }

  /**
   * Retrieves message by clientMsgID from IndexedDB.
   */
  public async getMessageByClientId(clientMsgID: string): Promise<StoredMessage | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const req = store.get(clientMsgID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(new Error(`Failed to query message: ${req.error?.message}`));
    });
  }

  /**
   * Retrieves paginated messages for a conversation.
   */
  public async getMessages(convID: string, limit: number, beforeSeq?: number): Promise<StoredMessage[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("convID");
      const req = index.getAll(IDBKeyRange.only(convID));

      req.onsuccess = () => {
        let results: StoredMessage[] = req.result || [];
        if (typeof beforeSeq === "number") {
          results = results.filter((m) => m.seq !== -1 && m.seq < beforeSeq);
        }
        results.sort((a, b) => {
          if (a.seq !== -1 && b.seq !== -1) return a.seq - b.seq;
          return a.createdAt - b.createdAt;
        });
        const start = Math.max(0, results.length - limit);
        resolve(results.slice(start));
      };
      req.onerror = () => reject(new Error(`Failed to fetch messages: ${req.error?.message}`));
    });
  }

  /**
   * Updates message status upon receiving server acknowledgment.
   */
  public async updateMessageStatus(
    clientMsgID: string,
    status: MessageStatus,
    serverMsgID?: string,
    seq?: number
  ): Promise<void> {
    const msg = await this.getMessageByClientId(clientMsgID);
    if (!msg) return;

    msg.status = status;
    if (serverMsgID) msg.serverMsgID = serverMsgID;
    if (typeof seq === "number") msg.seq = seq;

    await this.saveMessage(msg);
  }

  /**
   * Persists conversation to the 'conversations' object store.
   */
  public async saveConversation(conv: StoredConversation): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("conversations", "readwrite");
      const store = tx.objectStore("conversations");
      const req = store.put(conv);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error(`Failed to save conversation: ${req.error?.message}`));
    });
  }

  /**
   * Retrieves conversation by convID.
   */
  public async getConversation(convID: string): Promise<StoredConversation | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("conversations", "readonly");
      const store = tx.objectStore("conversations");
      const req = store.get(convID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(new Error(`Failed to read conversation: ${req.error?.message}`));
    });
  }

  /**
   * Retrieves all conversations sorted by updatedAt descending.
   */
  public async getAllConversations(): Promise<StoredConversation[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("conversations", "readonly");
      const store = tx.objectStore("conversations");
      const req = store.getAll();
      req.onsuccess = () => {
        const list: StoredConversation[] = req.result || [];
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => reject(new Error(`Failed to read conversations: ${req.error?.message}`));
    });
  }

  /**
   * Retrieves highest sequence counter recorded for a conversation.
   */
  public async getLatestSeq(convID: string): Promise<number> {
    const conv = await this.getConversation(convID);
    if (conv) return conv.lastSeq;
    return 0;
  }

  /**
   * Inserts an item into the 'outbox' store.
   */
  public async saveOutbox(item: OutboxItem): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readwrite");
      const store = tx.objectStore("outbox");
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error(`Failed to save outbox item: ${req.error?.message}`));
    });
  }

  /**
   * Retrieves all pending Outbox items.
   */
  public async getPendingOutbox(): Promise<OutboxItem[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readonly");
      const store = tx.objectStore("outbox");
      const req = store.getAll();
      req.onsuccess = () => {
        const list: OutboxItem[] = req.result || [];
        list.sort((a, b) => a.createdAt - b.createdAt);
        resolve(list);
      };
      req.onerror = () => reject(new Error(`Failed to read outbox: ${req.error?.message}`));
    });
  }

  /**
   * Removes an item from the Outbox store upon delivery confirmation.
   */
  public async removeOutbox(clientMsgID: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readwrite");
      const store = tx.objectStore("outbox");
      const req = store.delete(clientMsgID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error(`Failed to delete outbox item: ${req.error?.message}`));
    });
  }

  /**
   * Wipes all data from IndexedDB object stores.
   */
  public async clearAll(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["messages", "conversations", "outbox"], "readwrite");
      tx.objectStore("messages").clear();
      tx.objectStore("conversations").clear();
      tx.objectStore("outbox").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to clear storage: ${tx.error?.message}`));
    });
  }
}
