export interface CourseSummary {
  id: string;
  title: string;
  category: string | null;
  teacher: string | null;
  status: "ready" | "not_ready";
  hasBanner: boolean;
  lessonCount: number;
  completedCount: number;
  sectionCount: number;
  totalDuration: number | null;
  durationPartial: boolean;
  progressPct: number;
  lastWatched: string | null;
}

export interface ContinueItem {
  lessonId: string;
  position: number;
  updatedAt: string;
  lessonTitle: string;
  duration: number | null;
  courseId: string;
  courseTitle: string;
}

export interface HomeData {
  courses: CourseSummary[];
  continueWatching: ContinueItem[];
}

export interface LessonRow {
  id: string;
  title: string;
  duration: number | null;
  position: number;
  completed: number;
}

export type MaterialKind =
  | "video"
  | "image"
  | "pdf"
  | "text"
  | "audio"
  | "brush"
  | "psd"
  | "clip"
  | "archive"
  | "other";

export interface MaterialRow {
  id: string;
  name: string;
  size: number;
  kind: MaterialKind;
  viewable: boolean;
}

export interface CourseDetail {
  id: string;
  title: string;
  category: string | null;
  teacher: string | null;
  status: string;
  folderTitle: string;
  folderCategory: string | null;
  hasCustomBanner: boolean;
  sections: { title: string | null; lessons: LessonRow[] }[];
  materials: MaterialRow[];
}

export interface PlayerData {
  id: string;
  title: string;
  section: string | null;
  duration: number | null;
  position: number;
  completed: number;
  course: { id: string; title: string };
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  subtitles: { id: string; lang: string }[];
  directPlay: boolean;
}

export interface TrickplayMeta {
  interval: number;
  tileW: number;
  tileH: number;
  cols: number;
  rows: number;
  frames: number;
  sheets: number;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function saveCourseMeta(
  courseId: string,
  meta: { title: string; category: string; teacher: string }
): Promise<Response> {
  return fetch(`/api/courses/${courseId}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta)
  });
}

export function uploadCourseBanner(courseId: string, file: File): Promise<Response> {
  return fetch(`/api/courses/${courseId}/banner`, {
    method: "POST",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file
  });
}

export function setBannerFromLesson(courseId: string, lessonId: string): Promise<Response> {
  return fetch(`/api/courses/${courseId}/banner/from-lesson`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId })
  });
}

export function clearCourseBanner(courseId: string): Promise<Response> {
  return fetch(`/api/courses/${courseId}/banner`, { method: "DELETE" });
}

export function saveProgress(lessonId: string, position: number, completed?: boolean): Promise<Response> {
  return fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, position, completed }),
    keepalive: true
  });
}

// ---------- Anotações ----------

export interface NoteRow {
  id: string;
  lessonId: string | null; // null = nota geral do curso
  timeSec: number | null;
  text: string;
  hasDrawing: boolean;
  lessonTitle: string | null; // null em nota geral OU aula removida do disco
  createdAt: string;
  updatedAt: string;
}

export function listNotes(courseId: string): Promise<NoteRow[]> {
  return apiGet<NoteRow[]>(`/api/courses/${courseId}/notes`);
}

export async function createNote(
  courseId: string,
  body: { lessonId?: string; timeSec?: number; text: string }
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`/api/courses/${courseId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function updateNote(noteId: string, text: string): Promise<Response> {
  return fetch(`/api/notes/${noteId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
}

export function deleteNote(noteId: string): Promise<Response> {
  return fetch(`/api/notes/${noteId}`, { method: "DELETE" });
}

export function uploadNoteDrawing(noteId: string, blob: Blob): Promise<Response> {
  return fetch(`/api/notes/${noteId}/drawing`, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "image/png" },
    body: blob
  });
}

export function deleteNoteDrawing(noteId: string): Promise<Response> {
  return fetch(`/api/notes/${noteId}/drawing`, { method: "DELETE" });
}

export function noteDrawingUrl(noteId: string, updatedAt: string): string {
  return `/api/notes/${noteId}/drawing?v=${encodeURIComponent(updatedAt)}`;
}

export function fmtDuration(sec: number | null | undefined): string {
  if (!sec || !isFinite(sec)) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}:${String(ss).padStart(2, "0")}`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${m}:${String(ss).padStart(2, "0")}`;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
