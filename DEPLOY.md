# النشر على Render (مجاني)

1. ادخل https://dashboard.render.com ← New ← **Blueprint** ← اختر repo `cliniccare` (branch: main).
2. Render هيقرأ `render.yaml` وينشئ: قاعدة `cliniccare-db` + `cliniccare-api` + `cliniccare-web`.
3. بعد ما الخدمات تتعمل، ضبط المتغيرات (مرة واحدة):
   - في `cliniccare-api`:
     - `DATABASE_URL` = `postgresql://cliniccare_app:<DB_APP_PASSWORD>@<host-القاعدة-الداخلي>/cliniccare`
       (الـ host والـ port من Internal Database URL للقاعدة، وكلمة السر هي قيمة `DB_APP_PASSWORD` الموجودة في Environment).
     - `WEB_ORIGIN` = رابط `cliniccare-web` (مثال https://cliniccare-web.onrender.com)
   - في `cliniccare-web`:
     - `API_INTERNAL_URL` = رابط `cliniccare-api` (مثال https://cliniccare-api.onrender.com)
     - ثم **Manual Deploy ← Clear build cache & deploy** (الرابط يُثبَّت وقت البناء).
4. افتح رابط الواجهة. حساب العرض: `admin@cliniccare.demo` / `Passw0rd!2026`.
5. بعد كده أي `git push` على `main` ينشر تلقائيًا.

ملاحظات: الخدمات المجانية بتنام بعد 15 دقيقة خمول (أول طلب بياخد ~50 ثانية)، وقاعدة Postgres المجانية بتنتهي بعد 30 يوم. بيانات اصطناعية فقط.
