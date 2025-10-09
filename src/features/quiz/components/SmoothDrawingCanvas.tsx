"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getStroke } from "perfect-freehand";

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export type StrokeMode = "pen" | "eraser";

export interface SerializedStroke {
  id: string;
  points: StrokePoint[];
  color: string;
  size: number;
  mode: StrokeMode;
}

export interface SmoothDrawingCanvasProps {
  color: string;
  size: number;
  mode: StrokeMode;
  onChange?: (strokes: SerializedStroke[]) => void;
  className?: string;
  onHistoryChange?: (info: { canUndo: boolean; canRedo: boolean }) => void;
}

export interface SmoothDrawingCanvasHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportImage: () => Promise<string>;
  loadStrokes: (strokes: SerializedStroke[]) => void;
}

interface InternalStroke extends SerializedStroke {}

const STROKE_OPTIONS = {
  size: 16,
  smoothing: 0.5,
  thinning: 0.5,
  streamline: 0.5,
  easing: (t: number) => t,
  start: {
    taper: 0,
    cap: true,
  },
  end: {
    taper: 0,
    cap: true,
  },
  simulatePressure: false,
};

function cloneStrokes(input: InternalStroke[]): InternalStroke[] {
  return input.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function strokeToPath(stroke: InternalStroke) {
  if (stroke.points.length === 0) return null;
  const outline = getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure]),
    {
      ...STROKE_OPTIONS,
      size: stroke.size,
    }
  );
  if (!outline.length) return null;
  const path = new Path2D();
  const [firstX, firstY] = outline[0];
  path.moveTo(firstX, firstY);
  for (let i = 1; i < outline.length; i += 1) {
    const [x, y] = outline[i];
    path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

function toPoint(event: PointerEvent, rect: DOMRect): StrokePoint {
  const pressure = event.pressure > 0 ? event.pressure : 0.5;
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure,
    time: Date.now(),
  };
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized.length === 3 ? normalized.repeat(2) : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const SmoothDrawingCanvas = forwardRef<
  SmoothDrawingCanvasHandle,
  SmoothDrawingCanvasProps
>(function SmoothDrawingCanvas({
  color,
  size,
  mode,
  onChange,
  className,
  onHistoryChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<InternalStroke[]>([]);
  const undoneRef = useRef<InternalStroke[]>([]);
  const activeStrokeRef = useRef<InternalStroke | null>(null);
  const rafPendingRef = useRef<number | null>(null);
  const historyChangeRef = useRef(onHistoryChange);

  const scheduleRender = useCallback(() => {
    if (rafPendingRef.current !== null) return;
    rafPendingRef.current = requestAnimationFrame(() => {
      rafPendingRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, height);

      for (const stroke of strokesRef.current) {
        if (stroke.points.length < 2) continue;
        const path = strokeToPath(stroke);
        if (!path) continue;
        context.save();
        if (stroke.mode === "eraser") {
          context.globalCompositeOperation = "destination-out";
          context.fillStyle = "rgba(0,0,0,1)";
          context.shadowBlur = 0;
          context.filter = "none";
          context.fill(path);
        } else {
          context.globalCompositeOperation = "source-over";
          context.fillStyle = stroke.color;
          context.shadowColor = withAlpha(stroke.color, 0.33);
          context.shadowBlur = 0.8;
          context.filter = "blur(0.15px)";
          context.fill(path);
        }
        context.restore();
      }
    });
  }, []);

  useEffect(() => {
    scheduleRender();
  });

  const emitHistory = useCallback(() => {
    historyChangeRef.current?.({
      canUndo: strokesRef.current.length > 0,
      canRedo: undoneRef.current.length > 0,
    });
  }, []);

  useEffect(() => {
    historyChangeRef.current = onHistoryChange;
  }, [onHistoryChange]);

  useEffect(() => {
    emitHistory();
  }, [emitHistory]);

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(() => {
      scheduleRender();
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [scheduleRender]);

  useEffect(() => {
    return () => {
      if (rafPendingRef.current !== null) {
        cancelAnimationFrame(rafPendingRef.current);
        rafPendingRef.current = null;
      }
    };
  }, []);

  const commitChange = useCallback(() => {
    scheduleRender();
    emitHistory();
    if (onChange) {
      onChange(cloneStrokes(strokesRef.current));
    }
  }, [emitHistory, onChange, scheduleRender]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const stroke: InternalStroke = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        color,
        size,
        mode,
        points: [toPoint(event.nativeEvent, rect)],
      };
      activeStrokeRef.current = stroke;
      strokesRef.current = [...strokesRef.current, stroke];
      undoneRef.current = [];
      emitHistory();
      canvas.setPointerCapture(event.pointerId);
      scheduleRender();
    },
    [color, emitHistory, mode, scheduleRender, size]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStrokeRef.current;
      const canvas = canvasRef.current;
      if (!stroke || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      stroke.points.push(toPoint(event.nativeEvent, rect));
      scheduleRender();
    },
    [scheduleRender]
  );

  const endStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStrokeRef.current;
      const canvas = canvasRef.current;
      if (!stroke || !canvas) return;
      if (stroke.points.length < 2) {
        strokesRef.current = strokesRef.current.filter((item) => item !== stroke);
      } else {
        undoneRef.current = [];
      }
      activeStrokeRef.current = null;
      canvas.releasePointerCapture(event.pointerId);
      commitChange();
    },
    [commitChange]
  );

  const cancelStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStrokeRef.current;
      const canvas = canvasRef.current;
      if (!stroke || !canvas) return;
      strokesRef.current = strokesRef.current.filter((item) => item !== stroke);
      activeStrokeRef.current = null;
      canvas.releasePointerCapture(event.pointerId);
      scheduleRender();
      emitHistory();
    },
    [emitHistory, scheduleRender]
  );

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        const last = strokesRef.current.pop();
        if (!last) return;
        undoneRef.current.push(last);
        commitChange();
      },
      redo: () => {
        const restored = undoneRef.current.pop();
        if (!restored) return;
        strokesRef.current = [...strokesRef.current, restored];
        commitChange();
      },
      clear: () => {
        if (strokesRef.current.length === 0) return;
        strokesRef.current = [];
        undoneRef.current = [];
        commitChange();
      },
      exportImage: async () => {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas not ready");
        scheduleRender();
        return canvas.toDataURL("image/png");
      },
      loadStrokes: (strokes: SerializedStroke[]) => {
        strokesRef.current = cloneStrokes(strokes);
        undoneRef.current = [];
        commitChange();
      },
    }),
    [commitChange, scheduleRender]
  );

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={cancelStroke}
      onPointerLeave={(event) => {
        if (event.buttons === 0) return;
        cancelStroke(event);
      }}
    />
  );
});

export type { SerializedStroke as SmoothSerializedStroke };
