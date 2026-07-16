# Guia do Projeto — Art School

Plataforma pessoal de cursos em vídeo (estilo Jellyfin, mas com cara de plataforma de curso). Escaneia uma pasta de cursos, monta o catálogo e acompanha o progresso de cada aula. **TypeScript + Express** no backend, **React + Vite** no frontend, **SQLite nativo do Node (`node:sqlite`)** para dados — sem dependência nativa compilada.

## Comandos

- **Desenvolvimento (server + web juntos):** `npm run dev` → web em http://localhost:5173 (proxy /api → :3000)
- **Build completo:** `npm run build`
- **Produção (após build):** `npm start` → http://localhost:3000
- **Instalar dependências:** `npm install && npm install --prefix web`

Requisitos: Node 22.13+ (usa `node:sqlite`) e **ffmpeg/ffprobe no PATH** (thumbnails, durações e remux de mkv).

## Variáveis de ambiente

- `COURSES_PATH` — pasta dos cursos (padrão local: `E:\1 - Cursos`; no container: `/courses`)
- `DATA_PATH` — banco SQLite + cache de thumbnails (padrão: `./data`; no container: `/app/data`)
- `PORT` — porta do servidor (padrão: 3000)

## Estrutura

- `src/index.ts` — entrada: sobe o Express, serve `web/dist`, escaneia na inicialização
- `src/scanner.ts` — varre `COURSES_PATH` e reconstrói o catálogo (cursos/aulas/materiais/legendas)
- `src/api.ts` — rotas REST (`/api/...`): streaming com Range, remux mkv→mp4 via ffmpeg, SRT→VTT, progresso, thumbs
- `src/db.ts` — schema SQLite; **a tabela `progress` nunca é apagada no rescan**
- `src/ffmpeg.ts` — ffprobe (durações), thumbnails (curso e por aula), trickplay (sprite sheets do preview da timeline, gerado em segundo plano e salvo como BLOB no SQLite), remux
- `web/` — SPA React (pt-BR): Home (banners + progresso), Curso (seções/aulas/materiais), Player

## Regras importantes

1. **IDs por caminho relativo**: cursos/aulas usam `sha1(caminho relativo)` — o progresso sobrevive à mudança do ponto de montagem (PC → NAS), desde que a estrutura interna das pastas não mude.
2. **Importações locais devem terminar em `.js`** (TypeScript NodeNext), ex.: `import { db } from "./db.js"`.
3. **Convenção das pastas de curso**: `categoria_Título` na raiz. O scanner:
   - achata pastas aninhadas de nível único (`Section 02/Section 02/*.mp4`)
   - trata subpastas com vídeo como seções; vídeos soltos na raiz = curso sem seção
   - pastas com nome de material (`Materials`, `Class Materials`...) viram materiais mesmo contendo vídeo
   - `Subtitles/<Idioma>/*.srt` casa com a aula pelo mesmo nome de arquivo; `.srt` ao lado do vídeo = legenda "Padrão"
   - curso só com `.rar`/`.zip` fica `not_ready` ("extraia os arquivos")
4. **Playback**: mp4/webm tocam direto (Range); mkv passa por remux ffmpeg (`-c copy`, áudio→aac) — seek recarrega o stream com `?t=`.

## Deploy (mesmo fluxo do bot_twitch)

Push na `main` → GitHub Actions builda e publica `brittinho/artschool:latest` no Docker Hub → stack no Dockge com `pull_policy: always` (ver `dockge compose.txt`). Secrets do repo: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.
