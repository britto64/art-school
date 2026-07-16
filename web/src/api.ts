export interface CourseSummary {
  id: string;
  title: string;
  category: string | null;
  status: "ready" | "not_ready";
  hasBanner: boolean;
  lessonCount: number;
  completedCount: number;
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

export interface CourseDetail {
  id: string;
  title: string;
  category: string | null;
  status: string;
  sections: { title: string | null; lessons: LessonRow[] }[];
  materials: { id: string; name: string; size: number }[];
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

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function saveProgress(lessonId: string, position: number, completed?: boolean): Promise<Response> {
  return fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, position, completed }),
    keepalive: true
  });
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
