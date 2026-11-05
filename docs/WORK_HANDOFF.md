# THANAYA — استئناف المواصفات الكاملة

## آخر أساس متحقق
PR #63، feature/payment-provider-sandbox-core-20261105، 19eeb85d170b86af4db1c34170817ad278b26003. CI #239 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42090333455 . كل إصلاحات PRs #56–#62 محفوظة. المواصفات في WORK_MISSION.md ولا تعاد مرحلة Recovery.

## الدفعة الحالية 9
الفرع feature/payment-sandbox-journal-20261105، الأب #63. journal SQLite منفصل دائم خلال نفس Preview، وإيصالات فريدة وتحديث ذري وCAS وAPI owner-only وحارس بيئة/مسار/علامة seed. webhook موقع قبل parsing وCookie middleware بينما أزرار المالك تحت CSRF. لا كتابة في قاعدة المتجر. التفاصيل PAYMENT_SANDBOX.md؛ بحث المزودين PAYMENT_PROVIDER_RESEARCH.md. واجهة المالك وتكامل التاجر الحقيقي لم يكتملا بعد.

## الفحوص الفعلية
دفعة 8 اجتازت CI #239 مع 11 فحص بروتوكول. دفعة 9: build و15 فحص API للمحاكي مع restart فعلي وreplay وrollback وCAS وCSRF وحماية production والملفات، ومقارنة قاعدة المتجر وWAL byte-for-byte. auth.integration.cjs وpreview.integration.cjs نجحا أيضاً. الأوامر مع Node22 وRUST_LOG=info وNODE_ENV=test: npm run build؛ node tests/payment-sandbox.integration.cjs؛ node tests/auth.integration.cjs؛ node tests/preview.integration.cjs. CI الكامل بعد حفظ Draft PR.

## المخطط
الدفعات 7–9 لا تحتاج مخططاً إضافياً في قاعدة المتجر. للمحاكي ملف مستقل جديد فقط في root مؤقت. الدفعة 6 تحتاج جدول OrderStatusEvent، ولم تطبق على Mac. أداة rehearse_order_history.py قراءة فقط للمصدر وكتابة لنسخة مؤقتة، بلا apply. تعليمات وحدود التفعيل في ORDER_STATUS_AUDIT_ROLLOUT.md؛ لا db push أو reset على الحقيقي.

## بيئة الاختبار وPreview
Node 22 وRUST_LOG=info في Work. قواعد الاختبار تحت temp. Preview: نسخة مستقلة ثم bash scripts/preview-local.sh، بورتات 3108/4108 ومالك صناعي مؤقت وتنظيف عند الإيقاف. لا .env أو dev.db حقيقي هنا ولا نشر. Chromium المحلي مقيد؛ Chrome الفعلي يعمل في GitHub CI مع صور صناعية.

## التالي بدقة
تحقق من CI الدفعة 9 بعد الحفظ. بعدها واجهة PaymentSandboxPanel في طرق الدفع للمالك تظهر فقط عند enabled، بإنشاء محاولة من طلب صناعي ومحاكاة الفشل/التفويض/الدفع وضياع الإشعار والاستعلام والاسترداد. اختبرها في Chrome مع فحص عدم التحصيل، وأصلح لقطة timeline لتعرض السجل نفسه عبر scrollIntoView ولف رقم إشعار النجاح الطويل على الهاتف. بعدها Dashboard المالي ورحلة التسوق. لا ربط للتحصيل الحقيقي من mock ولا تفعيل حساب تاجر. بقية WORK_ROADMAP غير مكتملة.
