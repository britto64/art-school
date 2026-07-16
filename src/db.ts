import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { config } from "./config.js";

export const db = new DatabaseSync(path.join(config.dataPath, "artschool.db"));
db.exec("PRAGMA journal_mode = WAL");

/** Executa fn dentro de uma transação */
export function transaction(fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS courses (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  category   TEXT,
  rel_path   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ready',
  banner     TEXT,
  sort_title TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  section       TEXT,
  section_order INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  rel_path      TEXT NOT NULL,
  duration      REAL
);

CREATE TABLE IF NOT EXISTS materials (
  id        TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  name      TEXT NOT NULL,
  rel_path  TEXT NOT NULL,
  size      INTEGER
);

CREATE TABLE IF NOT EXISTS subtitles (
  id        TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  lang      TEXT NOT NULL,
  rel_path  TEXT NOT NULL
);

-- Progresso é persistente: nunca é apagado no rescan.
-- lesson_id = hash do caminho relativo, então sobrevive à migração para o NAS.
CREATE TABLE IF NOT EXISTS progress (
  lesson_id    TEXT PRIMARY KEY,
  position_sec REAL NOT NULL DEFAULT 0,
  completed    INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, section_order, sort_order);
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
CREATE INDEX IF NOT EXISTS idx_subtitles_lesson ON subtitles(lesson_id);
`);
