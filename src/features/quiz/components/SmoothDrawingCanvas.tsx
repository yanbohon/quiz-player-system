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
  viewportOrientation?: "portrait" | "landscape";
}

export interface SmoothDrawingCanvasHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportImage: () => Promise<string>;
  loadStrokes: (strokes: SerializedStroke[]) => void;
}

interface InternalStroke extends SerializedStroke {
  path: Path2D | null;
  dirty: boolean;
}

interface HistoryEntry {
  type: "add" | "remove";
  stroke: SerializedStroke;
  index: number;
}

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

function cloneSerializedStroke(stroke: SerializedStroke): SerializedStroke {
  return {
    id: stroke.id,
    color: stroke.color,
    size: stroke.size,
    mode: stroke.mode,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function createInternalStroke(source: SerializedStroke): InternalStroke {
  return {
    ...cloneSerializedStroke(source),
    path: null,
    dirty: true,
  };
}

function toSerializedStroke(stroke: InternalStroke): SerializedStroke {
  return {
    id: stroke.id,
    color: stroke.color,
    size: stroke.size,
    mode: stroke.mode,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function serializeStrokes(strokes: InternalStroke[]): SerializedStroke[] {
  return strokes.map(toSerializedStroke);
}

function ensureStrokePath(stroke: InternalStroke): Path2D | null {
  if (stroke.points.length < 2) {
    stroke.path = null;
    stroke.dirty = false;
    return null;
  }
  if (stroke.path && !stroke.dirty) {
    return stroke.path;
  }
  const outline = getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure]),
    {
      ...STROKE_OPTIONS,
      size: stroke.size,
    }
  );
  if (!outline.length) {
    stroke.path = null;
    stroke.dirty = false;
    return null;
  }
  const path = new Path2D();
  const [firstX, firstY] = outline[0];
  path.moveTo(firstX, firstY);
  for (let i = 1; i < outline.length; i += 1) {
    const [x, y] = outline[i];
    path.lineTo(x, y);
  }
  path.closePath();
  stroke.path = path;
  stroke.dirty = false;
  return path;
}

function toPoint(
  event: PointerEvent,
  rect: DOMRect,
  canvas: HTMLCanvasElement,
  orientation: "portrait" | "landscape"
): StrokePoint {
  const pressure = event.pressure > 0 ? event.pressure : 0.5;
  if (orientation === "portrait") {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    return {
      x: dy + width / 2,
      y: -dx + height / 2,
      pressure,
      time: Date.now(),
    };
  }
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure,
    time: Date.now(),
  };
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
  viewportOrientation = "landscape",
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<InternalStroke[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const activeStrokeRef = useRef<InternalStroke | null>(null);
  const erasingRef = useRef(false);
  const rafPendingRef = useRef<number | null>(null);
  const historyChangeRef = useRef(onHistoryChange);
  const pointerRectRef = useRef<DOMRect | null>(null);

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
        const path = ensureStrokePath(stroke);
        if (!path) continue;
        context.save();
        if (stroke.mode === "eraser") {
          context.globalCompositeOperation = "destination-out";
          context.fillStyle = "rgba(0,0,0,1)";
        } else {
          context.globalCompositeOperation = "source-over";
          context.fillStyle = stroke.color;
        }
        context.fill(path);
        context.restore();
      }
    });
  }, []);

  useEffect(() => {
    scheduleRender();
  });

  const emitHistory = useCallback(() => {
    historyChangeRef.current?.({
      canUndo: historyRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
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
      onChange(serializeStrokes(strokesRef.current));
    }
  }, [emitHistory, onChange, scheduleRender]);

  const removeStrokeAtPoint = useCallback(
    (point: Pick<StrokePoint, "x" | "y">, canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("2d");
      if (!context) return false;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      let removalIndex = -1;
      for (let i = strokesRef.current.length - 1; i >= 0; i -= 1) {
        const stroke = strokesRef.current[i];
        const path = ensureStrokePath(stroke);
        if (!path) continue;
        if (context.isPointInPath(path, point.x, point.y)) {
          removalIndex = i;
          break;
        }
      }
      context.restore();
      if (removalIndex >= 0) {
        const updated = [...strokesRef.current];
        const [removedStroke] = updated.splice(removalIndex, 1);
        strokesRef.current = updated;
        historyRef.current.push({
          type: "remove",
          stroke: toSerializedStroke(removedStroke),
          index: removalIndex,
        });
        redoStackRef.current = [];
        commitChange();
        return true;
      }
      return false;
    },
    [commitChange]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointerRectRef.current = rect;
      if (mode === "eraser") {
        activeStrokeRef.current = null;
        erasingRef.current = true;
        canvas.setPointerCapture(event.pointerId);
        const point = toPoint(event.nativeEvent, rect, canvas, viewportOrientation);
        removeStrokeAtPoint(point, canvas);
        return;
      }

      const stroke: InternalStroke = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        color,
        size,
        mode,
        points: [toPoint(event.nativeEvent, rect, canvas, viewportOrientation)],
        path: null,
        dirty: true,
      };
      activeStrokeRef.current = stroke;
      strokesRef.current = [...strokesRef.current, stroke];
      redoStackRef.current = [];
      emitHistory();
      canvas.setPointerCapture(event.pointerId);
      scheduleRender();
    },
    [color, emitHistory, mode, removeStrokeAtPoint, scheduleRender, size, viewportOrientation]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = pointerRectRef.current ?? canvas.getBoundingClientRect();
      if (!pointerRectRef.current) {
        pointerRectRef.current = rect;
      }
      if (mode === "eraser") {
        if (!erasingRef.current) return;
        const point = toPoint(event.nativeEvent, rect, canvas, viewportOrientation);
        removeStrokeAtPoint(point, canvas);
        return;
      }
      const stroke = activeStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(toPoint(event.nativeEvent, rect, canvas, viewportOrientation));
      stroke.dirty = true;
      stroke.path = null;
      scheduleRender();
    },
    [mode, removeStrokeAtPoint, scheduleRender, viewportOrientation]
  );

  const endStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (mode === "eraser") {
        if (erasingRef.current) {
          erasingRef.current = false;
          if (typeof canvas.hasPointerCapture === "function") {
            if (canvas.hasPointerCapture(event.pointerId)) {
              canvas.releasePointerCapture(event.pointerId);
            }
          } else {
            canvas.releasePointerCapture(event.pointerId);
          }
        }
        pointerRectRef.current = null;
        return;
      }
      const stroke = activeStrokeRef.current;
      if (!stroke) return;
      if (stroke.points.length < 2) {
        strokesRef.current = strokesRef.current.filter((item) => item !== stroke);
      } else {
        const index = strokesRef.current.findIndex((item) => item.id === stroke.id);
        if (index >= 0) {
          historyRef.current.push({
            type: "add",
            stroke: toSerializedStroke(stroke),
            index,
          });
        }
        redoStackRef.current = [];
      }
      activeStrokeRef.current = null;
      canvas.releasePointerCapture(event.pointerId);
      pointerRectRef.current = null;
      commitChange();
    },
    [commitChange, mode]
  );

  const cancelStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (mode === "eraser") {
        if (erasingRef.current) {
          erasingRef.current = false;
          if (typeof canvas.hasPointerCapture === "function") {
            if (canvas.hasPointerCapture(event.pointerId)) {
              canvas.releasePointerCapture(event.pointerId);
            }
          } else {
            canvas.releasePointerCapture(event.pointerId);
          }
        }
        pointerRectRef.current = null;
        return;
      }
      const stroke = activeStrokeRef.current;
      if (!stroke) return;
      strokesRef.current = strokesRef.current.filter((item) => item !== stroke);
      activeStrokeRef.current = null;
      canvas.releasePointerCapture(event.pointerId);
      scheduleRender();
      emitHistory();
      pointerRectRef.current = null;
    },
    [emitHistory, mode, scheduleRender]
  );

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        const entry = historyRef.current.pop();
        if (!entry) return;
        if (entry.type === "add") {
          const index = strokesRef.current.findIndex((item) => item.id === entry.stroke.id);
          if (index === -1) {
            historyRef.current.push(entry);
            return;
          }
          const updated = [...strokesRef.current];
          const [removedStroke] = updated.splice(index, 1);
          strokesRef.current = updated;
          redoStackRef.current.push({
            type: "add",
            stroke: toSerializedStroke(removedStroke),
            index,
          });
        } else {
          const insertIndex = Math.min(entry.index, strokesRef.current.length);
          const strokeClone = createInternalStroke(entry.stroke);
          const updated = [...strokesRef.current];
          updated.splice(insertIndex, 0, strokeClone);
          strokesRef.current = updated;
          redoStackRef.current.push({
            type: "remove",
            stroke: cloneSerializedStroke(entry.stroke),
            index: insertIndex,
          });
        }
        commitChange();
      },
      redo: () => {
        const entry = redoStackRef.current.pop();
        if (!entry) return;
        if (entry.type === "add") {
          const insertIndex = Math.min(entry.index, strokesRef.current.length);
          const strokeClone = createInternalStroke(entry.stroke);
          const updated = [...strokesRef.current];
          updated.splice(insertIndex, 0, strokeClone);
          strokesRef.current = updated;
          historyRef.current.push({
            type: "add",
            stroke: cloneSerializedStroke(entry.stroke),
            index: insertIndex,
          });
        } else {
          const index = strokesRef.current.findIndex((item) => item.id === entry.stroke.id);
          if (index === -1) {
            redoStackRef.current.push(entry);
            return;
          }
          const updated = [...strokesRef.current];
          const [removedStroke] = updated.splice(index, 1);
          strokesRef.current = updated;
          historyRef.current.push({
            type: "remove",
            stroke: toSerializedStroke(removedStroke),
            index,
          });
        }
        commitChange();
      },
      clear: () => {
        if (strokesRef.current.length === 0) return;
        strokesRef.current = [];
        historyRef.current = [];
        redoStackRef.current = [];
        erasingRef.current = false;
        commitChange();
      },
      exportImage: async () => {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas not ready");
        scheduleRender();
        return canvas.toDataURL("image/png");
      },
      loadStrokes: (strokes: SerializedStroke[]) => {
        strokesRef.current = strokes.map((stroke) => createInternalStroke(stroke));
        historyRef.current = [];
        redoStackRef.current = [];
        erasingRef.current = false;
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
