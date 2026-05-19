"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus, ArrowRight, X, FileText, FileSpreadsheet, File } from "lucide-react";
import { generatePressureTest } from "@/lib/api/threads";

interface UploadedFile {
  name: string;
  type: string;
  size: number;
}

interface ClarifyFormProps {
  threadId?: string | null;
  onBack: () => void;
  onContinue: (data: any) => void;
  onAutosave?: (data: any) => Promise<void> | void;
  onDraftChange?: (data: any) => void;
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

export function ClarifyForm({ threadId, onBack, onContinue, onAutosave, onDraftChange, autosaveStatus = "idle", initialData, reentryContext }: ClarifyFormProps) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasMountedRef = useRef(false);
  const lastQueuedPayloadRef = useRef<string>("");
  const preGeneratedRef = useRef(false);

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

  useEffect(() => {
    if (!onDraftChange) return;
    if (title.length < 6 || coreProblem.length < 15) return;

    const timer = window.setTimeout(() => {
      onDraftChange(draftPayload);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [draftPayload, onDraftChange, title.length, coreProblem.length]);

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles: UploadedFile[] = Array.from(files).map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      }));
      setUploadedFiles([...uploadedFiles, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) {
      return <FileText className="w-4 h-4 text-accent" />;
    } else if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) {
      return <FileSpreadsheet className="w-4 h-4 text-accent" />;
    }
    return <File className="w-4 h-4 text-accent" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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
        
        {/* Add + Button for file upload */}
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-sm text-accent border border-accent/50 rounded-lg hover:bg-accent/10 transition-colors flex items-center gap-1.5"
          >
            Add <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="mb-6 space-y-2">
          <label className="text-xs text-muted-foreground">Attached Files</label>
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm group"
              >
                {getFileIcon(file.type)}
                <span className="text-foreground/80 max-w-[150px] truncate">{file.name}</span>
                <span className="text-muted-foreground text-xs">({formatFileSize(file.size)})</span>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="p-0.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="flex-1 space-y-7 max-w-2xl mx-auto w-full">
        {/* Decision Title */}
        <div className="space-y-2">
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
        <div className="space-y-2">
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
        <div className="space-y-2">
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
        <div className="space-y-2">
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
        <div className="space-y-2">
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
        <div className="flex justify-end pt-4 pb-6">
          <button
            onClick={() => {
              if (threadId && !preGeneratedRef.current) {
                preGeneratedRef.current = true;
                generatePressureTest(threadId).catch(() => { preGeneratedRef.current = false; });
              }
              onContinue(draftPayload);
            }}
            className="px-6 py-2.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2"
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
