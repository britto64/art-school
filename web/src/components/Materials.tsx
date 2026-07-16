import { ComponentType } from "react";
import { fmtSize, MaterialKind, MaterialRow } from "../api";
import {
  IconArchive,
  IconAudio,
  IconBrush,
  IconDownload,
  IconEye,
  IconFile,
  IconFileText,
  IconImage,
  IconPalette,
  IconPaperclip,
  IconPlay,
  IconVideo
} from "./Icons";

const KIND_META: Record<MaterialKind, { Icon: ComponentType<{ size?: number }>; label: string }> = {
  video: { Icon: IconVideo, label: "Vídeo" },
  image: { Icon: IconImage, label: "Imagem" },
  pdf: { Icon: IconFileText, label: "PDF" },
  text: { Icon: IconFileText, label: "Texto" },
  audio: { Icon: IconAudio, label: "Áudio" },
  brush: { Icon: IconBrush, label: "Brushes" },
  psd: { Icon: IconPalette, label: "Photoshop" },
  clip: { Icon: IconPalette, label: "Clip Studio" },
  archive: { Icon: IconArchive, label: "Compactado" },
  other: { Icon: IconFile, label: "Arquivo" }
};

export default function Materials({ materials, title }: { materials: MaterialRow[]; title: string }) {
  if (materials.length === 0) return null;
  return (
    <details className="section player-materials">
      <summary>
        <span className="section-title with-icon">
          <IconPaperclip size={16} /> {title}
        </span>
        <span className="section-meta">{materials.length} arquivos</span>
      </summary>
      <ul className="material-list">
        {materials.map((m) => {
          const meta = KIND_META[m.kind] ?? KIND_META.other;
          return (
            <li key={m.id}>
              <span className="material-icon" title={meta.label}>
                <meta.Icon size={18} />
              </span>
              <span className="material-name">{m.name}</span>
              <span className="material-kind">{meta.label}</span>
              <span className="material-size">{fmtSize(m.size)}</span>
              <span className="material-actions">
                {m.viewable && (
                  <a
                    className="material-btn"
                    href={`/api/materials/${m.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                    title={m.kind === "video" ? "Assistir no navegador" : "Ver no navegador"}
                  >
                    {m.kind === "video" ? <IconPlay size={13} /> : <IconEye size={13} />}
                    {m.kind === "video" ? "Assistir" : "Ver"}
                  </a>
                )}
                <a className="material-btn" href={`/api/materials/${m.id}`} download title="Baixar arquivo">
                  <IconDownload size={13} />
                  Baixar
                </a>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
