import path from "node:path";
import fs from "node:fs";

const required = (value: string | undefined, fallback: string): string =>
  value && value.trim() !== "" ? value : fallback;

export const config = {
  port: Number(required(process.env.PORT, "3000")),
  coursesPath: path.resolve(required(process.env.COURSES_PATH, "E:\\1 - Cursos")),
  dataPath: path.resolve(required(process.env.DATA_PATH, "./data"))
};

// Garante que o diretório de dados (db + thumbs) existe
fs.mkdirSync(path.join(config.dataPath, "thumbs"), { recursive: true });
