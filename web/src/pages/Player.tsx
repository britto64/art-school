import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, CourseDetail, fmtClock, fmtDuration, PlayerData, saveProgress, TrickplayMeta } from "../api";
import Materials from "../components/Materials";
import {
  IconCC,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconForward10,
  IconFullscreen,
  IconPause,
  IconPlay,
  IconPlayOutline,
  IconRewind10,
  IconSettings,
  IconSkipNext,
  IconSkipPrev,
  IconTypography,
  IconVolume,
  IconVolumeMute
} from "../components/Icons";

const SUB_PREF_KEY = "artschool.sublang";
const AUTONEXT_KEY = "artschool.autonext";
const RATE_KEY = "artschool.rate";
const SUBSTYLE_KEY = "artschool.substyle";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// como o vídeo chega ao browser; em erro de reprodução escala direct -> remux -> transcode
type StreamMode = "direct" | "remux" | "transcode";
type MenuId = "cc" | "settings" | "substyle" | null;

// estilo global das legendas (vale para todos os cursos)
interface SubStyle {
  size: number; // px
  color: string;
  bg: number; // opacidade do fundo 0..1
  outline: boolean;
}

const DEFAULT_SUBSTYLE: SubStyle = { size: 22, color: "#ffffff", bg: 0.75, outline: false };

const SUB_COLORS = ["#ffffff", "#fde047", "#4ade80", "#67e8f9", "#f9a8d4", "#fb923c"];

function loadSubStyle(): SubStyle {
  try {
    return { ...DEFAULT_SUBSTYLE, ...JSON.parse(localStorage.getItem(SUBSTYLE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SUBSTYLE;
  }
}

// mantém só <i>/<b>/<u> do texto da legenda
const sanitizeCue = (t: string) => t.replace(/<(?!\/?(i|b|u)\b)[^>]*>/gi, "");

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seekWrapRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<PlayerData | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<StreamMode>("direct");
  // offset do remux: o <video> começa em 0, mas o tempo real é offset + currentTime
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0); // força remontar o <video> quando o src não muda
  const [fatal, setFatal] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [videoDur, setVideoDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("artschool.volume") ?? 1));
  const [rate, setRate] = useState(() => Number(localStorage.getItem(RATE_KEY) ?? 1));
  const [autoNext, setAutoNext] = useState(() => localStorage.getItem(AUTONEXT_KEY) !== "0");
  const [compat, setCompat] = useState(false); // modo compatibilidade: força recodificação
  const [subLang, setSubLang] = useState<string | null>(null);
  const [subStyle, setSubStyle] = useState<SubStyle>(loadSubStyle);
  const [cueLines, setCueLines] = useState<string[]>([]);
  const [menu, setMenu] = useState<MenuId>(null);
  const [showControls, setShowControls] = useState(true);
  const [drag, setDrag] = useState<number | null>(null); // arrastando a timeline
  // trickplay: preview de frames ao passar o mouse na timeline
  const [tp, setTp] = useState<TrickplayMeta | null>(null);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingResume = useRef(0); // seek pendente do direct play (aplicado no loadedmetadata)
  // última posição real conhecida: no unmount o <video> já foi destruído, então o save
  // final não pode ler videoRef (era isso que zerava o progresso ao navegar pela SPA)
  const lastPos = useRef(0);
  const lastVolume = useRef(1);
  const compatRef = useRef(false);
  const menuRef = useRef<MenuId>(null);
  menuRef.current = menu;

  const updateSubStyle = (patch: Partial<SubStyle>) =>
    setSubStyle((s) => {
      const next = { ...s, ...patch };
      localStorage.setItem(SUBSTYLE_KEY, JSON.stringify(next));
      return next;
    });

  // ---- carga da aula ----
  useEffect(() => {
    setData(null);
    setOffset(0);
    setCurTime(0);
    setVideoDur(0);
    setBuffered(0);
    setFatal(null);
    setWaiting(false);
    setDrag(null);
    setMenu(null);
    setReloadKey(0);
    pendingResume.current = 0;
    apiGet<PlayerData>(`/api/lessons/${id}`)
      .then((d) => {
        setData(d);
        // retoma de onde parou (se não estiver praticamente no fim)
        const resume = d.position > 10 && (!d.duration || d.position < d.duration - 15) ? d.position : 0;
        lastPos.current = resume;
        const m: StreamMode = compatRef.current ? "transcode" : d.directPlay ? "direct" : "remux";
        setMode(m);
        if (m === "direct") pendingResume.current = resume;
        else setOffset(Math.floor(resume));
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

  // ---- trickplay ----
  useEffect(() => {
    setTp(null);
    setHover(null);
    if (!id) return;
    apiGet<TrickplayMeta>(`/api/trickplay/${id}`).then(setTp).catch(() => {});
  }, [id]);

  // ---- curso (sidebar de aulas + materiais) ----
  useEffect(() => {
    if (!data?.course.id) return;
    apiGet<CourseDetail>(`/api/courses/${data.course.id}`).then(setCourse).catch(() => {});
  }, [data?.course.id, id]);

  const effTime = mode === "direct" ? curTime : offset + curTime;
  // no remux o <video> só conhece o trecho atual; o total vem do ffprobe (ou offset + trecho)
  const duration =
    data?.duration ??
    (videoDur > 0 && isFinite(videoDur) ? (mode === "direct" ? videoDur : offset + videoDur) : 0);

  // ---- src do vídeo ----
  const src = useMemo(() => {
    if (!data) return undefined;
    if (mode === "direct") return `/api/stream/${data.id}`;
    const base = `/api/stream/${data.id}?t=${Math.floor(offset)}`;
    return mode === "transcode" ? `${base}&transcode=1` : base;
  }, [data, mode, offset]);

  // ---- progresso ----
  const save = useCallback(
    (completed?: boolean) => {
      if (!data) return;
      void saveProgress(data.id, lastPos.current, completed);
    },
    [data]
  );

  useEffect(() => {
    const iv = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) save();
    }, 5000);
    return () => clearInterval(iv);
  }, [save]);

  useEffect(() => {
    const onUnload = () => save();
    const onVis = () => {
      if (document.visibilityState === "hidden") save(); // mobile não dispara beforeunload
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onVis);
      save(); // salva ao sair da página/trocar de aula (usa lastPos, o <video> já se foi)
    };
  }, [save]);

  // ---- troca de modo de stream (fallback, compat, seek do remux) ----
  const switchMode = (m: StreamMode, at: number) => {
    setFatal(null);
    setBuffered(0);
    setWaiting(true);
    lastPos.current = at;
    if (m === "direct") {
      pendingResume.current = at;
      setOffset(0);
    } else {
      setOffset(Math.floor(at));
    }
    setCurTime(0);
    setMode(m);
    setReloadKey((k) => k + 1);
  };

  // erro de reprodução: tenta o próximo modo (direct -> remux -> transcode)
  const onVideoError = () => {
    const code = videoRef.current?.error?.code ?? 0;
    if (code === 1 || !data) return; // 1 = abort (troca de src, não é erro real)
    setWaiting(false);
    setPlaying(false);
    if (mode === "direct") switchMode("remux", lastPos.current);
    else if (mode === "remux") switchMode("transcode", lastPos.current);
    else setFatal("Não foi possível reproduzir este vídeo, nem recodificando. Verifique o ffmpeg no servidor.");
  };

  // ---- legendas: renderização própria (overlay customizável) ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setCueLines([]);
    let active: TextTrack | null = null;
    for (let i = 0; i < v.textTracks.length; i++) {
      const t = v.textTracks[i];
      t.mode = "hidden"; // nunca usa o render nativo
      if (subLang !== null && t.label === subLang) active = t;
    }
    if (!active) return;
    const track = active;
    const onCue = () => {
      const lines: string[] = [];
      const cues = track.activeCues;
      if (cues) {
        for (let i = 0; i < cues.length; i++) {
          const cue = cues[i] as VTTCue;
          lines.push(...cue.text.split("\n").filter((l) => l.trim() !== ""));
        }
      }
      setCueLines(lines);
    };
    track.addEventListener("cuechange", onCue);
    onCue();
    return () => track.removeEventListener("cuechange", onCue);
  }, [subLang, src, data, reloadKey]);

  // fecha os menus junto com os controles
  useEffect(() => {
    if (!showControls) setMenu(null);
  }, [showControls]);

  // ---- volume / velocidade ----
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
    localStorage.setItem("artschool.volume", String(volume));
  }, [volume, src]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    localStorage.setItem(RATE_KEY, String(rate));
  }, [rate, src]);

  const toggleMute = () => {
    if (volume > 0) {
      lastVolume.current = volume;
      setVolume(0);
    } else {
      setVolume(lastVolume.current || 1);
    }
  };

  // ---- controles somem após inatividade (não enquanto um menu estiver aberto) ----
  const poke = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!menuRef.current) setShowControls(false);
    }, 3000);
  };

  const seek = (t: number) => {
    if (!data || fatal) return;
    const clamped = Math.max(0, duration > 0 ? Math.min(t, duration - 0.5) : t);
    lastPos.current = clamped;
    if (mode === "direct") {
      if (videoRef.current) videoRef.current.currentTime = clamped;
    } else {
      save();
      switchMode(mode, clamped);
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
    void saveProgress(data.id, lastPos.current, value);
    markDoneLocal(value);
  };

  const onEnded = () => {
    if (!data) return;
    void saveProgress(data.id, duration || effTime, true);
    markDoneLocal(true);
    if (autoNext && data.next) navigate(`/aula/${data.next.id}`);
  };

  const setCompatMode = (on: boolean) => {
    setCompat(on);
    compatRef.current = on;
    if (!data) return;
    save();
    switchMode(on ? "transcode" : data.directPlay ? "direct" : "remux", lastPos.current);
  };

  const chooseLang = (lang: string | null) => {
    setSubLang(lang);
    if (lang) localStorage.setItem(SUB_PREF_KEY, lang);
    else localStorage.removeItem(SUB_PREF_KEY);
  };

  // ---- teclado ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space" || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight" || e.key === "l") seek(effTime + 10);
      else if (e.key === "ArrowLeft" || e.key === "j") seek(effTime - 10);
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        setVolume((v) => Math.min(1, +(v + 0.1).toFixed(2)));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setVolume((v) => Math.max(0, +(v - 0.1).toFixed(2)));
      } else if (e.key === "m") toggleMute();
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

  // ---- timeline ----
  const shownTime = drag ?? effTime;
  const playedPct = duration > 0 ? Math.min(100, (shownTime / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  const timeAt = (clientX: number) => {
    const rect = seekWrapRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return 0;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return frac * duration;
  };

  const updateHover = (clientX: number) => {
    const rect = seekWrapRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const half = (tp ? tp.tileW / 2 : 42) + 6;
    const x = Math.min(Math.max(frac * rect.width, half), Math.max(half, rect.width - half));
    setHover({ x, time: frac * duration });
  };

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
            <IconChevronLeft size={18} />
          </button>
          <button
            className="round-btn"
            onClick={() => data.next && navigate(`/aula/${data.next.id}`)}
            disabled={!data.next}
            title={data.next ? `Próxima: ${data.next.title}` : "Última aula"}
          >
            <IconChevronRight size={18} />
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
              <IconCheck size={14} />
              {data.completed ? "Aula vista" : "Marcar como vista"}
            </button>
          </div>

          <div
            ref={wrapRef}
            className={showControls ? "video-wrap" : "video-wrap hide-cursor"}
            onMouseMove={poke}
            onClick={poke}
          >
            <video
              key={`${src}#${reloadKey}`}
              ref={videoRef}
              src={src}
              autoPlay={playing || offset > 0 || pendingResume.current > 0 || reloadKey > 0}
              crossOrigin="anonymous"
              onClick={() => (menu ? setMenu(null) : togglePlay())}
              onDoubleClick={toggleFullscreen}
              onPlay={() => {
                setPlaying(true);
                save(); // garante a linha no progresso logo no primeiro play
                poke();
              }}
              onPause={() => {
                setPlaying(false);
                save();
                setShowControls(true);
              }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setCurTime(t);
                lastPos.current = mode === "direct" ? t : offset + t;
              }}
              onLoadStart={() => setWaiting(true)}
              onCanPlay={() => setWaiting(false)}
              onPlaying={() => setWaiting(false)}
              onWaiting={() => setWaiting(true)}
              onSeeked={() => setWaiting(false)}
              onProgress={(e) => {
                const b = e.currentTarget.buffered;
                if (b.length > 0) setBuffered((mode === "direct" ? 0 : offset) + b.end(b.length - 1));
              }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setVideoDur(v.duration);
                v.volume = volume;
                v.playbackRate = rate;
                if (mode === "direct" && pendingResume.current > 0) {
                  v.currentTime = pendingResume.current;
                  pendingResume.current = 0;
                }
              }}
              onEnded={onEnded}
              onError={onVideoError}
            >
              {data.subtitles.map((s) => (
                <track key={s.id} kind="subtitles" label={s.lang} src={`/api/subtitles/${s.id}`} />
              ))}
            </video>

            {waiting && !fatal && <div className="player-spinner" />}

            {fatal && (
              <div className="player-error">
                <div className="player-error-title">{fatal}</div>
                <button
                  className="btn-primary"
                  onClick={() =>
                    switchMode(compat ? "transcode" : data.directPlay ? "direct" : "remux", lastPos.current)
                  }
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {subLang && cueLines.length > 0 && (
              <div
                className={showControls ? "sub-overlay raised" : "sub-overlay"}
                style={{ fontSize: subStyle.size }}
              >
                {cueLines.map((line, i) => (
                  <span
                    key={i}
                    className="sub-line"
                    style={{
                      color: subStyle.color,
                      background: `rgba(0, 0, 0, ${subStyle.bg})`,
                      textShadow: subStyle.outline
                        ? "2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000"
                        : undefined
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizeCue(line) }}
                  />
                ))}
              </div>
            )}

            <div className={showControls ? "controls" : "controls controls-hidden"}>
              <div
                ref={seekWrapRef}
                className={drag !== null ? "seekbar-wrap dragging" : "seekbar-wrap"}
                onPointerDown={(e) => {
                  if (duration <= 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrag(timeAt(e.clientX));
                }}
                onPointerMove={(e) => {
                  updateHover(e.clientX);
                  if (drag !== null) setDrag(timeAt(e.clientX));
                }}
                onPointerUp={() => {
                  if (drag !== null) {
                    seek(drag);
                    setDrag(null);
                  }
                }}
                onPointerLeave={() => setHover(null)}
              >
                <div className="seekbar-track">
                  <div className="seekbar-buffer" style={{ width: `${bufferedPct}%` }} />
                  <div className="seekbar-fill" style={{ width: `${playedPct}%` }} />
                  <div className="seekbar-thumb" style={{ left: `${playedPct}%` }} />
                </div>
                {hover && (
                  <div className="seek-preview" style={{ left: hover.x }}>
                    {tp &&
                      (() => {
                        const idx = Math.max(0, Math.min(tp.frames - 1, Math.floor(hover.time / tp.interval)));
                        const perSheet = tp.cols * tp.rows;
                        const sheet = Math.floor(idx / perSheet);
                        const col = (idx % perSheet) % tp.cols;
                        const row = Math.floor((idx % perSheet) / tp.cols);
                        return (
                          <div
                            className="seek-preview-img"
                            style={{
                              width: tp.tileW,
                              height: tp.tileH,
                              backgroundImage: `url(/api/trickplay/${data.id}/${sheet})`,
                              backgroundPosition: `-${col * tp.tileW}px -${row * tp.tileH}px`
                            }}
                          />
                        );
                      })()}
                    <div className="seek-preview-time">{fmtClock(hover.time)}</div>
                  </div>
                )}
              </div>
              <div className="controls-row">
                <div className="controls-left">
                  <button onClick={() => data.prev && navigate(`/aula/${data.prev.id}`)} disabled={!data.prev} title="Aula anterior">
                    <IconSkipPrev size={19} />
                  </button>
                  <button className="play-btn" onClick={togglePlay} title={playing ? "Pausar (espaço)" : "Reproduzir (espaço)"}>
                    {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
                  </button>
                  <button onClick={() => data.next && navigate(`/aula/${data.next.id}`)} disabled={!data.next} title="Próxima aula">
                    <IconSkipNext size={19} />
                  </button>
                  <button onClick={() => seek(effTime - 10)} title="Voltar 10s (←)">
                    <IconRewind10 size={21} />
                  </button>
                  <button onClick={() => seek(effTime + 10)} title="Avançar 10s (→)">
                    <IconForward10 size={21} />
                  </button>
                  <div className="ctrl-volume">
                    <button onClick={toggleMute} title={volume === 0 ? "Ativar som (m)" : "Mudo (m)"}>
                      {volume === 0 ? <IconVolumeMute size={20} /> : <IconVolume size={20} />}
                    </button>
                    <input
                      className="volume"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #fff ${volume * 100}%, rgba(255,255,255,0.25) ${volume * 100}%)`
                      }}
                      title="Volume"
                    />
                  </div>
                  <span className="time-label">
                    {fmtClock(effTime)} / {fmtClock(duration)}
                  </span>
                </div>
                <div className="controls-right">
                  {data.subtitles.length > 0 && (
                    <div className="menu-anchor" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={subLang ? "cc-on" : menu === "cc" || menu === "substyle" ? "active" : undefined}
                        onClick={() => setMenu(menu === "cc" || menu === "substyle" ? null : "cc")}
                        title="Legendas"
                      >
                        <IconCC size={20} />
                      </button>
                      {menu === "cc" && (
                        <div className="menu">
                          <div className="menu-label">Legendas</div>
                          <button className="menu-item" onClick={() => chooseLang(null)}>
                            <span className="mi-check">{subLang === null && <IconCheck size={14} />}</span>
                            Sem legenda
                          </button>
                          {data.subtitles.map((s) => (
                            <button key={s.id} className="menu-item" onClick={() => chooseLang(s.lang)}>
                              <span className="mi-check">{subLang === s.lang && <IconCheck size={14} />}</span>
                              {s.lang}
                            </button>
                          ))}
                          <div className="menu-sep" />
                          <button className="menu-item" onClick={() => setMenu("substyle")}>
                            <span className="mi-check">
                              <IconTypography size={15} />
                            </span>
                            Estilo da legenda
                            <span className="mi-arrow">
                              <IconChevronRight size={13} />
                            </span>
                          </button>
                        </div>
                      )}
                      {menu === "substyle" && (
                        <div className="menu sub-panel">
                          <button className="menu-item menu-back" onClick={() => setMenu("cc")}>
                            <IconChevronLeft size={14} /> Estilo da legenda
                          </button>
                          <label className="sub-panel-row">
                            <span>Tamanho</span>
                            <input
                              type="range"
                              min={14}
                              max={42}
                              step={1}
                              value={subStyle.size}
                              onChange={(e) => updateSubStyle({ size: Number(e.target.value) })}
                            />
                            <b>{subStyle.size}</b>
                          </label>
                          <div className="sub-panel-row">
                            <span>Cor</span>
                            <span className="sub-swatches">
                              {SUB_COLORS.map((c) => (
                                <button
                                  key={c}
                                  className={subStyle.color === c ? "swatch active" : "swatch"}
                                  style={{ background: c }}
                                  onClick={() => updateSubStyle({ color: c })}
                                  title={c}
                                />
                              ))}
                            </span>
                          </div>
                          <label className="sub-panel-row">
                            <span>Fundo</span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={subStyle.bg}
                              onChange={(e) => updateSubStyle({ bg: Number(e.target.value) })}
                            />
                            <b>{Math.round(subStyle.bg * 100)}%</b>
                          </label>
                          <button
                            className="menu-item"
                            onClick={() => updateSubStyle({ outline: !subStyle.outline })}
                          >
                            <span className="menu-item-text">Contorno</span>
                            <span className={subStyle.outline ? "switch on" : "switch"}>
                              <span className="switch-knob" />
                            </span>
                          </button>
                          <div className="sub-panel-note">Vale para todos os cursos</div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="menu-anchor" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={menu === "settings" ? "active" : undefined}
                      onClick={() => setMenu(menu === "settings" ? null : "settings")}
                      title="Configurações"
                    >
                      <IconSettings size={20} />
                    </button>
                    {menu === "settings" && (
                      <div className="menu">
                        <div className="menu-label">Velocidade</div>
                        <div className="rate-row">
                          {RATES.map((r) => (
                            <button
                              key={r}
                              className={r === rate ? "rate-pill active" : "rate-pill"}
                              onClick={() => setRate(r)}
                            >
                              {r === 1 ? "Normal" : `${r}x`}
                            </button>
                          ))}
                        </div>
                        <div className="menu-sep" />
                        <button
                          className="menu-item"
                          onClick={() => {
                            const v = !autoNext;
                            setAutoNext(v);
                            localStorage.setItem(AUTONEXT_KEY, v ? "1" : "0");
                          }}
                        >
                          <span className="menu-item-text">Próxima aula automática</span>
                          <span className={autoNext ? "switch on" : "switch"}>
                            <span className="switch-knob" />
                          </span>
                        </button>
                        <button className="menu-item" onClick={() => setCompatMode(!compat)}>
                          <span className="menu-item-text">
                            Modo compatibilidade
                            <small>Recodifica o vídeo — use se travar ou ficar sem imagem</small>
                          </span>
                          <span className={compat ? "switch on" : "switch"}>
                            <span className="switch-knob" />
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={toggleFullscreen} title="Tela cheia (f)">
                    <IconFullscreen size={19} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ---- materiais embaixo do player ---- */}
          {course && <Materials materials={course.materials} title="Material do curso" />}
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
                            {l.completed ? (
                              <IconCheck size={13} />
                            ) : isCurrent ? (
                              <IconPlay size={12} />
                            ) : (
                              <IconPlayOutline size={12} />
                            )}
                          </span>
                          <span className="lesson-thumb small">
                            <img
                              loading="lazy"
                              src={`/api/thumb/lesson/${l.id}`}
                              alt=""
                              onError={(e) => e.currentTarget.parentElement?.classList.add("empty")}
                            />
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
