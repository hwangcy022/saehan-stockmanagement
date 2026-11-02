import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCsvBytes, guessMapping, parseCsvText, rowsToErpRows } from "@/lib/erp/csv";

const dir = path.resolve(__dirname, "../supabase/samples");

describe("샘플 ERP CSV 파일", () => {
  it.each([
    ["erp_stock_utf8.csv", "utf-8"],
    ["erp_stock_euckr.csv", "euc-kr"],
  ])("%s 를 %s 로 판별하고 31개 품목(창고 행 합산)으로 읽는다", (file, enc) => {
    const buf = readFileSync(path.join(dir, file));
    const { text, encoding } = decodeCsvBytes(new Uint8Array(buf));
    expect(encoding).toBe(enc);
    const { headers, rows } = parseCsvText(text);
    const mapping = guessMapping(headers);
    expect(mapping).toEqual({ code: 0, name: 1, qty: 3 });
    const { rows: erp } = rowsToErpRows(rows, mapping);
    expect(erp).toHaveLength(31);
    expect(erp.find((r) => r.itemCode === "PF-500-28")).toEqual({ itemCode: "PF-500-28", itemName: "프리폼 500ml 28파이", qty: 121500 });
  });

  it("영문 헤더 파일도 자동 매핑된다", () => {
    const buf = readFileSync(path.join(dir, "erp_stock_english_header.csv"));
    const { headers } = parseCsvText(decodeCsvBytes(new Uint8Array(buf)).text);
    expect(guessMapping(headers)).toEqual({ code: 0, name: 1, qty: 2 });
  });
});
