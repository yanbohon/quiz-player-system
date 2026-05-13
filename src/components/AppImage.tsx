import type { CSSProperties, ImgHTMLAttributes } from "react";

type AppImageSource = string | { src: string };

export interface AppImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> {
  src: AppImageSource;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  unoptimized?: boolean;
}

function resolveImageSrc(src: AppImageSource): string {
  return typeof src === "string" ? src : src.src;
}

export function AppImage({
  src,
  alt,
  width,
  height,
  fill = false,
  priority = false,
  loading,
  style,
  unoptimized: _unoptimized,
  ...props
}: AppImageProps) {
  const imgStyle: CSSProperties = fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        ...style,
      }
    : style ?? {};

  return (
    <img
      {...props}
      src={resolveImageSrc(src)}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : loading}
      style={imgStyle}
    />
  );
}

export default AppImage;
