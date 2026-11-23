-- Covering indexes for the composite (ownership-checked) foreign keys.
create index if not exists df_activities_category_user_idx on public.df_activities (category_id, user_id);
create index if not exists df_tasks_category_user_idx on public.df_tasks (category_id, user_id);
create index if not exists df_overrides_activity_user_idx on public.df_occurrence_overrides (activity_id, user_id);
