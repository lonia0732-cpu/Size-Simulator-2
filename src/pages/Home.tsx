import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Clipboard,
  Download,
  ImagePlus,
  Info,
  Maximize2,
  Monitor,
  MoveDiagonal2,
  Printer,
  RefreshCw,
  Ruler,
  Sparkles,
  X,
} from "lucide-react";

type ImageInfo = {
  filename: string;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  alphaWidth: number;
  alphaHeight: number;
  hadTransparentArea: boolean;
};

type Piece = {
  id: "figure" | "base";
  name: string;
  shortName: string;
  accent: "coral" | "violet";
  sumMm: number;
  marginMm: number;
  image: ImageInfo | null;
  loading: boolean;
  error: string | null;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INITIAL_PIECES: Piece[] = [
  {
    id: "figure",
    name: "스탠드 본체",
    shortName: "본체",
    accent: "coral",
    sumMm: 150,
    marginMm: 2,
    image: null,
    loading: false,
    error: null,
  },
  {
    id: "base",
    name: "발판",
    shortName: "발판",
    accent: "violet",
    sumMm: 90,
    marginMm: 2,
    image: null,
    loading: false,
    error: null,
  },
];

function formatMm(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "–";
}

function calculate(piece: Piece) {
  if (!piece.image) return null;
  const ratio = piece.image.alphaWidth / piece.image.alphaHeight;
  const usableSum = piece.sumMm - piece.marginMm * 4;
  if (usableSum <= 0 || !Number.isFinite(ratio)) return null;

  const imageHeight = usableSum / (ratio + 1);
  const imageWidth = ratio * imageHeight;
  return {
    ratio,
    imageWidth,
    imageHeight,
    outerWidth: imageWidth + piece.marginMm * 2,
    outerHeight: imageHeight + piece.marginMm * 2,
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("비교 이미지를 읽을 수 없습니다."));
    image.src = src;
  });
}

async function createComparisonCanvas(pieces: Piece[], diagonal: number, screenSize: { width: number; height: number }) {
  const validPieces = pieces.filter((piece) => piece.image && calculate(piece));
  if (!validPieces.length) throw new Error("계산된 이미지가 없습니다.");
  const rulerLeft = 54;
  const topRuler = 34;
  const panelPadding = 25;
  const panelGap = 34;
  const panelWidth = 520;
  const desiredPxPerMm = Math.hypot(screenSize.width, screenSize.height) / (diagonal * 25.4);
  const maxWidthMm = Math.max(...validPieces.map((piece) => calculate(piece)?.outerWidth ?? 0));
  const maxWidthPxPerMm = (panelWidth - rulerLeft - 30) / Math.max(maxWidthMm, 1);
  const pxPerMm = Math.max(1.8, Math.min(5.2, desiredPxPerMm, maxWidthPxPerMm));
  const maxHeightMm = Math.max(...validPieces.map((piece) => calculate(piece)?.outerHeight ?? 0));
  const panelHeight = Math.max(280, topRuler + maxHeightMm * pxPerMm + panelPadding * 2 + 40);
  const width = panelPadding * 2 + panelWidth * validPieces.length + panelGap * (validPieces.length - 1);
  const height = 230 + panelHeight;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("비교 이미지를 만들 수 없습니다.");
  context.scale(scale, scale);

  const text = (value: string, x: number, y: number, size: number, color: string, weight = "400", align: CanvasTextAlign = "left") => {
    context.fillStyle = color;
    context.font = `${weight} ${size}px Arial, sans-serif`;
    context.textAlign = align;
    context.fillText(value, x, y);
  };
  const roundedRect = (x: number, y: number, w: number, h: number, radius: number, fill: string, stroke?: string) => {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke) { context.strokeStyle = stroke; context.stroke(); }
  };
  const drawRuler = (x: number, y: number, lengthMm: number, direction: "horizontal" | "vertical") => {
    const lengthPx = lengthMm * pxPerMm;
    context.strokeStyle = "#827770";
    context.lineWidth = 1;
    context.beginPath();
    if (direction === "horizontal") { context.moveTo(x, y); context.lineTo(x + lengthPx, y); } else { context.moveTo(x, y); context.lineTo(x, y + lengthPx); }
    context.stroke();
    for (let mm = 0; mm <= Math.ceil(lengthMm); mm += 1) {
      const position = mm * pxPerMm;
      const major = mm % 10 === 0;
      const medium = mm % 5 === 0;
      const tick = major ? 13 : medium ? 9 : 5;
      context.strokeStyle = major ? "#5f5651" : medium ? "#897e78" : "#b6aaa3";
      context.beginPath();
      if (direction === "horizontal") { context.moveTo(x + position, y); context.lineTo(x + position, y + tick); } else { context.moveTo(x, y + position); context.lineTo(x + tick, y + position); }
      context.stroke();
      if (major) text(String(mm), direction === "horizontal" ? x + position + 2 : x - 7, direction === "horizontal" ? y - 7 : y + position + 3, 9, "#726963", "400", direction === "horizontal" ? "left" : "right");
    }
  };

  context.fillStyle = "#f7f4ef";
  context.fillRect(0, 0, width, height);
  text("STANDSCALE", 28, 32, 13, "#e86e5c", "700");
  text("실물 크기 비교 캡처", 28, 70, 30, "#2d2a31", "700");
  text("사이트의 실물 크기 비교 영역을 그대로 저장한 비교용 이미지", 28, 95, 12, "#706966", "400");
  text(`1mm = ${pxPerMm.toFixed(2)}px · 화면 ${screenSize.width} × ${screenSize.height}px · ${diagonal} inch`, width - 28, 32, 10, "#817873", "400", "right");
  roundedRect(28, 119, width - 56, 37, 10, "#fff8e8", "#f1dfb8");
  text("이미지 비율 유지 · 이미지와 눈금자가 캔버스 밖으로 나가지 않도록 자동 조정", 45, 143, 11, "#6d5e4e", "700");

  for (let index = 0; index < validPieces.length; index += 1) {
    const piece = validPieces[index];
    const result = calculate(piece);
    if (!piece.image || !result) continue;
    const accent = piece.accent === "coral" ? "#e86e5c" : "#7a6cce";
    const cardX = panelPadding + index * (panelWidth + panelGap);
    const cardY = 178;
    const cutX = cardX + rulerLeft;
    const cutY = cardY + topRuler + 40;
    const outerW = result.outerWidth * pxPerMm;
    const outerH = result.outerHeight * pxPerMm;
    roundedRect(cardX, cardY, panelWidth, panelHeight, 16, "rgba(255,255,255,.58)", "#e4ddd7");
    context.fillStyle = accent;
    context.beginPath();
    context.arc(cardX + 24, cardY + 27, 5, 0, Math.PI * 2);
    context.fill();
    text(`${piece.shortName} · ${formatMm(result.outerWidth)} × ${formatMm(result.outerHeight)} mm`, cardX + 37, cardY + 31, 12, "#746d6a", "500");
    drawRuler(cutX, cutY - topRuler, result.outerWidth, "horizontal");
    drawRuler(cutX - 17, cutY, result.outerHeight, "vertical");
    context.save();
    context.setLineDash([3, 3]);
    context.strokeStyle = "#827770";
    context.strokeRect(cutX, cutY, outerW, outerH);
    context.restore();
    context.fillStyle = "rgba(255,255,255,.35)";
    context.fillRect(cutX, cutY, outerW, outerH);
    const image = await loadImage(piece.image.previewUrl);
    const marginPx = piece.marginMm * pxPerMm;
    const fitScale = Math.min(
      (outerW - marginPx * 2) / result.imageWidth,
      (outerH - marginPx * 2) / result.imageHeight,
    );
    const imageW = Math.max(1, result.imageWidth * fitScale);
    const imageH = Math.max(1, result.imageHeight * fitScale);
    const imageX = cutX + (outerW - imageW) / 2;
    const imageY = cutY + (outerH - imageH) / 2;
    context.save();
    context.beginPath();
    context.rect(cutX, cutY, outerW, outerH);
    context.clip();
    context.drawImage(image, imageX, imageY, imageW, imageH);
    context.restore();
    context.save();
    context.setLineDash([2, 2]);
    context.strokeStyle = accent;
    context.strokeRect(imageX, imageY, imageW, imageH);
    context.restore();
    text(`가로 ${formatMm(result.outerWidth)} mm`, cutX + outerW / 2, cutY + outerH + 22, 10, "#746d6a", "500", "center");
    text(`세로 ${formatMm(result.outerHeight)} mm`, cardX + 15, cutY + outerH / 2, 10, "#746d6a", "500", "right");
  }
  text("※ 이미지와 사이트에 발판과 꽂는 부분의 사이즈는 상정되지 않으며 추가하지 않고, 계산에서 제외됩니다.", 28, height - 21, 10, "#8c7d6d", "400");
  return canvas;
}

async function readTransparentBounds(file: File): Promise<ImageInfo> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
      element.src = sourceUrl;
    });

    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 2048 / longest);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("브라우저가 캔버스를 지원하지 않습니다.");
    context.drawImage(image, 0, 0, width, height);

    const data = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let transparentPixels = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 10) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        } else {
          transparentPixels += 1;
        }
      }
    }

    if (maxX < 0 || maxY < 0) {
      throw new Error("투명하지 않은 픽셀을 찾지 못했습니다.");
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const crop = document.createElement("canvas");
    crop.width = cropWidth;
    crop.height = cropHeight;
    const cropContext = crop.getContext("2d");
    if (!cropContext) throw new Error("미리보기를 만들 수 없습니다.");
    cropContext.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    return {
      filename: file.name,
      previewUrl: crop.toDataURL("image/png"),
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      alphaWidth: Math.round(cropWidth / scale),
      alphaHeight: Math.round(cropHeight / scale),
      hadTransparentArea: transparentPixels > 0,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  suffix: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="number-input-wrap">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step="0.1"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <em>{suffix}</em>
      </div>
    </label>
  );
}

function SizingPanel({
  piece,
  onUpdate,
  onFile,
  onClear,
}: {
  piece: Piece;
  onUpdate: (change: Partial<Piece>) => void;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const result = calculate(piece);
  const [isDragOver, setIsDragOver] = useState(false);

  const selectFile = (file?: File) => {
    if (file) onFile(file);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const accentClass = piece.accent === "coral" ? "coral" : "violet";

  return (
    <section className={`sizing-panel ${accentClass}`} aria-label={`${piece.name} 계산`}> 
      <div className="panel-heading">
        <div className="panel-title-row">
          <div className="panel-orb" aria-hidden="true">
            {piece.accent === "coral" ? <Sparkles size={18} /> : <Maximize2 size={18} />}
          </div>
          <div>
            <span className="eyebrow">독립 계산</span>
            <h2>{piece.name}</h2>
          </div>
        </div>
        {piece.image && (
          <button className="icon-action" onClick={onClear} type="button" aria-label={`${piece.name} 초기화`}>
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      <label
        className={`dropzone ${isDragOver ? "is-dragging" : ""} ${piece.image ? "has-image" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        <input type="file" accept="image/png,image/webp,image/gif" onChange={onChange} />
        {piece.loading ? (
          <div className="upload-state"><RefreshCw className="spin" size={24} /><strong>투명 영역을 읽는 중…</strong></div>
        ) : piece.image ? (
          <>
            <div className="image-checker"><img src={piece.image.previewUrl} alt={`${piece.name} 투명 이미지 미리보기`} /></div>
            <div className="image-meta">
              <span className="file-name">{piece.image.filename}</span>
              <span>{piece.image.alphaWidth.toLocaleString()} × {piece.image.alphaHeight.toLocaleString()} px · 실제 그림 기준</span>
            </div>
            <span className="replace-image">다른 이미지로 바꾸기</span>
          </>
        ) : (
          <>
            <span className="upload-icon"><ImagePlus size={23} /></span>
            <strong>투명 PNG를 놓아주세요</strong>
            <span>클릭해서 선택 · PNG / WebP / GIF</span>
          </>
        )}
      </label>
      {piece.error && <p className="error-message"><X size={14} /> {piece.error}</p>}

      <div className="input-grid">
        <NumberField label="주문 가로 + 세로 합" value={piece.sumMm} onChange={(sumMm) => onUpdate({ sumMm })} min={1} suffix="mm" />
        <NumberField label="바깥 여백 (각 변)" value={piece.marginMm} onChange={(marginMm) => onUpdate({ marginMm })} min={0} suffix="mm" />
      </div>

      {piece.image && result ? (
        <div className="result-block">
          <div className="result-kicker"><Check size={14} /> 주문 규격</div>
          <div className="dimension-line">
            <strong>{formatMm(result.outerWidth)} <small>mm</small></strong>
            <span>×</span>
            <strong>{formatMm(result.outerHeight)} <small>mm</small></strong>
          </div>
          <div className="result-footer">
            <span>합계 <b>{formatMm(result.outerWidth + result.outerHeight)}mm</b></span>
            <span>그림 {formatMm(result.imageWidth)} × {formatMm(result.imageHeight)}mm</span>
          </div>
        </div>
      ) : piece.image ? (
        <div className="invalid-block">가로+세로 합은 여백 총합({formatMm(piece.marginMm * 4)}mm)보다 커야 해요.</div>
      ) : (
        <div className="empty-result">이미지를 올리면 투명 여백을 제외한 비율로 계산됩니다.</div>
      )}
    </section>
  );
}

function VerticalRuler({ length, pixelsPerMm }: { length: number; pixelsPerMm: number }) {
  const visibleLength = Math.ceil(length);
  const ticks = Array.from({ length: visibleLength + 1 }, (_, index) => index);
  return (
    <div className="vertical-ruler" style={{ height: `${length * pixelsPerMm}px` }} aria-label={`${formatMm(length)} 밀리미터 세로 자`}>
      {ticks.map((mm) => (
        <span key={mm} className={mm % 10 === 0 ? "major" : mm % 5 === 0 ? "medium" : "minor"} style={{ top: `${mm * pixelsPerMm}px` }}>
          {mm % 10 === 0 && <i>{mm}</i>}
        </span>
      ))}
    </div>
  );
}

function HorizontalRuler({ length, pixelsPerMm }: { length: number; pixelsPerMm: number }) {
  const visibleLength = Math.ceil(length);
  const ticks = Array.from({ length: visibleLength + 1 }, (_, index) => index);
  return (
    <div className="horizontal-ruler" style={{ width: `${length * pixelsPerMm}px` }} aria-label={`${formatMm(length)} 밀리미터 가로 자`}>
      {ticks.map((mm) => (
        <span key={mm} className={mm % 10 === 0 ? "major" : mm % 5 === 0 ? "medium" : "minor"} style={{ left: `${mm * pixelsPerMm}px` }}>
          {mm % 10 === 0 && <i>{mm}</i>}
        </span>
      ))}
    </div>
  );
}

function LifeSizePiece({ piece, pixelsPerMm }: { piece: Piece; pixelsPerMm: number }) {
  const result = calculate(piece);
  if (!piece.image || !result) {
    return (
      <div className="life-piece empty-life-piece">
        <div className="life-label"><span className={`dot ${piece.accent}`} /> {piece.shortName}</div>
        <p>이미지를 올리면<br />여기에 나타납니다.</p>
      </div>
    );
  }

  const outerWidthPx = result.outerWidth * pixelsPerMm;
  const outerHeightPx = result.outerHeight * pixelsPerMm;
  const innerWidthPx = result.imageWidth * pixelsPerMm;
  const innerHeightPx = result.imageHeight * pixelsPerMm;
  const paddingPx = piece.marginMm * pixelsPerMm;

  return (
    <div className="life-piece">
      <div className="life-label"><span className={`dot ${piece.accent}`} /> {piece.shortName} · {formatMm(result.outerWidth)} × {formatMm(result.outerHeight)} mm</div>
      <div className="measurement-board" style={{ width: `${outerWidthPx + 54}px` }}>
        <div className="board-content">
          <div className="ruler-corner">mm</div>
          <HorizontalRuler length={result.outerWidth} pixelsPerMm={pixelsPerMm} />
          <VerticalRuler length={result.outerHeight} pixelsPerMm={pixelsPerMm} />
          <div className="cut-area" style={{ width: `${outerWidthPx}px`, height: `${outerHeightPx}px` }}>
            <span className="corner-label top-left">0</span>
            <span className="corner-label top-right">{formatMm(result.outerWidth)}</span>
            <span className="corner-label bottom-left">{formatMm(result.outerHeight)}</span>
            <div
              className="art-area"
              style={{
                width: `${innerWidthPx}px`,
                height: `${innerHeightPx}px`,
                left: `${paddingPx}px`,
                top: `${paddingPx}px`,
              }}
            >
              <img src={piece.image.previewUrl} alt={`${piece.name} 실물 크기 미리보기`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [pieces, setPieces] = useState<Piece[]>(INITIAL_PIECES);
  const [diagonal, setDiagonal] = useState(13.3);
  const [zoom, setZoom] = useState(100);
  const [screenSize, setScreenSize] = useState({ width: 1440, height: 900 });
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const updateScreen = () => setScreenSize({ width: window.screen.width || window.innerWidth, height: window.screen.height || window.innerHeight });
    updateScreen();
    window.addEventListener("resize", updateScreen);
    return () => window.removeEventListener("resize", updateScreen);
  }, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const pixelsPerMm = useMemo(() => {
    const px = Math.hypot(screenSize.width, screenSize.height);
    if (!diagonal || diagonal <= 0) return 3.78;
    return (px / (diagonal * 25.4)) * (zoom / 100);
  }, [diagonal, screenSize, zoom]);

  const updatePiece = (id: Piece["id"], change: Partial<Piece>) => {
    setPieces((current) => current.map((piece) => (piece.id === id ? { ...piece, ...change } : piece)));
  };

  const loadFile = async (id: Piece["id"], file: File) => {
    if (!file.type.startsWith("image/")) {
      updatePiece(id, { error: "이미지 파일만 올릴 수 있어요." });
      return;
    }
    updatePiece(id, { loading: true, error: null });
    try {
      const image = await readTransparentBounds(file);
      updatePiece(id, { image, loading: false, error: null });
    } catch (error) {
      updatePiece(id, { loading: false, error: error instanceof Error ? error.message : "이미지를 처리하지 못했습니다." });
    }
  };

  const clearPiece = (id: Piece["id"]) => {
    setPieces((current) => current.map((piece) => (piece.id === id ? { ...piece, image: null, error: null } : piece)));
  };

  const copyOrder = async () => {
    const lines = pieces.map((piece) => {
      const result = calculate(piece);
      return result ? `${piece.name}: ${formatMm(result.outerWidth)} × ${formatMm(result.outerHeight)} mm (가로+세로 ${formatMm(result.outerWidth + result.outerHeight)} mm)` : `${piece.name}: 이미지 업로드 필요`;
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const exportComparison = async (format: "png" | "pdf") => {
    if (!hasResults || exporting) return;
    const printWindow = format === "pdf" ? window.open("", "_blank", "noopener,noreferrer") : null;
    if (format === "pdf" && !printWindow) {
      window.alert("PDF 비교 이미지를 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.");
      return;
    }
    setExporting(true);
    try {
      const canvas = await createComparisonCanvas(pieces, diagonal, screenSize);
      if (format === "png") {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("PNG 파일을 만들지 못했습니다.");
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `standscale-실물크기-비교-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = objectUrl;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        window.setTimeout(() => {
          link.remove();
          URL.revokeObjectURL(objectUrl);
        }, 1000);
      } else if (printWindow) {
        const imageUrl = canvas.toDataURL("image/png");
        printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>스탠드 스케일 실물 크기 비교</title><style>html,body{margin:0;background:#f7f4ef}body{padding:24px}img{display:block;width:100%;max-width:1200px;height:auto;margin:0 auto}p{font:12px Arial,sans-serif;color:#7a716c;text-align:center}@media print{body{padding:0;background:#fff}p{display:none}@page{size:A4 portrait;margin:8mm}}</style></head><body><img src="${imageUrl}" alt="실물 크기 비교 이미지"><p>인쇄 대화상자에서 ‘PDF로 저장’을 선택하세요.</p><script>window.onload=function(){window.print()}<\/script></body></html>`);
        printWindow.document.close();
      }
    } catch (error) {
      if (printWindow) printWindow.close();
      window.alert(error instanceof Error ? error.message : "비교 이미지를 만들지 못했습니다.");
    } finally {
      setExporting(false);
    }
  };

  const hasResults = pieces.some((piece) => calculate(piece));

  const installApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } else {
      window.alert("홈 화면에 추가하려면 브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택해 주세요.");
    }
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="스탠드 스케일 홈">
          <span className="brand-mark"><MoveDiagonal2 size={19} /></span>
          <span>stand<span>scale</span></span>
        </a>
        <div className="topbar-tools">
          <div className="topbar-note"><span className="live-dot" /> 투명 이미지 비율 계산</div>
          {!isInstalled && <button className="install-button" type="button" onClick={() => void installApp()}><Download size={14} /> 홈 화면에 추가</button>}
        </div>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="overline">ACRYLIC STAND SIZING TOOL</p>
          <h1>복잡한 사이즈 계산,<br /><em>한 번에 딱 맞게.</em></h1>
          <p className="hero-description">투명 PNG의 실제 그림 비율을 읽고, 주문처가 요구하는 <b>가로+세로 합</b>에 맞춰 본체와 발판 치수를 동시에 계산해요.</p>
        </div>
        <aside className="formula-card" aria-label="계산 방식">
          <span className="formula-label">계산 방식</span>
          <strong>그림 비율 유지 <ChevronRight size={16} /> 여백 포함 <ChevronRight size={16} /> 주문 규격</strong>
          <p>투명 캔버스 여백은 자동으로 빼고 계산합니다.</p>
        </aside>
      </section>

      <section className="sizing-grid" aria-label="본체와 발판 계산 패널">
        {pieces.map((piece) => (
          <SizingPanel
            key={piece.id}
            piece={piece}
            onUpdate={(change) => updatePiece(piece.id, change)}
            onFile={(file) => loadFile(piece.id, file)}
            onClear={() => clearPiece(piece.id)}
          />
        ))}
      </section>

      <section className="preview-section" aria-labelledby="preview-title">
        <div className="preview-heading">
          <div>
            <p className="overline">SIZE COMPARISON</p>
            <h2 id="preview-title">실물 크기 비교</h2>
            <p>이 화면의 실제 대각선을 입력하면, 눈금자와 이미지가 같은 스케일로 표시됩니다.</p>
          </div>
          <div className="export-actions">
            <button className={`copy-button ${copied ? "is-copied" : ""}`} onClick={copyOrder} type="button" disabled={!hasResults}>
              {copied ? <Check size={16} /> : <Clipboard size={16} />}
              {copied ? "복사됨" : "주문 규격 복사"}
            </button>
            <button className="export-button png" onClick={() => void exportComparison("png")} type="button" disabled={!hasResults || exporting}>
              <Download size={16} /> {exporting ? "생성 중…" : "실물 비교 PNG"}
            </button>
            <button className="export-button pdf" onClick={() => void exportComparison("pdf")} type="button" disabled={!hasResults || exporting}>
              <Printer size={16} /> 실물 비교 PDF
            </button>
          </div>
        </div>

        <div className="calibration-row">
          <div className="monitor-info"><Monitor size={20} /><span>현재 화면 기준 <b>{screenSize.width} × {screenSize.height}</b> px</span></div>
          <NumberField label="화면 대각선" value={diagonal} onChange={setDiagonal} min={1} suffix="inch" />
          <label className="zoom-field"><span>미리보기 배율 <b>{zoom}%</b></span><input type="range" min="50" max="150" step="5" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <div className="scale-readout"><Ruler size={17} /><span>1mm = <b>{pixelsPerMm.toFixed(2)}px</b></span></div>
        </div>

        <div className="preview-notice"><Info size={16} /><span><b>화면 대각선을 실제 기기 값으로 입력하세요.</b> 눈금자와 이미지 비교가 더 정확해집니다. 각 변의 여백은 기본 2mm입니다.</span></div>
        <div className="exclusion-notice"><Info size={16} /><span><b>계산 제외 안내</b> 이미지와 사이트에 발판과 꽂는 부분의 사이즈는 상정되지 않으며 추가하지 않고, 계산에서 제외됩니다.</span></div>

        <div className="life-stage">
          <div className="stage-caption"><span>↔ 스크롤하여 큰 규격도 비교하세요</span><span>단위: mm</span></div>
          <div className="stage-scroll">
            <div className="stage-pieces">
              {pieces.map((piece) => <LifeSizePiece key={piece.id} piece={piece} pixelsPerMm={pixelsPerMm} />)}
            </div>
          </div>
        </div>
      </section>

      <section className="guide-grid">
        <div className="guide-card">
          <span className="guide-number">01</span>
          <div><h3>실제 그림 영역만 반영</h3><p>PNG 캔버스에 남은 투명 여백은 자동으로 제거하여 비율을 계산합니다.</p></div>
        </div>
        <div className="guide-card">
          <span className="guide-number">02</span>
          <div><h3>주문값은 외곽 기준</h3><p>결과는 그림 주변 여백까지 더한 아크릴 외곽 가로·세로 규격입니다.</p></div>
        </div>
        <div className="guide-card caution">
          <span className="guide-number">!</span>
          <div><h3>업체 기준을 먼저 확인</h3><p>일부 업체는 ‘2mm 여백’을 전체가 아닌 각 변 기준으로 적용합니다. 주문 전 안내를 확인하세요.</p></div>
        </div>
      </section>

      <footer>STAND<span>SCALE</span> · 투명 이미지 기반 아크릴 규격 계산 도구</footer>
    </main>
  );
}
