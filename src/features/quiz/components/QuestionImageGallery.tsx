"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ArcoImage, ImagePreview } from "@arco-design/mobile-react";
import styles from "./QuestionImageGallery.module.css";
import type { QuestionImageEntry } from "@/features/quiz/utils/questionImages";

export const QuestionImageGallery = memo(function QuestionImageGallery({
  entries,
}: {
  entries: QuestionImageEntry[];
}) {
  const [openIndex, setOpenIndex] = useState(-1);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [failedIndices, setFailedIndices] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setOpenIndex(-1);
    setFailedIndices(new Set());
    buttonRefs.current = [];
  }, [entries]);

  const previewImages = useMemo(
    () =>
      entries.map((entry) => ({
        src: entry.large,
        fallbackSrc: entry.thumb,
      })),
    [entries]
  );

  const handleImageLoad = useCallback((index: number) => {
    setFailedIndices((prev) => {
      if (!prev.has(index)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleImageError = useCallback((index: number) => {
    setFailedIndices((prev) => {
      if (prev.has(index)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const getThumbBounds = useCallback((index: number) => {
    const element = buttonRefs.current[index];
    if (element) {
      return element.getBoundingClientRect();
    }
    if (typeof window === "undefined" || typeof DOMRect === "undefined") {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      } as DOMRect;
    }
    return new DOMRect(0, 0, 0, 0);
  }, []);

  if (!entries.length) {
    return null;
  }

  const allFailed = failedIndices.size > 0 && failedIndices.size === entries.length;

  return (
    <div className={styles.questionImageContainer}>
      <div className={styles.questionImageGrid}>
        {entries.map((entry, index) => (
          <button
            key={`${entry.large}-${index}`}
            type="button"
            className={styles.questionImageThumbButton}
            onClick={() => setOpenIndex(index)}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            aria-label={`查看第${index + 1}张图片`}
          >
            <ArcoImage
              className={styles.questionImageThumbImage}
              src={entry.thumb}
              alt={`题目配图 ${index + 1}`}
              fit="cover"
              position="center"
              showLoading
              showError
              onLoad={() => handleImageLoad(index)}
              onError={() => handleImageError(index)}
            />
          </button>
        ))}
      </div>
      {allFailed ? (
        <div className={styles.questionImageFallback} role="status">
          图片加载失败，请稍后重试
        </div>
      ) : null}
      <ImagePreview
        images={previewImages}
        openIndex={openIndex}
        close={() => setOpenIndex(-1)}
        getThumbBounds={getThumbBounds}
      />
    </div>
  );
});
