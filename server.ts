import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Configuration ---
const DB_TYPE = process.env.DB_TYPE || 'sqlite';
let pool: any = null;
let sqliteDb: any = null;

if (DB_TYPE === 'postgres') {
  const { Pool } = pg;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log('Using PostgreSQL database');
} else {
  sqliteDb = new Database('database.sqlite');
  console.log('Using SQLite database');
}

// Helper to execute queries regardless of DB type
async function query(text: string, params: any[] = []) {
  if (DB_TYPE === 'postgres') {
    return await pool.query(text, params);
  } else {
    // Convert $1, $2... to ? for SQLite
    const sqliteQuery = text.replace(/\$(\d+)/g, '?');
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      const rows = sqliteDb.prepare(sqliteQuery).all(...params);
      return { rows };
    } else {
      const result = sqliteDb.prepare(sqliteQuery).run(...params);
      return { rows: [], rowCount: result.changes };
    }
  }
}

// --- Database Schema Initialization ---
async function initDb() {
  const schema = `
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      risk_score INTEGER DEFAULT 0,
      last_analyzed TEXT
    );

    CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL,
      text TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      weight INTEGER NOT NULL,
      CONSTRAINT fk_checklist FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checklist_results (
      target_id TEXT NOT NULL,
      checklist_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      is_checked BOOLEAN NOT NULL,
      justification TEXT,
      review_status TEXT DEFAULT 'pending',
      PRIMARY KEY (target_id, checklist_id, item_id),
      CONSTRAINT fk_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
      CONSTRAINT fk_checklist_res FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
    );
  `;

  if (DB_TYPE === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query(schema);
    } finally {
      client.release();
    }
  } else {
    sqliteDb.exec(schema);
  }

  // --- Migration: Add justification and review_status to checklist_results if they don't exist ---
  if (DB_TYPE === 'sqlite') {
    const columns = sqliteDb.prepare("PRAGMA table_info(checklist_results)").all();
    if (!columns.some((c: any) => c.name === 'justification')) {
      sqliteDb.exec("ALTER TABLE checklist_results ADD COLUMN justification TEXT");
    }
    if (!columns.some((c: any) => c.name === 'review_status')) {
      sqliteDb.exec("ALTER TABLE checklist_results ADD COLUMN review_status TEXT DEFAULT 'pending'");
    }
  } else {
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_results' AND column_name='justification') THEN
          ALTER TABLE checklist_results ADD COLUMN justification TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_results' AND column_name='review_status') THEN
          ALTER TABLE checklist_results ADD COLUMN review_status TEXT DEFAULT 'pending';
        END IF;
      END $$;
    `);
  }

  // --- Migration: Update existing category names ---
  const categoryUpdates = [
    ['System', 'System Security'],
    ['OS', 'OS Hardening'],
    ['Cloud', 'Cloud Communication'],
    ['Network', 'Local Network'],
    ['Network', 'Local'],
    ['Audit', 'Audit Logging'],
    ['Access', 'Access Control']
  ];

  for (const [newName, oldName] of categoryUpdates) {
    await query('UPDATE checklist_items SET category = $1 WHERE category = $2', [newName, oldName]);
  }

  const targetCountRes = await query('SELECT COUNT(*) as count FROM targets');
  const count = parseInt(targetCountRes.rows[0].count);
  
  const checklistCountRes = await query('SELECT COUNT(*) as count FROM checklists');
  const clCount = parseInt(checklistCountRes.rows[0].count);
  
  if (count === 0 || clCount === 0) {
    console.log('Initializing database with seed data...');
    
    if (count === 0) {
      for (const t of INITIAL_DATA.targets) {
        await query(
          'INSERT INTO targets (id, name, type, description, risk_score, last_analyzed) VALUES ($1, $2, $3, $4, $5, $6)',
          [t.id, t.name, t.type, t.description, t.riskScore, t.lastAnalyzed]
        );
        for (const clId in t.checklistResults) {
          for (const itemId in t.checklistResults[clId]) {
            await query(
              'INSERT INTO checklist_results (target_id, checklist_id, item_id, is_checked) VALUES ($1, $2, $3, $4)',
              [t.id, clId, itemId, t.checklistResults[clId][itemId] ? 1 : 0]
            );
          }
        }
      }
    }

    if (clCount === 0) {
      for (const cl of INITIAL_DATA.checklists) {
        await query(
          'INSERT INTO checklists (id, title, description) VALUES ($1, $2, $3)',
          [cl.id, cl.title, cl.description]
        );
        for (const item of cl.items) {
          await query(
            'INSERT INTO checklist_items (id, checklist_id, text, description, category, weight) VALUES ($1, $2, $3, $4, $5, $6)',
            [item.id, cl.id, item.text, item.description || null, item.category, item.weight]
          );
        }
      }
    }
  }
}

const INITIAL_DATA = {
  targets: [
    {
      id: 't1',
      name: 'Humanoid Unit H1-Alpha',
      type: 'Humanoid',
      description: 'Primary humanoid unit for research and development.',
      checklistResults: { 'cl-sys': { 'sys-01': true, 'sys-02': true } },
      riskScore: 15,
      lastAnalyzed: '2026-03-21'
    },
    {
      id: 't2',
      name: 'Humanoid Unit H1-Beta',
      type: 'Humanoid',
      description: 'Secondary humanoid unit for testing cloud communication.',
      checklistResults: { 'cl-comm': { 'com-01': false, 'com-03': false } },
      riskScore: 65,
      lastAnalyzed: '2026-03-20'
    }
  ],
  checklists: [
    {
      "id": "cl-sys",
      "title": "System Security & Hardware RoT",
      "description": "Hardware trust, secure boot, and physical security requirements for humanoid robots.",
      "items": [
        { "id": "sys-01", "text": "Hardware Root of Trust (eFuse, TPM 2.0, TEE)", "description": "All security operations must be based on a unique identifier and keys anchored in hardware (eFuse, TPM 2.0, or TEE).", "category": "System", "weight": 5 },
        { "id": "sys-02", "text": "Chain of Trust Booting (ROM to RootFS)", "description": "A verifiable chain must be established where each stage of the boot process (ROM -> Bootloader -> Kernel -> RootFS) is cryptographically signed and verified before execution.", "category": "System", "weight": 5 },
        { "id": "sys-03", "text": "Custom Key Usage (Developer Keys)", "description": "The system must support the use of developer-specific keys to prevent the use of generic vendor default keys, ensuring unique identity per manufacturer/model.", "category": "System", "weight": 5 },
        { "id": "sys-04", "text": "Anti-Rollback (Security Counters)", "description": "Implement hardware-backed security counters to prevent attackers from downgrading the firmware to an older, vulnerable version.", "category": "System", "weight": 4 },
        { "id": "sys-05", "text": "JTAG/Debug Interface Lock (Fuse Blowing)", "description": "Physically disable or cryptographically lock hardware debug interfaces (JTAG, UART) on production units to prevent physical memory dumping or shell access.", "category": "System", "weight": 4 },
        { "id": "sys-06", "text": "Read-Only RootFS Implementation", "description": "The primary root filesystem must be mounted as read-only to prevent persistent malware installation or unauthorized configuration changes.", "category": "System", "weight": 4 },
        { "id": "sys-07", "text": "Kernel Hardening (KASLR, CFI, Stack Protector)", "description": "Enable kernel-level protections including Address Space Layout Randomization (KASLR), Control Flow Integrity (CFI), and Stack Canaries.", "category": "System", "weight": 4 },
        { "id": "sys-08", "text": "Process Isolation (UID/GID separation)", "description": "Ensure all robot processes run with the minimum required privileges using distinct UID/GID for each functional module (e.g., perception, navigation, control).", "category": "System", "weight": 4 },
        { "id": "sys-09", "text": "Resource Limiting (cgroups allocation)", "description": "Use Linux cgroups to strictly limit the CPU, memory, and I/O resources available to non-critical processes, preventing resource exhaustion attacks.", "category": "System", "weight": 4 },
        { "id": "sys-10", "text": "Zero-Configuration (Attack Surface Minimization)", "description": "The system should have no default open ports or unnecessary services enabled out-of-the-box, following the 'Secure by Default' principle.", "category": "System", "weight": 3 },
        { "id": "sys-11", "text": "Full Disk Encryption (AES-256)", "description": "All data stored on internal storage (SSD/eMMC) must be encrypted using AES-256, protecting sensitive AI models and logs from physical theft.", "category": "System", "weight": 5 },
        { "id": "sys-12", "text": "Binding to Hardware (TPM/TEE key release)", "description": "Encryption keys must be bound to the hardware state (PCRs in TPM), ensuring data can only be decrypted if the system hasn't been tampered with.", "category": "System", "weight": 5 },
        { "id": "sys-13", "text": "IP Protection (Stripping & Obfuscation)", "description": "Remove all symbol tables from production binaries and apply code obfuscation to critical algorithms to protect intellectual property.", "category": "System", "weight": 4 },
        { "id": "sys-14", "text": "Secure Key Lifecycle (Hardware Secure World)", "description": "All cryptographic keys must be generated, stored, and used within a Hardware Secure World (TEE/HSM), never exposed to the main OS memory.", "category": "System", "weight": 5 },
        { "id": "sys-15", "text": "Chassis Intrusion Detection Sensors", "description": "Equip the robot chassis with physical sensors to detect unauthorized opening, triggering an immediate security alert.", "category": "System", "weight": 3 },
        { "id": "sys-16", "text": "Self-Destruction Logic (Key Zeroization)", "description": "Upon detection of a critical physical breach or tampering attempt, the system must automatically zeroize (erase) all sensitive cryptographic keys.", "category": "System", "weight": 4 },
        { "id": "sys-17", "text": "Port Lockdown (Kernel-level Whitelist)", "description": "Implement a kernel-level whitelist for authorized USB/Ethernet devices, blocking any unauthorized peripheral connections.", "category": "System", "weight": 4 }
      ]
    },
    {
      "id": "cl-os",
      "title": "Ubuntu OS & Kernel Hardening",
      "description": "OS-level security specifications for Ubuntu environment.",
      "items": [
        { "id": "sys-18", "text": "KASLR Activation (Address Space Randomization)", "description": "Enable Kernel Address Space Layout Randomization (KASLR) to prevent attackers from predicting the memory addresses of critical kernel functions.", "category": "OS", "weight": 4 },
        { "id": "sys-19", "text": "PXN/PAN Enforcement (Privileged Execute/Access Never)", "description": "Enforce Privileged Execute Never (PXN) and Privileged Access Never (PAN) to block the kernel from executing or accessing user-space memory.", "category": "OS", "weight": 5 },
        { "id": "sys-20", "text": "Stack Protector (Stack Canaries)", "description": "Compile the kernel and all system binaries with stack canaries to detect and prevent stack buffer overflow attacks.", "category": "OS", "weight": 4 },
        { "id": "sys-21", "text": "ReadOnly Kernel Data Structures", "description": "Configure critical kernel data structures as read-only after initialization to prevent runtime tampering by exploits.", "category": "OS", "weight": 4 },
        { "id": "sys-22", "text": "AppArmor Mandatory Profiles for ROS 2", "description": "Apply strict AppArmor profiles to all ROS 2 nodes to restrict their access to only necessary files, network ports, and system resources.", "category": "OS", "weight": 5 },
        { "id": "sys-23", "text": "Principle of Least Privilege (Non-root accounts)", "description": "Ensure all robot services and user-space applications run as non-root users, minimizing the impact of a potential process compromise.", "category": "OS", "weight": 4 },
        { "id": "sys-24", "text": "Capability Restriction (Minimum Linux Capabilities)", "description": "Strip unnecessary Linux capabilities from system binaries to prevent privilege escalation even if a binary is compromised.", "category": "OS", "weight": 4 },
        { "id": "sys-25", "text": "Attack Surface Reduction (Disable unused daemons)", "description": "Disable all unnecessary Ubuntu background services and network daemons (e.g., Avahi, Bluetooth if unused) to reduce potential entry points.", "category": "OS", "weight": 3 },
        { "id": "sys-26", "text": "ReadOnly RootFS for critical directories", "description": "Mount critical system directories (/bin, /sbin, /usr) as read-only during normal operation to prevent unauthorized system modifications.", "category": "OS", "weight": 5 },
        { "id": "sys-27", "text": "Sysctl Parameter Tuning (Network Stack Hardening)", "description": "Harden the network stack via sysctl parameters (e.g., disabling IP forwarding, ICMP redirects, and enabling SYN cookies).", "category": "OS", "weight": 4 },
        { "id": "sys-28", "text": "USB/External Media Blocking (modprobe blacklist)", "description": "Blacklist unused kernel modules for USB storage and other external media to prevent 'BadUSB' or data exfiltration attacks.", "category": "OS", "weight": 4 },
        { "id": "sys-29", "text": "SSH Hardening (Key-only, No Root login)", "description": "Disable password-based authentication and root login for SSH; enforce the use of strong SSH keys and non-standard ports.", "category": "OS", "weight": 4 },
        { "id": "sys-30", "text": "IMA/EVM Utilization (Integrity Measurement)", "description": "Use Integrity Measurement Architecture (IMA) and Extended Verification Module (EVM) to verify the integrity of files before execution.", "category": "OS", "weight": 5 },
        { "id": "sys-31", "text": "Secure PPA/Repository (Signed updates only)", "description": "Restrict software updates to only official, cryptographically signed repositories and PPAs to prevent the installation of malicious packages.", "category": "OS", "weight": 4 }
      ]
    },
    {
      "id": "cl-comm",
      "title": "Cloud-Robot Communication Security",
      "description": "Security for data exchange between robot and cloud VLM.",
      "items": [
        { "id": "com-01", "text": "Mutual TLS (mTLS) 1.3 Implementation", "description": "Establish a bidirectional trust relationship using TLS 1.3, where both the robot and the cloud server must verify each other's certificates.", "category": "Cloud", "weight": 5 },
        { "id": "com-02", "text": "HW Key Binding (TPM 2.0/TEE anchor)", "description": "The private keys used for mTLS must be stored in a hardware security module (TPM 2.0 or TEE) and never be exportable to the OS.", "category": "Cloud", "weight": 5 },
        { "id": "com-03", "text": "End-to-End Encryption for Vision/Audio", "description": "All raw sensor data (video streams, voice) must be encrypted at the source (robot) and only decrypted at the authorized cloud endpoint.", "category": "Cloud", "weight": 5 },
        { "id": "com-04", "text": "Forward Secrecy (PFS Cipher Suites)", "description": "Use cipher suites that support Perfect Forward Secrecy (PFS) to ensure that past communications remain secure even if the long-term server key is compromised.", "category": "Cloud", "weight": 4 },
        { "id": "com-05", "text": "Command Signing via Server-side HSM", "description": "All control commands issued by the cloud VLM must be digitally signed using a server-side HSM to prevent command injection or forgery.", "category": "Cloud", "weight": 5 },
        { "id": "com-06", "text": "Replay Protection (Nonce & Timestamp)", "description": "Include a unique nonce and a high-precision timestamp in every message to prevent attackers from capturing and replaying valid commands.", "category": "Cloud", "weight": 4 },
        { "id": "com-07", "text": "RBAC Enforcement (Tiered Access Control)", "description": "Implement Role-Based Access Control (RBAC) to restrict cloud-to-robot commands based on the user's authorization level (e.g., Admin, Operator, Viewer).", "category": "Cloud", "weight": 4 },
        { "id": "com-08", "text": "Command Expiry (TTL < 100ms)", "description": "Set a strict Time-To-Live (TTL) for all real-time control commands; commands received after the threshold must be automatically discarded.", "category": "Cloud", "weight": 5 },
        { "id": "com-09", "text": "Secure Tunneling (WireGuard/VPN)", "description": "Establish a dedicated secure tunnel (e.g., WireGuard or IPsec VPN) between the robot's local network and the cloud VPC for all management traffic.", "category": "Cloud", "weight": 4 },
        { "id": "com-10", "text": "QUIC/HTTP-3 Integration (Low Latency)", "description": "Utilize QUIC/HTTP-3 to minimize handshake latency and improve connection resilience during handovers between different network types (e.g., 5G to Wi-Fi).", "category": "Cloud", "weight": 4 },
        { "id": "com-11", "text": "Rate Limiting (DDoS Mitigation)", "description": "Implement rate limiting on both the robot and cloud endpoints to mitigate the impact of distributed denial-of-service (DDoS) attacks.", "category": "Cloud", "weight": 4 },
        { "id": "com-12", "text": "Fail-Safe Heartbeat (Safe Stop on loss)", "description": "The robot must enter a 'Safe State' (e.g., immediate stop or balanced posture) if the heartbeat signal from the cloud is lost for more than 200ms.", "category": "Cloud", "weight": 5 },
        { "id": "com-13", "text": "Local De-identification (Face Masking)", "description": "Apply local de-identification (e.g., blurring faces or removing PII) on the robot before transmitting vision data to the cloud to ensure privacy compliance.", "category": "Cloud", "weight": 3 },
        { "id": "com-14", "text": "Sensor Provenance (Signed Metadata-hash)", "description": "Attach a cryptographic hash and signature to sensor metadata to prove the data's origin and ensure it hasn't been tampered with during transit.", "category": "Cloud", "weight": 4 }
      ]
    },
    {
      "id": "cl-loc",
      "title": "Local Network Security",
      "description": "Inter-board communication and internal network isolation.",
      "items": [
        { "id": "loc-01", "text": "Internal mTLS/Auth (TLS 1.3 or HMAC)", "description": "All communications between the x86 control board and NVIDIA AI board must be authenticated and encrypted using TLS 1.3 or HMAC-based mutual authentication.", "category": "Network", "weight": 5 },
        { "id": "loc-02", "text": "Traffic Segmentation (VLAN isolation)", "description": "Implement VLANs to isolate management traffic, sensor data streams, and actuator control commands into separate logical networks.", "category": "Network", "weight": 4 },
        { "id": "loc-03", "text": "Static IP & ARP Binding (Anti-Spoofing)", "description": "Use static IP assignments and hardcoded ARP bindings to prevent internal ARP spoofing or IP hijacking attacks between boards.", "category": "Network", "weight": 4 },
        { "id": "loc-04", "text": "SROS2 Implementation (DDS-Security)", "description": "Enable SROS2 (DDS-Security) to provide authentication, access control, and encryption for all ROS 2 topics exchanged within the robot.", "category": "Network", "weight": 5 },
        { "id": "loc-05", "text": "Dual-Watchdog System (10ms cycle)", "description": "Implement a hardware-based dual-watchdog system that monitors both primary boards; if either fails to respond within 10ms, the robot must enter a safe state.", "category": "Network", "weight": 5 },
        { "id": "loc-06", "text": "Cross-Attestation (Board Integrity Verification)", "description": "Boards must perform mutual integrity attestation at startup, verifying each other's firmware signatures and secure boot states.", "category": "Network", "weight": 4 },
        { "id": "loc-07", "text": "Rate Limiting (Internal DoS Mitigation)", "description": "Apply rate limiting to internal communication interfaces to prevent a compromised sub-module from flooding the internal network with junk data.", "category": "Network", "weight": 4 },
        { "id": "loc-08", "text": "Port Lockdown (Physical & Logical Whitelisting)", "description": "Physically secure internal Ethernet ports and implement logical whitelisting to block any unauthorized internal network connections.", "category": "Network", "weight": 4 },
        { "id": "loc-09", "text": "Intrusion Detection (IDS for Ethernet traffic)", "description": "Deploy a lightweight IDS to monitor internal Ethernet traffic for abnormal patterns, such as unauthorized port scanning or protocol violations.", "category": "Network", "weight": 4 },
        { "id": "loc-10", "text": "Secure Key Exchange (TEE-to-TEE channel)", "description": "Establish a secure, encrypted channel directly between the TEEs of the x86 and NVIDIA boards for exchanging sensitive cryptographic keys.", "category": "Network", "weight": 5 }
      ]
    },
    {
      "id": "cl-audit",
      "title": "Audit Logging & Traceability",
      "description": "Real-time recording and forensic readiness.",
      "items": [
        { "id": "aud-01", "text": "Core Syscall Monitoring (auditd)", "description": "Utilize the Linux Audit Framework (auditd) to record security-sensitive system calls in real-time, including execve, ptrace, and setuid.", "category": "Audit", "weight": 4 },
        { "id": "aud-02", "text": "Auth & Privilege Logs (sudo, SSH, shadow/sudoers)", "description": "Log all sudo usage history, SSH login attempts, and any access or modification attempts to critical configuration files like /etc/shadow.", "category": "Audit", "weight": 4 },
        { "id": "aud-03", "text": "Resource Anomaly Logging (DoS detection)", "description": "Record events where CPU/Memory usage exceeds predefined thresholds or when a process monopolizes resources to detect signs of DoS attacks.", "category": "Audit", "weight": 3 },
        { "id": "aud-04", "text": "Append-Only Log Configuration (chattr +a)", "description": "Configure local log files as 'Append-Only' (using chattr +a) to prevent the modification or deletion of existing records.", "category": "Audit", "weight": 5 },
        { "id": "aud-05", "text": "TEE-backed Hash Chaining (Integrity detection)", "description": "Hash each log block using a key stored within the TEE and link them in a chain to immediately detect if logs are missing or reordered.", "category": "Audit", "weight": 5 },
        { "id": "aud-06", "text": "Real-time Remote Forwarding (mTLS)", "description": "Forward logs immediately to a cloud SIEM or a remote secure server via an encrypted mTLS channel to prevent evidence destruction.", "category": "Audit", "weight": 4 },
        { "id": "aud-07", "text": "Command-to-Action Mapping (Timestamped)", "description": "Maintain a high-precision timestamped correlation between the Command ID received from the Cloud VLM and the physical motor actuation.", "category": "Audit", "weight": 4 },
        { "id": "aud-08", "text": "Sensor Data Provenance (Signature metadata)", "description": "Store signature metadata alongside logs to prove that vision/audio data sent to the cloud originated from authentic physical sensor hardware.", "category": "Audit", "weight": 4 },
        { "id": "aud-09", "text": "Emergency Stop (E-Stop) Logs (Fail-Safe snapshots)", "description": "Record every instance of a hardware E-Stop trigger or software Fail-Safe activation, accompanied by a system state snapshot.", "category": "Audit", "weight": 5 },
        { "id": "aud-10", "text": "Anomaly Pattern Detection (Behavioral monitoring)", "description": "Monitor for abnormal behaviors such as SSH access during off-hours, repeated authentication failures, or massive data transfers.", "category": "Audit", "weight": 4 },
        { "id": "aud-11", "text": "Security Breach Alerting (5s threshold)", "description": "For critical violations (e.g., chassis intrusion, key zeroization), trigger an immediate administrative alert within 5 seconds.", "category": "Audit", "weight": 5 },
        { "id": "aud-12", "text": "Forensic Snapshotting (Memory/Process dump)", "description": "Upon suspicion of a breach, automatically dump volatile memory states and active process lists to secure storage for investigation.", "category": "Audit", "weight": 4 }
      ]
    }
  ]
};

// --- Repository Pattern (Dual Implementation) ---
class SecurityRepository {
  async getTargets(): Promise<any[]> {
    const targetsRes = await query('SELECT * FROM targets');
    const resultsRes = await query('SELECT * FROM checklist_results');

    return targetsRes.rows.map(t => {
      const targetResults: any = {};
      resultsRes.rows.filter((r: any) => r.target_id === t.id).forEach((r: any) => {
        if (!targetResults[r.checklist_id]) targetResults[r.checklist_id] = {};
        targetResults[r.checklist_id][r.item_id] = {
          checked: !!r.is_checked,
          justification: r.justification || '',
          reviewStatus: r.review_status || 'pending'
        };
      });
      return { 
        id: t.id,
        name: t.name,
        type: t.type,
        description: t.description,
        riskScore: t.risk_score,
        lastAnalyzed: t.last_analyzed,
        checklistResults: targetResults 
      };
    });
  }

  async addTarget(target: any): Promise<void> {
    await query(
      'INSERT INTO targets (id, name, type, description, risk_score, last_analyzed) VALUES ($1, $2, $3, $4, $5, $6)',
      [target.id, target.name, target.type, target.description, target.riskScore || 0, target.lastAnalyzed || null]
    );
    
    if (target.checklistResults) {
      for (const clId in target.checklistResults) {
        for (const itemId in target.checklistResults[clId]) {
          const res = target.checklistResults[clId][itemId];
          const isChecked = typeof res === 'boolean' ? res : res.checked;
          const justification = typeof res === 'boolean' ? null : res.justification;
          const reviewStatus = typeof res === 'boolean' ? 'pending' : res.reviewStatus;
          
          await query(
            'INSERT INTO checklist_results (target_id, checklist_id, item_id, is_checked, justification, review_status) VALUES ($1, $2, $3, $4, $5, $6)',
            [target.id, clId, itemId, isChecked ? 1 : 0, justification, reviewStatus]
          );
        }
      }
    }
  }

  async updateTarget(id: string, target: any): Promise<void> {
    await query(
      'UPDATE targets SET name = $1, type = $2, description = $3, risk_score = $4, last_analyzed = $5 WHERE id = $6',
      [target.name, target.type, target.description, target.riskScore, target.lastAnalyzed, id]
    );

    await query('DELETE FROM checklist_results WHERE target_id = $1', [id]);
    if (target.checklistResults) {
      for (const clId in target.checklistResults) {
        for (const itemId in target.checklistResults[clId]) {
          const res = target.checklistResults[clId][itemId];
          const isChecked = typeof res === 'boolean' ? res : res.checked;
          const justification = typeof res === 'boolean' ? null : res.justification;
          const reviewStatus = typeof res === 'boolean' ? 'pending' : res.reviewStatus;

          await query(
            'INSERT INTO checklist_results (target_id, checklist_id, item_id, is_checked, justification, review_status) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, clId, itemId, isChecked ? 1 : 0, justification, reviewStatus]
          );
        }
      }
    }
  }

  async deleteTarget(id: string): Promise<void> {
    await query('DELETE FROM targets WHERE id = $1', [id]);
  }

  async getChecklists(): Promise<any[]> {
    const checklistsRes = await query('SELECT * FROM checklists');
    const itemsRes = await query('SELECT * FROM checklist_items');

    return checklistsRes.rows.map(cl => ({
      id: cl.id,
      title: cl.title,
      description: cl.description,
      items: itemsRes.rows.filter((i: any) => i.checklist_id === cl.id).map((i: any) => ({
        id: i.id,
        checklistId: i.checklist_id,
        text: i.text,
        description: i.description,
        category: i.category,
        weight: i.weight
      }))
    }));
  }

  async saveChecklists(checklists: any[]): Promise<void> {
    if (DB_TYPE === 'postgres') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM checklist_items');
        await client.query('DELETE FROM checklists');
        
        for (const cl of checklists) {
          await client.query(
            'INSERT INTO checklists (id, title, description) VALUES ($1, $2, $3)',
            [cl.id, cl.title, cl.description]
          );
          for (const item of cl.items) {
            await client.query(
              'INSERT INTO checklist_items (id, checklist_id, text, description, category, weight) VALUES ($1, $2, $3, $4, $5, $6)',
              [item.id, cl.id, item.text, item.description || null, item.category, item.weight]
            );
          }
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      const transaction = sqliteDb.transaction((cls: any[]) => {
        sqliteDb.prepare('DELETE FROM checklist_items').run();
        sqliteDb.prepare('DELETE FROM checklists').run();
        
        for (const cl of cls) {
          sqliteDb.prepare('INSERT INTO checklists (id, title, description) VALUES (?, ?, ?)').run(cl.id, cl.title, cl.description);
          for (const item of cl.items) {
            sqliteDb.prepare('INSERT INTO checklist_items (id, checklist_id, text, description, category, weight) VALUES (?, ?, ?, ?, ?, ?)').run(item.id, cl.id, item.text, item.description || null, item.category, item.weight);
          }
        }
      });
      transaction(checklists);
    }
  }
}

const repo = new SecurityRepository();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Database
  try {
    await initDb();
    console.log('PostgreSQL initialized successfully');
  } catch (err) {
    console.error('Failed to initialize PostgreSQL:', err);
    // Don't exit, let the server start but APIs will fail
  }

  // API Routes
  app.get("/api/targets", async (req, res) => {
    try {
      const targets = await repo.getTargets();
      res.json(targets);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/targets", async (req, res) => {
    try {
      const newTarget = req.body;
      await repo.addTarget(newTarget);
      res.status(201).json(newTarget);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updatedTarget = req.body;
      await repo.updateTarget(id, updatedTarget);
      res.json(updatedTarget);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await repo.deleteTarget(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/checklists", async (req, res) => {
    try {
      const checklists = await repo.getChecklists();
      res.json(checklists);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/checklists", async (req, res) => {
    try {
      const checklist = req.body;
      const checklists = await repo.getChecklists();
      checklists.push(checklist);
      await repo.saveChecklists(checklists);
      res.status(201).json(checklist);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/checklists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updatedChecklist = req.body;
      const checklists = await repo.getChecklists();
      const index = checklists.findIndex(c => c.id === id);
      if (index !== -1) {
        checklists[index] = updatedChecklist;
        await repo.saveChecklists(checklists);
        res.json(updatedChecklist);
      } else {
        res.status(404).json({ error: "Checklist not found" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- AI Analysis Proxy (for non-Gemini models) ---
  app.post("/api/ai/analyze", async (req, res) => {
    const { prompt, model } = req.body;

    try {
      if (model === 'gpt-4o') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          })
        });

        const data = await response.json();
        const content = JSON.parse(data.choices[0].message.content);
        return res.json(content);
      }

      if (model === 'claude-3-5-sonnet') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt + "\n\nReturn ONLY a JSON object." }]
          })
        });

        const data = await response.json();
        const content = JSON.parse(data.content[0].text);
        return res.json(content);
      }

      res.status(400).json({ error: "Unsupported model" });
    } catch (error: any) {
      console.error('AI Proxy Error:', error.message);
      // Fallback for demo if keys are missing
      res.json({
        summary: `[DEMO MODE] ${model} analysis would appear here if API keys were configured.`,
        recommendations: ["Configure API keys in .env", "Check network connectivity"],
        severity: "Medium"
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

