#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SERIAL = "emulator-5554";
const BOOT_TIMEOUT_S = 180;
const METRO_PORT = 8081;

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
  console.error("Android SDK not found. Set ANDROID_HOME or install via Android Studio.");
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

function emulatorOnline() {
  return /emulator-5554\s+device/.test(runCapture(ADB, ["devices"]));
}

function emulatorBooted() {
  return runCapture(ADB, ["-s", SERIAL, "shell", "getprop", "sys.boot_completed"]) === "1";
}

async function waitForBoot() {
  const started = Date.now();
  while ((Date.now() - started) / 1000 < BOOT_TIMEOUT_S) {
    if (emulatorOnline() && emulatorBooted()) return true;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function killStaleMetro() {
  // Kill any process LISTENING on Metro's port so a stale dev server doesn't
  // refuse the new launch or serve a wedged bundle.
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(new RegExp(`:${METRO_PORT}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
        if (m) pids.add(m[1]);
      }
      for (const pid of pids) {
        try {
          execFileSync("taskkill", ["/F", "/PID", pid], { stdio: "ignore" });
          console.log(`Killed stale Metro process PID ${pid} on port ${METRO_PORT}.`);
        } catch {}
      }
    } else {
      const out = execFileSync("lsof", ["-ti", `:${METRO_PORT}`], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      const pids = out.split(/\s+/).filter(Boolean);
      for (const pid of pids) {
        try {
          execFileSync("kill", ["-9", pid], { stdio: "ignore" });
          console.log(`Killed stale Metro process PID ${pid} on port ${METRO_PORT}.`);
        } catch {}
      }
    }
  } catch {
    // No Metro running — nothing to kill, that's fine.
  }
}

function listPhysicalDevices() {
  const out = runCapture(ADB, ["devices", "-l"]);
  return out
    .split(/\r?\n/)
    .slice(1) // skip "List of devices attached" header
    .map((line) => line.trim())
    .filter((line) => line && /\sdevice\b/.test(line))
    .map((line) => {
      const serial = line.split(/\s+/)[0];
      const modelMatch = line.match(/model:(\S+)/);
      return { serial, model: modelMatch ? modelMatch[1] : "unknown" };
    })
    .filter((d) => !d.serial.startsWith("emulator-"));
}

async function main() {
  if (emulatorOnline() && emulatorBooted()) {
    console.log(`${SERIAL} already running \u2014 skipping boot.`);
  } else {
    const avdList = runCapture(EMULATOR, ["-list-avds"]);
    if (!avdList) {
      console.error("\nNo AVDs configured. Open Android Studio \u2192 Device Manager \u2192 Create Device.");
      process.exit(1);
    }
    const avd = avdList.split(/\r?\n/)[0].trim();
    console.log(`Booting AVD '${avd}' on ${SERIAL}...`);
    spawn(EMULATOR, ["-avd", avd], { detached: true, stdio: "ignore" }).unref();
    process.stdout.write("Waiting for emulator");
    const ok = await waitForBoot();
    if (!ok) {
      console.error("\nEmulator didn't boot within 3 minutes. Check Android Studio for errors.");
      process.exit(1);
    }
    console.log(" ready.");
  }

  const physical = listPhysicalDevices();
  if (physical.length > 0) {
    console.error("");
    console.error("\u26a0  Non-emulator Android device(s) connected via adb:");
    for (const d of physical) console.error(`    - ${d.serial}  (model: ${d.model})`);
    console.error("");
    console.error("Expo's 'start --android' grabs the first adb device, NOT always the emulator.");
    console.error("To avoid installing Forge Mobile on the wrong device (e.g. your Quest), either:");
    console.error("  1. Unplug the USB cable (or disable USB debugging on the device)");
    console.error("  2. If connected over wifi-adb: run  adb disconnect <ip>:<port>");
    console.error("");
    console.error("Then re-click 'Launch Forge Mobile on Android'.");
    process.exit(1);
  }

  const pathSep = process.platform === "win32" ? ";" : ":";
  const augmentedPath = [
    path.join(SDK, "platform-tools"),
    path.join(SDK, "emulator"),
    process.env.PATH || "",
  ].join(pathSep);

  killStaleMetro();

  // Force adb reverse so the emulator can reach Metro on the host. Expo's CLI
  // does this on first attach, but if the emulator was killed and re-booted
  // while Metro stayed alive, the mapping is stale and the dev client just
  // shows "downloading..." forever.
  try {
    execFileSync(ADB, ["-s", SERIAL, "reverse", "tcp:8081", "tcp:8081"], { stdio: "ignore" });
    console.log(`adb reverse tcp:8081 set on ${SERIAL}.`);
  } catch {
    console.warn(`adb reverse failed — emulator may not be ready yet.`);
  }

  console.log(`Only emulator-5554 is attached. Starting Expo (cache cleared) ...`);
  const expo = spawn("npx", ["expo", "start", "--android", "--clear"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ANDROID_SERIAL: SERIAL, ANDROID_HOME: SDK, PATH: augmentedPath },
  });
  expo.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
