import { fmtSize, MaterialKind, MaterialRow } from "../api";

const KIND_META: Record<MaterialKind, { icon: string; label: string }> = {
  video: { icon: "🎬", label: "Vídeo" },
  image: { icon: "🖼️", label: "Imagem" },
  pdf: { icon: "📕", label: "PDF" },
  text: { icon: "📝", label: "Texto" },
  audio: { icon: "🎧", label: "Áudio" },
  brush: { icon: "🖌️", label: "Brushes" },
  psd: { icon: "🎨", label: "Photoshop" },
  clip: { icon: "🎨", label: "Clip Studio" },
  archive: { icon: "📦", label: "Compactado" },
  other: { icon: "📎", label: "Arquivo" }
};

export default function Materials({ materials, title }: { materials: MaterialRow[]; title: string }) {
  if (materials.length === 0) return null;
  return (
    <details className="section player-materials">
      <summary>
        <span className="section-title">📎 {title}</span>
        <span className="section-meta">{materials.length} arquivos</span>
      </summary>
      <ul className="material-list">
        {materials.map((m) => {
          const meta = KIND_META[m.kind] ?? KIND_META.other;
          return (
            <li key={m.id}>
              <span className="material-icon" title={meta.label}>
                {meta.icon}
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
                    {m.kind === "video" ? "▶ Assistir" : "👁 Ver"}
                  </a>
                )}
                <a className="material-btn" href={`/api/materials/${m.id}`} download title="Baixar arquivo">
                  ⬇ Baixar
                </a>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
