import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORE_KEY_HOST = "forge_host";
const STORE_KEY_TOKEN = "forge_token";

// SecureStore is native-only — on web (preview/dev) fall back to localStorage so
// the connect screen can still render and round-trip a token for visual testing.
const isWeb = Platform.OS === "web";

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export interface ForgeConnection {
  host: string;
  token: string;
}

export async function saveConnection(conn: ForgeConnection): Promise<void> {
  await setItem(STORE_KEY_HOST, conn.host);
  await setItem(STORE_KEY_TOKEN, conn.token);
}

export async function loadConnection(): Promise<ForgeConnection | null> {
  const host = await getItem(STORE_KEY_HOST);
  const token = await getItem(STORE_KEY_TOKEN);
  if (!host || !token) return null;
  return { host, token };
}

export async function clearConnection(): Promise<void> {
  await deleteItem(STORE_KEY_HOST);
  await deleteItem(STORE_KEY_TOKEN);
}

export function baseUrl(conn: ForgeConnection): string {
  const h = conn.host.startsWith("http") ? conn.host : `http://${conn.host}`;
  return h.replace(/\/$/, "");
}

export function wsUrl(conn: ForgeConnection, path: string): string {
  const h = conn.host.replace(/^https?:\/\//, "");
  return `ws://${h}${path}`;
}
