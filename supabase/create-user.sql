-- Creates a Dayflow login (username + password) and grants access.
-- Run in the Supabase SQL editor. Replace the two values below. Never commit real passwords.
--
-- The e-mail is derived from the username exactly like the app does:
--   'u-' || hex(utf8(lower(trim(username)))) || '@users.dayflow.local'
do $$
declare
  v_username text := 'NEW_USERNAME';
  v_password text := 'NEW_PASSWORD';
  v_email text := 'u-' || encode(convert_to(lower(btrim(v_username)), 'UTF8'), 'hex') || '@users.dayflow.local';
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('app', 'dayflow', 'username', v_username),
    now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), now(), now());
  insert into public.df_members (user_id, username) values (v_id, v_username);
end $$;

-- Give an EXISTING Supabase user access to Dayflow instead:
-- insert into public.df_members (user_id, username) values ('<auth user id>', '<display username>');
