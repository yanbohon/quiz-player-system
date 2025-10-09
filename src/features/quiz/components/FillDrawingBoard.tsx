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
import { Loading, Popup, Toast } from "@arco-design/mobile-react";
import {
  SmoothDrawingCanvas,
  type SmoothDrawingCanvasHandle,
  type SmoothSerializedStroke,
} from "./SmoothDrawingCanvas";
import { uploadDatasheetAttachment } from "@/lib/fusionClient";
import styles from "./FillDrawingBoard.module.css";

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

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.iconGlyph}>
      <path
        d="M9.5 6.5 5 11l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 17a7.5 7.5 0 0 0-7.5-7.5H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.iconGlyph}>
      <path
        d="M14.5 6.5 19 11l-4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 17a7.5 7.5 0 0 1 7.5-7.5H19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.iconGlyph}>
      <path
        d="M4 7h16M9 7V5h6v2m-.5 12h-5a1.5 1.5 0 0 1-1.5-1.5V7h8v10.5A1.5 1.5 0 0 1 14.5 19Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 10.5 14 15m0-4.5-4 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
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
  const handleHistoryChange = useCallback((info: { canUndo: boolean; canRedo: boolean }) => {
    setHistoryState(info);
  }, []);

  const interactiveDisabled = disabled || uploading;

  useEffect(() => {
    cachedInitialPaths.current = initialPaths ?? null;
  }, [initialPaths]);

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
      const message = "画板为空，请完成作答后等待提交指令";
      Toast.warn(message);
      throw new Error(message);
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
          />
        </div>

        <div className={styles.overlayTop}>
          <div className={styles.topLeft}>
            <div className={styles.titleCluster}>
              <div className={styles.boardTitle}>画板作答</div>
            </div>
          </div>
          <div className={styles.topCenter}>
            {questionTitle ? (
              <p className={styles.boardQuestion}>{questionTitle}</p>
            ) : null}
            {status === "error" ? (
              <div className={styles.errorBadge}>上传失败，请检查网络后等待主持人再次提交</div>
            ) : null}
          </div>
          <div className={styles.topRight}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="撤销"
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label="重做"
            >
              <RedoIcon />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={handleClear}
              disabled={!canUndo}
              aria-label="清空画板"
            >
              <ClearIcon />
            </button>
          </div>
        </div>

        <div className={styles.overlayBottom}>
          <div className={styles.toolDock}>
            <div className={styles.toolGroup}>
              <button
                type="button"
                className={`${styles.toolChip} ${!erasing ? styles.toolChipActive : ""}`}
                onClick={activatePen}
                disabled={interactiveDisabled}
              >
                画笔
              </button>
              <button
                type="button"
                className={`${styles.toolChip} ${erasing ? styles.toolChipActive : ""}`}
                onClick={toggleEraser}
                disabled={interactiveDisabled}
              >
                橡皮
              </button>
            </div>
            <div className={styles.toolPagination}>
              <span className={styles.pageDot} />
              <span className={`${styles.pageDot} ${styles.pageDotInactive}`} />
            </div>
          </div>
        </div>
      </div>
    </Popup>
  );
});
