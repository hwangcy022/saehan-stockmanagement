import { describe, expect, it } from "vitest";
import { decodeCsvBytes, guessMapping, parseCsvText, rowsToErpRows } from "@/lib/erp/csv";
import { parseNumber } from "@/lib/format";

/** EUC-KR(CP949) 바이트: "품목코드,품목명,재고수량\nPF-500-28,프리폼,1200" */
function eucKrSample(): Uint8Array {
  const 품목코드 = [0xc7, 0xb0, 0xb8, 0xf1, 0xc4, 0xda, 0xb5, 0xe5];
  const 품목명 = [0xc7, 0xb0, 0xb8, 0xf1, 0xb8, 0xed];
  const 재고수량 = [0xc0, 0xe7, 0xb0, 0xed, 0xbc, 0xf6, 0xb7, 0xae];
  const 프리폼 = [0xc7, 0xc1, 0xb8, 0xae, 0xc6, 0xfb];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  return new Uint8Array([...품목코드, 0x2c, ...품목명, 0x2c, ...재고수량, 0x0a, ...ascii("PF-500-28,"), ...프리폼, ...ascii(",1200")]);
}

describe("CSV 인코딩 자동 판별", () => {
  it("UTF-8 (BOM 포함) 을 읽는다", () => {
    const bytes = new TextEncoder().encode("﻿품목코드,품목명,재고수량\nA,에이,1\n");
    const { text, encoding } = decodeCsvBytes(bytes);
    expect(encoding).toBe("utf-8");
    expect(text.startsWith("품목코드")).toBe(true);
  });

  it("EUC-KR 을 자동 판별해 읽는다", () => {
    const { text, encoding } = decodeCsvBytes(eucKrSample());
    expect(encoding).toBe("euc-kr");
    expect(text).toContain("품목코드");
    expect(text).toContain("프리폼");
  });
});

describe("헤더 매핑 추정과 행 정규화", () => {
  it("한글 헤더를 자동 매핑한다", () => {
    const { headers, rows } = parseCsvText("품목코드,품목명,창고,재고수량\nA,에이,1창고,\"1,200\"\nA,에이,2창고,300\n,,,\nB,비,1창고,abc\n");
    const mapping = guessMapping(headers);
    expect(mapping).toEqual({ code: 0, name: 1, qty: 3 });
    const { rows: erp, warnings } = rowsToErpRows(rows, mapping);
    expect(erp).toEqual([
      { itemCode: "A", itemName: "에이", qty: 1500 }, // 창고별 행 합산, 천 단위 콤마 처리
      { itemCode: "B", itemName: "비", qty: 0 }, // 숫자 아님 → 0 + 경고
    ]);
    expect(warnings.some((w) => w.includes("합산"))).toBe(true);
    expect(warnings.some((w) => w.includes("숫자로 읽을 수 없어"))).toBe(true);
  });

  it("영문 헤더·탭 구분도 처리하고, 못 찾으면 null 을 준다", () => {
    const { headers } = parseCsvText("ITEM_CODE\tDESCRIPTION\tQTY\nX\tdesc\t5");
    expect(guessMapping(headers)).toEqual({ code: 0, name: 1, qty: 2 });
    expect(guessMapping(["aaa", "bbb"])).toEqual({ code: null, name: null, qty: null });
  });

  it("숫자 파싱", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("(300)")).toBe(-300);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});
