import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { api } from "./api.js";
import { scanLibrary } from "./scanner.js";
import { fillMissingDurations } from "./ffmpeg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use("/api", api);

// Em produção, serve o SPA compilado (web/dist)
const webDist = path.resolve(__dirname, "..", "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`🎨 Art School rodando em http://localhost:${config.port}`);
  console.log(`   Cursos: ${config.coursesPath}`);
  console.log(`   Dados:  ${config.dataPath}`);
  scanLibrary();
  void fillMissingDurations();
});
