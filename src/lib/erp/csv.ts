// ERP 내보내기 CSV 파싱: 인코딩 자동 판별(UTF-8 / EUC-KR), 헤더 매핑 추정, 행 정규화
import Papa from "papaparse";
import { parseNumber } from "../format";
import type { ErpStockRow } from "./source";

export type CsvEncoding = "utf-8" | "euc-kr";

export interface DecodedCsv {
  text: string;
  encoding: CsvEncoding;
}

/** 바이트 → 문자열. BOM 이 있거나 UTF-8 로 오류 없이 해석되면 UTF-8, 아니면 EUC-KR(CP949). */
export function decodeCsvBytes(buf: ArrayBuffer | Uint8Array): DecodedCsv {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    // EUC-KR 디코더는 브라우저·Node(full-icu) 모두 CP949 호환으로 동작
    const text = new TextDecoder("euc-kr").decode(bytes);
    return { text, encoding: "euc-kr" };
  }
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** CSV 텍스트 → 헤더 + 데이터 행 (빈 행 제거, 구분자 자동 감지: 콤마/탭/세미콜론) */
export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", "\t", ";", "|"],
  });
  const data = (result.data || []).map((r) => (Array.isArray(r) ? r.map((c) => (c ?? "").toString().trim()) : []));
  if (data.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = data;
  return { headers: headers.map((h) => h.trim()), rows: rows.filter((r) => r.some((c) => c !== "")) };
}

export interface ColumnMapping {
  code: number | null;
  name: number | null;
  qty: number | null;
}

const CODE_KEYS = ["품목코드", "품목 코드", "품번", "자재코드", "자재번호", "코드", "itemcode", "item_code", "item code", "code", "sku", "part no", "partno"];
const NAME_KEYS = ["품목명", "품목 명", "품명", "자재명", "품목이름", "itemname", "item_name", "item name", "name", "description", "품목"];
const QTY_KEYS = ["재고수량", "재고 수량", "현재고", "현재고수량", "재고량", "재고", "수량", "기말재고", "창고재고", "qty", "quantity", "stock", "stockqty", "stock_qty", "onhand", "on hand", "balance"];

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-()]/g, "");
}

function findCol(headers: string[], keys: string[], used: Set<number>): number | null {
  const normalizedKeys = keys.map(norm);
  // 1) 완전 일치 우선
  for (let i = 0; i < headers.length; i++) {
    if (used.has(i)) continue;
    if (normalizedKeys.includes(norm(headers[i]))) return i;
  }
  // 2) 부분 일치
  for (let i = 0; i < headers.length; i++) {
    if (used.has(i)) continue;
    const h = norm(headers[i]);
    if (h && normalizedKeys.some((k) => h.includes(k))) return i;
  }
  return null;
}

/** 헤더 이름으로 품목코드/품목명/재고수량 컬럼 추정. 못 찾으면 null (사용자가 드롭다운으로 지정). */
export function guessMapping(headers: string[]): ColumnMapping {
  const used = new Set<number>();
  const code = findCol(headers, CODE_KEYS, used);
  if (code !== null) used.add(code);
  const qty = findCol(headers, QTY_KEYS, used);
  if (qty !== null) used.add(qty);
  const name = findCol(headers, NAME_KEYS, used);
  return { code, name, qty };
}

export interface NormalizedRows {
  rows: ErpStockRow[];
  warnings: string[];
  skipped: number;
}

/** 매핑에 따라 행을 ErpStockRow 로 변환. 같은 품목코드가 여러 행이면 수량 합산. */
export function rowsToErpRows(rows: string[][], mapping: ColumnMapping): NormalizedRows {
  const warnings: string[] = [];
  if (mapping.code === null) throw new Error("품목코드 컬럼을 지정해 주세요");
  if (mapping.qty === null) throw new Error("재고수량 컬럼을 지정해 주세요");
  const map = new Map<string, ErpStockRow>();
  let skipped = 0;
  let dup = 0;
  let badQty = 0;
  rows.forEach((r, idx) => {
    const code = (r[mapping.code as number] ?? "").trim();
    if (!code) {
      skipped++;
      return;
    }
    const name = mapping.name === null ? "" : (r[mapping.name] ?? "").trim();
    const qtyRaw = r[mapping.qty as number] ?? "";
    let qty = parseNumber(qtyRaw);
    if (qty === null) {
      badQty++;
      if (badQty <= 5) warnings.push(`${idx + 2}행: 수량 "${qtyRaw}" 을(를) 숫자로 읽을 수 없어 0 으로 처리`);
      qty = 0;
    }
    const prev = map.get(code);
    if (prev) {
      dup++;
      prev.qty += qty;
      if (!prev.itemName && name) prev.itemName = name;
    } else {
      map.set(code, { itemCode: code, itemName: name, qty });
    }
  });
  if (dup > 0) warnings.push(`같은 품목코드가 여러 행에 있어 ${dup}행을 합산했습니다`);
  if (badQty > 5) warnings.push(`수량을 읽을 수 없는 행이 총 ${badQty}행 있습니다 (0 으로 처리)`);
  if (skipped > 0) warnings.push(`품목코드가 비어 있는 ${skipped}행을 건너뛰었습니다`);
  return { rows: [...map.values()], warnings, skipped };
}
