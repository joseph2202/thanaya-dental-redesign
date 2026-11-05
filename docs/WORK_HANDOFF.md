# THANAYA — استئناف المواصفات الكاملة

## آخر أساس متحقق
PR #60، fix/iqd-refund-precision-20261105، e8aca5de373813e4bf246e5726a32be1995a2f4e. CI #236 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42086517169 . كل إصلاحات PRs #56–#59 محفوظة. المواصفات في WORK_MISSION.md ولا تعاد مرحلة Recovery.

## الدفعة الحالية 6
الفرع feature/order-status-audit-20261105، الأب #60. OrderStatusEvent جديد مع actor/name/role/from/to/time، وإنشاء الدليل بنفس transaction للإجراء، وGET history للموظفين المخولين فقط. القديم لا يعاد اختراع تاريخه. فشل كتابة الحدث يلغي الحالة والمخزون والإشعار.

## الفحوص الفعلية
نجح generate وبناء Backend، و7 فحوص Python للبروفة، و9 فحوص history API، ومجموعات orders/finance/COGS. اختبار history يشمل صلاحيات السيرفر وتزوير الفاعل والاسم/الدور التاريخي والتكرار والتزامن والمرتجعات وrollback ومقارنة مخطط Prisma ببروفة Python. CI الكامل بعد حفظ Draft PR.

## المخطط
الدفعة 5 لم تحتج Migration. الدفعة 6 تحتاج جدول OrderStatusEvent فقط، ولم تطبق على Mac. أداة rehearse_order_history.py قراءة فقط للمصدر وكتابة لنسخة مؤقتة، بلا apply. تعليمات وحدود التفعيل في ORDER_STATUS_AUDIT_ROLLOUT.md؛ لا db push أو reset على الحقيقي.

## بيئة الاختبار وPreview
Node 22 وRUST_LOG=info في Work. قواعد الاختبار تحت temp. Preview: نسخة مستقلة ثم bash scripts/preview-local.sh، بورتات 3108/4108 ومالك صناعي مؤقت وتنظيف عند الإيقاف. لا .env أو dev.db حقيقي هنا ولا نشر. Chromium المحلي مقيد؛ Chrome الفعلي يعمل في GitHub CI مع صور صناعية.

## التالي بدقة
تحقق من CI الدفعة 6 بعد حفظها، ثم فرع من رأسها لإضافة OrderStatusTimeline داخل تفاصيل طلب الإدارة، وحقل سبب اختياري، وتحديث السجل بعد الإجراء مع تحميل/خطأ/حالة قديمة صريحة. اختبر عبر Chrome إنشاء طلب وتأكيده وظهور الفاعل والسبب، دون تغيير التحصيل. بعدها بنية Payment Provider Adapter وsandbox معزولة وبحث مزودين رسمي. بقية المتطلبات في WORK_ROADMAP ولم تعتبر مكتملة.
