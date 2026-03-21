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
      category TEXT NOT NULL,
      weight INTEGER NOT NULL,
      CONSTRAINT fk_checklist FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checklist_results (
      target_id TEXT NOT NULL,
      checklist_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      is_checked BOOLEAN NOT NULL,
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

  const targetCountRes = await query('SELECT COUNT(*) as count FROM targets');
  const count = parseInt(targetCountRes.rows[0].count);
  
  if (count === 0) {
    console.log('Initializing database with seed data...');
    
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

    for (const cl of INITIAL_DATA.checklists) {
      await query(
        'INSERT INTO checklists (id, title, description) VALUES ($1, $2, $3)',
        [cl.id, cl.title, cl.description]
      );
      for (const item of cl.items) {
        await query(
          'INSERT INTO checklist_items (id, checklist_id, text, category, weight) VALUES ($1, $2, $3, $4, $5)',
          [item.id, cl.id, item.text, item.category, item.weight]
        );
      }
    }
  }
}

const INITIAL_DATA = {
  targets: [
    {
      id: 't1',
      name: 'Warehouse AGV #1',
      type: 'Mobile Robot',
      description: 'Autonomous guided vehicle in Sector A.',
      checklistResults: { 'cl-1': { 'i1': true, 'i3': true, 'i5': true } },
      riskScore: 24,
      lastAnalyzed: '2024-03-20'
    },
    {
      id: 't2',
      name: 'Assembly Arm B-4',
      type: 'Industrial Arm',
      description: 'High-precision arm for electronics assembly.',
      checklistResults: { 'cl-1': { 'i2': false, 'i4': false, 'i6': false } },
      riskScore: 78,
      lastAnalyzed: '2024-03-19'
    }
  ],
  checklists: [
    {
      id: 'cl-1',
      title: 'Standard Robot Security Baseline',
      description: 'Essential security controls for autonomous mobile robots.',
      items: [
        { id: 'i1', text: 'Default passwords changed', category: 'Access Control', weight: 5 },
        { id: 'i2', text: 'Network traffic encrypted (TLS/SSL)', category: 'Network', weight: 4 },
        { id: 'i3', text: 'Physical ports disabled/locked', category: 'Physical', weight: 3 },
        { id: 'i4', text: 'Firmware update mechanism verified', category: 'Software', weight: 4 },
        { id: 'i5', text: 'Emergency stop functionality verified', category: 'Physical', weight: 5 },
        { id: 'i6', text: 'SSH access restricted to specific IPs', category: 'Network', weight: 3 },
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
        targetResults[r.checklist_id][r.item_id] = !!r.is_checked;
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
          await query(
            'INSERT INTO checklist_results (target_id, checklist_id, item_id, is_checked) VALUES ($1, $2, $3, $4)',
            [target.id, clId, itemId, target.checklistResults[clId][itemId] ? 1 : 0]
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
          await query(
            'INSERT INTO checklist_results (target_id, checklist_id, item_id, is_checked) VALUES ($1, $2, $3, $4)',
            [id, clId, itemId, target.checklistResults[clId][itemId] ? 1 : 0]
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
              'INSERT INTO checklist_items (id, checklist_id, text, category, weight) VALUES ($1, $2, $3, $4, $5)',
              [item.id, cl.id, item.text, item.category, item.weight]
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
            sqliteDb.prepare('INSERT INTO checklist_items (id, checklist_id, text, category, weight) VALUES (?, ?, ?, ?, ?)').run(item.id, cl.id, item.text, item.category, item.weight);
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

