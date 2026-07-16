import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, fmtClock, fmtDuration, HomeData } from "../api";
import { IconArchive, IconCheck, IconPlay } from "../components/Icons";

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<HomeData>("/api/courses").then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="page center-msg">Erro ao carregar: {error}</div>;
  if (!data) return <div className="page center-msg">Carregando...</div>;

  const ready = data.courses.filter((c) => c.status === "ready");
  const notReady = data.courses.filter((c) => c.status !== "ready");

  return (
    <div className="page">
      {data.continueWatching.length > 0 && (
        <section>
          <h2 className="row-title">Continuar assistindo</h2>
          <div className="continue-row">
            {data.continueWatching.map((item) => (
              <Link key={item.lessonId} to={`/aula/${item.lessonId}`} className="continue-card">
                <div className="continue-thumb">
                  <img src={`/api/thumb/${item.courseId}`} alt="" loading="lazy" />
                  <span className="play-badge">
                    <IconPlay size={36} />
                  </span>
                  {item.duration ? (
                    <div className="mini-progress">
                      <div style={{ width: `${Math.min(100, (item.position / item.duration) * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="continue-info">
                  <span className="continue-lesson">{item.lessonTitle}</span>
                  <span className="continue-course">{item.courseTitle}</span>
                  <span className="continue-time">
                    {fmtClock(item.position)}
                    {item.duration ? ` / ${fmtClock(item.duration)}` : ""}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="row-title">Meus cursos</h2>
        <div className="course-grid">
          {ready.map((c) => (
            <Link key={c.id} to={`/curso/${c.id}`} className="course-card">
              <div className="course-banner">
                <img src={`/api/thumb/${c.id}`} alt={c.title} loading="lazy" />
                {c.category && <span className="badge">{c.category}</span>}
                {c.progressPct === 100 && (
                  <span className="badge badge-done">
                    <IconCheck size={11} /> Concluído
                  </span>
                )}
              </div>
              <div className="course-card-body">
                <h3>{c.title}</h3>
                <div className="progress-line">
                  <div className="progress-bar">
                    <div style={{ width: `${c.progressPct}%` }} />
                  </div>
                  <span className="progress-label">
                    {c.completedCount}/{c.lessonCount} aulas · {c.progressPct}%
                    {c.totalDuration ? ` · ${fmtDuration(c.totalDuration)}` : ""}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {notReady.map((c) => (
            <div key={c.id} className="course-card course-card-disabled">
              <div className="course-banner banner-placeholder">
                <span className="placeholder-icon">
                  <IconArchive size={46} />
                </span>
                {c.category && <span className="badge">{c.category}</span>}
              </div>
              <div className="course-card-body">
                <h3>{c.title}</h3>
                <span className="not-ready-note">Não preparado: extraia os arquivos (.rar/.zip)</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
