import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

export const timeLogs = pgTable("time_logs", {
  id: text().primaryKey(),
  syncKey: text("sync_key").notNull(),
  date: text().notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  totalHours: real("total_hours").notNull(),
  note: text().notNull().default(""),
  method: text().notNull().default("Manual"),
  createdAt: timestamp("created_at").defaultNow(),
});
