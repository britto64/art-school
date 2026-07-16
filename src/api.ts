import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { scanLibrary } from "./scanner.js";
import {
  fillMissingDurations,
  generateMissingTrickplay,
  generateThumb,
  getLessonThumb,
  remuxStream
} from "./ffmpeg.js";

export const api = Router();

const absPath = (relPath: string) => path.join(config.coursesPath, relPath);

// mp4/webm tocam direto no browser; o resto (mkv, avi, mov) passa por remux
const DIRECT_PLAY = new Set([".mp4", ".m4v", ".webm"]);

// ---------- tipos de material ----------
export type MaterialKind = "video" | "image" | "pdf" | "text" | "audio" | "brush" | "psd" | "clip" | "archive" | "other";

const KIND_BY_EXT: Record<string, MaterialKind> = {
  ".mov": "video", ".mp4": "video", ".m4v": "video", ".mkv": "video", ".webm": "video", ".avi": "video",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".bmp": "image",
  ".pdf": "pdf",
  ".txt": "text", ".md": "text",
  ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".ogg": "audio",
  ".abr": "brush",
  ".psd": "psd", ".psb": "psd",
  ".clip": "clip",
  ".zip": "archive", ".rar": "archive", ".7z": "archive"
};

// tipos que o navegador consegue abrir direto (ou via remux, no caso de vídeo)
const VIEWABLE: Set<MaterialKind> = new Set(["video", "image", "pdf", "text", "audio"]);

const materialKind = (relPath: string): MaterialKind =>
  KIND_BY_EXT[path.extname(relPath).toLowerCase()] ?? "other";

interface CourseSummary {
  id: string;
  title: string;
  category: string | null;
  status: string;
  banner: string | null;
  lesson_count: number;
  completed_count: number;
  total_duration: number | null;
  last_watched: string | null;
}

// ---------- Home ----------
api.get("/courses", (_req, res) => {
  const courses = db
    .prepare(
      `SELECT c.id, c.title, c.category, c.status, c.banner,
              COUNT(l.id) AS lesson_count,
              COALESCE(SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count,
              SUM(l.duration) AS total_duration,
              MAX(p.updated_at) AS last_watched
       FROM courses c
       LEFT JOIN lessons l ON l.course_id = c.id
       LEFT JOIN progress p ON p.lesson_id = l.id
       GROUP BY c.id
       ORDER BY c.sort_title`
    )
    .all() as unknown as CourseSummary[];

  const continueWatching = db
    .prepare(
      `SELECT p.lesson_id AS lessonId, p.position_sec AS position, p.updated_at AS updatedAt,
              l.title AS lessonTitle, l.duration, l.course_id AS courseId,
              c.title AS courseTitle
       FROM progress p
       JOIN lessons l ON l.id = p.lesson_id
       JOIN courses c ON c.id = l.course_id
       WHERE p.completed = 0 AND p.position_sec > 10
       ORDER BY p.updated_at DESC
       LIMIT 10`
    )
    .all();

  res.json({
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
      hasBanner: c.status === "ready" || c.banner !== null,
      lessonCount: c.lesson_count,
      completedCount: c.completed_count,
      totalDuration: c.total_duration,
      progressPct: c.lesson_count > 0 ? Math.round((c.completed_count / c.lesson_count) * 100) : 0,
      lastWatched: c.last_watched
    })),
    continueWatching
  });
});

// ---------- Página do curso ----------
api.get("/courses/:id", (req, res) => {
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!course) return res.status(404).json({ error: "Curso não encontrado" });

  const lessons = db
    .prepare(
      `SELECT l.id, l.section, l.section_order, l.sort_order, l.title, l.duration,
              COALESCE(p.position_sec, 0) AS position, COALESCE(p.completed, 0) AS completed
       FROM lessons l
       LEFT JOIN progress p ON p.lesson_id = l.id
       WHERE l.course_id = ?
       ORDER BY l.section_order, l.sort_order`
    )
    .all(req.params.id) as unknown as {
    id: string;
    section: string | null;
    section_order: number;
    title: string;
    duration: number | null;
    position: number;
    completed: number;
  }[];

  // agrupa por seção preservando a ordem
  const sections: { title: string | null; lessons: typeof lessons }[] = [];
  for (const l of lessons) {
    const last = sections[sections.length - 1];
    if (!last || last.title !== l.section) sections.push({ title: l.section, lessons: [l] });
    else last.lessons.push(l);
  }

  const materials = (
    db
      .prepare("SELECT id, name, size, rel_path FROM materials WHERE course_id = ? ORDER BY name")
      .all(req.params.id) as unknown as { id: string; name: string; size: number; rel_path: string }[]
  ).map((m) => {
    const kind = materialKind(m.rel_path);
    return { id: m.id, name: m.name, size: m.size, kind, viewable: VIEWABLE.has(kind) };
  });

  res.json({ ...course, sections, materials });
});

// ---------- Payload do player ----------
api.get("/lessons/:id", (req, res) => {
  const lesson = db
    .prepare(
      `SELECT l.*, COALESCE(p.position_sec, 0) AS position, COALESCE(p.completed, 0) AS completed
       FROM lessons l LEFT JOIN progress p ON p.lesson_id = l.id
       WHERE l.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!lesson) return res.status(404).json({ error: "Aula não encontrada" });

  const course = db.prepare("SELECT id, title FROM courses WHERE id = ?").get(lesson.course_id as string);
  const siblings = db
    .prepare("SELECT id, title FROM lessons WHERE course_id = ? ORDER BY section_order, sort_order")
    .all(lesson.course_id as string) as unknown as { id: string; title: string }[];
  const idx = siblings.findIndex((s) => s.id === req.params.id);

  const subtitles = db
    .prepare("SELECT id, lang FROM subtitles WHERE lesson_id = ? ORDER BY lang")
    .all(req.params.id);

  const ext = path.extname(lesson.rel_path as string).toLowerCase();

  res.json({
    id: lesson.id,
    title: lesson.title,
    section: lesson.section,
    duration: lesson.duration,
    position: lesson.position,
    completed: lesson.completed,
    course,
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
    subtitles,
    directPlay: DIRECT_PLAY.has(ext)
  });
});

// ---------- Streaming ----------
api.get("/stream/:id", (req, res) => {
  const lesson = db.prepare("SELECT rel_path FROM lessons WHERE id = ?").get(req.params.id) as
    | { rel_path: string }
    | undefined;
  if (!lesson) return res.status(404).end();
  const file = absPath(lesson.rel_path);
  if (!fs.existsSync(file)) return res.status(404).end();

  const ext = path.extname(file).toLowerCase();
  const transcode = req.query.transcode === "1";

  if (DIRECT_PLAY.has(ext) && !transcode) {
    // Streaming direto com suporte a Range (seek nativo)
    const stat = fs.statSync(file);
    const contentType = ext === ".webm" ? "video/webm" : "video/mp4";
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (start >= stat.size) return res.status(416).setHeader("Content-Range", `bytes */${stat.size}`).end();
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", end - start + 1);
      res.setHeader("Content-Type", contentType);
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", "bytes");
      fs.createReadStream(file).pipe(res);
    }
    return;
  }

  // Remux (mkv etc.): mp4 fragmentado via ffmpeg; seek = novo request com ?t=
  const startSec = Math.max(0, Number(req.query.t) || 0);
  res.setHeader("Content-Type", "video/mp4");
  const ff = remuxStream(file, startSec, transcode);
  ff.stdout.pipe(res);
  const kill = () => {
    try {
      ff.kill("SIGKILL");
    } catch {}
  };
  res.on("close", kill);
  ff.on("error", () => res.destroy());
});

// ---------- Legendas (SRT -> WebVTT) ----------
function srtToVtt(buf: Buffer): string {
  let text = buf.toString("utf8");
  if (text.includes("�")) text = buf.toString("latin1"); // arquivos antigos em latin1
  text = text.replace(/^﻿/, "");
  if (/^\s*WEBVTT/.test(text)) return text;
  const converted = text
    .replace(/\r+/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return "WEBVTT\n\n" + converted;
}

api.get("/subtitles/:id", (req, res) => {
  const sub = db.prepare("SELECT rel_path FROM subtitles WHERE id = ?").get(req.params.id) as
    | { rel_path: string }
    | undefined;
  if (!sub) return res.status(404).end();
  const file = absPath(sub.rel_path);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.setHeader("Content-Type", "text/vtt; charset=utf-8");
  res.send(srtToVtt(fs.readFileSync(file)));
});

// ---------- Materiais ----------
api.get("/materials/:id", (req, res) => {
  const mat = db.prepare("SELECT rel_path, name FROM materials WHERE id = ?").get(req.params.id) as
    | { rel_path: string; name: string }
    | undefined;
  if (!mat) return res.status(404).end();
  const file = absPath(mat.rel_path);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.download(file, path.basename(mat.rel_path));
});

// visualizar material no navegador (imagem/pdf/txt direto; vídeo via remux se preciso)
api.get("/materials/:id/view", (req, res) => {
  const mat = db.prepare("SELECT rel_path FROM materials WHERE id = ?").get(req.params.id) as
    | { rel_path: string }
    | undefined;
  if (!mat) return res.status(404).end();
  const file = absPath(mat.rel_path);
  if (!fs.existsSync(file)) return res.status(404).end();

  const ext = path.extname(file).toLowerCase();
  const kind = materialKind(mat.rel_path);

  if (kind === "video" && !DIRECT_PLAY.has(ext)) {
    // .mov/.mkv/.avi: remux para mp4 fragmentado, igual às aulas
    res.setHeader("Content-Type", "video/mp4");
    const ff = remuxStream(file, 0, false);
    ff.stdout.pipe(res);
    const kill = () => {
      try {
        ff.kill("SIGKILL");
      } catch {}
    };
    res.on("close", kill);
    ff.on("error", () => res.destroy());
    return;
  }

  if (!VIEWABLE.has(kind)) {
    // não dá para abrir no navegador — cai no download
    return res.download(file, path.basename(mat.rel_path));
  }

  if (kind === "text") res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.sendFile(file); // sendFile já cuida de Content-Type e Range (seek de vídeo mp4)
});

// ---------- Thumbnails / banners ----------
const sendJpeg = (res: import("express").Response, img: Uint8Array) => {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=604800");
  res.end(Buffer.from(img.buffer, img.byteOffset, img.byteLength));
};

// thumbnail de uma aula (gera sob demanda e cacheia na db)
api.get("/thumb/lesson/:id", async (req, res) => {
  const img = await getLessonThumb(req.params.id);
  if (!img) return res.status(404).end();
  sendJpeg(res, img);
});

api.get("/thumb/:courseId", async (req, res) => {
  const course = db.prepare("SELECT id, banner FROM courses WHERE id = ?").get(req.params.courseId) as
    | { id: string; banner: string | null }
    | undefined;
  if (!course) return res.status(404).end();

  // cover.jpg manual tem prioridade
  if (course.banner) {
    const file = absPath(course.banner);
    if (fs.existsSync(file)) return res.sendFile(file);
  }

  // senão, gera do primeiro vídeo
  const first = db
    .prepare("SELECT rel_path FROM lessons WHERE course_id = ? ORDER BY section_order, sort_order LIMIT 1")
    .get(course.id) as { rel_path: string } | undefined;
  if (!first) return res.status(404).end();
  const thumb = await generateThumb(course.id, absPath(first.rel_path));
  if (!thumb) return res.status(404).end();
  res.sendFile(thumb);
});

// ---------- Trickplay (preview da timeline) ----------
api.get("/trickplay/:id", (req, res) => {
  const tp = db
    .prepare(
      "SELECT interval, tile_w, tile_h, tile_cols, tile_rows, frames, sheets FROM trickplay WHERE lesson_id = ?"
    )
    .get(req.params.id) as
    | { interval: number; tile_w: number; tile_h: number; tile_cols: number; tile_rows: number; frames: number; sheets: number }
    | undefined;
  if (!tp || tp.frames === 0) return res.status(404).json({ error: "Trickplay indisponível" });
  res.json({
    interval: tp.interval,
    tileW: tp.tile_w,
    tileH: tp.tile_h,
    cols: tp.tile_cols,
    rows: tp.tile_rows,
    frames: tp.frames,
    sheets: tp.sheets
  });
});

api.get("/trickplay/:id/:sheet", (req, res) => {
  const row = db
    .prepare("SELECT img FROM trickplay_sheets WHERE lesson_id = ? AND idx = ?")
    .get(req.params.id, Number(req.params.sheet) || 0) as { img: Uint8Array } | undefined;
  if (!row) return res.status(404).end();
  sendJpeg(res, row.img);
});

// ---------- Progresso ----------
api.post("/progress", (req, res) => {
  const { lessonId, position, completed } = req.body as {
    lessonId?: string;
    position?: number;
    completed?: boolean;
  };
  if (!lessonId) return res.status(400).json({ error: "lessonId obrigatório" });
  const lesson = db.prepare("SELECT id, duration FROM lessons WHERE id = ?").get(lessonId) as
    | { id: string; duration: number | null }
    | undefined;
  if (!lesson) return res.status(404).json({ error: "Aula não encontrada" });

  const pos = Math.max(0, Number(position) || 0);
  let done: number;
  if (typeof completed === "boolean") {
    done = completed ? 1 : 0; // marcação manual
  } else {
    const existing = db.prepare("SELECT completed FROM progress WHERE lesson_id = ?").get(lessonId) as
      | { completed: number }
      | undefined;
    done = existing?.completed ?? 0;
    // completa automaticamente ao assistir >= 90%
    if (!done && lesson.duration && pos / lesson.duration >= 0.9) done = 1;
  }

  db.prepare(
    `INSERT INTO progress (lesson_id, position_sec, completed, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(lesson_id) DO UPDATE SET position_sec = excluded.position_sec,
       completed = excluded.completed, updated_at = excluded.updated_at`
  ).run(lessonId, pos, done);

  res.json({ ok: true, completed: done === 1 });
});

// ---------- Rescan ----------
api.post("/scan", (_req, res) => {
  const result = scanLibrary();
  void fillMissingDurations().then(() => generateMissingTrickplay());
  res.json(result);
});
