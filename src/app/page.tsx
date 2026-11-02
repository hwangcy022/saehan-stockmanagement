import { redirect } from "next/navigation";

// 로그인 여부·기기 분기는 src/proxy.ts 가 처리합니다. 여기까지 오면 보드로.
export default function Home() {
  redirect("/board");
}
