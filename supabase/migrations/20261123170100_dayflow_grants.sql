-- Dayflow: table/function privileges (anon gets nothing; authenticated limited by RLS).
revoke all on public.df_members, public.df_profiles, public.df_categories, public.df_activities,
              public.df_occurrence_overrides, public.df_tasks from anon, public;
grant select on public.df_members to authenticated;
grant select, insert, update on public.df_profiles to authenticated;
grant select, insert, update, delete on public.df_categories, public.df_activities,
                                        public.df_occurrence_overrides, public.df_tasks to authenticated;

revoke execute on function public.df_is_member() from public, anon;
grant execute on function public.df_is_member() to authenticated;
revoke execute on function public.df_set_updated_at() from public, anon, authenticated;

revoke execute on function public.df_bootstrap() from public, anon;
grant execute on function public.df_bootstrap() to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.df_members from authenticated;
revoke delete, truncate, references, trigger on public.df_profiles from authenticated;
revoke truncate, references, trigger on public.df_categories, public.df_activities, public.df_occurrence_overrides, public.df_tasks from authenticated;
