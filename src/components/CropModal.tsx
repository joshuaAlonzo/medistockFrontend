import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  onDone: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

export default function CropModal({ src, onDone, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  // crop state: offset (px on original img) and scale
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const SIZE = 280; // canvas display size (px)
  const OUTPUT = 300; // output image size (px)

  // drag state
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImg(image);
      // default: fit the image so it fills the circle
      const minDim = Math.min(image.width, image.height);
      const initScale = SIZE / minDim;
      setScale(initScale);
      setOffset({
        x: (image.width * initScale - SIZE) / 2,
        y: (image.height * initScale - SIZE) / 2,
      });
    };
    image.src = src;
  }, [src]);

  // Draw whenever state changes
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, -offset.x, -offset.y, img.width * scale, img.height * scale);
    ctx.restore();

    // dim overlay outside circle
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // draw image again inside circle (on top of dim)
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, -offset.x, -offset.y, img.width * scale, img.height * scale);
    ctx.restore();

    // circle border
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "#126b57";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [img, offset, scale]);

  function clampOffset(ox: number, oy: number, s: number) {
    if (!img) return { x: ox, y: oy };
    const maxX = Math.max(0, img.width * s - SIZE);
    const maxY = Math.max(0, img.height * s - SIZE);
    return { x: Math.max(0, Math.min(ox, maxX)), y: Math.max(0, Math.min(oy, maxY)) };
  }

  function onMouseDown(e: React.MouseEvent) {
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setOffset(clampOffset(drag.current.ox - dx, drag.current.oy - dy, scale));
  }
  function onMouseUp() { drag.current = null; }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    drag.current = { startX: t.clientX, startY: t.clientY, ox: offset.x, oy: offset.y };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!drag.current) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.current.startX;
    const dy = t.clientY - drag.current.startY;
    setOffset(clampOffset(drag.current.ox - dx, drag.current.oy - dy, scale));
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    if (!img) return;
    const newScale = Math.max(0.1, Math.min(scale - e.deltaY * 0.001, 10));
    const ratio = newScale / scale;
    const newOffset = clampOffset(offset.x * ratio, offset.y * ratio, newScale);
    setScale(newScale);
    setOffset(newOffset);
  }

  function handleSave() {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = OUTPUT;
    out.height = OUTPUT;
    const ctx = out.getContext("2d")!;
    const ratio = OUTPUT / SIZE;
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, -offset.x * ratio, -offset.y * ratio, img.width * scale * ratio, img.height * scale * ratio);
    onDone(out.toDataURL("image/png"));
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 20, padding: "28px 28px 22px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)", maxWidth: 360, width: "100%",
      }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111" }}>Adjust your photo</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Drag to reposition · scroll to zoom</p>
        </div>

        {/* Canvas */}
        <div style={{ borderRadius: "50%", overflow: "hidden", width: SIZE, height: SIZE, cursor: "grab", flexShrink: 0, boxShadow: "0 4px 24px rgba(18,107,87,0.18)" }}>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            style={{ display: "block", userSelect: "none" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onMouseUp}
            onWheel={onWheel}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>–</span>
          <input
            type="range" min="0.1" max="5" step="0.01"
            value={scale}
            onChange={(e) => {
              if (!img) return;
              const s = parseFloat(e.target.value);
              setScale(s);
              setOffset(clampOffset(offset.x * (s / scale), offset.y * (s / scale), s));
            }}
            style={{ flex: 1, accentColor: "#126b57" }}
          />
          <span style={{ fontSize: 11, color: "#9ca3af" }}>+</span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#126b57", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
          >
            Save photo
          </button>
        </div>
      </div>
    </div>
  );
}
