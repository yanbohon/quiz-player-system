import { Loading as ArcoLoading } from "@arco-design/mobile-react";
import styles from "./Loading.module.css";

interface LoadingProps {
  text?: string;
  fullscreen?: boolean;
}

export function Loading({ text = "加载中...", fullscreen = false }: LoadingProps) {
  if (fullscreen) {
    return (
      <div className={styles.fullscreen}>
        <ArcoLoading type="circle" />
        {text && <p className={styles.text}>{text}</p>}
      </div>
    );
  }

  return (
    <div className={styles.inline}>
      <ArcoLoading type="circle" />
      {text && <span className={styles.text}>{text}</span>}
    </div>
  );
}

