-- Manual order of items inside one part of the day (drag to reorder). Null = automatic order.
alter table public.df_activities add column if not exists period_order double precision;
alter table public.df_tasks add column if not exists period_order double precision;
