export type DocType = "quotation" | "invoice" | "installment" | "receipt";
export type DocStatus = "draft" | "pending" | "approved" | "paid" | "cancelled";
export type DiscountType = "percent" | "amount";

export interface CompanySettings {
  user_id?: string;
  company_name: string;
  address: string;
  tax_id: string;
  branch: string;
  phone: string;
  email: string;
  website: string;
  logo_path: string | null;
  signature_path: string | null;
  stamp_path: string | null;
  signer_name: string;
  signer_title: string;
  bank_name: string;
  bank_branch: string;
  bank_account_name: string;
  bank_account_no: string;
  qr_path: string | null;
  default_vat_rate: number;
  default_notes: string;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  tax_id: string;
  branch: string;
  contact: string;
  phone: string;
  email: string;
}

export interface DocItem {
  id?: string;
  sort_order?: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount?: number;
}

export interface DocumentRow {
  id: string;
  doc_type: DocType;
  doc_no: string;
  issue_date: string;
  due_date: string | null;
  status: DocStatus;
  paid_date: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_address: string;
  customer_tax_id: string;
  customer_branch: string;
  customer_contact: string;
  reference_id: string | null;
  installment_no: number | null;
  installment_count: number | null;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  vat_enabled: boolean;
  vat_rate: number;
  vat_amount: number;
  grand_total: number;
  wht_rate: number;
  wht_amount: number;
  net_total: number;
  notes: string;
  payment_method: string;
  created_at?: string;
}

export const EMPTY_COMPANY: CompanySettings = {
  company_name: "",
  address: "",
  tax_id: "",
  branch: "สำนักงานใหญ่",
  phone: "",
  email: "",
  website: "",
  logo_path: null,
  signature_path: null,
  stamp_path: null,
  signer_name: "",
  signer_title: "กรรมการผู้มีอำนาจลงนาม",
  bank_name: "",
  bank_branch: "",
  bank_account_name: "",
  bank_account_no: "",
  qr_path: null,
  default_vat_rate: 7,
  default_notes: "",
};
