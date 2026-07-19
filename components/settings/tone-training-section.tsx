"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Link as LinkIcon,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { getPlan, planRank } from "@/lib/plans";
import { FieldLabel, SettingsSection } from "@/components/settings/settings-ui";

type ToneSourceType = "document" | "url" | "text";

type ToneSource = {
  id: string;
  type: ToneSourceType;
  title: string;
  content: string;
  url?: string;
  createdAt: string;
};

const SAMPLE_MAX = 3;
const SAMPLE_MAX_CHARS = 1500;
const INSTRUCTIONS_MAX_CHARS = 800;
const SIGNOFF_MAX_CHARS = 120;
const SOURCE_MAX_COUNT = 10;

const SOURCE_TYPE_OPTIONS = [
  { value: "url" as const, label: "Website URL", icon: LinkIcon },
  { value: "text" as const, label: "Paste text", icon: Type },
  { value: "document" as const, label: "Upload .txt", icon: FileText },
];

/**
 * "Your voice" — Normal tone training (every plan: instructions, sign-off,
 * sample replies, analyze-sent, preview) + Advanced tone training (Business+:
 * documents, URLs, large text, compressed into a knowledge summary). Manages
 * its own fetch/save lifecycle against /api/assistant-settings and /api/tone/*
 * so it can drop into Settings without touching the page's existing state.
 */
export function ToneTrainingSection({ userId, planId }: { userId?: string | null; planId?: string | null }) {
  const isAdvanced = planRank(getPlan(planId).id) >= planRank("business");

  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [signOff, setSignOff] = useState("");
  const [samples, setSamples] = useState<string[]>([]);
  const [sources, setSources] = useState<ToneSource[]>([]);
  const [knowledgeSummary, setKnowledgeSummary] = useState("");

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewError, setPreviewError] = useState("");

  const [sourceType, setSourceType] = useState<ToneSourceType>("url");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/assistant-settings?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.settings) return;
        const s = data.settings;
        setInstructions(typeof s.toneInstructions === "string" ? s.toneInstructions : "");
        setSignOff(typeof s.toneSignOff === "string" ? s.toneSignOff : "");
        setSamples(Array.isArray(s.toneSamples) ? s.toneSamples : []);
        setSources(Array.isArray(s.toneSources) ? s.toneSources : []);
        setKnowledgeSummary(typeof s.toneKnowledgeSummary === "string" ? s.toneKnowledgeSummary : "");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const saveVoice = useCallback(async () => {
    if (!userId) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/assistant-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          settings: { toneInstructions: instructions, toneSignOff: signOff, toneSamples: samples },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      window.setTimeout(() => setSaveState("idle"), 2500);
    }
  }, [userId, instructions, signOff, samples]);

  const updateSample = (index: number, value: string) => {
    setSamples((current) => current.map((s, i) => (i === index ? value.slice(0, SAMPLE_MAX_CHARS) : s)));
  };
  const addSample = () => {
    setSamples((current) => (current.length >= SAMPLE_MAX ? current : [...current, ""]));
  };
  const removeSample = (index: number) => {
    setSamples((current) => current.filter((_, i) => i !== index));
  };

  const runAnalyzeSent = async () => {
    if (!userId) return;
    setAnalyzing(true);
    setAnalyzeError("");
    setAnalyzeMessage("");
    try {
      const res = await fetch("/api/tone/analyze-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      const suggestion = data.suggestion || {};
      if (suggestion.instructions) setInstructions(String(suggestion.instructions).slice(0, INSTRUCTIONS_MAX_CHARS));
      if (suggestion.signOff) setSignOff(String(suggestion.signOff).slice(0, SIGNOFF_MAX_CHARS));
      if (Array.isArray(suggestion.samples) && suggestion.samples.length) {
        setSamples(suggestion.samples.slice(0, SAMPLE_MAX));
      }
      setAnalyzeMessage(
        `Applied style notes from ${data.analyzed || "your"} recent sent emails. Review below, then save.`
      );
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    setPreviewError("");
    setPreviewText("");
    try {
      const res = await fetch("/api/tone/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          toneInstructions: instructions,
          toneSignOff: signOff,
          toneSamples: samples,
          toneKnowledgeSummary: isAdvanced ? knowledgeSummary : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreviewText(data.preview || "");
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const addSource = async () => {
    if (!userId) return;
    if (sourceType === "url" && !sourceUrl.trim()) {
      setSourceError("Add a URL first.");
      return;
    }
    if (sourceType !== "url" && !sourceText.trim()) {
      setSourceError(sourceType === "document" ? "Add the document text first." : "Paste some text first.");
      return;
    }
    setAddingSource(true);
    setSourceError("");
    try {
      const res = await fetch("/api/tone/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action: "add",
          source: {
            type: sourceType,
            title: sourceTitle,
            url: sourceType === "url" ? sourceUrl.trim() : undefined,
            content: sourceType !== "url" ? sourceText : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add source");
      setSources(Array.isArray(data.toneSources) ? data.toneSources : []);
      setKnowledgeSummary(typeof data.toneKnowledgeSummary === "string" ? data.toneKnowledgeSummary : "");
      setSourceTitle("");
      setSourceUrl("");
      setSourceText("");
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not add source");
    } finally {
      setAddingSource(false);
    }
  };

  const removeSource = async (id: string) => {
    if (!userId) return;
    setRemovingId(id);
    setSourceError("");
    try {
      const res = await fetch("/api/tone/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove", sourceId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove source");
      setSources(Array.isArray(data.toneSources) ? data.toneSources : []);
      setKnowledgeSummary(typeof data.toneKnowledgeSummary === "string" ? data.toneKnowledgeSummary : "");
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not remove source");
    } finally {
      setRemovingId(null);
    }
  };

  const regenerateSummary = async () => {
    if (!userId) return;
    setRegenerating(true);
    setSourceError("");
    try {
      const res = await fetch("/api/tone/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "regenerate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not refresh summary");
      setKnowledgeSummary(typeof data.toneKnowledgeSummary === "string" ? data.toneKnowledgeSummary : "");
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not refresh summary");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDocumentFile = (file: File) => {
    const okType = file.type === "text/plain" || /\.(txt|md)$/i.test(file.name);
    if (!okType) {
      setSourceError("Only .txt/.md files are read automatically — paste the text instead for other formats.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSourceText(String(reader.result || "").slice(0, 20_000));
      setSourceError("");
      if (!sourceTitle) setSourceTitle(file.name);
    };
    reader.onerror = () => setSourceError("Could not read that file.");
    reader.readAsText(file);
  };

  return (
    <SettingsSection
      icon={Wand2}
      title="Your voice"
      description="Teach Loopin how you write so drafts sound like you, not a generic assistant."
    >
      {loading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading your voice settings…</p>
      ) : (
        <>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-500">
                Normal · every plan
              </span>
              <button
                type="button"
                onClick={runAnalyzeSent}
                disabled={analyzing || !userId}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition"
              >
                {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Analyze my sent mail
              </button>
            </div>
            {analyzeMessage && <p className="text-[11px] font-semibold text-emerald-500">{analyzeMessage}</p>}
            {analyzeError && <p className="text-[11px] font-semibold text-rose-500">{analyzeError}</p>}

            <label className="space-y-2 block">
              <FieldLabel
                label="How you write"
                hint={`Sentence length, formality, habits Loopin should match. ${instructions.length}/${INSTRUCTIONS_MAX_CHARS}`}
              />
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value.slice(0, INSTRUCTIONS_MAX_CHARS))}
                rows={3}
                placeholder="e.g. Short sentences, casual, I skip greetings and get straight to the point."
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-violet-500 resize-none"
              />
            </label>

            <label className="space-y-2 block">
              <FieldLabel label="Preferred sign-off" hint="Used when a closing feels appropriate." />
              <input
                value={signOff}
                onChange={(e) => setSignOff(e.target.value.slice(0, SIGNOFF_MAX_CHARS))}
                placeholder="e.g. Best, Alex"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-violet-500"
              />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel label="Sample replies" hint={`Up to ${SAMPLE_MAX} real replies to match the voice of.`} />
                {samples.length < SAMPLE_MAX && (
                  <button
                    type="button"
                    onClick={addSample}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-500 hover:text-violet-400 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add sample
                  </button>
                )}
              </div>
              {samples.length === 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-500">
                  No samples yet — add one or analyze your sent mail.
                </p>
              ) : (
                <div className="space-y-2">
                  {samples.map((sample, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <textarea
                        value={sample}
                        onChange={(e) => updateSample(index, e.target.value)}
                        rows={2}
                        placeholder={`Sample reply ${index + 1}`}
                        className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500 resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeSample(index)}
                        className="mt-1 flex-shrink-0 text-slate-400 hover:text-rose-500 transition"
                        title="Remove sample"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={saveVoice}
                disabled={saveState === "saving" || !userId}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition"
              >
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save voice settings"}
              </button>
              <button
                type="button"
                onClick={runPreview}
                disabled={previewing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition"
              >
                {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Preview a draft
              </button>
              {saveState === "error" && <span className="text-[11px] font-semibold text-rose-500">Save failed — try again.</span>}
            </div>

            {previewError && <p className="text-[11px] font-semibold text-rose-500">{previewError}</p>}
            {previewText && (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-3">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">Preview draft</p>
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {previewText}
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  isAdvanced
                    ? "border-violet-500/20 bg-violet-500/10 text-violet-500"
                    : "border-slate-200 dark:border-white/10 text-slate-500"
                }`}
              >
                Advanced · Business+
              </span>
              {isAdvanced && sources.length > 0 && (
                <button
                  type="button"
                  onClick={regenerateSummary}
                  disabled={regenerating}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-violet-500 disabled:opacity-50 transition"
                >
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refresh summary
                </button>
              )}
            </div>

            {!isAdvanced ? (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-4 flex items-start gap-3">
                <Lock className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Train on documents, website URLs, and large volumes of text.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">
                    Available on the Business plan and higher, so drafts can pull from your facts, not just your style.
                  </p>
                  <Link
                    href="/dashboard?tab=pricing"
                    className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-violet-500 hover:text-violet-400 transition"
                  >
                    Upgrade to Business <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-slate-500 dark:text-slate-500">
                  Up to {SOURCE_MAX_COUNT} sources — documents, website URLs, or pasted text — compressed into a
                  knowledge summary every draft can use.
                </p>

                {sources.length > 0 && (
                  <div className="space-y-2">
                    {sources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          {source.type === "url" ? (
                            <LinkIcon className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                          ) : source.type === "document" ? (
                            <FileText className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Type className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                              {source.title}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {source.url || `${source.content.length.toLocaleString()} characters`}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSource(source.id)}
                          disabled={removingId === source.id}
                          className="flex-shrink-0 text-slate-400 hover:text-rose-500 disabled:opacity-50 transition"
                          title="Remove source"
                        >
                          {removingId === source.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {knowledgeSummary && (
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-3">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                      Knowledge summary used in drafts
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-6">
                      {knowledgeSummary}
                    </p>
                  </div>
                )}

                {sourceError && <p className="text-[11px] font-semibold text-rose-500">{sourceError}</p>}

                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSourceType(opt.value);
                          setSourceError("");
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                          sourceType === opt.value
                            ? "border-violet-500 bg-violet-500/10 text-violet-500"
                            : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                      >
                        <opt.icon className="w-3.5 h-3.5" />
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <input
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500"
                  />

                  {sourceType === "url" ? (
                    <input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://example.com/style-guide"
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500"
                    />
                  ) : (
                    <>
                      {sourceType === "document" && (
                        <input
                          type="file"
                          accept=".txt,.md,text/plain"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleDocumentFile(file);
                          }}
                          className="w-full text-xs text-slate-500 dark:text-slate-400"
                        />
                      )}
                      <textarea
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        rows={4}
                        placeholder={
                          sourceType === "document"
                            ? "Text from your .txt/.md file appears here — for PDF/DOCX, paste the text directly."
                            : "Paste a style guide, FAQ, or past replies…"
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#030712] px-3 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500 resize-none"
                      />
                    </>
                  )}

                  <button
                    type="button"
                    onClick={addSource}
                    disabled={addingSource || sources.length >= SOURCE_MAX_COUNT}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition"
                  >
                    {addingSource ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add source
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </SettingsSection>
  );
}
