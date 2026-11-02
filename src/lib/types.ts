// 데이터 모델 타입 (supabase/schema.sql 과 1:1 대응)
// 주의: supabase-js 제네릭(Record<string, unknown>) 호환을 위해 interface 대신 type 사용

export type Role = "admin" | "viewer";
export type TxType = "IN" | "OUT" | "ADJ";

export const TX_TYPE_LABEL: Record<TxType, string> = {
  IN: "입고",
  OUT: "출고",
  ADJ: "조정",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "관리자",
  viewer: "조회자",
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  created_at: string;
}

export type Item = {
  item_code: string;
  item_name: string;
  unit: string;
  qty_per_box: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Baseline = {
  id: number;
  uploaded_at: string;
  uploaded_by: string | null;
  file_name: string;
  note: string | null;
  line_count: number;
  new_item_codes: string[];
}

export type BaselineLine = {
  baseline_id: number;
  item_code: string;
  erp_qty: number;
  web_qty_before: number | null;
}

export type Transaction = {
  id: number;
  occurred_at: string;
  tx_type: TxType;
  item_code: string;
  qty: number;
  note: string | null;
  created_by: string | null;
  baseline_id: number | null;
  reversal_of: number | null;
  created_at: string;
}

export type TransactionInsert = {
  occurred_at?: string;
  tx_type: TxType;
  item_code: string;
  qty: number;
  note?: string | null;
}

/** current_stock 뷰 한 행 */
export type StockRow = {
  item_code: string;
  item_name: string;
  unit: string;
  qty_per_box: number;
  is_active: boolean;
  baseline_id: number | null;
  baseline_at: string | null;
  erp_qty: number;
  in_sum: number;
  out_sum: number;
  adj_sum: number;
  tx_count: number;
  current_qty: number;
  last_changed_at: string | null;
}

/** transaction_history 뷰 한 행 */
export type TransactionHistoryRow = Transaction & {
  item_name: string;
  qty_per_box: number;
  unit: string;
  created_by_name: string | null;
  reversed_by_id: number | null;
}

export type ApplyBaselineResult = {
  baseline_id: number;
  new_item_codes: string[];
}

/** supabase-js 제네릭용 Database 타입 (수기 작성) */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: Partial<Item> & { item_code: string };
        Update: Partial<Item>;
        Relationships: [];
      };
      baselines: {
        Row: Baseline;
        Insert: Partial<Baseline>;
        Update: Partial<Baseline>;
        Relationships: [];
      };
      baseline_lines: {
        Row: BaselineLine;
        Insert: BaselineLine;
        Update: Partial<BaselineLine>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: TransactionInsert & { created_by?: string | null };
        Update: Partial<Transaction>;
        Relationships: [];
      };
    };
    Views: {
      current_stock: { Row: StockRow; Relationships: [] };
      transaction_history: { Row: TransactionHistoryRow; Relationships: [] };
    };
    Functions: {
      apply_baseline: {
        Args: { p_file_name: string; p_note: string | null; p_lines: Json };
        Returns: Json;
      };
      reverse_transaction: {
        Args: { p_tx_id: number; p_note?: string | null };
        Returns: number;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
