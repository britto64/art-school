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

/** Stream remux (mkv -> mp4 fragmentado, sem recodificar) para o browser */
export function remuxStream(absPath: string, startSec: number, transcode: boolean) {
  const args = ["-hide_banner", "-loglevel", "error"];
  if (startSec > 0) args.push("-ss", String(startSec));
  args.push("-i", absPath);
  if (transcode) {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "160k");
  } else {
    args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k"); // áudio p/ aac (compatibilidade), vídeo copiado
  }
  args.push("-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1");
  return spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "ignore"] });
}
