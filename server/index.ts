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
  sqliteDb = new Database(path.join(process.cwd(), 'server', 'data', 'database.sqlite'));
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
async function loadSeedData() {
  let targets: any[] = [];
  let checklists: any[] = [];
  const dataDir = path.join(process.cwd(), 'server', 'data');

  try {
    const targetsData = await fs.readFile(path.join(dataDir, 'data.json'), 'utf-8');
    const parsedTargets = JSON.parse(targetsData);
    targets = parsedTargets.targets || [];
  } catch (err) {
    console.error('Failed to load data.json for targets');
  }

  const checklistsDir = path.join(dataDir, 'checklists');
  try {
    const files = await fs.readdir(checklistsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const fileData = await fs.readFile(path.join(checklistsDir, file), 'utf-8');
          const parsedData = JSON.parse(fileData);
          const parsedArray = Array.isArray(parsedData) ? parsedData : [parsedData];
          
          // 파일 구조 검증: id와 items 배열을 포함한 객체인지 확인
          const validChecklists = parsedArray.filter((item: any) => item.id && item.items);
          
          if (validChecklists.length > 0) {
            checklists = checklists.concat(validChecklists);
            console.log(`Loaded ${validChecklists.length} checklists from ${file}`);
          } else {
            console.warn(`Ignored ${file}: No valid checklist structure found (missing 'id' or 'items').`);
          }
        } catch (err) {
          console.error(`Failed to parse or load checklist file ${file}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to read checklists directory:', err);
  }

  return { targets, checklists };
}

// Helper function for dynamic risk score calculation on the backend
const calculateGlobalRiskScore = (results: Record<string, Record<string, any>>, allChecklists: any[]) => {
  if (!results) results = {};
  if (!allChecklists) return 0;
  let totalWeight = 0;
  let failedWeight = 0;

  allChecklists.forEach(cl => {
    const clResults = results[cl.id] || {};
    cl.items.forEach((item: any) => {
      totalWeight += item.weight;
      const res = clResults[item.id];
      const isCompleted = typeof res === 'boolean' ? res : res?.checked;
      const isApproved = typeof res === 'object' ? res?.reviewStatus === 'approved' : false;

      if (!isCompleted && !isApproved) {
        failedWeight += item.weight;
      }
    });
  });

  return totalWeight > 0 ? Math.round((failedWeight / totalWeight) * 100) : 0;
};

// --- Database Schema Initialization ---
async function initDb() {
  const INITIAL_DATA = await loadSeedData();
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
      implementation_guide TEXT,
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

    CREATE TABLE IF NOT EXISTS security_history (
      id ${DB_TYPE === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${DB_TYPE === 'sqlite' ? 'AUTOINCREMENT' : ''},
      timestamp TEXT NOT NULL,
      avg_risk INTEGER NOT NULL,
      active_targets INTEGER NOT NULL,
      critical_alerts INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guides (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL
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
    const itemColumns = sqliteDb.prepare("PRAGMA table_info(checklist_items)").all();
    if (!itemColumns.some((c: any) => c.name === 'description')) {
      sqliteDb.exec("ALTER TABLE checklist_items ADD COLUMN description TEXT");
    }
    if (!itemColumns.some((c: any) => c.name === 'implementation_guide')) {
      sqliteDb.exec("ALTER TABLE checklist_items ADD COLUMN implementation_guide TEXT");
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
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_items' AND column_name='description') THEN
          ALTER TABLE checklist_items ADD COLUMN description TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_items' AND column_name='implementation_guide') THEN
          ALTER TABLE checklist_items ADD COLUMN implementation_guide TEXT;
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
    await seedDatabase(INITIAL_DATA);
  }
}

// Refactoring: Seed logic completely decoupled into a reusable function
async function seedDatabase(initialData?: any) {
  const INITIAL_DATA = initialData || await loadSeedData();

  // Clear existing data
  await query('DELETE FROM checklist_results');
  await query('DELETE FROM checklist_items');
  await query('DELETE FROM checklists');
  await query('DELETE FROM targets');
  await query('DELETE FROM guides');

  for (const cl of INITIAL_DATA.checklists) {
    await query(
      'INSERT INTO checklists (id, title, description) VALUES ($1, $2, $3)',
      [cl.id, cl.title, cl.description]
    );
    for (const item of cl.items) {
      await query(
        'INSERT INTO checklist_items (id, checklist_id, text, description, category, weight, implementation_guide) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [item.id, cl.id, item.text, item.description || null, item.category, item.weight, item.implementationGuide || null]
      );
    }
  }

  for (const t of INITIAL_DATA.targets) {
    // Calculate score dynamically based on checklists, ignoring hardcoded values
    const riskScore = calculateGlobalRiskScore(t.checklistResults as any, INITIAL_DATA.checklists);
    await query(
      'INSERT INTO targets (id, name, type, description, risk_score, last_analyzed) VALUES ($1, $2, $3, $4, $5, $6)',
      [t.id, t.name, t.type, t.description, riskScore, t.lastAnalyzed]
    );

    if (t.checklistResults) {
      for (const clId in t.checklistResults) {
        for (const itemId in t.checklistResults[clId]) {
          const res = (t.checklistResults[clId] as any)[itemId];
          const isChecked = typeof res === 'boolean' ? res : res.checked;
          const justification = typeof res === 'boolean' ? null : res.justification;
          const reviewStatus = typeof res === 'boolean' ? 'pending' : res.reviewStatus;

          await query(
            'INSERT INTO checklist_results (target_id, checklist_id, item_id, is_checked, justification, review_status) VALUES ($1, $2, $3, $4, $5, $6)',
            [t.id, clId, itemId, isChecked ? 1 : 0, justification, reviewStatus]
          );
        }
      }
    }
  }

  // Seed some history data if empty
  const historyCountRes = await query('SELECT COUNT(*) as count FROM security_history');
  if (parseInt(historyCountRes.rows[0].count) === 0) {
    console.log('Seeding security history...');
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const mockAvgRisk = 20 + Math.floor(Math.random() * 10) - (7 - i);
      const mockActiveTargets = 1;
      const mockCriticalAlerts = mockAvgRisk > 70 ? 1 : 0;

      await query(
        'INSERT INTO security_history (timestamp, avg_risk, active_targets, critical_alerts) VALUES ($1, $2, $3, $4)',
        [date.toISOString(), mockAvgRisk, mockActiveTargets, mockCriticalAlerts]
      );
    }
    console.log('Security history seeded successfully.');
  }

  // Seed guides from local directory if available
  const guidesDir = path.join(process.cwd(), 'server', 'data', 'guides');
  try {
    await fs.access(guidesDir);
    const files = await fs.readdir(guidesDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await fs.readFile(path.join(guidesDir, file), 'utf-8');
        const titleMatch = content.match(/^#+\s+(.*)$/m);
        const title = titleMatch ? titleMatch[1].replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() : file.replace('.md', '');
        const id = `g-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        await query(
          'INSERT INTO guides (id, title, description, content) VALUES ($1, $2, $3, $4)',
          [id, title, `Imported from local file: ${file}`, content]
        );
      }
    }
    console.log('Local guides seeded successfully.');
  } catch (err) {
    console.log('No local guides directory found or error reading it, skipping file-based guides seed.');
  }
}

async function recordSecuritySnapshot() {
  try {
    const targetsRes = await query('SELECT risk_score FROM targets');
    const targets = targetsRes.rows;
    if (targets.length === 0) return;

    const avgRisk = Math.round(targets.reduce((acc: number, t: any) => acc + t.risk_score, 0) / targets.length);
    const criticalAlerts = targets.filter((t: any) => t.risk_score > 70).length;
    const activeTargets = targets.length;

    await query(
      'INSERT INTO security_history (timestamp, avg_risk, active_targets, critical_alerts) VALUES ($1, $2, $3, $4)',
      [new Date().toISOString(), avgRisk, activeTargets, criticalAlerts]
    );
  } catch (err) {
    console.error('Failed to record security snapshot:', err);
  }
}

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
        implementationGuide: i.implementation_guide,
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
              'INSERT INTO checklist_items (id, checklist_id, text, description, category, weight, implementation_guide) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [item.id, cl.id, item.text, item.description || null, item.category, item.weight, item.implementationGuide || null]
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
            sqliteDb.prepare('INSERT INTO checklist_items (id, checklist_id, text, description, category, weight, implementation_guide) VALUES (?, ?, ?, ?, ?, ?, ?)').run(item.id, cl.id, item.text, item.description || null, item.category, item.weight, item.implementationGuide || null);
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
    console.log(`${DB_TYPE === 'postgres' ? 'PostgreSQL' : 'SQLite'} initialized successfully`);
  } catch (err) {
    console.error(`Failed to initialize ${DB_TYPE === 'postgres' ? 'PostgreSQL' : 'SQLite'}:`, err);
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
      await recordSecuritySnapshot();
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
      await recordSecuritySnapshot();
      res.json(updatedTarget);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await repo.deleteTarget(id);
      await recordSecuritySnapshot();
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/backup", async (req, res) => {
    try {
      const targets = await query('SELECT * FROM targets');
      const checklists = await query('SELECT * FROM checklists');
      const checklistItems = await query('SELECT * FROM checklist_items');
      const checklistResults = await query('SELECT * FROM checklist_results');
      const history = await query('SELECT * FROM security_history');

      const backupData = {
        timestamp: new Date().toISOString(),
        targets: targets.rows,
        checklists: checklists.rows,
        checklistItems: checklistItems.rows,
        checklistResults: checklistResults.rows,
        history: history.rows
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=security_backup_${new Date().toISOString().split('T')[0]}.json`);
      res.send(JSON.stringify(backupData, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const history = await query('SELECT * FROM security_history ORDER BY timestamp DESC LIMIT 30');
      res.json(history.rows);
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

  // NEW: Add 3 essential APIs called by the frontend (Refactoring)

  app.post("/api/seed", async (req, res) => {
    try {
      await seedDatabase();
      res.json({ success: true, message: "Database completely seeded and recalculated." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      // Return an empty array to prevent frontend crashes until the history table is introduced in the future
      res.json([]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/backup", async (req, res) => {
    try {
      const targets = await repo.getTargets();
      const checklists = await repo.getChecklists();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="humanoid-sec-backup.json"');
      res.send(JSON.stringify({ targets, checklists }, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // NEW: Guides APIs
  app.get("/api/guides", async (req, res) => {
    try {
      const guides = await query('SELECT * FROM guides');
      res.json(guides.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/guides", async (req, res) => {
    try {
      const guide = req.body;
      await query(
        'INSERT INTO guides (id, title, description, content) VALUES ($1, $2, $3, $4)',
        [guide.id, guide.title, guide.description || '', guide.content]
      );
      res.status(201).json(guide);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/guides/:id", async (req, res) => {
    try {
      await query('DELETE FROM guides WHERE id = $1', [req.params.id]);
      res.status(204).send();
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
