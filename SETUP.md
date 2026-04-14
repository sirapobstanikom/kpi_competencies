# Employee Performance Evaluation System — Setup Guide

แอปนี้เป็น SPA (React + Vite) ที่เชื่อม **Supabase Auth + PostgreSQL + RLS** สำหรับระบบประเมินผลพนักงานแบบหลายผู้ประเมินพร้อมน้ำหนัก

## ความต้องการ

- Node.js 20+
- บัญชี [Supabase](https://supabase.com/) (โครงการใหม่)

## 1) สร้างฐานข้อมูลและนโยบาย RLS

1. เปิดโปรเจกต์ Supabase → **SQL Editor**
2. วางและรันไฟล์ `supabase/migrations/001_initial_schema.sql` ทั้งไฟล์ (หนึ่งครั้งต่อโปรเจกต์)  
   ถ้าเคยรัน `001` ไปแล้วแล้วเจอ error **`infinite recursion detected in policy for relation "profiles"`** ให้รัน `002_fix_profiles_rls_recursion.sql`  
   ถ้า **REST ตอบ 400 ทุกคำขอที่ `/profiles`** (รวมทั้งแดชบอร์ด / มอบหมาย) ให้รันเพิ่ม **`004_is_admin_row_security_and_admin_count.sql`** (ปรับ `is_admin()` + ฟังก์ชัน `admin_profile_count()`)  
   คะแนนแบบประเมินเป็น **1–5** (ทศนิยม 1 ตำแหน่ง) ตามแอป — รัน **`005_eval_scores_1_to_5.sql`** ถ้า DB ยังอนุญาต 0–5  
   ให้ผู้ประเมิน**แก้คะแนนหลังส่งได้จนสิ้นวันสิ้นสุดรอบ** — รัน **`006_eval_edit_until_cycle_end.sql`**

สคริปต์นี้สร้าง:

- ตารางตามสเปก (departments, positions, profiles, cycles, questions, KPIs, assignments, evaluations, answers, results)
- ฟังก์ชันคำนวณผลแบบถ่วงน้ำหนัก + สูตร KPI 0.7 / Competency 0.3
- Trigger คำนวณเมื่อส่งแบบครบทุกผู้ประเมิน
- RLS ครบถ้วน
- ฟังก์ชัน `replace_evaluator_assignments` สำหรับมอบหมายผู้ประเมินแบบ atomic (รวม weight = 100%)
- Seed แผนก / ตำแหน่ง / คำถาม / KPI ตามค่าเริ่มต้น
- Trigger สร้างแถว `profiles` เมื่อมีผู้ใช้ใหม่ใน `auth.users`

## 2) Authentication

1. ใน Supabase: **Authentication → Providers** เปิด Email (หรือตามนโยบายองค์กร)
2. สร้างผู้ใช้ทดสอบ (**Authentication → Users → Add user**)
3. หลังมีผู้ใช้ แถวใน `public.profiles` จะถูกสร้างอัตโนมัติ (trigger `on_auth_user_created`)  
   **ถ้าล็อกอินได้แต่ข้อมูล user / แดชบอร์ดไม่ขึ้น** ให้เปิด **Table Editor → profiles** ว่ามีแถว `id` ตรงกับ **Authentication → Users → User UID** หรือไม่  
   ถ้าไม่มี ให้รัน `supabase/migrations/003_backfill_missing_profiles.sql` ใน SQL Editor (สร้างแถว `profiles` ให้ user ที่ยังไม่มี)
4. ตั้งค่าแอดมินคนแรก: ใน **Table Editor → profiles** ตั้ง `is_admin = true` สำหรับผู้ใช้นั้น
5. กำหนด `department_id`, `position_id`, `employee_code` ให้พนักงานแต่ละคน (แอดมินทำได้จากหน้า **จัดการข้อมูลหลัก → ผู้ใช้**)

## 3) ตั้งค่า Frontend

```bash
cp .env.example .env.local
```

แก้ `.env.local`:

- `VITE_SUPABASE_URL` — URL โปรเจกต์
- `VITE_SUPABASE_ANON_KEY` — anon public key

```bash
npm install
npm run dev
```

เปิดเบราว์เซอร์ที่ URL ที่ Vite แสดง แล้วล็อกอินด้วยอีเมล/รหัสผ่านที่สร้างไว้

## 4) ลำดับการใช้งานแนะนำ (UAT)

1. แอดมิน: **จัดการข้อมูลหลัก → รอบประเมิน** — สร้างรอบ แล้วตั้งสถานะเป็น `active` (แดชบอร์ดองค์กรใช้รอบ active)
2. แอดมิน: **มอบหมายผู้ประเมิน** — เลือกรอบ + พนักงาน + ผู้ประเมินหลายคน ให้ **ผลรวม weight = 100%** แล้วบันทึก (ระบบสร้างแถว `evaluations` แบบ `draft`)
3. ผู้ประเมิน: **งานประเมิน** — กรอกคะแนน 0–5 ทุกข้อ แล้ว **ส่งแบบประเมิน**
4. เมื่อผู้ประเมินทุกคนส่งครบ ระบบจะคำนวณ `evaluation_results` อัตโนมัติ
5. พนักงาน: **ผลของฉัน** — ดูคะแนนและประวัติ

## 5) โครงสร้างโค้ดสำคัญ

| พาธ | บทบาท |
|------|--------|
| `supabase/migrations/001_initial_schema.sql` | Schema, RLS, triggers, RPC, seed |
| `src/lib/supabase.ts` | คลไคลเอนต์ |
| `src/types/database.ts` | TypeScript types โดเมน |
| `src/context/AuthContext.tsx` | เซสชัน + โหลด profile |
| `src/App.tsx` | React Router + layout |
| `src/pages/**` | หน้าจอตามบทบาท |

## 6) Deploy บน Vercel

โปรเจกต์มี `vercel.json` สำหรับ **SPA (React Router)** — เส้นทางเช่น `/admin` จะได้ `index.html` หลัง build

### เชื่อม GitHub → Vercel

1. Push โค้ดขึ้น GitHub (repo นี้)
2. ไปที่ [vercel.com](https://vercel.com) → **Add New… → Project** → **Import** repository นี้
3. Vercel จะตรวจจับ **Vite** อัตโนมัติ — ค่าเริ่มต้นมักเป็น:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. ที่ **Environment Variables** ของโปรเจกต์ Vercel ให้เพิ่ม (ทุก environment ที่ต้องการ เช่น Production / Preview):
   - `VITE_SUPABASE_URL` = Project URL จาก Supabase
   - `VITE_SUPABASE_ANON_KEY` = anon public key
5. กด **Deploy**

หลังได้ URL เช่น `https://your-app.vercel.app` ให้ตั้งค่า Supabase:

- **Authentication → URL Configuration**
  - **Site URL** ใส่ URL production ของ Vercel (ถ้าใช้ redirect หลังล็อกอิน/ยืนยันอีเมล)
  - **Redirect URLs** เพิ่ม `https://your-app.vercel.app/**` และ URL preview ของ Vercel (ถ้ามี) เพื่อไม่ให้ redirect หลัง auth โดนบล็อก

จากนั้น redeploy หรือรอ build รอบถัดไปหลังแก้ env บน Vercel

### REST ตอบ 400 ที่ `/rest/v1/profiles`

- โค้ดนับจำนวนพนักงานใช้ **`GET` + `count=exact` + `limit(1)`** แล้ว (ไม่ใช้ **`HEAD`**) เพราะบางโปรเจกต์ได้ **400** กับ `HEAD .../profiles` ร่วมกับ RLS  
- มักเกิดจาก **ค่า filter ไม่ใช่ UUID** หรือ **`.in('id', [])` ว่าง** — มีการกรอง UUID / ไม่เรียก `in` เมื่อไม่มี id แล้ว  
- **ล็อกอินได้แต่ข้อมูล user ไม่ขึ้น** → มักไม่มีแถวใน **`public.profiles`** ให้ตรงกับ user ใน Auth — รัน **`003_backfill_missing_profiles.sql`** (ดูข้อ 2 ด้านบน)

ถ้ายัง error ให้เปิดแท็บ Network ดู **Response body** และยืนยันว่ารัน **`002_fix_profiles_rls_recursion.sql`** แล้วถ้าเคยเจอ infinite recursion บน `profiles`

## 7) หมายเหตุ production

- ปิดการสมัครสมาชิกสาธารณะใน Supabase หากใช้เฉพาะแอดมินเชิญ
- พิจารณา **Supabase Edge Functions** หรือ **Database Webhooks** สำหรับแจ้งเตือนเมื่อส่งแบบครบ
- สำหรับ type จาก DB จริง สามารถสร้างด้วย `supabase gen types typescript` แล้วนำไปใส่ในโปรเจกต์แทน `src/types/database.ts` ได้
