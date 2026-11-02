import { describe, expect, it } from "vitest";
import { boxesToQty, computeCurrentStock, diffStock, makeReversal, qtyToBoxes, signedQty, type TxLike } from "@/lib/stock";

const baselines = [
  { id: 1, uploaded_at: "2026-10-01T00:00:00Z" },
  { id: 2, uploaded_at: "2026-10-15T00:00:00Z" },
];
const lines = [
  { baseline_id: 1, item_code: "A", erp_qty: 1000 },
  { baseline_id: 2, item_code: "A", erp_qty: 800 },
  { baseline_id: 2, item_code: "B", erp_qty: 50 },
];

describe("현재고 = 최신 기준 ERP수량 + 그 기준 이후 거래 합", () => {
  it("최신 기준의 ERP 수량에 기준 이후 거래만 합산한다", () => {
    const txs: TxLike[] = [
      // 기준 1 시절 거래 — 현재고 계산에서 제외되어야 함
      { id: 1, item_code: "A", tx_type: "OUT", qty: -999, baseline_id: 1 },
      // 기준 2 이후 거래
      { id: 2, item_code: "A", tx_type: "IN", qty: 100, baseline_id: 2 },
      { id: 3, item_code: "A", tx_type: "OUT", qty: -30, baseline_id: 2 },
      { id: 4, item_code: "A", tx_type: "ADJ", qty: -5, baseline_id: 2 },
    ];
    const m = computeCurrentStock(["A", "B"], baselines, lines, txs);
    const a = m.get("A")!;
    expect(a.erp_qty).toBe(800);
    expect(a.in_sum).toBe(100);
    expect(a.out_sum).toBe(30);
    expect(a.adj_sum).toBe(-5);
    expect(a.current_qty).toBe(800 + 100 - 30 - 5);
    expect(a.tx_count).toBe(3);
    // 거래 없는 품목은 ERP 수량 그대로
    expect(m.get("B")!.current_qty).toBe(50);
  });

  it("기준이 없으면 baseline_id 가 null 인 거래만 합산한다", () => {
    const txs: TxLike[] = [
      { id: 1, item_code: "A", tx_type: "IN", qty: 10, baseline_id: null },
      { id: 2, item_code: "A", tx_type: "IN", qty: 10, baseline_id: 1 },
    ];
    const m = computeCurrentStock(["A"], [], [], txs);
    expect(m.get("A")!.current_qty).toBe(10);
  });
});

describe("취소 거래", () => {
  it("취소 거래는 같은 구분·같은 기준·반대 부호이며 원거래를 상쇄한다", () => {
    const original = { id: 7, item_code: "A", tx_type: "OUT" as const, qty: -240, baseline_id: 2 };
    const rev = makeReversal(original);
    expect(rev.qty).toBe(240);
    expect(rev.tx_type).toBe("OUT");
    expect(rev.baseline_id).toBe(2);
    expect(rev.reversal_of).toBe(7);
    expect(rev.note).toBe("취소: #7");

    const m = computeCurrentStock(["A"], baselines, lines, [original, rev]);
    const a = m.get("A")!;
    expect(a.current_qty).toBe(800); // 기준값으로 복귀
    expect(a.out_sum).toBe(0); // 출고합도 상쇄
    expect(a.tx_count).toBe(2); // 이력은 2건 모두 남음
  });

  it("취소 거래를 다시 취소할 수 없다", () => {
    expect(() => makeReversal({ id: 9, item_code: "A", tx_type: "IN", qty: -5, baseline_id: 2, reversal_of: 8 })).toThrow();
  });
});

describe("수량 부호와 박스 환산", () => {
  it("출고는 음수로, 입고는 양수로 저장하고 조정은 부호를 유지한다", () => {
    expect(signedQty("OUT", 100)).toBe(-100);
    expect(signedQty("OUT", -100)).toBe(-100);
    expect(signedQty("IN", 100)).toBe(100);
    expect(signedQty("ADJ", -7)).toBe(-7);
    expect(signedQty("ADJ", 7)).toBe(7);
  });

  it("박스 수 × 박스당수량 환산", () => {
    expect(boxesToQty(3, 240)).toBe(720);
    expect(qtyToBoxes(720, 240)).toBe(3);
    expect(qtyToBoxes(100, 240)).toBe(0.4);
    expect(qtyToBoxes(100, 0)).toBe(0);
  });
});

describe("웹 현재고 vs ERP 차이", () => {
  it("불일치·신규·웹에만 있는 품목을 구분하고 불일치를 앞에 정렬한다", () => {
    const web = [
      { item_code: "A", item_name: "에이", current_qty: 100 },
      { item_code: "B", item_name: "비", current_qty: 50 },
      { item_code: "C", item_name: "씨", current_qty: 10 },
    ];
    const erp = [
      { itemCode: "A", itemName: "에이", qty: 100 },
      { itemCode: "B", itemName: "비", qty: 40 },
      { itemCode: "B", itemName: "비", qty: 5 }, // 중복 행은 합산 → 45
      { itemCode: "D", itemName: "디", qty: 7 },
    ];
    const rows = diffStock(web, erp);
    const by = Object.fromEntries(rows.map((r) => [r.item_code, r]));
    expect(by.A.status).toBe("match");
    expect(by.B.status).toBe("mismatch");
    expect(by.B.erp_qty).toBe(45);
    expect(by.B.diff).toBe(-5);
    expect(by.C.status).toBe("web_only");
    expect(by.D.status).toBe("erp_only");
    expect(rows[rows.length - 1].item_code).toBe("A"); // 일치 행은 맨 뒤
  });
});
