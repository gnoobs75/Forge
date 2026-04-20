#!/usr/bin/env node
import { spawn, execSync } from "node:child_process";

const SERIAL = "emulator-5554";
const BOOT_TIMEOUT_S = 180;

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function emulatorOnline() {
  return /emulator-5554\s+device/.test(sh("adb devices"));
}

function emulatorBooted() {
  return sh(`adb -s ${SERIAL} shell getprop sys.boot_completed`) === "1";
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

async function main() {
  if (!sh("adb version")) {
    console.error("adb not found in PATH. Add %LOCALAPPDATA%\\Android\\Sdk\\platform-tools to PATH.");
    process.exit(1);
  }

  if (emulatorOnline() && emulatorBooted()) {
    console.log(`${SERIAL} already running — skipping boot.`);
  } else {
    if (!sh("emulator -version")) {
      console.error("emulator not found in PATH. Add %LOCALAPPDATA%\\Android\\Sdk\\emulator to PATH.");
      process.exit(1);
    }
    const avdList = sh("emulator -list-avds");
    if (!avdList) {
      console.error("\nNo AVDs configured. Open Android Studio \u2192 Device Manager \u2192 Create Device.");
      process.exit(1);
    }
    const avd = avdList.split(/\r?\n/)[0].trim();
    console.log(`Booting AVD '${avd}' on ${SERIAL}...`);
    spawn("emulator", ["-avd", avd], { detached: true, stdio: "ignore", shell: true }).unref();
    process.stdout.write("Waiting for emulator");
    const ok = await waitForBoot();
    if (!ok) {
      console.error("\nEmulator didn't boot within 3 minutes. Check Android Studio.");
      process.exit(1);
    }
    console.log(" ready.");
  }

  console.log(`Starting Expo with ANDROID_SERIAL=${SERIAL} ...`);
  const expo = spawn("npx", ["expo", "start", "--android", "--device", SERIAL], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ANDROID_SERIAL: SERIAL },
  });
  expo.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
