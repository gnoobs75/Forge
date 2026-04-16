import * as SecureStore from "expo-secure-store";

const STORE_KEY_HOST = "forge_host";
const STORE_KEY_TOKEN = "forge_token";

export interface ForgeConnection {
  host: string;
  token: string;
}

export async function saveConnection(conn: ForgeConnection): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY_HOST, conn.host);
  await SecureStore.setItemAsync(STORE_KEY_TOKEN, conn.token);
}

export async function loadConnection(): Promise<ForgeConnection | null> {
  const host = await SecureStore.getItemAsync(STORE_KEY_HOST);
  const token = await SecureStore.getItemAsync(STORE_KEY_TOKEN);
  if (!host || !token) return null;
  return { host, token };
}

export async function clearConnection(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY_HOST);
  await SecureStore.deleteItemAsync(STORE_KEY_TOKEN);
}

export function baseUrl(conn: ForgeConnection): string {
  const h = conn.host.startsWith("http") ? conn.host : `http://${conn.host}`;
  return h.replace(/\/$/, "");
}

export function wsUrl(conn: ForgeConnection, path: string): string {
  const h = conn.host.replace(/^https?:\/\//, "");
  return `ws://${h}${path}`;
}
