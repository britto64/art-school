import { useEffect, useRef, useState } from "react";
import {
  apiGet,
  clearCourseBanner,
  CourseDetail,
  HomeData,
  saveCourseMeta,
  setBannerFromLesson,
  uploadCourseBanner
} from "../api";
import { IconUpload, IconX } from "./Icons";

interface Props {
  course: CourseDetail;
  onClose: () => void;
  onSaved: () => void;
}

interface Suggestion {
  id: string;
  title: string;
}

export default function EditCourse({ course, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(course.title);
  const [category, setCategory] = useState(course.category ?? "");
  const [teacher, setTeacher] = useState(course.teacher ?? "");
  const [categories, setCategories] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // escolha de imagem: null = manter atual; {lessonId} = frame sugerido; {file} = upload; "remove" = limpar
  const [pickedLesson, setPickedLesson] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<Suggestion[]>(`/api/courses/${course.id}/thumb-suggestions`).then(setSuggestions).catch(() => {});
    apiGet<HomeData>("/api/courses")
      .then((d) => {
        const cats = new Set<string>();
        d.courses.forEach((c) => c.category && cats.add(c.category));
        setCategories([...cats].sort());
      })
      .catch(() => {});
  }, [course.id]);

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (f: File | null) => {
    setFile(f);
    if (f) {
      setPickedLesson(null);
      setRemoveBanner(false);
    }
  };

  const pickLesson = (lessonId: string) => {
    setPickedLesson((cur) => (cur === lessonId ? null : lessonId));
    setFile(null);
    setRemoveBanner(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await saveCourseMeta(course.id, { title, category, teacher });
      if (!res.ok) throw new Error("Falha ao salvar metadados");
      if (file) {
        const r = await uploadCourseBanner(course.id, file);
        if (!r.ok) throw new Error("Falha ao enviar a imagem");
      } else if (pickedLesson) {
        const r = await setBannerFromLesson(course.id, pickedLesson);
        if (!r.ok) throw new Error("Falha ao gerar o frame");
      } else if (removeBanner) {
        await clearCourseBanner(course.id);
      }
      onSaved();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Editar curso</h2>
          <button className="modal-close" onClick={onClose} title="Fechar">
            <IconX size={18} />
          </button>
        </div>

        <label className="field">
          <span>Nome</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={course.folderTitle} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Categoria</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="cat-list"
              placeholder={course.folderCategory ?? "ex.: pintura, animação"}
            />
            <datalist id="cat-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Professor</span>
            <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="ex.: Jongha Yoon" />
          </label>
        </div>

        <div className="field">
          <span>Imagem do curso</span>
          <div className="banner-pick-row">
            <div className={removeBanner ? "banner-current removing" : "banner-current"}>
              {filePreview ? (
                <img src={filePreview} alt="" />
              ) : pickedLesson ? (
                <img src={`/api/thumb/lesson/${pickedLesson}`} alt="" />
              ) : (
                <img src={`/api/thumb/${course.id}?v=edit`} alt="" />
              )}
              <span className="banner-current-label">
                {filePreview ? "Upload" : pickedLesson ? "Frame escolhido" : removeBanner ? "Será removida" : "Atual"}
              </span>
            </div>
            <div className="banner-actions">
              <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
                <IconUpload size={15} /> Enviar imagem
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {course.hasCustomBanner && !file && !pickedLesson && (
                <label className="remove-banner">
                  <input type="checkbox" checked={removeBanner} onChange={(e) => setRemoveBanner(e.target.checked)} />
                  Remover imagem personalizada
                </label>
              )}
            </div>
          </div>

          {suggestions.length > 0 && (
            <>
              <span className="suggest-label">Ou escolha um frame das aulas:</span>
              <div className="suggest-grid">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    className={pickedLesson === s.id ? "suggest-thumb active" : "suggest-thumb"}
                    onClick={() => pickLesson(s.id)}
                    title={s.title}
                  >
                    <img loading="lazy" src={`/api/thumb/lesson/${s.id}`} alt={s.title} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-foot">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || title.trim() === ""}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
