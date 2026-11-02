// 숫자·날짜 표시 (한국어, Asia/Seoul)

export const TZ = "Asia/Seoul";

/** 서버 컴포넌트에서 "데이터를 조회한 시각"을 기록할 때 사용 (요청마다 새로 렌더링되므로 안전) */
export function nowMs(): number {
  return Date.now();
}

const numFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });
const boxFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

/** 천 단위 콤마 */
export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return numFmt.format(Number(n));
}

/** 부호 포함 (+1,000 / -500) */
export function fmtSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  const v = Number(n);
  if (v > 0) return `+${numFmt.format(v)}`;
  return numFmt.format(v);
}

export function fmtBoxes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return boxFmt.format(Number(n));
}

function parts(d: Date): Record<string, string> {
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(d)) out[p.type] = p.value;
  if (out.hour === "24") out.hour = "00";
  return out;
}

/** YYYY-MM-DD HH:MM */
export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** YYYY-MM-DD */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** HH:MM */
export function fmtTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

/** datetime-local 입력값용: 서울 기준 'YYYY-MM-DDTHH:MM' */
export function toSeoulInputValue(d: Date = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** datetime-local 입력값('YYYY-MM-DDTHH:MM', 서울 시각) → ISO 문자열(+09:00) */
export function seoulInputToIso(value: string): string {
  if (!value) return new Date().toISOString();
  const v = value.length === 16 ? `${value}:00` : value;
  return new Date(`${v}+09:00`).toISOString();
}

/** 오늘(서울) 00:00 의 ISO 문자열 */
export function seoulTodayStartIso(now: Date = new Date()): string {
  const p = parts(now);
  return new Date(`${p.year}-${p.month}-${p.day}T00:00:00+09:00`).toISOString();
}

/** "N분 전" 류 상대 시간 */
export function fmtAgo(iso: string | number | Date | null | undefined, now: Date = new Date()): string {
  if (!iso) return "-";
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const sec = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (sec < 60) return "방금 전";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.round(hr / 24)}일 전`;
}

/** "1,234" "1 234" " 12.5 " 같은 문자열을 숫자로. 실패 시 null */
export function parseNumber(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = s.replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
