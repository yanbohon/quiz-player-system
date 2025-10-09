"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loading, Popup } from "@arco-design/mobile-react";
import {
  SmoothDrawingCanvas,
  type SmoothDrawingCanvasHandle,
  type SmoothSerializedStroke,
} from "./SmoothDrawingCanvas";
import { uploadDatasheetAttachment } from "@/lib/fusionClient";
import styles from "./FillDrawingBoard.module.css";
import type { StaticImageData } from "next/image";
import undoIcon from "@/components/icons/undo.svg";
import redoIcon from "@/components/icons/redo.svg";
import trashIcon from "@/components/icons/trash.svg";
import penIcon from "@/components/icons/pen.svg";
import eraserIcon from "@/components/icons/eraser.svg";
import { Toast } from "@/lib/arco";

const PEN_COLOR = "#111827";

function resolveFilename(questionId: string | null): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (!questionId) return `sketch-${timestamp}.png`;
  return `sketch-${questionId}-${timestamp}.png`;
}

export interface FillDrawingBoardPayload {
  token: string;
  preview: string;
  paths: SmoothSerializedStroke[];
}

export class FillDrawingBoardEmptyError extends Error {
  code: "EMPTY_BOARD";

  constructor(message: string) {
    super(message);
    this.name = "FillDrawingBoardEmptyError";
    this.code = "EMPTY_BOARD";
  }
}

export interface FillDrawingBoardProps {
  open: boolean;
  questionId: string | null;
  questionTitle?: string;
  questionSheetId?: string;
  onClose: () => void;
  onUploadSuccess: (result: FillDrawingBoardPayload) => void;
  onPathsChange: (paths: SmoothSerializedStroke[]) => void;
  initialPaths?: SmoothSerializedStroke[] | null;
  disabled?: boolean;
  status?: "idle" | "waiting" | "uploading" | "success" | "error";
}

export interface FillDrawingBoardHandle {
  exportAndUpload: () => Promise<FillDrawingBoardPayload>;
}

function MaskIcon({ source, className }: { source: StaticImageData; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className ? `${styles.iconGlyph} ${className}` : styles.iconGlyph}
      style={{
        WebkitMaskImage: `url(${source.src})`,
        maskImage: `url(${source.src})`,
      }}
    />
  );
}

function RotateDeviceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className}>
      <rect
        x="10"
        y="6"
        width="28"
        height="36"
        rx="4"
        ry="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M16 40c0 2 1.6 2 4 2h8c2.4 0 4 0 4-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="m6 18 4-4 4 4m24 12-4 4-4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const FillDrawingBoard = forwardRef<
  FillDrawingBoardHandle,
  FillDrawingBoardProps
>(function FillDrawingBoard(
  {
    open,
    questionId,
    questionTitle,
    questionSheetId,
    onClose,
    onUploadSuccess,
    onPathsChange,
    initialPaths,
    disabled = false,
    status = "idle",
  },
  ref
) {
  const canvasRef = useRef<SmoothDrawingCanvasHandle | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const cachedInitialPaths = useRef<SmoothSerializedStroke[] | null>(null);
  const pendingUploadRef = useRef<Promise<FillDrawingBoardPayload> | null>(null);
  const [strokeColor] = useState(PEN_COLOR);
  const [paths, setPaths] = useState<SmoothSerializedStroke[]>([]);
  const [uploading, setUploading] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [showOrientationHint, setShowOrientationHint] = useState(false);
  const [isPortraitViewport, setIsPortraitViewport] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return false;
    return window.matchMedia("(orientation: portrait)").matches;
  });
  const handleHistoryChange = useCallback((info: { canUndo: boolean; canRedo: boolean }) => {
    setHistoryState(info);
  }, []);

  const interactiveDisabled = disabled || uploading;

  useEffect(() => {
    cachedInitialPaths.current = initialPaths ?? null;
  }, [initialPaths]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(orientation: portrait)");
    const update = () => {
      const portrait = media.matches;
      setIsPortraitViewport(portrait);
      if (!portrait) {
        setShowOrientationHint(false);
      }
    };
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const preset = cachedInitialPaths.current;
    if (preset && preset.length > 0) {
      canvasRef.current?.loadStrokes(preset);
      setPaths(preset);
    } else {
      canvasRef.current?.clear();
      setPaths([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setShowOrientationHint(false);
      return;
    }
    if (!isPortraitViewport) {
      setShowOrientationHint(false);
      return;
    }
    setShowOrientationHint(true);
    const timer = window.setTimeout(() => {
      setShowOrientationHint(false);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isPortraitViewport, open]);

  const handlePathsChange = (updated: SmoothSerializedStroke[]) => {
    cachedInitialPaths.current = updated;
    setPaths(updated);
    onPathsChange(updated);
  };

  const handleUndo = () => {
    if (interactiveDisabled) return;
    canvasRef.current?.undo();
  };

  const handleRedo = () => {
    if (interactiveDisabled) return;
    canvasRef.current?.redo();
  };

  const handleClear = () => {
    if (interactiveDisabled) return;
    canvasRef.current?.clear();
  };

  const toggleEraser = () => {
    if (interactiveDisabled) return;
    const next = !erasing;
    setErasing(next);
  };

  const activatePen = () => {
    if (interactiveDisabled) return;
    setErasing(false);
  };

  const hasStrokes = useMemo(() => paths.length > 0, [paths]);
  const canUndo = historyState.canUndo && !interactiveDisabled;
  const canRedo = historyState.canRedo && !interactiveDisabled;

  const uploadDrawing = useCallback(async (): Promise<FillDrawingBoardPayload> => {
    if (pendingUploadRef.current) {
      return pendingUploadRef.current;
    }
    if (!questionSheetId) {
      const message = "题库表缺失，无法上传画板内容";
      Toast.warn(message);
      throw new Error(message);
    }
    if (!hasStrokes) {
      const message = "提交了空画板";
      Toast.warn(message);
      throw new FillDrawingBoardEmptyError(message);
    }

    const job = (async () => {
      setUploading(true);
      try {
        const imageDataUrl = await canvasRef.current?.exportImage();
        if (!imageDataUrl) {
          throw new Error("导出画板失败，请重试");
        }
        const response = await fetch(imageDataUrl);
        const blob = await response.blob();
        const filename = resolveFilename(questionId);
        const file =
          typeof File !== "undefined"
            ? new File([blob], filename, { type: blob.type })
            : blob;
        const uploadResponse = await uploadDatasheetAttachment(
          questionSheetId,
          file,
          filename
        );
        const token = uploadResponse.token;
        if (!token) {
          throw new Error("上传成功但未获取到答案 token");
        }
        const payload: FillDrawingBoardPayload = {
          token,
          preview: imageDataUrl,
          paths,
        };
        onUploadSuccess(payload);
        return payload;
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error ? error.message : "画板上传失败，请稍后重试";
        Toast.error(message);
        throw error instanceof Error ? error : new Error(message);
      } finally {
        setUploading(false);
      }
    })();

    const sharedPromise = job.finally(() => {
      pendingUploadRef.current = null;
    });

    pendingUploadRef.current = sharedPromise;
    return sharedPromise;
  }, [hasStrokes, onUploadSuccess, paths, questionId, questionSheetId]);

  useImperativeHandle(
    ref,
    () => ({
      exportAndUpload: uploadDrawing,
    }),
    [uploadDrawing]
  );

  const dismissOrientationHint = useCallback(() => {
    setShowOrientationHint(false);
  }, []);

  return (
    <Popup
      visible={open}
      onClose={onClose}
      close={() => undefined}
      preventBodyScroll
      contentClass={styles.popupContent}
      maskClosable={false}
      getScrollContainer={() => scrollContainerRef.current}
      unmountOnExit={false}
    >
      <div className={styles.orientationViewport}>
        <div className={styles.orientationContent}>
          <div className={styles.boardContainer} ref={scrollContainerRef}>
            <div className={styles.canvasShell}>
              {uploading ? (
                <div className={styles.loadingMask}>
                  <Loading type="spin" />
                  <span>正在上传...</span>
                </div>
              ) : null}
              <SmoothDrawingCanvas
                ref={canvasRef}
                className={styles.canvasSurface}
                color={strokeColor}
                size={16}
                mode={erasing ? "eraser" : "pen"}
                onChange={handlePathsChange}
                onHistoryChange={handleHistoryChange}
                viewportOrientation={isPortraitViewport ? "portrait" : "landscape"}
              />
            </div>

            <div className={styles.overlayTop}>
              <div className={styles.topLeft}>
                {questionTitle ? (
                  <p className={styles.boardQuestion}>{questionTitle}</p>
                ) : null}
                {status === "error" ? (
                  <div className={styles.errorBadge}>
                    上传失败，请检查网络后等待主持人再次提交
                  </div>
                ) : null}
              </div>
              <div className={styles.topRight}>
                <div className={styles.topRightBar}>
                  <div className={styles.barSection}>
                    <button
                      type="button"
                      className={`${styles.barButton} ${styles.barButtonNeutral}`}
                      onClick={handleUndo}
                      disabled={!canUndo}
                    >
                      <MaskIcon source={undoIcon} />
                      <span className={styles.barButtonLabel}>撤销</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.barButton} ${styles.barButtonNeutral}`}
                      onClick={handleRedo}
                      disabled={!canRedo}
                    >
                      <MaskIcon source={redoIcon} />
                      <span className={styles.barButtonLabel}>重做</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.barButton} ${styles.barButtonNeutral}`}
                      onClick={handleClear}
                      disabled={!canUndo}
                    >
                      <MaskIcon source={trashIcon} />
                      <span className={styles.barButtonLabel}>清空</span>
                    </button>
                  </div>
                  <span className={styles.barDivider} aria-hidden="true" />
                  <div className={styles.barSection}>
                    <button
                      type="button"
                      className={`${styles.barButton} ${styles.barButtonPen} ${
                        !erasing ? styles.barButtonPenActive : ""
                      }`}
                      onClick={activatePen}
                      disabled={interactiveDisabled}
                    >
                      <MaskIcon source={penIcon} />
                      <span className={styles.barButtonLabel}>画笔</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.barButton} ${styles.barButtonEraser} ${
                        erasing ? styles.barButtonEraserActive : ""
                      }`}
                      onClick={toggleEraser}
                      disabled={interactiveDisabled}
                    >
                      <MaskIcon source={eraserIcon} />
                      <span className={styles.barButtonLabel}>橡皮</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`${styles.orientationHint} ${
            showOrientationHint ? "" : styles.orientationHintHidden
          }`}
          onClick={dismissOrientationHint}
          aria-live="polite"
        >
          <RotateDeviceIcon className={styles.orientationHintIcon} />
          <span className={styles.orientationHintText}>为获得更好体验，请横置您的设备</span>
        </button>
      </div>
    </Popup>
  );
});
