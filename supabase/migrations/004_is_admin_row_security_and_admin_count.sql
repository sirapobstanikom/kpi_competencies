-- แก้ 400 ทุกคำขอไปที่ profiles: ให้ is_admin() ปิด RLS แบบระดับฟังก์ชัน (ไม่ใช้แค่ SET LOCAL ใน body)
-- และ RPC นับจำนวนพนักงานสำหรับแดชบอร์ดแอดมิน (ไม่พึ่ง Prefer: count=exact บน PostgREST)

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_profile_count()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_admin boolean;
  v_cnt bigint;
BEGIN
  SELECT COALESCE(is_admin, false) INTO v_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_admin, false) THEN
    RETURN 0;
  END IF;
  SELECT count(*)::bigint INTO v_cnt FROM public.profiles;
  RETURN v_cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_profile_count() TO authenticated;
