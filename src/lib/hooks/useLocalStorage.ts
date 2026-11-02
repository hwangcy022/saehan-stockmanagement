"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVENT = "saehan-localstorage";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/**
 * localStorage 값을 React 상태처럼 쓰는 훅 (SSR 안전, effect 안 setState 없음).
 * 값은 JSON 으로 저장. 서버 렌더·hydration 시에는 defaultValue 를 사용합니다.
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const value = useMemo<T>(() => {
    if (raw === null) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
    // defaultValue 는 호출부에서 리터럴로 주는 것을 전제 (참조 변화 무시)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const setValue = useCallback(
    (v: T | ((prev: T) => T)) => {
      let current: T = defaultValue;
      try {
        const r = localStorage.getItem(key);
        if (r !== null) current = JSON.parse(r) as T;
      } catch {
        /* ignore */
      }
      const next = typeof v === "function" ? (v as (prev: T) => T)(current) : v;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* 저장 실패는 무시 */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, setValue];
}
