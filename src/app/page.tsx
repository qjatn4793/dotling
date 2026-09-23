"use client";

import { useState, useRef, useEffect } from "react";

const RESOLUTIONS = [
  { label: "16×16", value: 16 },
  { label: "32×32", value: 32 },
  { label: "64×64", value: 64 },
];

const PALETTES = [
  { label: "NES", value: "nes" },
  { label: "Game Boy", value: "gameboy" },
  { label: "8색", value: "8" },
  { label: "16색", value: "16" },
  { label: "32색", value: "32" },
];

type Mode = "image" | "text";

export default function Home() {
  const [mode, setMode] = useState<Mode>("image");
  const [resolution, setResolution] = useState(32);
  const [palette, setPalette] = useState("16");
  const [removeBg, setRemoveBg] = useState(false);
  const [sourceKind, setSourceKind] = useState<"image" | "pixel">("image");
  const [resultSize, setResultSize] = useState(32);
  const [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileDataRef = useRef<File | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result); }, [result]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (loading) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) loadFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function loadFile(file: File) {
    fileDataRef.current = file;
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }

  async function handleRequest() {
    if (mode === "image" ? !fileDataRef.current : !prompt.trim()) return;
    setLoading(true);
    setError(null);
    setNotice("");
    setResult(null);
    const requestedSize = resolution;
    try {
      const formData = new FormData();
      if (fileDataRef.current) formData.append("image", fileDataRef.current);
      formData.append("resolution", String(resolution));
      formData.append("palette", palette);
      formData.append("removeBg", String(removeBg));
      formData.append("sourceKind", sourceKind);
      const res = await fetch(mode === "image" ? "/api/convert" : "/api/generate", {
        method: "POST",
        ...(mode === "text" ? { headers: { "Content-Type": "application/json" } } : {}),
        body: mode === "image" ? formData : JSON.stringify({ prompt, resolution, palette, removeBg }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "처리에 실패했습니다");
      }
      setResult(URL.createObjectURL(await res.blob()));
      setResultSize(requestedSize);
      const messages = [];
      if (res.headers.get("X-Dotling-Boundary") === "true") messages.push("그림이 캔버스 경계에 닿아 있습니다. 잘린 부분이 없는지 확인해주세요.");
      setNotice(messages.join(" "));
    } catch (error) {
      setError(error instanceof Error ? error.message : "네트워크 연결을 확인해주세요");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `dotling-${resultSize}x${resultSize}.png`;
    a.click();
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-12 gap-10">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-widest text-[#f0f0f0] mb-1">✦ DOTLING</h1>
        <p className="text-sm text-[#888] tracking-wide">AI Pixel Art Generator</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-[#1a1a1a] border border-[#333] p-1">
        {(["image", "text"] as Mode[]).map((m) => (
          <button
            key={m}
            disabled={loading}
            onClick={() => { setMode(m); setResult(null); setError(null); }}
            className={`px-6 py-2 text-sm font-bold tracking-widest transition-colors ${
              mode === m ? "bg-[#f0f0f0] text-[#0f0f0f]" : "text-[#888] hover:text-[#f0f0f0]"
            }`}
          >
            {m === "image" ? "이미지 변환" : "텍스트 생성"}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-6 items-start justify-center w-full max-w-2xl">
        {/* Resolution */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#666] tracking-widest">RESOLUTION</span>
          <div className="flex gap-1">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setResolution(r.value)}
                className={`px-3 py-1 text-sm border transition-colors ${
                  resolution === r.value
                    ? "border-[#f0f0f0] text-[#f0f0f0]"
                    : "border-[#333] text-[#666] hover:border-[#888] hover:text-[#888]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Palette */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#666] tracking-widest">PALETTE</span>
          <div className="flex gap-1 flex-wrap">
            {PALETTES.map((p) => (
              <button
                key={p.value}
                onClick={() => setPalette(p.value)}
                className={`px-3 py-1 text-sm border transition-colors ${
                  palette === p.value
                    ? "border-[#f0f0f0] text-[#f0f0f0]"
                    : "border-[#333] text-[#666] hover:border-[#888] hover:text-[#888]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Remove BG toggle */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#666] tracking-widest">OPTIONS</span>
          <button
            onClick={() => setRemoveBg((v) => !v)}
            className={`px-3 py-1 text-sm border transition-colors ${
              removeBg
                ? "border-[#f0f0f0] text-[#f0f0f0]"
                : "border-[#333] text-[#666] hover:border-[#888] hover:text-[#888]"
            }`}
          >
            배경 제거
          </button>
        </div>
      </div>

      {mode === "image" && (
        <label className="text-sm text-[#aaa] flex gap-3 items-center">
          입력 이미지 유형
          <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as "image" | "pixel")} className="bg-[#1a1a1a] border border-[#444] p-2">
            <option value="image">사진 / 일러스트</option>
            <option value="pixel">기존 픽셀아트</option>
          </select>
        </label>
      )}
      {/* Input area */}
      <div className="w-full max-w-2xl flex flex-col gap-4">
        {mode === "image" ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => { if (!loading) fileRef.current?.click(); }}
            className={`border-2 border-dashed h-48 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              isDragging
                ? "border-[#f0f0f0] bg-[#1a1a1a]"
                : preview ? "border-[#444]" : "border-[#333] hover:border-[#555]"
            }`}
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {preview ? (
              <img src={preview} alt="preview" className="max-h-44 max-w-full object-contain" style={{ imageRendering: "auto" }} />
            ) : (
              <div className="text-center text-[#444]">
                <div className="text-4xl mb-2">⊕</div>
                <p className="text-sm tracking-wide">이미지를 드래그하거나 클릭해서 업로드</p>
                <p className="text-xs mt-1 text-[#333]">PNG · JPG · WEBP</p>
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: 검은 닌자 캐릭터, 귀여운 고양이, 우주선..."
            rows={4}
            className="w-full bg-[#1a1a1a] border border-[#333] text-[#f0f0f0] px-4 py-3 text-sm tracking-wide resize-none outline-none focus:border-[#555] placeholder-[#444]"
          />
        )}

        <button
          onClick={handleRequest}
          disabled={loading || (mode === "image" ? !preview : !prompt.trim())}
          className="w-full py-3 font-bold tracking-widest text-sm transition-colors bg-[#f0f0f0] text-[#0f0f0f] hover:bg-[#ccc] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading
            ? "처리 중..."
            : mode === "image" ? "픽셀아트로 변환" : "픽셀아트 생성"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-2xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="flex flex-col items-center gap-4">
          <span className="text-xs text-[#666] tracking-widest">RESULT</span>
          <div className="border border-[#333] p-2" style={{ backgroundColor: "#555", backgroundImage: "conic-gradient(#333 25%, transparent 0 50%, #333 0 75%, transparent 0)", backgroundSize: "16px 16px" }}>
            <img
              src={result}
              alt="pixel art result"
              className="w-64 h-64 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <p className="text-xs text-[#aaa]">원본 {resultSize}×{resultSize}px · 미리보기 확대 표시</p>
          {notice && <p className="max-w-xl text-sm text-amber-300">{notice}</p>}
          <button
            onClick={handleDownload}
            className="px-8 py-2 border border-[#f0f0f0] text-sm tracking-widest hover:bg-[#f0f0f0] hover:text-[#0f0f0f] transition-colors"
          >
            PNG 다운로드
          </button>
        </div>
      )}
    </main>
  );
}
