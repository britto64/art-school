import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, CourseDetail, fmtDuration, saveProgress } from "../api";
import Materials from "../components/Materials";
import { IconCheck, IconPlay } from "../components/Icons";

export default function Course() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<CourseDetail>(`/api/courses/${id}`).then(setCourse).catch((e) => setError(String(e)));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <div className="page center-msg">Erro ao carregar: {error}</div>;
  if (!course) return <div className="page center-msg">Carregando...</div>;

  const allLessons = course.sections.flatMap((s) => s.lessons);
  const total = allLessons.length;
  const done = allLessons.filter((l) => l.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
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
        <img className="course-hero-img" src={`/api/thumb/${course.id}`} alt="" />
        <div className="course-hero-grad" />
        <div className="course-hero-body">
          {course.category && <span className="badge">{course.category}</span>}
          <h1>{course.title}</h1>
          <div className="progress-line hero-progress">
            <div className="progress-bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-label">
              {done}/{total} aulas · {pct}%
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

      <Materials materials={course.materials} title="Materiais" />
    </div>
  );
}
