-- Execute este arquivo inteiro no SQL Editor do Supabase, em um projeto novo.
-- Ele cria as tabelas, autenticao, perfis e as politicas de seguranca (RLS).

create type public.user_role as enum ('admin', 'operator', 'viewer', 'pending');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.user_role not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.products (
  code text primary key check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  initial_stock numeric not null default 0,
  minimum_stock numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create table public.movements (
  id bigint generated always as identity primary key,
  product_code text not null references public.products(code) on delete restrict,
  type text not null check (type in ('entry', 'exit')),
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index movements_product_created_at_idx on public.movements(product_code, created_at desc);

create table public.condiments (
  code text primary key check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  unit_weight numeric not null default 0 check (unit_weight >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create table public.condiment_counts (
  id bigint generated always as identity primary key,
  condiment_code text not null references public.condiments(code) on delete restrict,
  count numeric not null check (count >= 0),
  total_weight numeric not null check (total_weight >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index condiment_counts_code_created_at_idx on public.condiment_counts(condiment_code, created_at desc);

create table public.monthly_reports (
  product_code text not null references public.products(code) on delete restrict,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2200),
  count numeric not null default 0,
  consumption numeric,
  closed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),
  primary key (product_code, month, year)
);

-- Cria automaticamente um perfil seguro quando alguem confirma o cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Funcoes usadas pelas politicas. Elas evitam confiar apenas na interface web.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.can_write_stock()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(public.current_role() in ('admin', 'operator'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

create or replace function public.has_stock_access()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(public.current_role() in ('admin', 'operator', 'viewer'), false)
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.products, public.movements, public.condiments, public.condiment_counts, public.monthly_reports to authenticated;
grant select, update on public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.current_role(), public.can_write_stock(), public.is_admin(), public.has_stock_access() to authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.movements enable row level security;
alter table public.condiments enable row level security;
alter table public.condiment_counts enable row level security;
alter table public.monthly_reports enable row level security;

create policy "Users read own profile or admins read all" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "Only admins change profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Authorized users read products" on public.products for select to authenticated using (public.has_stock_access());
create policy "Operators manage products" on public.products for all to authenticated using (public.can_write_stock()) with check (public.can_write_stock());
create policy "Authorized users read movements" on public.movements for select to authenticated using (public.has_stock_access());
create policy "Operators manage movements" on public.movements for all to authenticated using (public.can_write_stock()) with check (public.can_write_stock());
create policy "Authorized users read condiments" on public.condiments for select to authenticated using (public.has_stock_access());
create policy "Operators manage condiments" on public.condiments for all to authenticated using (public.can_write_stock()) with check (public.can_write_stock());
create policy "Authorized users read condiment counts" on public.condiment_counts for select to authenticated using (public.has_stock_access());
create policy "Operators manage condiment counts" on public.condiment_counts for all to authenticated using (public.can_write_stock()) with check (public.can_write_stock());
create policy "Authorized users read reports" on public.monthly_reports for select to authenticated using (public.has_stock_access());
create policy "Operators manage reports" on public.monthly_reports for all to authenticated using (public.can_write_stock()) with check (public.can_write_stock());

-- Execute uma vez, depois de criar a sua primeira conta, trocando pelo e-mail dela:
-- update public.profiles set role = 'admin' where email = 'seu-email@exemplo.com';
