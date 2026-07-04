import express from 'express';
import { db } from './db/index.js';
import { timeLogs } from './db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend files
app.use(express.static('.'));

// GET /api/sync?key=xxx
app.get('/api/sync', async (req, res) => {
  const syncKey = req.query.key;

  if (!syncKey) {
    return res.status(400).json({ error: "Missing sync key" });
  }

  try {
    const records = await db
      .select({
        id: timeLogs.id,
        date: timeLogs.date,
        startTime: timeLogs.startTime,
        endTime: timeLogs.endTime,
        totalHours: timeLogs.totalHours,
        note: timeLogs.note,
        method: timeLogs.method,
      })
      .from(timeLogs)
      .where(eq(timeLogs.syncKey, syncKey));

    res.json(records);
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// POST /api/sync?key=xxx
app.post('/api/sync', async (req, res) => {
  const syncKey = req.query.key;
  const body = req.body;

  if (!syncKey) {
    return res.status(400).json({ error: "Missing sync key" });
  }

  if (!Array.isArray(body)) {
    return res.status(400).json({ error: "Expected an array of records" });
  }

  try {
    // Delete old records for this key
    await db.delete(timeLogs).where(eq(timeLogs.syncKey, syncKey));

    if (body.length > 0) {
      await db.insert(timeLogs).values(
        body.map((rec) => ({
          id: String(rec.id),
          syncKey,
          date: String(rec.date),
          startTime: String(rec.startTime),
          endTime: String(rec.endTime),
          totalHours: Number(rec.totalHours),
          note: String(rec.note ?? ""),
          method: String(rec.method ?? "Manual"),
        }))
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error inserting logs:', err);
    res.status(500).json({ error: 'Database insert failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
