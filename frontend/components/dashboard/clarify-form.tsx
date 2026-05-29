"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus, ArrowRight, X, FileText, FileSpreadsheet, File, Link2 } from "lucide-react";
import { generatePressureTest, fetchImportableThreads, saveContingentThread, type ImportableThread } from "@/lib/api/threads";

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  status: "uploading" | "done" | "error";
}

interface ClarifyFormProps {
  threadId?: string | null;
  onBack: () => void;
  onContinue: (data: any) => void;
  onAutosave?: (data: any) => Promise<void> | void;
  autosaveStatus?: "idle" | "saving" | "saved" | "error";
  initialData?: {
    title?: string;
    coreProblem?: string;
    desiredOutcome?: string;
    context?: string;
    constraints?: string[];
    assumptions?: string[];
  };
  reentryContext?: { failedTitle: string; failedLessons: string[] } | null;
}

export function ClarifyForm({ threadId, onBack, onContinue, onAutosave, autosaveStatus = "idle", initialData, reentryContext }: ClarifyFormProps) {
  const [title, setTitle] = useState(
    initialData?.title && initialData.title !== "Untitled Decision" && initialData.title !== "Untitled n"
      ? initialData.title
      : ""
  );
  const [coreProblem, setCoreProblem] = useState(initialData?.coreProblem || "");
  const [desiredOutcome, setDesiredOutcome] = useState(initialData?.desiredOutcome || "");
  const [context, setContext] = useState(initialData?.context || "");
  const [constraints, setConstraints] = useState<string[]>(initialData?.constraints || []);
  const [assumptions, setAssumptions] = useState<string[]>(initialData?.assumptions || []);
  const [newConstraint, setNewConstraint] = useState("");
  const [newAssumption, setNewAssumption] = useState("");
  const [showConstraintInput, setShowConstraintInput] = useState(false);
  const [showAssumptionInput, setShowAssumptionInput] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [importableThreads, setImportableThreads] = useState<ImportableThread[]>([]);
  const [loadingImportable, setLoadingImportable] = useState(false);
  const [contingentThread, setContingentThread] = useState<ImportableThread | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasMountedRef = useRef(false);
  const lastQueuedPayloadRef = useRef<string>("");
  const preGeneratedRef = useRef(false);
  const initializedThreadRef = useRef<string | null | undefined>(null);

  // When threadId changes and initialData arrives, re-sync form fields
  useEffect(() => {
    if (!initialData || initializedThreadRef.current === threadId) return;
    initializedThreadRef.current = threadId;
    setTitle(
      initialData.title && initialData.title !== "Untitled Decision" && initialData.title !== "Untitled n"
        ? initialData.title : ""
    );
    setCoreProblem(initialData.coreProblem || "");
    setDesiredOutcome(initialData.desiredOutcome || "");
    setContext(initialData.context || "");
    setConstraints(initialData.constraints || []);
    setAssumptions(initialData.assumptions || []);
  }, [threadId, initialData]);

  const draftPayload = useMemo(
    () => ({
      title,
      coreProblem,
      desiredOutcome,
      context,
      constraints,
      assumptions,
    }),
    [title, coreProblem, desiredOutcome, context, constraints, assumptions]
  );

  // 3s debounce on context field → silently pre-generate pressure test roots
  useEffect(() => {
    if (!threadId || preGeneratedRef.current) return;
    if (title.length < 6 || coreProblem.length < 15 || context.length < 10) return;

    const timer = window.setTimeout(() => {
      preGeneratedRef.current = true;
      generatePressureTest(threadId).catch(() => {
        preGeneratedRef.current = false;
      });
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [context, threadId, title.length, coreProblem.length]);

  useEffect(() => {
    if (!onAutosave) return;

    const serializedPayload = JSON.stringify(draftPayload);
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastQueuedPayloadRef.current = serializedPayload;
      return;
    }

    if (lastQueuedPayloadRef.current === serializedPayload) {
      return;
    }

    lastQueuedPayloadRef.current = serializedPayload;

    const timer = window.setTimeout(() => {
      void onAutosave(draftPayload);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [draftPayload, onAutosave]);


  const autosaveLabel =
    autosaveStatus === "saving"
      ? "Saving..."
      : autosaveStatus === "saved"
        ? "Saved"
        : autosaveStatus === "error"
          ? "Save failed"
          : "";

  const handleAddConstraint = () => {
    if (newConstraint.trim()) {
      setConstraints([...constraints, newConstraint.trim()]);
      setNewConstraint("");
      setShowConstraintInput(false);
    }
  };

  const handleRemoveConstraint = (index: number) => {
    setConstraints(constraints.filter((_, i) => i !== index));
  };

  const handleAddAssumption = () => {
    if (newAssumption.trim()) {
      setAssumptions([...assumptions, newAssumption.trim()]);
      setNewAssumption("");
      setShowAssumptionInput(false);
    }
  };

  const handleRemoveAssumption = (index: number) => {
    setAssumptions(assumptions.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    for (const file of files) {
      const placeholder: UploadedFile = { name: file.name, type: file.type, size: file.size, status: threadId ? "uploading" : "error" };
      setUploadedFiles((prev) => [...prev, placeholder]);
      if (!threadId) continue;

      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/threads/${threadId}/upload`, { method: "POST", body: form });
        setUploadedFiles((prev) =>
          prev.map((f) => f.name === file.name && f.status === "uploading"
            ? { ...f, status: res.ok ? "done" : "error" }
            : f
          )
        );
      } catch {
        setUploadedFiles((prev) =>
          prev.map((f) => f.name === file.name && f.status === "uploading" ? { ...f, status: "error" } : f)
        );
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const handleOpenImportPicker = async () => {
    if (showImportPicker) { setShowImportPicker(false); return; }
    setShowImportPicker(true);
    if (importableThreads.length > 0) return;
    setLoadingImportable(true);
    const threads = await fetchImportableThreads();
    setImportableThreads(threads);
    setLoadingImportable(false);
  };

  const handleSelectContingent = async (thread: ImportableThread) => {
    setContingentThread(thread);
    setShowImportPicker(false);
    if (threadId) await saveContingentThread(threadId, thread.id);
  };

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) {
      return <FileText className="w-4 h-4 text-accent" />;
    } else if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) {
      return <FileSpreadsheet className="w-4 h-4 text-accent" />;
    }
    return <File className="w-4 h-4 text-accent" />;
  };


  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto scroll-container">
      {/* Re-entry banner — shown after failure analysis */}
      {reentryContext && (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 space-y-1.5">
          <p className="text-xs font-medium text-accent uppercase tracking-wider">Re-entering after failure</p>
          <p className="text-sm text-foreground/80">Previous decision: <span className="font-medium">{reentryContext.failedTitle}</span></p>
          {reentryContext.failedLessons.length > 0 && (
            <ul className="space-y-1 pt-0.5">
              {reentryContext.failedLessons.map((l, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-accent/60 shrink-0">•</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-serif text-foreground">Clarify the Problem</h2>
            {autosaveLabel ? (
              <p className={`text-xs ${autosaveStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {autosaveLabel}
              </p>
            ) : null}
          </div>
        </div>
        
        {/* File badges + buttons */}
        <div className="flex items-center gap-2 relative">
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1 text-xs group transition-colors ${
                file.status === "error"
                  ? "bg-destructive/10 border-destructive/40"
                  : file.status === "done"
                  ? "bg-secondary/50 border-accent/40"
                  : "bg-secondary/50 border-border/50 opacity-70"
              }`}
            >
              {getFileIcon(file.type)}
              <span className="text-foreground/80 max-w-[100px] truncate">{file.name}</span>
              {file.status !== "uploading" && (
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="p-0.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {/* Contingent badge */}
          {contingentThread && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(201,184,150,0.08)', border: '1px solid rgba(201,184,150,0.3)', color: '#c9b896' }}
            >
              <Link2 className="w-3 h-3" />
              <span className="max-w-[100px] truncate">{contingentThread.title}</span>
              <button onClick={() => setContingentThread(null)} className="opacity-60 hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={handleFileUpload} className="hidden" />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-sm text-accent border border-accent/50 rounded-lg hover:bg-accent/10 transition-colors flex items-center gap-1.5"
          >
            Add <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Import from prior decision */}
          <button
            onClick={handleOpenImportPicker}
            className="px-3 py-1.5 text-sm rounded-lg border transition-colors flex items-center gap-1.5"
            style={{
              borderColor: showImportPicker ? 'rgba(201,184,150,0.6)' : 'rgba(201,184,150,0.25)',
              color: showImportPicker ? '#c9b896' : 'rgba(201,184,150,0.5)',
            }}
          >
            Import <Link2 className="w-3.5 h-3.5" />
          </button>

          {/* Picker dropdown */}
          {showImportPicker && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border z-50 overflow-hidden"
              style={{ background: 'var(--card)', borderColor: 'rgba(201,184,150,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
            >
              <p className="px-4 pt-3 pb-2 text-xs text-muted-foreground">Import</p>
              {loadingImportable ? (
                <p className="px-4 pb-3 text-xs text-muted-foreground">Loading...</p>
              ) : importableThreads.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-muted-foreground">No extracted decisions found.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto">
                  {importableThreads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectContingent(t)}
                      className="w-full text-left px-4 py-2.5 hover:bg-secondary/60 transition-colors"
                    >
                      <p className="text-sm text-foreground truncate">{t.title}</p>
                      {t.decision && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.decision}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-7 max-w-2xl mx-auto w-full">
        {/* Decision Title */}
        <div id="tour-clarify-title" className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: '#ddd0b0' }}>Decision Title</label>
          <div className="relative">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 150))}
              placeholder="What are you deciding?"
              className="w-full rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-all"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            {title.length > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {title.length}/150
              </span>
            )}
          </div>
        </div>

        {/* Core Problem */}
        <div id="tour-clarify-problem" className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: '#ddd0b0' }}>Core Problem</label>
          <div className="relative">
            <textarea
              value={coreProblem}
              onChange={(e) => setCoreProblem(e.target.value.slice(0, 500))}
              placeholder="What's really going on here?"
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none transition-all"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            {coreProblem.length > 0 && (
              <span className="absolute right-3 bottom-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {coreProblem.length}/500
              </span>
            )}
          </div>
        </div>

        {/* Context */}
        <div id="tour-clarify-context" className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: '#ddd0b0' }}>
            Context <span className="normal-case tracking-normal font-normal ml-1" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>· optional</span>
          </label>
          <div className="relative">
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value.slice(0, 500))}
              placeholder="Any background that shapes this decision…"
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none transition-all"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            {context.length > 0 && (
              <span className="absolute right-3 bottom-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {context.length}/500
              </span>
            )}
          </div>
        </div>

        {/* Constraints */}
        <div id="tour-clarify-constraints" className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: '#ddd0b0' }}>Constraints</label>
          {constraints.map((constraint, index) => (
            <div
              key={index}
              className="rounded-xl px-4 py-3 text-base flex items-center justify-between group transition-all"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <span>{constraint}</span>
              <button
                onClick={() => handleRemoveConstraint(index)}
                className="p-1 transition-colors opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {showConstraintInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newConstraint}
                onChange={(e) => setNewConstraint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddConstraint();
                  if (e.key === "Escape") { setShowConstraintInput(false); setNewConstraint(""); }
                }}
                placeholder="e.g. Budget under ₹5L…"
                autoFocus
                className="flex-1 rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-all"
                style={{ background: 'var(--secondary)', border: '1px solid var(--accent)' }}
              />
              <button onClick={handleAddConstraint} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>Add</button>
              <button onClick={() => { setShowConstraintInput(false); setNewConstraint(""); }} className="px-3 py-2 transition-colors" style={{ color: 'var(--muted-foreground)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConstraintInput(true)}
              className="w-full rounded-xl px-4 py-3 text-sm flex items-center gap-2 transition-colors"
              style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--muted-foreground)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <Plus className="w-4 h-4" />
              <span>Add a constraint</span>
            </button>
          )}
        </div>

        {/* Assumptions */}
        <div id="tour-clarify-assumptions" className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: '#ddd0b0' }}>Assumptions</label>
          {assumptions.map((assumption, index) => (
            <div
              key={index}
              className="rounded-xl px-4 py-3 text-base flex items-center justify-between group transition-all"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <span>{assumption}</span>
              <button
                onClick={() => handleRemoveAssumption(index)}
                className="p-1 transition-colors opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {showAssumptionInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newAssumption}
                onChange={(e) => setNewAssumption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddAssumption();
                  if (e.key === "Escape") { setShowAssumptionInput(false); setNewAssumption(""); }
                }}
                placeholder="e.g. Users will pay for this…"
                autoFocus
                className="flex-1 rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-all"
                style={{ background: 'var(--secondary)', border: '1px solid var(--accent)' }}
              />
              <button onClick={handleAddAssumption} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>Add</button>
              <button onClick={() => { setShowAssumptionInput(false); setNewAssumption(""); }} className="px-3 py-2 transition-colors" style={{ color: 'var(--muted-foreground)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAssumptionInput(true)}
              className="w-full rounded-xl px-4 py-3 text-sm flex items-center gap-2 transition-colors"
              style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--muted-foreground)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <Plus className="w-4 h-4" />
              <span>Add an assumption</span>
            </button>
          )}
        </div>

        {/* Continue Button */}
        <div id="tour-clarify-continue" className="flex justify-end pt-4 pb-6">
          <button
            onClick={() => {
              if (threadId && !preGeneratedRef.current) {
                preGeneratedRef.current = true;
                generatePressureTest(threadId).catch(() => { preGeneratedRef.current = false; });
              }
              onContinue(draftPayload);
            }}
            disabled={!title.trim() || !coreProblem.trim()}
            className="px-6 py-2.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'var(--accent-foreground)', boxShadow: '0 4px 20px color-mix(in srgb, var(--accent) 25%, transparent)' }}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
