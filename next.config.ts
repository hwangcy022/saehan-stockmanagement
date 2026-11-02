import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 로그인 세션(쿠키)에 따라 매 요청 동적으로 렌더링하므로 Cache Components 는 사용하지 않습니다.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // 서비스워커는 항상 최신 버전을 받도록
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
