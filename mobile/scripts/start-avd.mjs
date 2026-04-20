#!/usr/bin/env node
// Boots an Android AVD on emulator-5554 and stays attached to this terminal —
// close the tab to shut the emulator down. No-op if already running.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SERIAL = "emulator-5554";

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
    path.join(os.homedir(), "Library", "Android", "sdk"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "platform-tools"))) return c;
  }
  return null;
}

const SDK = findAndroidSdk();
if (!SDK) {
  console.error("Android SDK not found. Install via Android Studio or set ANDROID_HOME.");
  process.exit(1);
}
console.log(`Using Android SDK at: ${SDK}`);

const winExe = process.platform === "win32" ? ".exe" : "";
const ADB = path.join(SDK, "platform-tools", `adb${winExe}`);
const EMULATOR = path.join(SDK, "emulator", `emulator${winExe}`);

function runCapture(bin, args) {
  try {
    return execFileSync(bin, args, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const onlineAndBooted =
  /emulator-5554\s+device/.test(runCapture(ADB, ["devices"])) &&
  runCapture(ADB, ["-s", SERIAL, "shell", "getprop", "sys.boot_completed"]) === "1";

if (onlineAndBooted) {
  console.log(`${SERIAL} already running \u2014 nothing to do.`);
  process.exit(0);
}

const avdList = runCapture(EMULATOR, ["-list-avds"]);
if (!avdList) {
  console.error("No AVDs configured. Open Android Studio \u2192 Device Manager \u2192 Create Device.");
  process.exit(1);
}
const avd = avdList.split(/\r?\n/)[0].trim();
console.log(`Booting AVD '${avd}' on ${SERIAL}. Close this tab to stop the emulator.`);

const emu = spawn(EMULATOR, ["-avd", avd], { stdio: "inherit" });
emu.on("exit", (code) => process.exit(code ?? 0));
