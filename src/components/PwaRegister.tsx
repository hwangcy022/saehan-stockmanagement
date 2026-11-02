"use client";

import { useEffect } from "react";

/** PWA 서비스워커 등록 (프로덕션 + 브라우저 지원 시) */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* 등록 실패는 무시 (앱은 그대로 동작) */
    });
  }, []);
  return null;
}
