# Friday Remote Access Guide

> Connect to Friday from your phone, browser, or Apple Watch — all talking to your desktop running Forge.

## Architecture Overview

```
Your Phone (Safari/PWA)          Your Desktop (Windows 11)
  |                                  |
  | HTTPS (Cloudflare Tunnel)        | Friday Server (port 3000)
  +--------------------------------->|   - WebSocket (voice + status)
                                     |   - REST API (text turns)
                                     |   - Static files (web UI)
                                     |
Apple Watch (Shortcuts)              | Forge Electron App
  |                                  |   (also connects to Friday)
  | HTTPS POST /api/voice/turn       |
  +--------------------------------->|
```

Friday's server handles 10 concurrent WebSocket clients. Your phone and Forge desktop share the same conversation history.

---

## Phase 1: Remote Client from Phone

### Prerequisites

- Friday running on your desktop (started from Forge or standalone)
- `cloudflared` installed on your desktop
- Phone on any network (WiFi, cellular — doesn't matter)

### Step 1: Install Cloudflare Tunnel

On your Windows desktop, open a terminal:

```bash
winget install Cloudflare.cloudflared
```

Verify:
```bash
cloudflared --version
```

### Step 2: Set a Remote Access Token

Create or edit `C:\Claude\Samurai\Forge\friday\.env` and add:

```
FRIDAY_REMOTE_TOKEN=pick-a-strong-secret-here
```

Use something long and random. This token protects Friday from unauthorized access.

### Step 3: Start Friday

**Option A — From Forge dashboard:**
Click "Start Friday Server" in the Forge Electron app. Friday boots on port 3000.

**Option B — Standalone (if Forge is already running Friday):**
Friday is already running if you see it in Forge. Skip this step.

**Option C — Manual standalone:**
```bash
cd C:\Claude\Samurai\Forge\friday
bun run serve
```

Wait for: `Friday online — http://localhost:3000`

### Step 4: Start the Tunnel

In a **separate terminal** (keep it open):

```bash
cd C:\Claude\Samurai\Forge
./scripts/remote-tunnel.sh
```

Or manually:
```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflare will print something like:
```
+----------------------------+
| Your quick tunnel URL:     |
| https://abc-xyz-123.trycloudflare.com |
+----------------------------+
```

**Copy that URL.** It changes each time you restart the tunnel. For a permanent subdomain, set up a named tunnel (see "Permanent Tunnel" section below).

### Step 5: Open on Your Phone

On your iPhone, open Safari and navigate to:

```
https://abc-xyz-123.trycloudflare.com/?mode=voice#token=pick-a-strong-secret-here
```

Replace:
- `abc-xyz-123.trycloudflare.com` with your tunnel URL
- `pick-a-strong-secret-here` with your actual token

**What happens:**
1. The token gate appears briefly, auto-extracts the token from the URL hash
2. The URL cleans itself (token disappears from the address bar)
3. The mobile voice interface loads with a big purple PTT button
4. Hold the button and speak — Friday responds

### Step 6: Install as PWA (Optional but Recommended)

In Safari on your iPhone:
1. Tap the **Share** button (box with arrow)
2. Scroll down and tap **Add to Home Screen**
3. Name it "Friday" and tap **Add**

Now you have a standalone app icon. It opens full-screen without Safari chrome.

### Step 7: Test the Connection

- **Voice:** Hold the PTT button, say "What's the status of Expedition?" — you should hear Friday respond
- **Status tab:** Tap the chart icon in the bottom nav — see project progress bars and system health
- **Settings tab:** Tap the gear icon — see connection info

### Troubleshooting

| Problem | Fix |
|---------|-----|
| Token gate appears but never goes away | Check your token matches `.env` exactly |
| "Connecting..." stuck | Friday server isn't running, or tunnel is down |
| No audio playback | Tap the PTT button once first (iOS requires user gesture to unlock audio) |
| Mic not working | Grant microphone permission when Safari asks |
| Tunnel URL changed | Restart the tunnel, update your bookmark/PWA |

---

## Permanent Tunnel (Optional)

Quick tunnels give random URLs that change every restart. For a stable URL:

### 1. Create a Cloudflare account and login

```bash
cloudflared tunnel login
```

This opens a browser — pick your Cloudflare domain.

### 2. Create a named tunnel

```bash
cloudflared tunnel create friday
```

### 3. Configure DNS

```bash
cloudflared tunnel route dns friday friday.yourdomain.com
```

### 4. Create config file

Create `~/.cloudflared/config.yml`:
```yaml
tunnel: <tunnel-id-from-step-2>
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: friday.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 5. Run the named tunnel

```bash
cloudflared tunnel run friday
```

Now `https://friday.yourdomain.com` always points to your Friday server (when the tunnel is running).

---

## Phase 2: Build Native iOS App (TestFlight)

The PWA works great for quick access, but a native iOS app gives you:
- Push notifications
- Background audio
- Better WKWebView performance
- TestFlight distribution
- Apple Watch companion app

### Architecture

The native app is a thin Swift/SwiftUI shell wrapping the Friday web UI in a WKWebView, plus native audio handling and a watchOS companion.

```
iOS App (Swift/SwiftUI)
├── WKWebView → loads Friday PWA
├── Native audio session (AVAudioSession)
├── Push notification registration
└── watchOS Companion
    └── Calls POST /api/voice/turn
```

### Step 1: Create Xcode Project

On your MacBook:

1. Open Xcode
2. File > New > Project
3. Choose **App** (under iOS)
4. Settings:
   - Product Name: `Friday`
   - Team: Your Apple Developer account
   - Organization Identifier: `com.yourcompany` (or your bundle ID prefix)
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Check **Include Tests**
5. Add a **watchOS** target:
   - File > New > Target > watchOS > App
   - Name: `FridayWatch`
   - Check "Include Companion iPhone App" if prompted

### Step 2: iOS App — WKWebView Shell

Replace `ContentView.swift`:

```swift
import SwiftUI
import WebKit

struct ContentView: View {
    @State private var serverURL: String = ""
    @State private var token: String = ""
    @State private var isConnected = false
    @AppStorage("fridayServerURL") private var savedURL = ""
    @AppStorage("fridayToken") private var savedToken = ""

    var body: some View {
        if isConnected {
            FridayWebView(
                url: serverURL,
                token: token
            )
            .ignoresSafeArea()
        } else {
            SetupView(
                serverURL: $serverURL,
                token: $token,
                onConnect: {
                    savedURL = serverURL
                    savedToken = token
                    isConnected = true
                }
            )
            .onAppear {
                serverURL = savedURL
                token = savedToken
                if !savedURL.isEmpty && !savedToken.isEmpty {
                    isConnected = true
                }
            }
        }
    }
}

struct SetupView: View {
    @Binding var serverURL: String
    @Binding var token: String
    let onConnect: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Text("F.R.I.D.A.Y.")
                .font(.system(size: 28, weight: .light))
                .foregroundColor(Color(hex: "E8943A"))
                .tracking(8)

            Text("Remote Access")
                .font(.subheadline)
                .foregroundColor(.gray)

            VStack(spacing: 12) {
                TextField("Server URL", text: $serverURL)
                    .textFieldStyle(.roundedBorder)
                    .autocapitalization(.none)
                    .keyboardType(.URL)

                SecureField("Access Token", text: $token)
                    .textFieldStyle(.roundedBorder)
            }
            .padding(.horizontal, 32)

            Button("Connect") {
                onConnect()
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: "D946EF"))
            .disabled(serverURL.isEmpty || token.isEmpty)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(hex: "06060C"))
    }
}

struct FridayWebView: UIViewRepresentable {
    let url: String
    let token: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(hex: "06060C")
        webView.scrollView.bounces = false

        // Load the Friday web UI with token in hash
        let fullURL = "\(url)/?mode=mobile#token=\(token)"
        if let requestURL = URL(string: fullURL) {
            webView.load(URLRequest(url: requestURL))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

// Color extension for hex strings
extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgb: UInt64 = 0
        scanner.scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

extension UIColor {
    convenience init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgb: UInt64 = 0
        scanner.scanHexInt64(&rgb)
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}
```

### Step 3: App Configuration

In `Info.plist` (or Project Settings > Info):

```xml
<!-- Allow microphone access -->
<key>NSMicrophoneUsageDescription</key>
<string>Friday needs microphone access for voice commands</string>

<!-- Allow arbitrary loads for tunnel URLs -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### Step 4: Apple Watch Companion

The Watch app uses the REST endpoint — no WebSocket (watchOS doesn't support long-lived WebSocket well).

Create `FridayWatch/ContentView.swift`:

```swift
import SwiftUI
import WatchConnectivity

struct ContentView: View {
    @State private var response = ""
    @State private var isLoading = false
    @State private var showInput = false
    @AppStorage("fridayServerURL") private var serverURL = ""
    @AppStorage("fridayToken") private var token = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("F.R.I.D.A.Y.")
                    .font(.system(size: 14, weight: .light))
                    .foregroundColor(Color(hex: "E8943A"))

                if !response.isEmpty {
                    Text(response)
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if isLoading {
                    ProgressView()
                        .tint(Color(hex: "D946EF"))
                }

                // Dictation button — watchOS native speech-to-text
                Button(action: { showInput = true }) {
                    Image(systemName: "mic.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                        .frame(width: 60, height: 60)
                        .background(
                            LinearGradient(
                                colors: [Color(hex: "D946EF"), Color(hex: "7C3AED")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showInput) {
            DictationView { text in
                showInput = false
                sendMessage(text)
            }
        }
    }

    func sendMessage(_ text: String) {
        guard !serverURL.isEmpty, !token.isEmpty else {
            response = "Configure server URL and token in iPhone app"
            return
        }

        isLoading = true
        response = ""

        guard let url = URL(string: "\(serverURL)/api/voice/turn") else {
            response = "Invalid server URL"
            isLoading = false
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = text.data(using: .utf8)
        request.setValue("text/plain", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        URLSession.shared.dataTask(with: request) { data, _, error in
            DispatchQueue.main.async {
                isLoading = false
                if let error = error {
                    response = "Error: \(error.localizedDescription)"
                    return
                }
                guard let data = data,
                      let json = try? JSONDecoder().decode(VoiceTurnResponse.self, from: data) else {
                    response = "Invalid response"
                    return
                }
                response = json.text
            }
        }.resume()
    }
}

struct VoiceTurnResponse: Codable {
    let text: String
    let brain: String?
    let durationMs: Int?
}

struct DictationView: View {
    let onResult: (String) -> Void
    @State private var text = ""

    var body: some View {
        VStack {
            TextField("Ask Friday...", text: $text)
                .font(.system(size: 14))

            Button("Send") {
                if !text.isEmpty {
                    onResult(text)
                }
            }
            .tint(Color(hex: "D946EF"))
        }
        .padding()
    }
}
```

**Note:** watchOS `TextField` supports dictation natively — tap the mic icon on the keyboard to speak.

### Step 5: Share Settings Between iPhone and Watch

In the iPhone app, use `WatchConnectivity` to sync the server URL and token:

```swift
// In your iOS app's AppDelegate or a shared manager
import WatchConnectivity

class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = ConnectivityManager()

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func syncSettings(url: String, token: String) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.transferUserInfo([
            "fridayServerURL": url,
            "fridayToken": token,
        ])
    }

    // WCSessionDelegate required methods
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
}
```

### Step 6: Build and Test

1. Connect your iPhone via USB
2. Select your iPhone as the build target
3. Cmd+R to build and run
4. Enter your tunnel URL and token
5. The Friday web UI should load in the native app

For Apple Watch:
1. Select the Watch target
2. Build and run — it deploys to your paired Watch
3. Tap the mic button, dictate a question
4. Friday's response appears on the Watch face

### Step 7: TestFlight Distribution

1. In Xcode: Product > Archive
2. Window > Organizer > select the archive
3. Click "Distribute App"
4. Choose "App Store Connect" > "Upload"
5. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
6. Create a new app listing (or use existing)
7. Go to TestFlight tab
8. The build appears after processing (~15-30 min)
9. Add testers (internal or external groups)
10. Testers get a TestFlight notification to install

---

## Phase 3: iOS Shortcuts (Quick Win for Apple Watch)

Before building a full native app, you can use **iOS Shortcuts** for instant Apple Watch access:

### Create the Shortcut

1. Open **Shortcuts** app on iPhone
2. Tap **+** to create new
3. Add actions:
   - **Ask for Input** — Type: Text, Prompt: "Ask Friday"
   - **Get Contents of URL**:
     - URL: `https://your-tunnel-url/api/voice/turn`
     - Method: POST
     - Headers: `Authorization: Bearer your-token`
     - Request Body: `Input`
   - **Get Dictionary Value** — Key: `text`
   - **Show Result** (or **Speak Text** for voice response)

4. Name it "Ask Friday"
5. It automatically appears on your Apple Watch

### Use on Apple Watch

1. Open Shortcuts on your Watch
2. Tap "Ask Friday"
3. Dictate your question
4. Friday's text response appears on screen

This works TODAY with zero Xcode — just the REST endpoint we already built.

---

## Quick Reference

| Method | Best For | Setup Time | Needs Xcode |
|--------|----------|-----------|-------------|
| PWA in Safari | Phone voice + status | 5 min | No |
| iOS Shortcut | Quick Watch queries | 10 min | No |
| Native iOS app | Full experience + TestFlight | 2-4 hours | Yes |
| Watch companion | Wrist queries + dictation | +1 hour | Yes |

## Security Notes

- The token is sent via HTTPS (Cloudflare Tunnel handles TLS)
- Token is stored in localStorage (browser) or Keychain (native app)
- Quick tunnels use random URLs — hard to guess, but not permanent
- Named tunnels use your own domain — more professional, same security
- The token protects against unauthorized access; HTTPS protects against eavesdropping
- Consider rotating your token periodically
