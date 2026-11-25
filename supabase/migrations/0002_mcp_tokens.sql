-- =========================================================
-- MCP / API tokens  (ใช้ให้ AI bot เช่น Grok เรียกระบบบัญชี)
-- วางใน Supabase > SQL Editor แล้วกด Run (รันหลัง 0001_init.sql)
-- =========================================================

create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null default 'MCP',
  token_prefix  text not null default '',          -- แสดงให้ผู้ใช้จำได้ เช่น bill_AbCd…
  token_hash    text not null unique,              -- sha256 (hex) ของ token จริง
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists api_tokens_user_idx on public.api_tokens(user_id);

alter table public.api_tokens enable row level security;
drop policy if exists "own rows" on public.api_tokens;
create policy "own rows" on public.api_tokens for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ออกเลขที่เอกสารแทนผู้ใช้ (เรียกจากฝั่ง server ด้วย service_role เท่านั้น)
create or replace function public.next_doc_no_for(p_user uuid, p_type text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_period text := to_char(p_date, 'YYYYMM');
  v_no int;
begin
  v_prefix := case p_type
    when 'quotation'   then 'QT'
    when 'invoice'     then 'IV'
    when 'installment' then 'IN'
    when 'receipt'     then 'RE'
    else 'DOC' end;

  insert into public.doc_counters(user_id, prefix, period, last_no)
  values (p_user, v_prefix, v_period, 1)
  on conflict (user_id, prefix, period)
  do update set last_no = public.doc_counters.last_no + 1
  returning last_no into v_no;

  return v_prefix || v_period || '-' || lpad(v_no::text, 3, '0');
end $$;

revoke all on function public.next_doc_no_for(uuid, text, date) from public, anon, authenticated;
grant execute on function public.next_doc_no_for(uuid, text, date) to service_role;
