# THANAYA — استئناف المواصفات الكاملة

## آخر أساس متحقق
PR #65، feature/payment-sandbox-console-20261105، 6b5929d4ef2bedfdf35e0f0952ca3ffc02019e08. CI #241 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42092911548 . كل إصلاحات PRs #56–#64 محفوظة. المواصفات في WORK_MISSION.md ولا تعاد مرحلة Recovery.

## الدفعة الحالية 11
الفرع feature/admin-financial-command-center-20261105، الأب #65. API /reports/operations خاصة owner/admin، مصدر تحصيل/مصاريف/حركة نقد للفترة وذمم زبائن وموردين وتنبيه صلاحية حالي. استبعاد معلن للطلبات ذات المرتجع من الذمم غير المسواة، ورفض السجلات غير المتناسقة، بلا أرباح أو رصيد صندوق مختلق. المصدر يقرأ transaction فقط. شرح OPERATIONAL_REPORTS.md. ربط UI تالٍ؛ لا تعد Dashboard مكتملة بعد.

## الفحوص الفعلية
دفعة 10 اجتازت CI #241 مع Chrome الفعلي، وراجعت صورتي timeline وsandbox (عنوان sandbox مغطى بالهيدر الثابت في اللقطة الطويلة؛ ليس فشل بيانات). دفعة 11: backend build و9 فحوص operations API نجحت مع Node22/RUST_LOG=info/NODE_ENV=test، تغطي فترات وذمم ومصاريف واسترداداً جزئياً وexpiry وسجلات تالفة وصلاحيات وقراءة بلا تغيير bytes. الأوامر npm run build ثم node tests/operations.integration.cjs. CI الكامل بعد الحفظ.

## المخطط
الدفعات 7–11 لا تحتاج مخططاً إضافياً في قاعدة المتجر. للمحاكي ملف مستقل جديد فقط في root مؤقت. الدفعة 6 تحتاج جدول OrderStatusEvent، ولم تطبق على Mac. أداة rehearse_order_history.py قراءة فقط للمصدر وكتابة لنسخة مؤقتة، بلا apply. تعليمات وحدود التفعيل في ORDER_STATUS_AUDIT_ROLLOUT.md؛ لا db push أو reset على الحقيقي.

## بيئة الاختبار وPreview
Node 22 وRUST_LOG=info في Work. قواعد الاختبار تحت temp. Preview: نسخة مستقلة ثم bash scripts/preview-local.sh، بورتات 3108/4108 ومالك صناعي مؤقت وتنظيف عند الإيقاف. لا .env أو dev.db حقيقي هنا ولا نشر. Chromium المحلي مقيد؛ Chrome الفعلي يعمل في GitHub CI مع صور صناعية.

## التالي بدقة
تحقق من CI الدفعة 11 بعد الحفظ، ثم FinancialDashboard تستخدم operations وcosts تحت range موحد مع AbortController وحالات تحميل/خطأ تخفي الأرقام القديمة. اربط /admin وحافظ على charts/navigation القديمة، وصحح توصيف أسفل الصفحة القديم. اختبر Chrome بعد وجود مصروف 25,000 وسداد مورد 50,000: الذمم 48,000، حركة النقد 25,000 بلا تحصيل؛ واختبر تبديل الفترة بلا أرقام قديمة، وصورة موبايل/تابلت. لقطات الأقسام الطويلة تخفي .thanaya-admin header أثناء التصوير فقط بعد معرفة selector الصحيح. ثم رحلة الشراء والمنتجات والبحث وبقية WORK_ROADMAP. لا دفع تاجر حقيقي.
