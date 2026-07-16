import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  NoteRow,
  createNote,
  deleteNote,
  deleteNoteDrawing,
  fmtClock,
  updateNote,
  uploadNoteDrawing
} from "../api";
import { IconNote, IconPencil, IconPlayOutline } from "./Icons";
import NotePaper from "./NotePaper";

interface NotesPanelProps {
  courseId: string;
  notes: NoteRow[];
  onRefresh: () => void;
  /** presentes só no player */
  currentLessonId?: string;
  getCurrentTime?: () => number;
  onSeek?: (t: number) => void;
  onOpenEditor?: () => void;
  /** layout compacto (sidebar/drawer do player) vs grade (página do curso) */
  compact?: boolean;
  /** abrir uma nota específica (vinda do marcador da timeline) */
  openNoteId?: string | null;
  onOpenNoteHandled?: () => void;
}

// nota sendo editada/criada
interface OpenNote {
  note: NoteRow | null; // null = nova
  lessonId: string | null;
  timeSec: number | null;
  readOnly: boolean;
}

export default function NotesPanel({
  courseId,
  notes,
  onRefresh,
  currentLessonId,
  getCurrentTime,
  onSeek,
  onOpenEditor,
  compact,
  openNoteId,
  onOpenNoteHandled
}: NotesPanelProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<OpenNote | null>(null);
  const [saving, setSaving] = useState(false);

  // abre nota pedida pelo marcador da timeline
  useEffect(() => {
    if (!openNoteId) return;
    const n = notes.find((x) => x.id === openNoteId);
    if (n) openNote(n);
    onOpenNoteHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNoteId, notes]);

  const openNote = (n: NoteRow) => {
    // no player, nota de outra aula abre só pra leitura (botão "Ir para a aula" à parte)
    const readOnly = Boolean(currentLessonId && n.lessonId && n.lessonId !== currentLessonId);
    setOpen({ note: n, lessonId: n.lessonId, timeSec: n.timeSec, readOnly });
  };

  const newNoteHere = () => {
    if (!currentLessonId || !getCurrentTime) return;
    onOpenEditor?.();
    setOpen({ note: null, lessonId: currentLessonId, timeSec: getCurrentTime(), readOnly: false });
  };

  const newCourseNote = () => {
    onOpenEditor?.();
    setOpen({ note: null, lessonId: null, timeSec: null, readOnly: false });
  };

  const handleSave = async (text: string, drawing: Blob | null | undefined) => {
    if (!open || saving) return;
    setSaving(true);
    try {
      if (open.note) {
        await updateNote(open.note.id, text);
        if (drawing instanceof Blob) await uploadNoteDrawing(open.note.id, drawing);
        else if (drawing === null && open.note.hasDrawing) await deleteNoteDrawing(open.note.id);
      } else {
        const res = await createNote(courseId, {
          lessonId: open.lessonId ?? undefined,
          timeSec: open.timeSec ?? undefined,
          text
        });
        if (drawing instanceof Blob) await uploadNoteDrawing(res.id, drawing);
      }
      setOpen(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!open?.note) return;
    if (!confirm("Apagar esta anotação?")) return;
    await deleteNote(open.note.id);
    setOpen(null);
    onRefresh();
  };

  const goToMoment = (n: NoteRow) => {
    if (n.lessonId == null || n.timeSec == null) return;
    if (currentLessonId === n.lessonId && onSeek) {
      onSeek(n.timeSec);
      setOpen(null);
    } else {
      navigate(`/aula/${n.lessonId}?t=${Math.floor(n.timeSec)}`);
    }
  };

  const heading = (o: OpenNote): string => {
    if (!o.lessonId) return "Nota do curso";
    const title = o.note?.lessonTitle ?? notes.find((n) => n.lessonId === o.lessonId)?.lessonTitle;
    if (o.note && !o.note.lessonTitle) return "(aula removida)";
    return title ?? (o.lessonId === currentLessonId ? "Esta aula" : "Aula");
  };

  // agrupa mantendo a ordem da API: gerais primeiro, depois por aula
  const groups: { key: string; title: string; items: NoteRow[] }[] = [];
  for (const n of notes) {
    const key = n.lessonId ?? "__course__";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(n);
    else
      groups.push({
        key,
        title: n.lessonId ? n.lessonTitle ?? "(aula removida)" : "Notas do curso",
        items: [n]
      });
  }

  const editorHeaderExtra = (o: OpenNote) =>
    o.lessonId && o.timeSec != null ? (
      <button
        className="note-tool"
        onClick={() =>
          goToMoment(
            o.note ?? ({ lessonId: o.lessonId, timeSec: o.timeSec } as NoteRow)
          )
        }
        title={o.lessonId === currentLessonId ? "Ir para o momento" : "Ir para a aula"}
      >
        <IconPlayOutline size={15} />
      </button>
    ) : null;

  const editor = open && (
    <NotePaper
      note={open.note}
      heading={heading(open)}
      timeSec={open.timeSec}
      readOnly={open.readOnly}
      saving={saving}
      onSave={handleSave}
      onDelete={open.note ? handleDelete : undefined}
      onClose={() => setOpen(null)}
      headerExtra={editorHeaderExtra(open)}
    />
  );

  return (
    <div className={compact ? "notes-panel compact" : "notes-panel"}>
      {open && !compact ? (
        <div className="modal-overlay" onClick={() => setOpen(null)}>
          <div className="note-modal" onClick={(e) => e.stopPropagation()}>
            {editor}
          </div>
        </div>
      ) : (
        open && editor
      )}

      {(!open || !compact) && (
        <>
          <div className="notes-actions">
            {currentLessonId && getCurrentTime && (
              <button className="btn-secondary notes-add" onClick={newNoteHere}>
                <IconNote size={15} />
                Nota neste momento
              </button>
            )}
            <button className="btn-secondary notes-add" onClick={newCourseNote}>
              <IconPencil size={15} />
              Nota do curso
            </button>
          </div>

          {notes.length === 0 && <p className="notes-empty">Nenhuma anotação ainda.</p>}

          <div className="notes-list">
            {groups.map((g) => (
              <div key={g.key} className="notes-group">
                <div
                  className={`notes-group-title${g.key === currentLessonId ? " current" : ""}`}
                >
                  {g.title}
                </div>
                {g.items.map((n) => (
                  <button key={n.id} className="note-card" onClick={() => openNote(n)}>
                    <span className="note-card-top">
                      {n.timeSec != null && (
                        <span
                          className="note-card-time"
                          title="Assistir deste momento"
                          onClick={(e) => {
                            e.stopPropagation();
                            goToMoment(n);
                          }}
                        >
                          <IconPlayOutline size={11} />
                          {fmtClock(n.timeSec)}
                        </span>
                      )}
                      {n.hasDrawing && (
                        <span className="note-card-badge" title="Tem desenho">
                          <IconPencil size={11} />
                        </span>
                      )}
                    </span>
                    <span className="note-card-text">
                      {n.text.trim() ? n.text : n.hasDrawing ? "(desenho)" : "(vazia)"}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
