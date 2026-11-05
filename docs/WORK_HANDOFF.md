# THANAYA — استئناف المواصفات الكاملة

## آخر أساس متحقق
PR #61، feature/order-status-audit-20261105، bcb7ecb7d1a4988a65df6a2f6bb35b1735e28ab0. CI #237 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42087967379 . كل إصلاحات PRs #56–#60 محفوظة. المواصفات في WORK_MISSION.md ولا تعاد مرحلة Recovery.

## الدفعة الحالية 7
الفرع feature/admin-order-timeline-20261105، الأب #61. Timeline داخل تفاصيل الطلب، مع الفاعل والدور والتوقيت بتوقيت بغداد، تحميل وخطأ وإعادة محاولة وغياب التاريخ القديم بشكل صريح. حقل ملاحظة اختياري ضمن تأكيد الحالة؛ يعاد تحميل السجل بعد الحفظ. يقرأ من API المحمية؛ لا يكتب تاريخاً أو مالاً من المتصفح.

## الفحوص الفعلية
سجل السيرفر وبروفة المخطط اجتازا CI #237. نجح بناء الواجهة للدفعة 7 (35 مساراً)، وفحص syntax وgit diff --check. أضيف فحص Chrome فعلي ينشئ طلباً صناعياً ويؤكده من الإدارة بملاحظة، ثم يتحقق من السجل ومن بقاء التحصيل صفراً، مع عرض 390px وصورة مراجعة. نتيجة Chrome بعد حفظ Draft PR؛ لا يدّعى تشغيله محلياً (Chromium مقيد). الأمر: frontend: npm run build ثم في CI node tests/fullstack-session-proxy.cjs.

## المخطط
الدفعة 5 لم تحتج Migration. الدفعة 6 تحتاج جدول OrderStatusEvent فقط، ولم تطبق على Mac. أداة rehearse_order_history.py قراءة فقط للمصدر وكتابة لنسخة مؤقتة، بلا apply. تعليمات وحدود التفعيل في ORDER_STATUS_AUDIT_ROLLOUT.md؛ لا db push أو reset على الحقيقي.

## بيئة الاختبار وPreview
Node 22 وRUST_LOG=info في Work. قواعد الاختبار تحت temp. Preview: نسخة مستقلة ثم bash scripts/preview-local.sh، بورتات 3108/4108 ومالك صناعي مؤقت وتنظيف عند الإيقاف. لا .env أو dev.db حقيقي هنا ولا نشر. Chromium المحلي مقيد؛ Chrome الفعلي يعمل في GitHub CI مع صور صناعية.

## التالي بدقة
تحقق من CI الدفعة 7 وصورة admin-order-timeline-mobile بعد حفظها، وعالج أي فشل قبل اعتمادها. بعدها فرع من رأسها لبنية Payment Provider Adapter وsandbox معزولة وبحث مزودين رسمي. لا ربط للتحصيل الحقيقي من mock ولا تفعيل حساب تاجر. مؤشرات Dashboard ورحلة الشراء والبحث والمنتجات وبقية المتطلبات في WORK_ROADMAP لم تعتبر مكتملة.
