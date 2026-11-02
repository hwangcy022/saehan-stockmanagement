// =============================================================================
// ERP 스냅샷 공급원 (교체 지점)
//
// 화면 A(ERP 업로드)와 화면 E(대사 점검)는 이 파일의 `ErpSnapshotSource` 인터페이스만 사용합니다.
// 지금은 담당자가 ERP(Mold)에서 내보낸 CSV 파일을 읽는 `CsvErpSource` 하나뿐입니다.
//
// 나중에 사내에서 ERP DB 에 직접 연결하게 되면:
//   1) 같은 인터페이스를 구현하는 `DbErpSource`(예: Next.js Route Handler 가 ERP DB 를 조회해 ErpStockRow[] 반환)를 만들고
//   2) 아래 `createErpSource()` 가 그것을 돌려주도록 바꾸면
// 화면 코드는 손대지 않아도 됩니다.
// =============================================================================

import { decodeCsvBytes, guessMapping, parseCsvText, rowsToErpRows, type ColumnMapping, type CsvEncoding } from "./csv";

/** ERP 재고 한 행 (품목코드, 품목명, 재고수량) */
export interface ErpStockRow {
  itemCode: string;
  itemName: string;
  qty: number;
}

export interface ErpSnapshot {
  rows: ErpStockRow[];
  /** 화면·이력에 표시할 출처 (파일명 등) */
  sourceLabel: string;
  warnings: string[];
}

/** 파일을 읽은 직후, 컬럼 매핑을 사용자에게 확인받기 위한 중간 상태 */
export interface ErpFilePreview {
  fileName: string;
  encoding: CsvEncoding;
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
}

export interface ErpSnapshotSource {
  /** 파일 → 헤더/미리보기/추정 매핑 */
  inspectFile(file: File): Promise<ErpFilePreview>;
  /** 매핑 확정 → 정규화된 스냅샷 */
  toSnapshot(preview: ErpFilePreview, mapping: ColumnMapping): ErpSnapshot;
}

export class CsvErpSource implements ErpSnapshotSource {
  async inspectFile(file: File): Promise<ErpFilePreview> {
    const buf = await file.arrayBuffer();
    const { text, encoding } = decodeCsvBytes(buf);
    const { headers, rows } = parseCsvText(text);
    if (headers.length === 0) throw new Error("CSV 에서 헤더를 읽지 못했습니다. 첫 줄에 컬럼명이 있어야 합니다.");
    return { fileName: file.name, encoding, headers, rows, mapping: guessMapping(headers) };
  }

  toSnapshot(preview: ErpFilePreview, mapping: ColumnMapping): ErpSnapshot {
    const { rows, warnings } = rowsToErpRows(preview.rows, mapping);
    return { rows, sourceLabel: preview.fileName, warnings };
  }
}

/** 화면에서 사용하는 유일한 진입점. ERP DB 직결로 바꿀 때 여기만 수정. */
export function createErpSource(): ErpSnapshotSource {
  return new CsvErpSource();
}
