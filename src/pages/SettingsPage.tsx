import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings as SettingsIcon, 
  Database, 
  Cpu, 
  ShieldCheck, 
  Key, 
  Copy, 
  Check, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  Layers,
  ArrowRight,
  Clock,
  Users,
  Stethoscope,
  Link2,
  Wrench,
  UserCheck
} from 'lucide-react';
import { 
  getActiveFirebaseConfig, 
  saveActiveFirebaseConfig, 
  getFirebaseDatabase,
  getFirebaseAuth,
  isUserAdmin,
  runDatabaseDiagnostics,
  autoRepairDatabaseDiagnostics,
  linkAuthUidToStudent,
  provisionAuthForExistingStudent
} from '../services/firebase';
import { useAttendance } from '../context/AttendanceContext';
import { useAuth } from '../context/AuthContext';
import { DatabaseValidationReport } from '../types';
import { ref, get } from 'firebase/database';
import { DatabaseMigrationModal } from '../components/DatabaseMigrationModal';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const {
    isDbConnected,
    studentsList,
    migrationInspection,
    unregisteredRecovery,
    attendanceDeadline,
    isAfterDeadline,
    updateAttendanceDeadline,
    retryConnection,
  } = useAttendance();
  const [config, setConfig] = useState(getActiveFirebaseConfig());
  const [isSaved, setIsSaved] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState(attendanceDeadline);
  const [deadlineStatus, setDeadlineStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);

  // Automatic Database Validation & Account Recovery State
  const [diagReport, setDiagReport] = useState<DatabaseValidationReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [diagActionStatus, setDiagActionStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Manual Auth UID <-> Existing Student Linker State
  const [linkStudentDbId, setLinkStudentDbId] = useState('');
  const [linkAuthUid, setLinkAuthUid] = useState('');
  const [linkEmailOverride, setLinkEmailOverride] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);

  React.useEffect(() => {
    setDeadlineInput(attendanceDeadline);
  }, [attendanceDeadline]);

  const handleRunDiagnostics = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setIsAuditing(true);
    setDiagActionStatus(null);
    try {
      const report = await runDatabaseDiagnostics();
      setDiagReport(report);
    } catch (err: any) {
      setDiagActionStatus({
        success: false,
        message: err?.message || 'Failed running database validation suite.',
      });
    } finally {
      setIsAuditing(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'admin') {
      handleRunDiagnostics();
    }
  }, [user?.role, handleRunDiagnostics]);

  const handleAutoRepair = async () => {
    setIsRepairing(true);
    setDiagActionStatus(null);
    try {
      const res = await autoRepairDatabaseDiagnostics();
      setDiagReport(res.report);
      const ambNote =
        res.ambiguousStudents.length > 0
          ? ` Ambiguous matches skipped for manual selection: ${res.ambiguousStudents.join(', ')}.`
          : '';
      setDiagActionStatus({
        success: true,
        message: `Safe repair completed: ${res.repairedCount} unambiguous item${res.repairedCount === 1 ? '' : 's'} synchronized without overwriting existing student or attendance records.${ambNote}`,
      });
      await retryConnection();
    } catch (err: any) {
      setDiagActionStatus({
        success: false,
        message: err?.message || 'Safe auto-repair failed.',
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const handleManualLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkStudentDbId || !linkAuthUid.trim()) {
      setDiagActionStatus({
        success: false,
        message: 'Select an existing student and enter the Firebase Auth UID to link.',
      });
      return;
    }
    setIsLinkingAccount(true);
    setDiagActionStatus(null);
    try {
      const res = await linkAuthUidToStudent(linkStudentDbId, linkAuthUid.trim(), linkEmailOverride.trim() || undefined);
      setDiagActionStatus({
        success: true,
        message: `Linked Firebase Auth UID ${res.authUid} to existing student ${res.studentDbId} (RFID: ${res.rfidUID}) cleanly.`,
      });
      setLinkAuthUid('');
      setLinkEmailOverride('');
      await handleRunDiagnostics();
      await retryConnection();
    } catch (err: any) {
      setDiagActionStatus({
        success: false,
        message: err?.message || 'Failed linking Auth UID to student.',
      });
    } finally {
      setIsLinkingAccount(false);
    }
  };

  const handleProvisionLoginSubmit = async () => {
    if (!linkStudentDbId || linkPassword.trim().length < 6) {
      setDiagActionStatus({
        success: false,
        message: 'Select an existing unlinked student and provide a password (minimum 6 characters).',
      });
      return;
    }
    setIsLinkingAccount(true);
    setDiagActionStatus(null);
    try {
      const res = await provisionAuthForExistingStudent(linkStudentDbId, linkPassword.trim(), linkEmailOverride.trim() || undefined);
      setDiagActionStatus({
        success: true,
        message: `Provisioned portal login (${res.email}) and linked Auth UID ${res.authUid} to existing student ${res.studentDbId}.`,
      });
      setLinkPassword('');
      setLinkEmailOverride('');
      await handleRunDiagnostics();
      await retryConnection();
    } catch (err: any) {
      setDiagActionStatus({
        success: false,
        message: err?.message || 'Failed provisioning Firebase Auth login.',
      });
    } finally {
      setIsLinkingAccount(false);
    }
  };

  const handleSaveDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDeadline(true);
    setDeadlineStatus(null);
    const res = await updateAttendanceDeadline(deadlineInput);
    setDeadlineStatus(res);
    setIsSavingDeadline(false);
  };

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
          message: 'Authentication Required: Sign in with an authorized Administrator account to query database records.',
        });
        return;
      }

      const authorized = await isUserAdmin(auth.currentUser.uid);
      if (!authorized) {
        setTestResult({
          success: false,
          message: `Permission Denied: Signed-in UID (${auth.currentUser.uid}) does not have role "admin" in /users/${auth.currentUser.uid}.`,
        });
        return;
      }

      const db = getFirebaseDatabase();
      const probePaths = [
        `users/${auth.currentUser.uid}`,
        'users',
        'auth_to_student',
        'rfid_to_student',
        'students',
      ];
      const probeResults: string[] = [];
      let deniedPath: string | null = null;
      let studentCount = 0;

      for (const path of probePaths) {
        try {
          const snap = await get(ref(db, path));
          if (path === 'students' && snap.exists()) {
            studentCount = Object.keys(snap.val() || {}).length;
          }
          probeResults.push(`/${path}: OK`);
        } catch (probeErr: any) {
          deniedPath = `/${path}`;
          probeResults.push(`/${path}: DENIED (${probeErr?.code || probeErr?.message || 'Permission denied'})`);
        }
      }

      if (deniedPath) {
        setTestResult({
          success: false,
          message: `Permission check failed (first denied path: ${deniedPath}). Results: ${probeResults.join(' | ')}`,
        });
      } else {
        setTestResult({
          success: true,
          message: `Connected as verified Administrator (${auth.currentUser.uid})! ${studentCount} student records synced. Probes: ${probeResults.join(' | ')}`,
        });
      }
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

  // Push dynamically to Unified Student Attendance Node: /students/{STUDENT_DB_ID}/attendance/{DATE}.json
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient checkHttp;

    // 1. Resolve RFID Card UID to Student Database ID via /rfid_to_student/{uidStr}/studentDbId.json
    String studentDbId = uidStr;
    checkHttp.begin(String(FIREBASE_HOST) + "/rfid_to_student/" + uidStr + "/studentDbId.json");
    if (checkHttp.GET() == 200) {
      String mappedBody = checkHttp.getString();
      mappedBody.replace("\\"", "");
      mappedBody.trim();
      if (mappedBody.length() > 0 && mappedBody != "null") {
        studentDbId = mappedBody;
      }
    }
    checkHttp.end();

    // 2. Verify student exists, is active, and is not suspended
    String studentStatusUrl = String(FIREBASE_HOST) + "/students/" + studentDbId + "/status.json";
    checkHttp.begin(studentStatusUrl);
    int statusHttpCode = checkHttp.GET();
    String statusBody = statusHttpCode == 200 ? checkHttp.getString() : "null";
    checkHttp.end();

    if (statusBody.indexOf("active") < 0) {
      Serial.println("[BLOCKED] Student unregistered or suspended (" + statusBody + "). Skipping attendance write.");
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
      delay(1500);
      return;
    }

    // 3. Check if admin already locked this date via Manual Override
    String overrideUrl = String(FIREBASE_HOST) + "/students/" + studentDbId + "/attendance/" + String(dateStr) + "/isOverridden.json";
    checkHttp.begin(overrideUrl);
    int overrideHttpCode = checkHttp.GET();
    String overrideBody = overrideHttpCode == 200 ? checkHttp.getString() : "null";
    checkHttp.end();

    if (overrideBody.indexOf("true") >= 0) {
      Serial.println("[LOCKED] Date is locked by Admin Manual Override.");
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
      delay(1500);
      return;
    }

    // 4. Register date in shared working_days/{DATE} calendar index
    HTTPClient wdHttp;
    wdHttp.begin(String(FIREBASE_HOST) + "/working_days/" + String(dateStr) + ".json");
    wdHttp.addHeader("Content-Type", "application/json");
    wdHttp.sendRequest("PATCH", "{\\"date\\":\\"" + String(dateStr) + "\\",\\"isHoliday\\":false}");
    wdHttp.end();

    // 5. Write directly to Unified Path: /students/{STUDENT_DB_ID}/attendance/{DATE}.json
    HTTPClient http;
    String url = String(FIREBASE_HOST) + "/students/" + studentDbId + "/attendance/" + String(dateStr) + ".json";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\\"studentDbId\\":\\"" + studentDbId +
                         "\\",\\"uid\\":\\"" + uidStr + 
                         "\\",\\"rfidUID\\":\\"" + uidStr +
                         "\\",\\"date\\":\\"" + String(dateStr) + 
                         "\\",\\"time\\":\\"" + String(timeStr) + 
                         "\\",\\"timestamp\\":" + String((unsigned long)time(nullptr)) + 
                         ",\\"device\\":\\"ESP32-RFID-01\\",\\"status\\":\\"Present\\"}";

    int httpCode = http.PUT(jsonPayload);
    if (httpCode > 0) {
      Serial.printf("[HTTP %d] Attendance Synced to /students/%s/attendance/%s!\\n", httpCode, studentDbId.c_str(), dateStr);
    } else {
      Serial.printf("[HTTP ERROR] %s\\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1500); // Debounce to prevent accidental double-reads
}`;

  // Production Security Rules matching database.rules.json (Unified students/{studentId}/attendance/{DATE})
  const rtdbSecurityRules = `{
  "rules": {
    ".read": false,
    ".write": false,

    "students": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",

      "$studentId": {
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || data.child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId || (data.child('email').val() != null && auth.token.email != null && data.child('email').val().toLowerCase() === auth.token.email.toLowerCase()))",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",

        "attendance": {
          ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || data.parent().child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId || (data.parent().child('email').val() != null && auth.token.email != null && data.parent().child('email').val().toLowerCase() === auth.token.email.toLowerCase()))",
          ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",

          "$date": {
            ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || data.parent().parent().child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId || (data.parent().parent().child('email').val() != null && auth.token.email != null && data.parent().parent().child('email').val().toLowerCase() === auth.token.email.toLowerCase()))",
            ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || (auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' && data.parent().parent().exists() && data.parent().parent().child('status').val() === 'active' && data.parent().parent().child('isSuspended').val() !== true && (!data.exists() || data.child('isOverridden').val() !== true)))",
            ".validate": "newData.hasChildren(['date', 'status', 'time', 'timestamp'])"
          }
        }
      }
    },

    "working_days": {
      ".read": "auth != null",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
    },

    "settings": {
      ".read": "auth != null",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "users": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      "$authUid": {
        ".read": "auth != null && (auth.uid === $authUid || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".validate": "newData.hasChildren(['role']) && (newData.child('role').val() === 'admin' || newData.child('role').val() === 'student')"
      }
    },

    "auth_to_student": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      "$authUid": {
        ".read": "auth != null && (auth.uid === $authUid || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
      }
    },

    "rfid_to_student": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "rfid_to_uid": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "attendance_trash": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "audit_logs": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "auditLogs": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "suspensions": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      "$studentId": {
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || root.child('students').child($studentId).child('authUid').val() === auth.uid || root.child('users').child(auth.uid).child('studentDbId').val() === $studentId || root.child('users').child(auth.uid).child('rfidUID').val() === $studentId || root.child('auth_to_student').child(auth.uid).child('studentDbId').val() === $studentId)"
      }
    },

    "backups": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "database_backups": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "migration_recovery": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "migration_status": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "deviceCommands": {
      "esp32": {
        ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
        ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
      }
    },

    "unknown_scans": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
    },

    "devices": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')"
    },

    "attendance": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
    },

    "students_attendance": {
      ".read": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      ".write": "auth != null && (auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || root.child('users').child(auth.uid).child('role').val() === 'admin')"
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

        {/* Live Student Registry Node Card */}
        <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2.5 pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Registered Students in Database</h3>
                  <p className="text-[11px] text-slate-400">Live sync from /students/&#123;studentDbId&#125; &amp; /rfid_to_student</p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                {studentsList.length} Total
              </span>
            </div>

            {studentsList.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-950/70 border border-dashed border-slate-800 text-center text-xs text-slate-400">
                No registered students found in Firebase Realtime Database yet. Add students from the Student Directory tab.
              </div>
            ) : (
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1">
                {studentsList.map((st, idx) => (
                  <div
                    key={st.studentDbId || st.uid}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-white truncate block">
                        {idx + 1}. {st.name}
                      </span>
                      <p className="text-[10px] text-slate-400 truncate">
                        {st.department} &bull; {st.studentId}
                      </p>
                    </div>
                    <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 shrink-0">
                      {st.rfidUID || st.uid}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>Auth &amp; RFID identity indexes sync automatically on Admin login</span>
            <span className="font-mono text-emerald-400 font-semibold">Dynamic Mapping</span>
          </div>
        </div>
      </div>

      {/* Attendance Window & Cutoff Deadline (Asia/Kolkata) */}
      <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Attendance Window &amp; Cutoff Deadline (Asia/Kolkata)</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                  isAfterDeadline
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isAfterDeadline ? 'Window Closed Today' : 'Window Open Today'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Unscanned active students stay <strong className="text-amber-300">Pending</strong> while the window is open and are only counted <strong className="text-rose-300">Absent</strong> after this daily IST cutoff.
              </p>
            </div>
          </div>
          {deadlineStatus && (
            <p className={`text-xs font-medium pt-1 ${deadlineStatus.success ? 'text-emerald-400' : 'text-rose-400'}`}>
              {deadlineStatus.message}
            </p>
          )}
        </div>

        <form onSubmit={handleSaveDeadline} className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            type="time"
            value={deadlineInput}
            onChange={(e) => setDeadlineInput(e.target.value)}
            required
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-xs focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={isSavingDeadline}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition cursor-pointer disabled:opacity-50"
          >
            {isSavingDeadline ? 'Saving...' : 'Save Cutoff (IST)'}
          </button>
        </form>
      </div>

      {/* Automatic Database Validation & Account Recovery (Admin-Only) */}
      <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Database Validation &amp; Safe Account Recovery</span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                  ADMIN DIAGNOSTIC SUITE
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Audits user profiles, roles, student mappings, RFID indexes, paths, permissions, and attendance nodes without altering existing records.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunDiagnostics}
              disabled={isAuditing || isRepairing}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'Auditing...' : 'Run Full Audit'}</span>
            </button>

            <button
              type="button"
              onClick={handleAutoRepair}
              disabled={isRepairing || isAuditing}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 border border-cyan-400/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 ${isRepairing ? 'animate-spin' : ''}`} />
              <span>{isRepairing ? 'Repairing...' : 'Auto-Repair Safe Issues'}</span>
            </button>
          </div>
        </div>

        {diagActionStatus && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              diagActionStatus.success
                ? 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/35 border-rose-500/40 text-rose-200'
            }`}
          >
            {diagActionStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{diagActionStatus.message}</span>
          </div>
        )}

        {diagReport && (
          <div className="space-y-4">
            {/* Summary Metric Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className={`p-3 rounded-xl border ${diagReport.summary.permissionErrors > 0 ? 'bg-rose-950/25 border-rose-500/40' : 'bg-slate-950 border-slate-800'}`}>
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Permission Errors</span>
                <span className={`text-lg font-black font-mono ${diagReport.summary.permissionErrors > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {diagReport.summary.permissionErrors}
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${diagReport.summary.missingUserProfiles > 0 ? 'bg-rose-950/25 border-rose-500/40' : 'bg-slate-950 border-slate-800'}`}>
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Missing /users Profiles</span>
                <span className={`text-lg font-black font-mono ${diagReport.summary.missingUserProfiles > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {diagReport.summary.missingUserProfiles}
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${diagReport.summary.missingMappings + diagReport.summary.ambiguousMappings > 0 ? 'bg-amber-950/25 border-amber-500/40' : 'bg-slate-950 border-slate-800'}`}>
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Mapping / Ambiguous</span>
                <span className={`text-lg font-black font-mono ${diagReport.summary.missingMappings + diagReport.summary.ambiguousMappings > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {diagReport.summary.missingMappings} / {diagReport.summary.ambiguousMappings}
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${diagReport.summary.incorrectRoles + diagReport.summary.invalidRfids + diagReport.summary.incorrectPaths > 0 ? 'bg-amber-950/25 border-amber-500/40' : 'bg-slate-950 border-slate-800'}`}>
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Roles / RFID / Paths</span>
                <span className={`text-lg font-black font-mono ${diagReport.summary.incorrectRoles + diagReport.summary.invalidRfids + diagReport.summary.incorrectPaths > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {diagReport.summary.incorrectRoles + diagReport.summary.invalidRfids + diagReport.summary.incorrectPaths}
                </span>
              </div>
            </div>

            {/* Live RTDB & Firestore Permission Probes */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Live Database Path Access Checks
              </p>
              <div className="flex flex-wrap gap-2">
                {diagReport.permissionChecks.map((chk) => (
                  <span
                    key={`${chk.operation}-${chk.path}`}
                    title={chk.error || 'Access granted'}
                    className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] flex items-center gap-1.5 ${
                      chk.allowed
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${chk.allowed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span>{chk.path}</span>
                    <strong>{chk.allowed ? 'OK' : 'DENIED'}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Issues List */}
            {diagReport.issues.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/25 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All profiles, roles, student mappings, RFID indexes, and attendance paths passed validation cleanly.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {diagReport.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      issue.severity === 'critical'
                        ? 'bg-rose-950/20 border-rose-500/35 text-rose-100'
                        : 'bg-amber-950/15 border-amber-500/30 text-amber-100'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                            issue.severity === 'critical'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <span className="font-bold text-white">{issue.title}</span>
                        <code className="text-[10px] font-mono text-cyan-300">{issue.path}</code>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{issue.description}</p>
                    </div>
                    {issue.canAutoRepair && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] shrink-0 self-start sm:self-center">
                        Safe Auto-Repair
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Safe Manual Auth UID <-> Existing Student Recovery Linker */}
        <form onSubmit={handleManualLinkSubmit} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-cyan-400" />
            <div>
              <h4 className="text-xs font-bold text-white">
                Link Existing Auth UID or Provision Login for Existing Student
              </h4>
              <p className="text-[11px] text-slate-400">
                Safely binds a Firebase Auth UID (or creates one) to an existing <code className="text-cyan-300 font-mono">/students/&#123;studentDbId&#125;</code> without creating duplicates or overwriting attendance/RFID history.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                1. Existing Student *
              </label>
              <select
                value={linkStudentDbId}
                onChange={(e) => setLinkStudentDbId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- Select Student --</option>
                {studentsList.map((st) => {
                  const key = st.studentDbId || st.uid;
                  return (
                    <option key={key} value={key}>
                      {st.name} ({st.rfidUID || st.uid}) {st.authUid ? '✓ Linked' : '• Unlinked'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                2A. Existing Firebase Auth UID
              </label>
              <input
                type="text"
                placeholder="Paste Firebase Auth UID..."
                value={linkAuthUid}
                onChange={(e) => setLinkAuthUid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                Email (Optional Override)
              </label>
              <input
                type="email"
                placeholder="Uses student's email if blank"
                value={linkEmailOverride}
                onChange={(e) => setLinkEmailOverride(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                2B. Or New Password (Provision)
              </label>
              <input
                type="password"
                placeholder="Min 6 chars (if unlinked)"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {diagReport && diagReport.unlinkedUserProfiles.length > 0 ? (
              <div className="text-[11px] text-amber-300 flex flex-wrap items-center gap-1.5">
                <span>Unlinked /users detected:</span>
                {diagReport.unlinkedUserProfiles.map((u) => (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => {
                      setLinkAuthUid(u.uid);
                      if (u.email) setLinkEmailOverride(u.email);
                    }}
                    className="px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 font-mono text-[10px] cursor-pointer"
                  >
                    Use {u.email || u.uid}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-slate-500">
                Use 2A to link an existing Firebase Auth UID, or 2B to create a new login for an unlinked student.
              </span>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={isLinkingAccount || !linkStudentDbId || !linkAuthUid.trim()}
                className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Link Existing Auth UID</span>
              </button>

              <button
                type="button"
                onClick={handleProvisionLoginSubmit}
                disabled={isLinkingAccount || !linkStudentDbId || linkPassword.trim().length < 6}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Provision Login</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Unified Database Architecture & Migration Center Card */}
      <div className="p-6 rounded-2xl bg-[#0c1220]/90 backdrop-blur-xl border border-slate-800/80 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Unified Database Architecture & Migration Center</h3>
              <p className="text-[11px] text-slate-400">
                Single root structure: <code className="text-cyan-300 font-mono">students/{'{RFID_UID}'}/attendance/{'{DATE}'}</code>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
              Students: <strong className="text-white">{migrationInspection?.studentCount ?? 0}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-emerald-300">
              Unified Records: <strong>{migrationInspection?.alreadyUnifiedCount ?? 0}</strong>
            </span>
            <span className={`px-2.5 py-1 rounded-lg bg-slate-950 border text-xs ${
              migrationInspection?.hasLegacyAttendance
                ? 'border-amber-500/40 text-amber-300'
                : 'border-slate-800 text-slate-400'
            }`}>
              Legacy Queue: <strong>{migrationInspection?.legacyRecordCount ?? 0}</strong>
            </span>
            <span className={`px-2.5 py-1 rounded-lg bg-slate-950 border text-xs ${
              unregisteredRecovery.length > 0
                ? 'border-rose-500/40 text-rose-300'
                : 'border-slate-800 text-slate-400'
            }`}>
              Unregistered Cards: <strong>{unregisteredRecovery.length}</strong>
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsMigrationModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 border border-emerald-400/30 transition flex items-center gap-2 self-start lg:self-auto cursor-pointer"
        >
          <Layers className="w-4 h-4" />
          <span>Open Migration Center</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
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

      <DatabaseMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
      />
    </div>
  );
};
