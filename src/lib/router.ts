import {
  useLocation,
  useNavigate,
  useSearchParams,
  type NavigateOptions,
} from "react-router-dom";

interface AppNavigate {
  push: (path: string, options?: NavigateOptions) => void;
  replace: (path: string, options?: Omit<NavigateOptions, "replace">) => void;
}

export function useAppNavigate(): AppNavigate {
  const navigate = useNavigate();

  return {
    push(path, options) {
      navigate(path, options);
    },
    replace(path, options) {
      navigate(path, { ...options, replace: true });
    },
  };
}

export function useAppPathname(): string {
  return useLocation().pathname;
}

export function useAppSearchParams(): URLSearchParams {
  const [searchParams] = useSearchParams();
  return searchParams;
}
