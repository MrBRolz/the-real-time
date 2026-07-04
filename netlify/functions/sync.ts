import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { timeLogs } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export default async (req: Request) => {
  const url = new URL(req.url);
  const syncKey = url.searchParams.get("key");

  if (!syncKey) {
    return Response.json({ error: "Missing sync key" }, { status: 400 });
  }

  if (req.method === "GET") {
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

    return Response.json(records);
  }

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!Array.isArray(body)) {
      return Response.json({ error: "Expected an array of records" }, { status: 400 });
    }

    // Replace all records for this sync key so deletions propagate correctly
    await db.delete(timeLogs).where(eq(timeLogs.syncKey, syncKey));

    if (body.length > 0) {
      await db.insert(timeLogs).values(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body.map((rec: any) => ({
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

    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/sync",
};
