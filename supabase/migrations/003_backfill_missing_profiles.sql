-- สำหรับ user ที่สร้างก่อนมี trigger handle_new_user หรือ trigger ล้มเหลว
-- รันใน SQL Editor (สิทธิ์ postgres) — สร้างแถว profiles ให้ครบทุก auth.users ที่ยังไม่มี

INSERT INTO public.profiles (id, email, first_name, last_name)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data ->> 'first_name', ''),
  COALESCE(u.raw_user_meta_data ->> 'last_name', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
