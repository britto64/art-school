import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { db, transaction } from "./db.js";

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi"]);
const SUBTITLE_EXTS = new Set([".srt", ".vtt"]);
const COVER_RE = /^(cover|banner|poster|folder)\.(jpe?g|png|webp)$/i;
// Arquivos compactados (inclusive volumes divididos tipo .001, .part1.rar, .z01)
const ARCHIVE_RE = /(\.(rar|zip|7z|tar|gz|tgz)|\.z?\d{2,3})$/i;
const SUBTITLE_DIR_RE = /^(subtitles?|legendas?|subs)$/i;
// Pastas de material didático (mesmo contendo vídeos de referência, não são aulas)
const MATERIALS_DIR_RE = /(materials?|materiais|materiels?|recursos|resources|assets|arquivos)/i;

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const naturalSort = (a: string, b: string) => collator.compare(a, b);

const relId = (relPath: string) =>
  crypto.createHash("sha1").update(relPath.split(path.sep).join("/")).digest("hex").slice(0, 16);

const toRel = (absPath: string) => path.relative(config.coursesPath, absPath);

interface Entry {
  name: string;
  abs: string;
  isDir: boolean;
}

function listDir(abs: string): Entry[] {
  try {
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .map((d) => ({ name: d.name, abs: path.join(abs, d.name), isDir: d.isDirectory() }));
  } catch {
    return [];
  }
}

const isVideo = (name: string) => VIDEO_EXTS.has(path.extname(name).toLowerCase());
const isSubtitle = (name: string) => SUBTITLE_EXTS.has(path.extname(name).toLowerCase());
const isArchive = (name: string) => ARCHIVE_RE.test(name);
const baseName = (name: string) => path.basename(name, path.extname(name));

/** Verifica recursivamente se um diretório contém algum vídeo */
function containsVideo(abs: string): boolean {
  for (const e of listDir(abs)) {
    if (!e.isDir && isVideo(e.name)) return true;
    if (e.isDir && containsVideo(e.abs)) return true;
  }
  return false;
}

/** Desce por pastas aninhadas de nível único (ex.: "Section 02/Section 02/*.mp4") */
function flatten(abs: string): string {
  let current = abs;
  for (let i = 0; i < 5; i++) {
    const entries = listDir(current);
    const dirs = entries.filter((e) => e.isDir);
    const hasVideoFile = entries.some((e) => !e.isDir && isVideo(e.name));
    if (!hasVideoFile && dirs.length === 1) {
      current = dirs[0].abs;
    } else {
      break;
    }
  }
  return current;
}

/** Lista todos os arquivos recursivamente (para materiais e vídeos de seção) */
function walkFiles(abs: string): Entry[] {
  const out: Entry[] = [];
  for (const e of listDir(abs)) {
    if (e.isDir) out.push(...walkFiles(e.abs));
    else out.push(e);
  }
  return out;
}

interface LessonRow {
  id: string;
  section: string | null;
  sectionOrder: number;
  sortOrder: number;
  title: string;
  relPath: string;
}
interface SubtitleRow {
  id: string;
  lessonId: string;
  lang: string;
  relPath: string;
}
interface MaterialRow {
  id: string;
  name: string;
  relPath: string;
  size: number;
}
interface CourseRow {
  id: string;
  title: string;
  category: string | null;
  relPath: string;
  status: "ready" | "not_ready";
  banner: string | null;
  lessons: LessonRow[];
  subtitles: SubtitleRow[];
  materials: MaterialRow[];
}

function scanCourse(courseDir: Entry): CourseRow {
  const folderName = courseDir.name;
  const underscore = folderName.indexOf("_");
  const category = underscore > 0 ? folderName.slice(0, underscore) : null;
  const title = underscore > 0 ? folderName.slice(underscore + 1).trim() : folderName;
  const courseId = relId(toRel(courseDir.abs));

  const root = flatten(courseDir.abs);
  const rootEntries = listDir(root);
  // cover.jpg pode estar na raiz original ou na raiz "achatada"
  const coverEntry =
    listDir(courseDir.abs).find((e) => !e.isDir && COVER_RE.test(e.name)) ??
    rootEntries.find((e) => !e.isDir && COVER_RE.test(e.name));

  const lessons: LessonRow[] = [];
  const subtitles: SubtitleRow[] = [];
  const materials: MaterialRow[] = [];
  // basename (minúsculo) -> lessonId, para casar legendas por idioma
  const lessonByBase = new Map<string, string>();
  let archivesPresent = false;

  const addLesson = (fileAbs: string, section: string | null, sectionOrder: number, sortOrder: number) => {
    const rel = toRel(fileAbs);
    const id = relId(rel);
    lessons.push({ id, section, sectionOrder, sortOrder, title: baseName(fileAbs), relPath: rel });
    lessonByBase.set(baseName(fileAbs).toLowerCase(), id);
  };

  const addSidecarSubs = (dirAbs: string) => {
    for (const e of listDir(dirAbs)) {
      if (e.isDir) continue;
      if (!isSubtitle(e.name)) continue;
      const lessonId = lessonByBase.get(baseName(e.name).toLowerCase());
      if (!lessonId) continue;
      const rel = toRel(e.abs);
      subtitles.push({ id: relId(rel), lessonId, lang: "Padrão", relPath: rel });
    }
  };

  const addMaterialsFromDir = (dirAbs: string, prefix: string) => {
    for (const f of walkFiles(dirAbs)) {
      if (isSubtitle(f.name)) continue;
      const rel = toRel(f.abs);
      const name = prefix ? `${prefix}/${path.relative(dirAbs, f.abs).split(path.sep).join("/")}` : f.name;
      let size = 0;
      try {
        size = fs.statSync(f.abs).size;
      } catch {}
      materials.push({ id: relId(rel), name, relPath: rel, size });
    }
  };

  // ---- classifica o conteúdo da raiz do curso ----
  const sectionDirs: Entry[] = [];
  const materialDirs: Entry[] = [];
  let subtitleRoot: Entry | null = null;

  for (const e of rootEntries) {
    if (e.isDir) {
      if (SUBTITLE_DIR_RE.test(e.name)) subtitleRoot = e;
      else if (MATERIALS_DIR_RE.test(e.name)) materialDirs.push(e);
      else if (containsVideo(e.abs)) sectionDirs.push(e);
      else materialDirs.push(e);
    } else {
      if (isArchive(e.name)) archivesPresent = true;
      else if (!isVideo(e.name) && !isSubtitle(e.name) && !COVER_RE.test(e.name)) {
        const rel = toRel(e.abs);
        let size = 0;
        try {
          size = fs.statSync(e.abs).size;
        } catch {}
        materials.push({ id: relId(rel), name: e.name, relPath: rel, size });
      }
    }
  }

  // vídeos soltos na raiz = curso "plano" (sem seções)
  const rootVideos = rootEntries.filter((e) => !e.isDir && isVideo(e.name)).sort((a, b) => naturalSort(a.name, b.name));
  rootVideos.forEach((v, i) => addLesson(v.abs, null, -1, i));
  if (rootVideos.length > 0) addSidecarSubs(root);

  // seções
  sectionDirs.sort((a, b) => naturalSort(a.name, b.name));
  sectionDirs.forEach((sec, sIdx) => {
    const secRoot = flatten(sec.abs);
    const videos = walkFiles(secRoot)
      .filter((f) => isVideo(f.name))
      .sort((a, b) => naturalSort(toRel(a.abs), toRel(b.abs)));
    videos.forEach((v, i) => addLesson(v.abs, sec.name, sIdx, i));
    // legendas sidecar dentro da seção (em qualquer nível)
    const subDirs = new Set(videos.map((v) => path.dirname(v.abs)));
    for (const d of subDirs) addSidecarSubs(d);
  });

  // materiais (pastas sem vídeo)
  for (const m of materialDirs) addMaterialsFromDir(m.abs, m.name);

  // legendas por idioma: Subtitles/<Idioma>/<mesmo basename>.srt
  if (subtitleRoot) {
    for (const langDir of listDir(subtitleRoot.abs)) {
      if (!langDir.isDir) continue;
      for (const f of walkFiles(langDir.abs)) {
        if (!isSubtitle(f.name)) continue;
        const lessonId = lessonByBase.get(baseName(f.name).toLowerCase());
        if (!lessonId) continue;
        const rel = toRel(f.abs);
        subtitles.push({ id: relId(rel), lessonId, lang: langDir.name, relPath: rel });
      }
    }
  }

  return {
    id: courseId,
    title,
    category,
    relPath: toRel(courseDir.abs),
    status: lessons.length > 0 ? "ready" : "not_ready",
    banner: coverEntry ? toRel(coverEntry.abs) : null,
    lessons,
    subtitles,
    materials
  };
}

export function scanLibrary(): { courses: number; lessons: number } {
  const courseDirs = listDir(config.coursesPath).filter((e) => e.isDir);
  const courses = courseDirs.map(scanCourse);

  // guarda durações já conhecidas para não rodar ffprobe de novo
  const knownDurations = new Map<string, number>(
    (db.prepare("SELECT id, duration FROM lessons WHERE duration IS NOT NULL").all() as { id: string; duration: number }[]).map(
      (r) => [r.id, r.duration]
    )
  );

  transaction(() => {
    db.prepare("DELETE FROM courses").run();
    db.prepare("DELETE FROM lessons").run();
    db.prepare("DELETE FROM materials").run();
    db.prepare("DELETE FROM subtitles").run();

    const insCourse = db.prepare(
      "INSERT INTO courses (id, title, category, rel_path, status, banner, sort_title) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const insLesson = db.prepare(
      "INSERT OR IGNORE INTO lessons (id, course_id, section, section_order, sort_order, title, rel_path, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insMaterial = db.prepare(
      "INSERT OR IGNORE INTO materials (id, course_id, name, rel_path, size) VALUES (?, ?, ?, ?, ?)"
    );
    const insSubtitle = db.prepare(
      "INSERT OR IGNORE INTO subtitles (id, lesson_id, lang, rel_path) VALUES (?, ?, ?, ?)"
    );

    for (const c of courses) {
      insCourse.run(c.id, c.title, c.category, c.relPath, c.status, c.banner, c.title.toLowerCase());
      for (const l of c.lessons)
        insLesson.run(l.id, c.id, l.section, l.sectionOrder, l.sortOrder, l.title, l.relPath, knownDurations.get(l.id) ?? null);
      for (const m of c.materials) insMaterial.run(m.id, c.id, m.name, m.relPath, m.size);
      for (const s of c.subtitles) insSubtitle.run(s.id, s.lessonId, s.lang, s.relPath);
    }
  });

  const lessons = courses.reduce((acc, c) => acc + c.lessons.length, 0);
  console.log(`[scanner] ${courses.length} cursos, ${lessons} aulas encontradas em ${config.coursesPath}`);
  return { courses: courses.length, lessons };
}
