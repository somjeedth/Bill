-- =========================================================
-- ระบบบัญชี / ออกเอกสาร  (Quotation, Invoice, Installment, Receipt)
-- วางไฟล์นี้ใน Supabase Dashboard > SQL Editor แล้วกด Run
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- ข้อมูลบริษัท (1 แถวต่อผู้ใช้) ----------
create table if not exists public.company_settings (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  company_name      text not null default '',
  address           text not null default '',
  tax_id            text not null default '',
  branch            text not null default 'สำนักงานใหญ่',
  phone             text not null default '',
  email             text not null default '',
  website           text not null default '',
  logo_path         text,
  signature_path    text,
  signer_name       text not null default '',
  signer_title      text not null default 'กรรมการผู้มีอำนาจลงนาม',
  bank_name         text not null default '',
  bank_branch       text not null default '',
  bank_account_name text not null default '',
  bank_account_no   text not null default '',
  qr_path           text,
  default_vat_rate  numeric(5,2) not null default 7,
  default_notes     text not null default '',
  updated_at        timestamptz not null default now()
);

-- ---------- ลูกค้า ----------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  address     text not null default '',
  tax_id      text not null default '',
  branch      text not null default '',
  contact     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists customers_user_idx on public.customers(user_id);

-- ---------- เอกสาร ----------
create table if not exists public.documents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_type           text not null check (doc_type in ('quotation','invoice','installment','receipt')),
  doc_no             text not null,
  issue_date         date not null default current_date,
  due_date           date,
  status             text not null default 'pending'
                     check (status in ('draft','pending','approved','paid','cancelled')),
  paid_date          date,

  customer_id        uuid references public.customers(id) on delete set null,
  customer_name      text not null default '',
  customer_address   text not null default '',
  customer_tax_id    text not null default '',
  customer_branch    text not null default '',
  customer_contact   text not null default '',

  reference_id       uuid references public.documents(id) on delete set null,
  installment_no     int,
  installment_count  int,

  subtotal           numeric(14,2) not null default 0,
  discount_type      text not null default 'amount' check (discount_type in ('percent','amount')),
  discount_value     numeric(14,2) not null default 0,
  discount_amount    numeric(14,2) not null default 0,
  vat_enabled        boolean not null default true,
  vat_rate           numeric(5,2) not null default 7,
  vat_amount         numeric(14,2) not null default 0,
  grand_total        numeric(14,2) not null default 0,
  wht_rate           numeric(5,2) not null default 0,
  wht_amount         numeric(14,2) not null default 0,
  net_total          numeric(14,2) not null default 0,

  notes              text not null default '',
  payment_method     text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, doc_no)
);
create index if not exists documents_user_type_idx on public.documents(user_id, doc_type, issue_date);
create index if not exists documents_ref_idx on public.documents(reference_id);

-- ---------- รายการย่อย ----------
create table if not exists public.document_items (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sort_order   int not null default 0,
  description  text not null default '',
  quantity     numeric(14,2) not null default 1,
  unit         text not null default '',
  unit_price   numeric(14,2) not null default 0,
  amount       numeric(14,2) not null default 0
);
create index if not exists document_items_doc_idx on public.document_items(document_id);

-- ---------- ตัวนับเลขที่เอกสาร ----------
create table if not exists public.doc_counters (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prefix   text not null,
  period   text not null,
  last_no  int  not null default 0,
  primary key (user_id, prefix, period)
);

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();
drop trigger if exists company_touch on public.company_settings;
create trigger company_touch before update on public.company_settings
  for each row execute function public.touch_updated_at();

-- ---------- ออกเลขที่เอกสาร: QT202611-001 ----------
create or replace function public.next_doc_no(p_type text, p_date date default current_date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefix text;
  v_period text := to_char(p_date, 'YYYYMM');
  v_no int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_prefix := case p_type
    when 'quotation'   then 'QT'
    when 'invoice'     then 'IV'
    when 'installment' then 'IN'
    when 'receipt'     then 'RE'
    else 'DOC' end;

  insert into public.doc_counters(user_id, prefix, period, last_no)
  values (auth.uid(), v_prefix, v_period, 1)
  on conflict (user_id, prefix, period)
  do update set last_no = public.doc_counters.last_no + 1
  returning last_no into v_no;

  return v_prefix || v_period || '-' || lpad(v_no::text, 3, '0');
end $$;

-- ---------- RLS ----------
alter table public.company_settings enable row level security;
alter table public.customers        enable row level security;
alter table public.documents        enable row level security;
alter table public.document_items   enable row level security;
alter table public.doc_counters     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['company_settings','customers','documents','document_items','doc_counters'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- รายการย่อยต้องอยู่ในเอกสารของตัวเองเท่านั้น
drop policy if exists "items in own doc" on public.document_items;
create policy "items in own doc" on public.document_items as restrictive for all to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));

-- ---------- Storage: โลโก้ / ลายเซ็น / QR (private, แยกโฟลเดอร์ตาม user id) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-assets', 'company-assets', false, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "assets select own" on storage.objects;
drop policy if exists "assets insert own" on storage.objects;
drop policy if exists "assets update own" on storage.objects;
drop policy if exists "assets delete own" on storage.objects;

create policy "assets select own" on storage.objects for select to authenticated
  using (bucket_id = 'company-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assets insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assets update own" on storage.objects for update to authenticated
  using (bucket_id = 'company-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assets delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
