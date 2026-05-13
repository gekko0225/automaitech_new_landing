create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  business text not null,
  business_type text not null,
  need text not null,
  need_label text not null,
  urgency text not null,
  message text,
  score integer not null,
  priority text not null,
  reasons jsonb not null default '[]'::jsonb,
  source text not null default 'automaitech-home'
);

alter table public.leads enable row level security;
