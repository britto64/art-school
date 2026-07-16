import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, CourseDetail, fmtClock, fmtDuration, fmtSize, PlayerData, saveProgress } from "../api";

const SUB_PREF_KEY = "artschool.sublang";
const AUTONEXT_KEY = "artschool.autonext";
const RATE_KEY = "artschool.rate";

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<PlayerData | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // offset do remux: o <video> começa em 0, mas o tempo real é offset + currentTime
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [videoDur, setVideoDur] = useState(0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("artschool.volume") ?? 1));
  const [rate, setRate] = useState(() => Number(localStorage.getItem(RATE_KEY) ?? 1));
  const [autoNext, setAutoNext] = useState(() => localStorage.getItem(AUTONEXT_KEY) !== "0");
  const [subLang, setSubLang] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  // ---- carga da aula ----
  useEffect(() => {
    setData(null);
    setOffset(0);
    setCurTime(0);
    apiGet<PlayerData>(`/api/lessons/${id}`)
      .then((d) => {
        setData(d);
        // retoma de onde parou (se não estiver praticamente no fim)
        const resume = d.position > 10 && (!d.duration || d.position < d.duration - 15) ? d.position : 0;
        if (d.directPlay) {
          if (videoRef.current) videoRef.current.dataset.resume = String(resume);
        } else {
          setOffset(resume);
        }
        // legenda preferida
        const pref = localStorage.getItem(SUB_PREF_KEY);
        const langs = d.subtitles.map((s) => s.lang);
        const pick =
          (pref && langs.includes(pref) && pref) ||
          langs.find((l) => l === "Padrão") ||
          langs.find((l) => /portug/i.test(l)) ||
          langs.find((l) => /english/i.test(l)) ||
          null;
        setSubLang(pick);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  // ---- curso (sidebar de aulas + materiais) ----
  useEffect(() => {
    if (!data?.course.id) return;
    apiGet<CourseDetail>(`/api/courses/${data.course.id}`).then(setCourse).catch(() => {});
  }, [data?.course.id, id]);

  const effTime = data?.directPlay ? curTime : offset + curTime;
  const duration = data?.duration ?? (videoDur > 0 && isFinite(videoDur) ? videoDur : 0);

  // ---- src do vídeo ----
  const src = useMemo(() => {
    if (!data) return undefined;
    return data.directPlay ? `/api/stream/${data.id}` : `/api/stream/${data.id}?t=${Math.floor(offset)}`;
  }, [data, offset]);

  // ---- progresso ----
  const save = useCallback(
    (completed?: boolean) => {
      if (!data) return;
      const pos = data.directPlay ? videoRef.current?.currentTime ?? 0 : offset + (videoRef.current?.currentTime ?? 0);
      void saveProgress(data.id, pos, completed);
    },
    [data, offset]
  );

  useEffect(() => {
    const iv = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) save();
    }, 5000);
    return () => clearInterval(iv);
  }, [save]);

  useEffect(() => {
    const onUnload = () => save();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      save(); // salva ao sair da página/trocar de aula
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  // ---- legendas ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      const t = v.textTracks[i];
      t.mode = subLang !== null && t.label === subLang ? "showing" : "hidden";
    }
  }, [subLang, src, data]);

  // ---- volume / velocidade ----
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
    localStorage.setItem("artschool.volume", String(volume));
  }, [volume, src]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    localStorage.setItem(RATE_KEY, String(rate));
  }, [rate, src]);

  // ---- controles somem após inatividade ----
  const poke = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  const seek = (t: number) => {
    if (!data) return;
    const clamped = Math.max(0, duration > 0 ? Math.min(t, duration - 0.5) : t);
    if (data.directPlay) {
      if (videoRef.current) videoRef.current.currentTime = clamped;
    } else {
      save();
      setOffset(clamped);
      setCurTime(0);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const markDoneLocal = (value: boolean) => {
    // atualiza o ✓ na sidebar e o botão sem esperar refetch
    setData((d) => (d ? { ...d, completed: value ? 1 : 0 } : d));
    setCourse((c) =>
      c
        ? {
            ...c,
            sections: c.sections.map((s) => ({
              ...s,
              lessons: s.lessons.map((l) => (l.id === data?.id ? { ...l, completed: value ? 1 : 0 } : l))
            }))
          }
        : c
    );
  };

  const toggleWatched = () => {
    if (!data) return;
    const value = !data.completed;
    void saveProgress(data.id, effTime, value);
    markDoneLocal(value);
  };

  const onEnded = () => {
    if (!data) return;
    void saveProgress(data.id, duration || effTime, true);
    markDoneLocal(true);
    if (autoNext && data.next) navigate(`/aula/${data.next.id}`);
  };

  // ---- teclado ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space" || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") seek(effTime + 10);
      else if (e.key === "ArrowLeft") seek(effTime - 10);
      else if (e.key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  };

  if (error) return <div className="page center-msg">Erro ao carregar: {error}</div>;
  if (!data) return <div className="page center-msg">Carregando...</div>;

  const totalLessons = course ? course.sections.reduce((n, s) => n + s.lessons.length, 0) : 0;

  return (
    <div className="player-page">
      <div className="player-topbar">
        <Link to={`/curso/${data.course.id}`} className="back-link">
          ← Voltar para o curso
        </Link>
        <div className="topbar-nav">
          <button
            className="round-btn"
            onClick={() => data.prev && navigate(`/aula/${data.prev.id}`)}
            disabled={!data.prev}
            title={data.prev ? `Anterior: ${data.prev.title}` : "Primeira aula"}
          >
            ‹
          </button>
          <button
            className="round-btn"
            onClick={() => data.next && navigate(`/aula/${data.next.id}`)}
            disabled={!data.next}
            title={data.next ? `Próxima: ${data.next.title}` : "Última aula"}
          >
            ›
          </button>
        </div>
      </div>

      <div className="player-layout">
        {/* ---- coluna esquerda: título + player + materiais ---- */}
        <div className="player-main">
          <div className="player-title-row">
            <h1 className="player-title">{data.title}</h1>
            <button
              className={data.completed ? "btn-watched active" : "btn-watched"}
              onClick={toggleWatched}
              title={data.completed ? "Marcar como não vista" : "Marcar como vista"}
            >
              {data.completed ? "✓ Aula vista" : "Marcar como vista"}
            </button>
          </div>

          <div
            ref={wrapRef}
            className={showControls ? "video-wrap" : "video-wrap hide-cursor"}
            onMouseMove={poke}
            onClick={poke}
          >
            <video
              key={src}
              ref={videoRef}
              src={src}
              autoPlay={effTime > 0 || playing}
              crossOrigin="anonymous"
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onPlay={() => {
                setPlaying(true);
                poke();
              }}
              onPause={() => {
                setPlaying(false);
                save();
                setShowControls(true);
              }}
              onTimeUpdate={(e) => setCurTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setVideoDur(v.duration);
                v.volume = volume;
                v.playbackRate = rate;
                const resume = Number(v.dataset.resume ?? 0);
                if (data.directPlay && resume > 0) {
                  v.currentTime = resume;
                  delete v.dataset.resume;
                }
              }}
              onEnded={onEnded}
            >
              {data.subtitles.map((s) => (
                <track key={s.id} kind="subtitles" label={s.lang} src={`/api/subtitles/${s.id}`} />
              ))}
            </video>

            <div className={showControls ? "controls" : "controls controls-hidden"}>
              <input
                className="seekbar"
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(effTime, duration || effTime)}
                onChange={(e) => seek(Number(e.target.value))}
              />
              <div className="controls-row">
                <div className="controls-left">
                  <button onClick={() => data.prev && navigate(`/aula/${data.prev.id}`)} disabled={!data.prev} title="Aula anterior">
                    ⏮
                  </button>
                  <button className="play-btn" onClick={togglePlay}>
                    {playing ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => data.next && navigate(`/aula/${data.next.id}`)} disabled={!data.next} title="Próxima aula">
                    ⏭
                  </button>
                  <button onClick={() => seek(effTime - 10)} title="Voltar 10s">↺10</button>
                  <button onClick={() => seek(effTime + 10)} title="Avançar 10s">10↻</button>
                  <span className="time-label">
                    {fmtClock(effTime)} / {fmtClock(duration)}
                  </span>
                </div>
                <div className="controls-right">
                  {data.subtitles.length > 0 && (
                    <select
                      value={subLang ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setSubLang(v);
                        if (v) localStorage.setItem(SUB_PREF_KEY, v);
                        else localStorage.removeItem(SUB_PREF_KEY);
                      }}
                      title="Legendas"
                    >
                      <option value="">Sem legenda</option>
                      {data.subtitles.map((s) => (
                        <option key={s.id} value={s.lang}>
                          {s.lang}
                        </option>
                      ))}
                    </select>
                  )}
                  <select value={rate} onChange={(e) => setRate(Number(e.target.value))} title="Velocidade">
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                      <option key={r} value={r}>
                        {r}x
                      </option>
                    ))}
                  </select>
                  <input
                    className="volume"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    title="Volume"
                  />
                  <label className="autonext" title="Ir para a próxima aula automaticamente">
                    <input
                      type="checkbox"
                      checked={autoNext}
                      onChange={(e) => {
                        setAutoNext(e.target.checked);
                        localStorage.setItem(AUTONEXT_KEY, e.target.checked ? "1" : "0");
                      }}
                    />
                    Auto
                  </label>
                  <button onClick={toggleFullscreen} title="Tela cheia">⛶</button>
                </div>
              </div>
            </div>
          </div>

          {/* ---- materiais embaixo do player ---- */}
          {course && course.materials.length > 0 && (
            <details className="section player-materials">
              <summary>
                <span className="section-title">📎 Material do curso</span>
                <span className="section-meta">{course.materials.length} arquivos</span>
              </summary>
              <ul className="material-list">
                {course.materials.map((m) => (
                  <li key={m.id}>
                    <a href={`/api/materials/${m.id}`} download>
                      {m.name}
                    </a>
                    <span className="material-size">{fmtSize(m.size)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* ---- coluna direita: aulas do curso ---- */}
        <aside className="player-sidebar">
          <div className="sidebar-header">
            <div className="sidebar-course">{data.course.title}</div>
            {totalLessons > 0 && <div className="sidebar-count">{totalLessons} aulas</div>}
          </div>
          <div className="sidebar-list">
            {course?.sections.map((section, i) => {
              const hasSections = course.sections.length > 1 || section.title !== null;
              const containsCurrent = section.lessons.some((l) => l.id === data.id);
              const list = (
                <ul className="sidebar-lessons">
                  {section.lessons.map((l) => {
                    const isCurrent = l.id === data.id;
                    return (
                      <li key={l.id}>
                        <Link
                          to={`/aula/${l.id}`}
                          className={isCurrent ? "sidebar-lesson current" : "sidebar-lesson"}
                        >
                          <span className={l.completed ? "lesson-icon done" : "lesson-icon"}>
                            {l.completed ? "✓" : isCurrent ? "▶" : "▷"}
                          </span>
                          <span className="sidebar-lesson-title">{l.title}</span>
                          <span className="sidebar-lesson-dur">{fmtDuration(l.duration)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              );
              if (!hasSections) return <div key={i}>{list}</div>;
              return (
                <details key={i} className="sidebar-section" open={containsCurrent}>
                  <summary>
                    <span className="sidebar-section-title">{section.title ?? "Aulas"}</span>
                    <span className="section-meta">
                      {section.lessons.filter((l) => l.completed).length}/{section.lessons.length}
                    </span>
                  </summary>
                  {list}
                </details>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
