import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";

/** Retorna a duração do vídeo em segundos via ffprobe (null se indisponível) */
export function probeDuration(absPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", absPath],
      { timeout: 30_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const dur = parseFloat(stdout.trim());
        resolve(Number.isFinite(dur) ? dur : null);
      }
    );
  });
}

let filling = false;
/** Preenche durações faltantes em segundo plano (não bloqueia o servidor) */
export async function fillMissingDurations(): Promise<void> {
  if (filling) return;
  filling = true;
  try {
    const rows = db
      .prepare("SELECT id, rel_path FROM lessons WHERE duration IS NULL")
      .all() as unknown as { id: string; rel_path: string }[];
    if (rows.length === 0) return;
    console.log(`[ffprobe] calculando duração de ${rows.length} aulas...`);
    const update = db.prepare("UPDATE lessons SET duration = ? WHERE id = ?");
    for (const row of rows) {
      const dur = await probeDuration(path.join(config.coursesPath, row.rel_path));
      if (dur !== null) update.run(dur, row.id);
    }
    console.log("[ffprobe] durações preenchidas");
  } finally {
    filling = false;
  }
}

/** Gera (e cacheia) a thumbnail do curso a partir do primeiro vídeo */
export function generateThumb(courseId: string, videoAbs: string): Promise<string | null> {
  const thumbPath = path.join(config.dataPath, "thumbs", `${courseId}.jpg`);
  if (fs.existsSync(thumbPath)) return Promise.resolve(thumbPath);
  return new Promise((resolve) => {
    execFile(
      "ffmpeg",
      [
        "-ss", "60", // frame aos 60s costuma pular a vinheta/tela preta
        "-i", videoAbs,
        "-frames:v", "1",
        "-vf", "scale=640:-2",
        "-q:v", "4",
        "-y", thumbPath
      ],
      { timeout: 60_000 },
      (err) => {
        if (!err && fs.existsSync(thumbPath)) return resolve(thumbPath);
        // vídeo mais curto que 60s: tenta no início
        execFile(
          "ffmpeg",
          ["-ss", "3", "-i", videoAbs, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", "-y", thumbPath],
          { timeout: 60_000 },
          (err2) => resolve(!err2 && fs.existsSync(thumbPath) ? thumbPath : null)
        );
      }
    );
  });
}

/** Largura/altura do vídeo via ffprobe (null se indisponível) */
function probeDims(absPath: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", absPath],
      { timeout: 30_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const [w, h] = stdout.trim().split(",").map(Number);
        resolve(w > 0 && h > 0 ? { width: w, height: h } : null);
      }
    );
  });
}

const execFileP = (cmd: string, args: string[], timeout: number) =>
  new Promise<boolean>((resolve) => execFile(cmd, args, { timeout }, (err) => resolve(!err)));

// diretório temporário para saídas intermediárias do ffmpeg
const tmpDir = () => {
  const dir = path.join(config.dataPath, "tmp");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// ---------- thumbnails por aula ----------

// semáforo: limita ffmpeg simultâneos (o browser dispara várias thumbs de uma vez)
const THUMB_SLOTS = 3;
let thumbActive = 0;
const thumbWaiting: (() => void)[] = [];
const thumbAcquire = () =>
  new Promise<void>((resolve) => {
    if (thumbActive < THUMB_SLOTS) {
      thumbActive++;
      resolve();
    } else thumbWaiting.push(resolve);
  });
const thumbRelease = () => {
  const next = thumbWaiting.shift();
  if (next) next();
  else thumbActive--;
};

/** Gera (e cacheia na db) a thumbnail de uma aula; retorna o JPEG ou null */
export async function getLessonThumb(lessonId: string): Promise<Uint8Array | null> {
  const cached = db.prepare("SELECT img FROM lesson_thumbs WHERE lesson_id = ?").get(lessonId) as
    | { img: Uint8Array }
    | undefined;
  if (cached) return cached.img;

  await thumbAcquire();
  try {
    // outra request pode ter gerado enquanto esperava o slot
    const again = db.prepare("SELECT img FROM lesson_thumbs WHERE lesson_id = ?").get(lessonId) as
      | { img: Uint8Array }
      | undefined;
    if (again) return again.img;

    const lesson = db.prepare("SELECT rel_path, duration FROM lessons WHERE id = ?").get(lessonId) as
      | { rel_path: string; duration: number | null }
      | undefined;
    if (!lesson) return null;
    const videoAbs = path.join(config.coursesPath, lesson.rel_path);
    if (!fs.existsSync(videoAbs)) return null;

    // frame a ~20% da aula (pula intro/tela preta); fallback pro início
    const at = lesson.duration ? Math.min(lesson.duration * 0.2, 120) : 30;
    const out = path.join(tmpDir(), `thumb-${lessonId}.jpg`);
    const args = (ss: number) => [
      "-hide_banner", "-loglevel", "error",
      "-ss", String(Math.floor(ss)),
      "-i", videoAbs,
      "-frames:v", "1",
      "-vf", "scale=320:-2",
      "-q:v", "6",
      "-y", out
    ];
    let ok = await execFileP("ffmpeg", args(at), 60_000);
    if (!ok || !fs.existsSync(out)) ok = await execFileP("ffmpeg", args(1), 60_000);
    if (!ok || !fs.existsSync(out)) return null;

    const img = fs.readFileSync(out);
    fs.rmSync(out, { force: true });
    db.prepare("INSERT OR REPLACE INTO lesson_thumbs (lesson_id, img) VALUES (?, ?)").run(lessonId, img);
    return img;
  } finally {
    thumbRelease();
  }
}

/** Gera um frame em 640px de uma aula (para usar como banner do curso) */
export async function generateFrameFromLesson(lessonId: string): Promise<Uint8Array | null> {
  const lesson = db.prepare("SELECT rel_path, duration FROM lessons WHERE id = ?").get(lessonId) as
    | { rel_path: string; duration: number | null }
    | undefined;
  if (!lesson) return null;
  const videoAbs = path.join(config.coursesPath, lesson.rel_path);
  if (!fs.existsSync(videoAbs)) return null;

  const at = lesson.duration ? Math.min(lesson.duration * 0.2, 120) : 30;
  const out = path.join(tmpDir(), `banner-${lessonId}.jpg`);
  const args = (ss: number) => [
    "-hide_banner", "-loglevel", "error",
    "-ss", String(Math.floor(ss)),
    "-i", videoAbs,
    "-frames:v", "1",
    "-vf", "scale=640:-2",
    "-q:v", "4",
    "-y", out
  ];
  let ok = await execFileP("ffmpeg", args(at), 60_000);
  if (!ok || !fs.existsSync(out)) ok = await execFileP("ffmpeg", args(1), 60_000);
  if (!ok || !fs.existsSync(out)) return null;
  const img = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return img;
}

// ---------- trickplay (preview da timeline) ----------

const TP_COLS = 5;
const TP_ROWS = 5;
const TP_WIDTH = 240;

/** Gera as sprite sheets de trickplay de uma aula e salva na db */
async function generateTrickplay(lessonId: string, relPath: string, duration: number): Promise<void> {
  const videoAbs = path.join(config.coursesPath, relPath);
  const markFailed = (): void => {
    db.prepare(
      "INSERT OR REPLACE INTO trickplay (lesson_id, interval, tile_w, tile_h, tile_cols, tile_rows, frames, sheets) VALUES (?, 10, 0, 0, 0, 0, 0, 0)"
    ).run(lessonId);
  };

  if (!fs.existsSync(videoAbs) || duration < 10) return markFailed();

  const dims = await probeDims(videoAbs);
  if (!dims) return markFailed();

  // intervalo dinâmico: mira ~300 frames por aula (5s..30s)
  const interval = Math.min(30, Math.max(5, Math.ceil(duration / 300)));
  const tileH = Math.max(2, 2 * Math.round((TP_WIDTH * dims.height) / dims.width / 2));
  const frames = Math.max(1, Math.floor(duration / interval));

  const dir = fs.mkdtempSync(path.join(tmpDir(), "tp-"));
  try {
    // -skip_frame nokey: decodifica só keyframes (bem mais rápido; fps duplica o frame mais próximo)
    const ok = await execFileP(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error",
        "-skip_frame", "nokey",
        "-i", videoAbs,
        "-an", "-sn",
        "-vf", `fps=1/${interval},scale=${TP_WIDTH}:${tileH},tile=${TP_COLS}x${TP_ROWS}`,
        "-q:v", "9",
        "-y", path.join(dir, "sheet-%04d.jpg")
      ],
      15 * 60_000
    );
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
    if (!ok || files.length === 0) return markFailed();

    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM trickplay_sheets WHERE lesson_id = ?").run(lessonId);
      const ins = db.prepare("INSERT INTO trickplay_sheets (lesson_id, idx, img) VALUES (?, ?, ?)");
      files.forEach((f, i) => ins.run(lessonId, i, fs.readFileSync(path.join(dir, f))));
      db.prepare(
        "INSERT OR REPLACE INTO trickplay (lesson_id, interval, tile_w, tile_h, tile_cols, tile_rows, frames, sheets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(lessonId, interval, TP_WIDTH, tileH, TP_COLS, TP_ROWS, Math.min(frames, files.length * TP_COLS * TP_ROWS), files.length);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let tpRunning = false;
/** Gera trickplay das aulas que ainda não têm, em segundo plano */
export async function generateMissingTrickplay(): Promise<void> {
  if (tpRunning) return;
  tpRunning = true;
  try {
    // limpa blobs de aulas que saíram do catálogo
    db.exec("DELETE FROM trickplay WHERE lesson_id NOT IN (SELECT id FROM lessons)");
    db.exec("DELETE FROM trickplay_sheets WHERE lesson_id NOT IN (SELECT id FROM lessons)");
    db.exec("DELETE FROM lesson_thumbs WHERE lesson_id NOT IN (SELECT id FROM lessons)");

    const rows = db
      .prepare(
        `SELECT id, rel_path, duration FROM lessons
         WHERE duration IS NOT NULL AND id NOT IN (SELECT lesson_id FROM trickplay)
         ORDER BY course_id, section_order, sort_order`
      )
      .all() as unknown as { id: string; rel_path: string; duration: number }[];
    if (rows.length === 0) return;
    console.log(`[trickplay] gerando preview de timeline de ${rows.length} aulas...`);
    let done = 0;
    for (const row of rows) {
      try {
        await generateTrickplay(row.id, row.rel_path, row.duration);
      } catch (err) {
        console.error(`[trickplay] falhou em ${row.rel_path}:`, err);
      }
      done++;
      if (done % 25 === 0) console.log(`[trickplay] ${done}/${rows.length}`);
    }
    console.log(`[trickplay] concluído (${done} aulas)`);
  } finally {
    tpRunning = false;
  }
}

// ---------- streaming (remux / transcode) ----------

export interface MediaCodecs {
  video: string | null;
  audio: string | null;
}

// codecs de vídeo que o browser toca dentro de mp4 sem recodificar
const COPY_VIDEO = new Set(["h264", "hevc", "vp9", "av1"]);

const codecsCache = new Map<string, MediaCodecs>();

/** Codecs de vídeo/áudio do arquivo via ffprobe (com cache em memória) */
export function probeCodecs(absPath: string): Promise<MediaCodecs> {
  const cached = codecsCache.get(absPath);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", absPath],
      { timeout: 30_000 },
      (err, stdout) => {
        if (err) return resolve({ video: null, audio: null });
        try {
          const streams = (JSON.parse(stdout).streams ?? []) as { codec_type?: string; codec_name?: string }[];
          const info: MediaCodecs = {
            video: streams.find((s) => s.codec_type === "video")?.codec_name ?? null,
            audio: streams.find((s) => s.codec_type === "audio")?.codec_name ?? null
          };
          codecsCache.set(absPath, info);
          resolve(info);
        } catch {
          resolve({ video: null, audio: null });
        }
      }
    );
  });
}

/**
 * Stream mp4 fragmentado para o browser.
 * Copia o vídeo quando o codec é compatível (h264/hevc/vp9/av1); senão recodifica
 * para h264. Áudio aac é copiado; o resto vira aac. Legendas embutidas, attachments
 * e trilhas extras são descartados — eles quebram o mux mp4 (era o que travava mkv/mov).
 */
export function remuxStream(absPath: string, startSec: number, transcode: boolean, codecs: MediaCodecs) {
  const args = ["-hide_banner", "-loglevel", "error"];
  if (startSec > 0) args.push("-ss", String(startSec));
  args.push("-i", absPath);
  // só a primeira trilha de vídeo/áudio; sem legendas/attachments/dados
  args.push("-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1");

  const copyVideo = !transcode && codecs.video !== null && COPY_VIDEO.has(codecs.video);
  if (copyVideo) {
    args.push("-c:v", "copy");
    if (codecs.video === "hevc") args.push("-tag:v", "hvc1"); // sem a tag o browser não reconhece hevc
  } else {
    args.push(
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-pix_fmt", "yuv420p", // fontes 10-bit/4:2:2 (comum em .mov/ProRes) não tocam no browser sem isso
      "-g", "60"
    );
  }
  if (!transcode && codecs.audio === "aac") args.push("-c:a", "copy");
  else args.push("-c:a", "aac", "-b:a", "192k", "-ac", "2");

  args.push(
    "-max_muxing_queue_size", "1024",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4", "pipe:1"
  );
  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  // loga o motivo quando o ffmpeg morre sozinho (kill por desconexão do cliente sai com code null)
  let stderr = "";
  ff.stderr.on("data", (d: Buffer) => {
    if (stderr.length < 4000) stderr += d.toString();
  });
  ff.on("close", (code) => {
    if (code && code !== 0)
      console.error(`[stream] ffmpeg falhou (${path.basename(absPath)}):`, stderr.trim().slice(0, 500));
  });
  return ff;
}
