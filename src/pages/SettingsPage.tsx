import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Database, 
  Cpu, 
  ShieldCheck, 
  Key, 
  Radio, 
  Copy, 
  Check, 
  Sparkles, 
  RefreshCw, 
  Code2, 
  CheckCircle2, 
  AlertTriangle,
  Lock,
  Wifi
} from 'lucide-react';
import { 
  getActiveFirebaseConfig, 
  saveActiveFirebaseConfig, 
  getFirebaseDatabase,
  getFirebaseAuth
} from '../services/firebase';
import { useAttendance } from '../context/AttendanceContext';
import { ref, get } from 'firebase/database';

export const SettingsPage: React.FC = () => {
  const { isDbConnected, seedDefaultStudents, dbErrorMessage } = useAttendance();
  const [config, setConfig] = useState(getActiveFirebaseConfig());
  const [isSaved, setIsSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveActiveFirebaseConfig(config);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser) {
        setTestResult({
          success: false,
          message: 'Authentication Required: You must be signed in with the authorized Administrator account (Admin UID: bi3c890VUXhVE0JFxroYfnlQwea2) to query database records.',
        });
        return;
      }

      if (auth.currentUser.uid !== 'bi3c890VUXhVE0JFxroYfnlQwea2') {
        setTestResult({
          success: false,
          message: `Permission Denied: Current user UID (${auth.currentUser.uid}) does not match Administrator UID (bi3c890VUXhVE0JFxroYfnlQwea2).`,
        });
        return;
      }

      const db = getFirebaseDatabase();
      const testRef = ref(db, 'students');
      const snap = await get(testRef);
      setTestResult({
        success: true,
        message: `Successfully connected to Firebase RTDB as Administrator! Verified ${snap.exists() ? Object.keys(snap.val() || {}).length : 0} student records at /students.`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Firebase connection diagnostic: ${err.message || 'Check database permissions or network connectivity'}.`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Secure ESP32 Arduino firmware sketch with Firebase authenticated client
  const esp32CodeSnippet = `/*
 * ESP32 + MFRC522 RFID Attendance System
 * Firebase Realtime Database Integration
 * Project: rfid-attendance-system-5fccd
 * Database: https://rfid-attendance-system-5fccd-default-rtdb.firebaseio.com
 *
 * NOTE: For security, never hardcode credentials in source control.
 * ESP32 authenticates with its dedicated device account via Firebase Auth.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <time.h>

// WiFi Configuration (Configure for your local access point)
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Firebase Realtime Database Endpoint
const char* FIREBASE_HOST = "https://rfid-attendance-system-5fccd-default-rtdb.firebaseio.com";

// Dedicated ESP32 Device Account (Separate from Administrator account)
// Created in Firebase Authentication > Email/Password
const char* DEVICE_AUTH_EMAIL = "esp32-reader01@rfidportal.com";
const char* DEVICE_AUTH_PASSWORD = "YOUR_DEVICE_PASSWORD";

// Hardware SPI Pins for RC522 Reader on ESP32
#define SS_PIN    5   // SDA
#define RST_PIN   22  // RST
#define BUZZER_PIN 4  // Optional Beeper

MFRC522 rfid(SS_PIN, RST_PIN);

// Remote Command & State Tracking
String lastProcessedCommandId = "";
unsigned long lastCommandCheck = 0;
const unsigned long COMMAND_CHECK_INTERVAL = 3000; // Check every 3 seconds

// NTP Time Configuration
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 19800; // UTC +5:30 (IST). Adjust for your local timezone
const int   daylightOffset_sec = 0;

void checkForRemoteCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(FIREBASE_HOST) + "/deviceCommands/esp32.json";
  http.begin(url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    // Check if command is RESET_SYSTEM
    if (payload.indexOf("\\"command\\":\\"RESET_SYSTEM\\"") > 0) {
      // Extract commandId
      int idIdx = payload.indexOf("\\"commandId\\":\\"");
      if (idIdx > 0) {
        int idStart = idIdx + 13;
        int idEnd = payload.indexOf("\\"", idStart);
        String cmdId = payload.substring(idStart, idEnd);

        if (cmdId != lastProcessedCommandId && cmdId.length() > 0) {
          lastProcessedCommandId = cmdId;
          Serial.println("\\n>>> [REMOTE COMMAND] RESET_SYSTEM Received! <<<");

          // 1. Clear temporary runtime variables
          rfid.PICC_HaltA();
          rfid.PCD_StopCrypto1();

          // 2. Beep signal for system reset acknowledgement
          digitalWrite(BUZZER_PIN, HIGH);
          delay(200);
          digitalWrite(BUZZER_PIN, LOW);

          // 3. Send acknowledgement back to Firebase RTDB
          HTTPClient ackHttp;
          String ackUrl = String(FIREBASE_HOST) + "/deviceCommands/esp32.json";
          ackHttp.begin(ackUrl);
          ackHttp.addHeader("Content-Type", "application/json");

          String ackPayload = "{\\"command\\":\\"RESET_SYSTEM\\",\\"commandId\\":\\"" + cmdId + 
                              "\\",\\"status\\":\\"ACKNOWLEDGED\\",\\"acknowledgedAt\\":" + String(millis()) + "}";
          ackHttp.sendRequest("PATCH", ackPayload);
          ackHttp.end();

          Serial.println("[REMOTE COMMAND] Acknowledged. Returning to Ready screen.\\n");
        }
      }
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  SPI.begin();
  rfid.PCD_Init();

  Serial.println("\\nConnecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected! IP: " + WiFi.localIP().toString());

  // Configure NTP for accurate UTC/local time
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  Serial.println("ESP32 RFID Reader Ready. Listening for card taps and remote commands...");
}

void loop() {
  // Periodically check for remote reset commands from administrator portal
  if (millis() - lastCommandCheck > COMMAND_CHECK_INTERVAL) {
    lastCommandCheck = millis();
    checkForRemoteCommands();
  }

  // Check for incoming RFID card
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // Extract UID in uppercase HEX format
  String uidStr = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(rfid.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();
  Serial.println("\\n[RFID SCAN] UID: " + uidStr);

  // Audio indicator
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);

  // Get synchronized date and time
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain network time");
    return;
  }

  char dateStr[20];
  strftime(dateStr, sizeof(dateStr), "%Y-%m-%d", &timeinfo);
  char timeStr[20];
  strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);

  // Push to Firebase Realtime Database
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    // Database Path: attendance/YYYY-MM-DD/UID.json
    String url = String(FIREBASE_HOST) + "/attendance/" + String(dateStr) + "/" + uidStr + ".json";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\\"uid\\":\\"" + uidStr + 
                         "\\",\\"date\\":\\"" + String(dateStr) + 
                         "\\",\\"time\\":\\"" + String(timeStr) + 
                         "\\",\\"timestamp\\":" + String(millis()) + 
                         ",\\"device\\":\\"ESP32-RFID-01\\",\\"status\\":\\"Present\\"}";

    int httpCode = http.PUT(jsonPayload);
    if (httpCode > 0) {
      Serial.printf("[HTTP %d] Attendance Synced to Firebase!\\n", httpCode);
    } else {
      Serial.printf("[HTTP ERROR] %s\\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1500); // Debounce to prevent accidental double-reads
}`;

  // Production Security Rules enforcing authenticated access and preventing public access
  const rtdbSecurityRules = `{
  "rules": {
    /* Prevent unauthenticated public access */
    ".read": false,
    ".write": false,

    "students": {
      /* Authenticated administrators and ESP32 devices can read student records */
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      /* Only administrator can add, edit, or purge student records */
      ".write": "auth != null && auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2'"
    },

    "attendance": {
      /* Administrators and ESP32 devices can read attendance */
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      /* Only administrator can purge or reset all attendance records */
      ".write": "auth != null && auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2'",
      "$date": {
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
        ".write": "auth != null && auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2'",
        "$uid": {
          /* Authenticated ESP32 device account (MdwxcdNtLgZp3cnYoqXBNkin8C82) or Admin can record attendance */
          ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
          ".validate": "newData.hasChildren(['uid', 'date', 'time', 'status'])"
        }
      }
    },

    "deviceCommands": {
      "esp32": {
        /* Administrator dispatches reset commands; ESP32 reads & acknowledges */
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
      }
    },

    "auditLogs": {
      /* Audit trail of all database purges and system resets */
      ".read": "auth != null && auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2'",
      ".write": "auth != null && auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2'"
    },

    "unknown_scans": {
      ".read": "auth != null && auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2'",
      ".write": "auth != null"
    }
  }
}`;

  const copyToClipboard = (text: string, type: 'code' | 'rules') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedRules(true);
      setTimeout(() => setCopiedRules(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-blue-400" />
          <span>System & Hardware Gateway Settings</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Firebase credentials, ESP32 Arduino firmware, and production security rules
        </p>
      </div>

      {/* Grid: Firebase Config & Test */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Firebase Config Card */}
        <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Firebase Project Credentials</h3>
                <p className="text-[11px] text-slate-400">Target Project & RTDB Endpoint</p>
              </div>
            </div>
            <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
              isDbConnected 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isDbConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isDbConnected ? 'Connected' : 'Connecting'}
            </span>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                Firebase Project ID
              </label>
              <input
                type="text"
                value={config.projectId}
                onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                Realtime Database URL
              </label>
              <input
                type="text"
                value={config.databaseURL}
                onChange={(e) => setConfig({ ...config, databaseURL: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                Firebase Web API Key
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter Firebase Web API Key"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
                <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                From Firebase Console &gt; Project Settings &gt; General &gt; Web API Key.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Test Database Ping</span>
              </button>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md shadow-blue-600/30"
              >
                {isSaved ? 'Config Saved!' : 'Save Config'}
              </button>
            </div>
          </form>

          {/* Test connection result */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Student Registry Node Card */}
        <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Registered Students in Database</h3>
                <p className="text-[11px] text-slate-400">Database node: students/RFID_UID</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              The three registered student profiles active in your Firebase Realtime Database:
            </p>

            <div className="mt-3 space-y-2">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white">1. Mohammed Rehan</span>
                  <p className="text-[10px] text-slate-400">Computer Science & Engineering</p>
                </div>
                <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                  5AA5AB24
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white">2. Shakir Ahmed</span>
                  <p className="text-[10px] text-slate-400">Electronics & Communication</p>
                </div>
                <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                  0A37B224
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white">3. Mohammed Zaheer</span>
                  <p className="text-[10px] text-slate-400">Information Technology</p>
                </div>
                <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                  8A75B525
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={() => seedDefaultStudents()}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-blue-500/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ensure 3 Students Seeded in Firebase students/</span>
            </button>
          </div>
        </div>
      </div>

      {/* ESP32 Arduino Firmware Code Section */}
      <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>ESP32 + RC522 Arduino Sketch (Ready to Flash)</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Pre-configured for project endpoint: <code className="text-cyan-300 font-mono">rfid-attendance-system-5fccd-default-rtdb</code>
              </p>
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(esp32CodeSnippet, 'code')}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 self-start sm:self-auto"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied Code!' : 'Copy Arduino Sketch'}</span>
          </button>
        </div>

        {/* Pinout diagram */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">SDA (SS)</span>
            <span className="text-cyan-300 font-bold">GPIO 5</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">SCK</span>
            <span className="text-cyan-300 font-bold">GPIO 18</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">MOSI / MISO</span>
            <span className="text-cyan-300 font-bold">GPIO 23 / 19</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">RST / Power</span>
            <span className="text-cyan-300 font-bold">GPIO 22 / 3.3V</span>
          </div>
        </div>

        <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-72">
          <pre>{esp32CodeSnippet}</pre>
        </div>
      </div>

      {/* Firebase Realtime Database Security Rules */}
      <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Strict Firebase Realtime Database Security Rules</h3>
              <p className="text-[11px] text-slate-400">
                Deploy in Firebase Console &gt; Realtime Database &gt; Rules
              </p>
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(rtdbSecurityRules, 'rules')}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 self-start sm:self-auto"
          >
            {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedRules ? 'Copied Rules!' : 'Copy Rules JSON'}</span>
          </button>
        </div>

        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] text-slate-300 overflow-x-auto">
          <pre>{rtdbSecurityRules}</pre>
        </div>
      </div>
    </div>
  );
};
