import type { ForgeConnection } from "./connection";
import { wsUrl } from "./connection";

type MessageHandler = (msg: Record<string, unknown>) => void;

export class ForgeWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnect = 10;
  private handlers = new Map<string, MessageHandler[]>();

  constructor(
    private conn: ForgeConnection,
    private path: string,
  ) {}

  connect(): void {
    const url = wsUrl(this.conn, `${this.path}?token=${this.conn.token}`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit("_connected", {});
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type as string;
        this.emit(type, msg);
        this.emit("*", msg);
      } catch {}
    };

    this.ws.onclose = (event) => {
      this.emit("_disconnected", { code: event.code });
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnect) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, delay);
      }
    };

    this.ws.onerror = () => {};
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const l = this.handlers.get(type) || [];
      this.handlers.set(type, l.filter((h) => h !== handler));
    };
  }

  private emit(type: string, msg: Record<string, unknown>): void {
    const list = this.handlers.get(type) || [];
    for (const h of list) {
      try { h(msg); } catch {}
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000);
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
