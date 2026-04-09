type IconProps = {
  className?: string;
};

type HeartIconProps = IconProps & {
  filled?: boolean;
};

export function ClockIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-label="倒计时"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path
        d="M12 7.5v4.2l3 1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function HeartIcon({ className, filled = false }: HeartIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 21s-7.2-4.5-9.6-9A5.7 5.7 0 0 1 5.5 4.2 4.4 4.4 0 0 1 12 6.3a4.4 4.4 0 0 1 6.5-2.1 5.7 5.7 0 0 1 3.1 7.8c-2.4 4.5-9.6 9-9.6 9Z"
        fill={filled ? "#ef4444" : "rgba(239, 68, 68, 0.2)"}
      />
    </svg>
  );
}

export function EliminatedIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m20 20 24 24M44 20 20 44"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function SuccessCheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 33.5 28.8 42 44 23"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function ErrorBadgeIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 20 44 44M44 20 20 44"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function SwitchArrowsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 24h28l-8-8"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M46 40H18l8 8"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
