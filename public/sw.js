/* 실제재고 PWA 서비스워커
 * - 페이지 이동: 네트워크 우선, 실패 시 캐시(마지막으로 본 화면) → 그래도 없으면 /m 캐시
 * - 정적 자산(/_next/static, /icons): 캐시 우선
 * 재고 숫자 자체는 페이지 안에서 localStorage 에 따로 보관하고 "N분 전 데이터" 배지를 붙입니다.
 */
const CACHE = "saehan-stock-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const m = await caches.match("/m");
          if (m) return m;
          return new Response("<html lang='ko'><body style='font-family:sans-serif;padding:24px'><h2>오프라인입니다</h2><p>네트워크가 연결되면 다시 열어 주세요.</p></body></html>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 503,
          });
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});
