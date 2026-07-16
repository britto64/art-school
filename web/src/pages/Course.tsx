import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, CourseDetail, fmtDuration, listNotes, NoteRow, saveProgress } from "../api";
import Materials from "../components/Materials";
import EditCourse from "../components/EditCourse";
import NotesPanel from "../components/NotesPanel";
import { IconCheck, IconPencil, IconPlay, IconUser } from "../components/Icons";

export default function Course() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [thumbVer, setThumbVer] = useState(0); // muda após editar pra recarregar a imagem
  const [notes, setNotes] = useState<NoteRow[]>([]);

  const load = useCallback(() => {
    apiGet<CourseDetail>(`/api/courses/${id}`).then(setCourse).catch((e) => setError(String(e)));
  }, [id]);

  useEffect(load, [load]);

  const refreshNotes = useCallback(() => {
    if (!id) return;
    listNotes(id).then(setNotes).catch(() => {});
  }, [id]);

  useEffect(refreshNotes, [refreshNotes]);

  if (error) return <div className="page center-msg">Erro ao carregar: {error}</div>;
  if (!course) return <div className="page center-msg">Carregando...</div>;

  const allLessons = course.sections.flatMap((s) => s.lessons);
  const total = allLessons.length;
  const done = allLessons.filter((l) => l.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const moduleCount = course.sections.filter((s) => s.title !== null).length;
  const totalDuration = allLessons.reduce((acc, l) => acc + (l.duration ?? 0), 0);
  const durationPartial = allLessons.some((l) => !l.duration); // ffprobe ainda calculando
  // continuar: primeira aula não concluída (preferindo uma já começada)
  const started = allLessons.find((l) => !l.completed && l.position > 10);
  const continueLesson = started ?? allLessons.find((l) => !l.completed) ?? allLessons[0];

  const toggleComplete = async (lessonId: string, position: number, completed: boolean) => {
    await saveProgress(lessonId, position, completed);
    load();
  };

  return (
    <div className="page">
      <div className="course-hero">
        <img className="course-hero-img" src={`/api/thumb/${course.id}?v=${thumbVer}`} alt="" />
        <div className="course-hero-grad" />
        <button className="hero-edit" onClick={() => setEditing(true)} title="Editar curso">
          <IconPencil size={15} /> Editar
        </button>
        <div className="course-hero-body">
          {course.category && <span className="badge">{course.category}</span>}
          <h1>{course.title}</h1>
          {course.teacher && (
            <span className="hero-teacher">
              <IconUser size={14} /> {course.teacher}
            </span>
          )}
          <div className="progress-line hero-progress">
            <div className="progress-bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-label">
              {done}/{total} aulas · {pct}%
              {moduleCount > 1 ? ` · ${moduleCount} módulos` : ""}
              {totalDuration > 0 ? ` · ${fmtDuration(totalDuration)}${durationPartial ? "+" : ""}` : ""}
            </span>
          </div>
          {continueLesson && (
            <Link to={`/aula/${continueLesson.id}`} className="btn-primary">
              <IconPlay size={15} />
              {done === 0 ? "Começar curso" : pct === 100 ? "Rever curso" : "Continuar de onde parou"}
            </Link>
          )}
        </div>
      </div>

      {course.sections.map((section, i) => (
        <details key={i} className="section" open={section.lessons.some((l) => !l.completed) || course.sections.length === 1}>
          <summary>
            <span className="section-title">{section.title ?? "Aulas"}</span>
            <span className="section-meta">
              {section.lessons.filter((l) => l.completed).length}/{section.lessons.length}
            </span>
          </summary>
          <ol className="lesson-list">
            {section.lessons.map((l) => {
              const watchedPct =
                l.completed ? 100 : l.duration && l.position > 0 ? Math.min(99, Math.round((l.position / l.duration) * 100)) : 0;
              return (
                <li key={l.id} className={l.completed ? "lesson done" : "lesson"}>
                  <button
                    className="lesson-check"
                    title={l.completed ? "Marcar como não assistida" : "Marcar como assistida"}
                    onClick={() => toggleComplete(l.id, l.position, !l.completed)}
                  >
                    {l.completed ? <IconCheck size={13} /> : null}
                  </button>
                  <Link to={`/aula/${l.id}`} className="lesson-link">
                    <span className="lesson-thumb">
                      <img
                        loading="lazy"
                        src={`/api/thumb/lesson/${l.id}`}
                        alt=""
                        onError={(e) => e.currentTarget.parentElement?.classList.add("empty")}
                      />
                    </span>
                    <span className="lesson-title">{l.title}</span>
                    <span className="lesson-meta">
                      {watchedPct > 0 && watchedPct < 100 && <span className="lesson-pct">{watchedPct}%</span>}
                      <span className="lesson-duration">{fmtDuration(l.duration)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </details>
      ))}

      <details className="section" open={notes.length > 0}>
        <summary>
          <span className="section-title">Anotações</span>
          <span className="section-meta">{notes.length}</span>
        </summary>
        <NotesPanel courseId={course.id} notes={notes} onRefresh={refreshNotes} />
      </details>

      <Materials materials={course.materials} title="Materiais" />

      {editing && (
        <EditCourse
          course={course}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setThumbVer((v) => v + 1);
            load();
          }}
        />
      )}
    </div>
  );
}
