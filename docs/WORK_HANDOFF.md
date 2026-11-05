# THANAYA — استئناف المواصفات الكاملة

## آخر أساس متحقق
PR #62، feature/admin-order-timeline-20261105، a0fb659a86273769dcf745890858fa00610ededd. CI #238 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42089281596 . كل إصلاحات PRs #56–#61 محفوظة. المواصفات في WORK_MISSION.md ولا تعاد مرحلة Recovery.

## الدفعة الحالية 8
الفرع feature/payment-provider-sandbox-core-20261105، الأب #62. عقد مزود دفع مع محاكي واستعلام واسترداد وتوقيع، ومقارنة مبلغ/عملة/بيئة/طلب وCAS وإعادة المحاولة. بحث رسمي للمزودين في PAYMENT_PROVIDER_RESEARCH.md وحدود التنفيذ في PAYMENT_ADAPTER.md. الأساس لم يربط بواجهة Checkout أو قاعدة دائمة بعد؛ لا يعلن كتاجر مفعّل.

## الفحوص الفعلية
دفعة 7 اجتازت CI #238، بما فيه Chrome الفعلي لإنشاء/تأكيد طلب صناعي وإظهار الفاعل والملاحظة وبقاء التحصيل صفراً وعرض 390px. في الدفعة 8 نجح backend: npm run test:payment-provider (build + 11 فحصاً) وgit diff --check. فحوص بروتوكول الدفع بلا DB وشبكة؛ لا تعد اختباراً للحفظ الدائم. CI الكامل بعد حفظ Draft PR.

## المخطط
الدفعتان 7 و8 لا تحتاجان مخططاً إضافياً. الدفعة 6 تحتاج جدول OrderStatusEvent فقط، ولم تطبق على Mac. أداة rehearse_order_history.py قراءة فقط للمصدر وكتابة لنسخة مؤقتة، بلا apply. تعليمات وحدود التفعيل في ORDER_STATUS_AUDIT_ROLLOUT.md؛ لا db push أو reset على الحقيقي.

## بيئة الاختبار وPreview
Node 22 وRUST_LOG=info في Work. قواعد الاختبار تحت temp. Preview: نسخة مستقلة ثم bash scripts/preview-local.sh، بورتات 3108/4108 ومالك صناعي مؤقت وتنظيف عند الإيقاف. لا .env أو dev.db حقيقي هنا ولا نشر. Chromium المحلي مقيد؛ Chrome الفعلي يعمل في GitHub CI مع صور صناعية.

## التالي بدقة
تحقق من CI الدفعة 8 بعد الحفظ. بعدها repository SQLite دائم للمحاكي وإيصالات أحداث فريدة وCAS، محمي ببيئة preview-only وحارس مسار مؤقت وعلامة عزل، ومرفوض في production. اختبر restart وreplay والتزامن وصلاحية owner قبل واجهة المحاكي. لا ربط للتحصيل الحقيقي من mock ولا تفعيل حساب تاجر. مؤشرات Dashboard ورحلة الشراء والبحث والمنتجات وبقية المتطلبات في WORK_ROADMAP لم تعتبر مكتملة.
