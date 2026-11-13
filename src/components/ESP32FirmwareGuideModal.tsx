import React, { useState } from 'react';
import { X, Cpu, Copy, Check, Terminal, ShieldAlert, Lock, CheckCircle2, Radio } from 'lucide-react';

interface ESP32FirmwareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ESP32FirmwareGuideModal: React.FC<ESP32FirmwareGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const firmwareCode = `/**
 * ============================================================================
 * ESP32 + MFRC522 RFID ATTENDANCE SCANNER FIRMWARE
 * WITH REAL-TIME SUSPENSION & ADMINISTRATIVE OVERRIDE CHECKING
 * ============================================================================
 * Target: ESP32 Dev Module
 * Hardware: RC522 RFID Reader (SPI), Active Buzzer, Dual Status LEDs
 * Cloud Backend: Firebase Realtime Database
 */

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <SPI.h>
#include <MFRC522.h>
#include <time.h>

// WiFi Configuration
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Firebase Project Credentials
#define API_KEY "AIzaSyCg52LDce_ACHrJV1FqOTqcLndG9i77J3g"
#define DATABASE_URL "https://rfid-attendance-system-5fccd-default-rtdb.firebaseio.com"

// Pin Definitions
#define SS_PIN 5      // RC522 SDA/SS
#define RST_PIN 22    // RC522 Reset
#define BUZZER_PIN 4  // Active Buzzer
#define LED_GREEN 2   // Success Indicator
#define LED_RED 15    // Denied / Error Indicator

MFRC522 rfid(SS_PIN, RST_PIN);
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Helpers for Buzzer Tones
void beepSuccess() {
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(BUZZER_PIN, HIGH); delay(120);
  digitalWrite(BUZZER_PIN, LOW); delay(80);
  digitalWrite(BUZZER_PIN, HIGH); delay(120);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_GREEN, LOW);
}

void beepDenied() {
  digitalWrite(LED_RED, HIGH);
  digitalWrite(BUZZER_PIN, HIGH); delay(400);
  digitalWrite(BUZZER_PIN, LOW); delay(100);
  digitalWrite(BUZZER_PIN, HIGH); delay(400);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_RED, LOW);
}

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");

  // NTP Time Synchronization
  configTime(0, 0, "pool.ntp.org");

  // Firebase Init
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  Serial.println("ESP32 RFID Attendance Scanner Ready.");
}

void loop() {
  // Check for new RFID card tap
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // Format Card UID as Hex string (e.g. A1B2C3D4)
  String cardUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) cardUID += "0";
    cardUID += String(rfid.uid.uidByte[i], HEX);
  }
  cardUID.toUpperCase();
  Serial.println("\\n--- Card Tapped: " + cardUID + " ---");

  // Get Current Date YYYY-MM-DD and Time HH:MM:SS
  time_t now = time(nullptr);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  char dateStr[16], timeStr[16];
  strftime(dateStr, sizeof(dateStr), "%Y-%m-%d", &timeinfo);
  strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);

  // -------------------------------------------------------------
  // STEP 0: RESOLVE RFID CARD UID -> STUDENT DATABASE ID
  // Reads /rfid_to_student/{CARD_UID}/studentDbId (falls back to cardUID)
  // -------------------------------------------------------------
  String studentDbId = cardUID;
  String mappingPath = "/rfid_to_student/" + cardUID + "/studentDbId";
  if (Firebase.RTDB.getString(&fbdo, mappingPath) && fbdo.stringData().length() > 0) {
    studentDbId = fbdo.stringData();
  }

  // -------------------------------------------------------------
  // STEP 1: VERIFY REGISTERED ACTIVE STUDENT & SUSPENSION STATUS
  // Check /students/{STUDENT_DB_ID}/status & /students/{STUDENT_DB_ID}/isSuspended
  // -------------------------------------------------------------
  String statusPath = "/students/" + studentDbId + "/status";
  if (!Firebase.RTDB.getString(&fbdo, statusPath) || fbdo.stringData() != "active") {
    Serial.println("ACCESS DENIED: Unregistered, inactive, or suspended student.");
    beepDenied();
    rfid.PICC_HaltA();
    return;
  }

  String suspPath = "/students/" + studentDbId + "/isSuspended";
  if (Firebase.RTDB.getBool(&fbdo, suspPath) && fbdo.boolData() == true) {
    Serial.println("ACCESS DENIED: Student is SUSPENDED. Attendance rejected.");
    beepDenied();
    rfid.PICC_HaltA();
    return;
  }

  // -------------------------------------------------------------
  // STEP 2: CHECK ADMINISTRATIVE OVERRIDE LOCK
  // Check if admin manually marked Absent for today:
  // /students/{STUDENT_DB_ID}/attendance/{DATE}/isOverridden
  // -------------------------------------------------------------
  String overridePath = "/students/" + studentDbId + "/attendance/" + String(dateStr) + "/isOverridden";
  if (Firebase.RTDB.getBool(&fbdo, overridePath) && fbdo.boolData() == true) {
    Serial.println("ATTENDANCE LOCKED: Admin marked Absent. Subsequent scans blocked.");
    beepDenied();
    rfid.PICC_HaltA();
    return;
  }

  // -------------------------------------------------------------
  // STEP 3: PREVENT DUPLICATE SCANS ON SAME DAY
  // -------------------------------------------------------------
  String checkPath = "/students/" + studentDbId + "/attendance/" + String(dateStr) + "/status";
  if (Firebase.RTDB.getString(&fbdo, checkPath) && fbdo.stringData() == "Present") {
    Serial.println("DUPLICATE TAP: Student already marked Present today.");
    beepSuccess();
    rfid.PICC_HaltA();
    return;
  }

  // -------------------------------------------------------------
  // STEP 4: RECORD PRESENT ATTENDANCE IN UNIFIED STUDENT NODE
  // Write to /students/{STUDENT_DB_ID}/attendance/{DATE}
  // -------------------------------------------------------------
  FirebaseJson json;
  json.set("studentDbId", studentDbId);
  json.set("uid", cardUID);
  json.set("rfidUID", cardUID);
  json.set("date", String(dateStr));
  json.set("time", String(timeStr));
  json.set("timestamp", (double)now);
  json.set("status", "Present");
  json.set("device", "ESP32-HARDWARE-01");

  String writePath = "/students/" + studentDbId + "/attendance/" + String(dateStr);
  if (Firebase.RTDB.setJSON(&fbdo, writePath, &json)) {
    Serial.println("Attendance Recorded Successfully at " + writePath);
    beepSuccess();
  } else {
    Serial.println("Firebase write failed: " + fbdo.errorReason());
    beepDenied();
  }

  rfid.PICC_HaltA();
  delay(1000); // Debounce
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(firmwareCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl rounded-2xl bg-[#0c1220] border border-cyan-500/30 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>ESP32 Hardware Firmware & Compatibility Guide</span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-mono border border-cyan-500/30">
                  Ready to Flash
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Drop-in Arduino C++ firmware supporting real-time student suspension & admin override locks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Architecture Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <ShieldAlert className="w-4 h-4" />
                <span>1. Suspension Check</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Queries <code className="text-amber-300 font-mono">students/{'{UID}'}/isSuspended</code>. If true, activates error buzzer and rejects attendance.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-rose-400 font-bold">
                <Lock className="w-4 h-4" />
                <span>2. Admin Lock Check</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Queries <code className="text-rose-300 font-mono">students/{'{UID}'}/attendance/{'{DATE}'}/isOverridden</code>. If locked as Absent, prevents RFID override.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>3. Realtime Push</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Writes directly to <code className="text-emerald-300 font-mono">students/{'{UID}'}/attendance/{'{DATE}'}</code>. Instantly updates Admin &amp; Student Portals.
              </p>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
              <div className="flex items-center gap-2 font-mono text-slate-300 text-xs">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>esp32_rfid_firmware.ino</span>
              </div>

              <button
                onClick={handleCopy}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            <pre className="p-4 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-80 leading-relaxed">
              {firmwareCode}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Hardware wiring: Connect MFRC522 to SPI (SCK=18, MISO=19, MOSI=23, SS=5, RST=22).
          </p>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
