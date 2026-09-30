"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Toast = { id: number; msg: string; kind: "success" | "error" | "info" };
const ToastCtx = createContext<(msg: string, kind?: Toast["kind"]) => void>(
  () => {},
);
export const useToast = () => useContext(ToastCtx);

const KIND_CLS: Record<Toast["kind"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-[#e2e9f2] bg-white text-slate-700",
};

/** App-wide toasts — announced to assistive tech via aria-live. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback(
    (msg: string, kind: Toast["kind"] = "info") => {
      const id = nextId.current++;
      setItems((xs) => [...xs, { id, msg, kind }]);
      setTimeout(
        () => setItems((xs) => xs.filter((x) => x.id !== id)),
        4500,
      );
    },
    [],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed bottom-4 start-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 rtl:translate-x-1/2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-lg ${KIND_CLS[t.kind]}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
