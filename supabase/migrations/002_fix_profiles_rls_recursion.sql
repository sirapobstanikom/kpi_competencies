-- แก้ error: infinite recursion detected in policy for relation "profiles"
-- และปรับ is_admin() ให้ปิด RLS ระดับฟังก์ชัน (ดู 004 สำหรับเวอร์ชันล่าสุด + RPC นับพนักงาน)

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

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;

CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND is_admin = public.is_admin()
  );
