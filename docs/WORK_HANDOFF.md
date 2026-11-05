# THANAYA — استئناف المواصفات الكاملة

## آخر أساس متحقق
PR #67، feature/admin-financial-dashboard-20261105، c9d91a359d8d6b5b7bae698a210bf95d8087399d. CI #243 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42100764683 . صور الهاتف والتابلت وsandbox قرئت؛ الهيدر لم يعد يغطي القسم أثناء التصوير. جميع دفعات #60–#66 وما قبلها محفوظة. المواصفات في WORK_MISSION.md ولا تعاد مرحلة Recovery.

## الدفعة الحالية 13
الفرع feature/product-gallery-zoom-20261105، الأب #67. Native dialog لتكبير صور المنتج والتنقل والأسهم وEscape واستعادة التركيز وقفل تمرير الصفحة. تكبير 2× بتمرير أصلي بلا مكتبة صور أو animations. صور معطلة لها fallback صريح، ويُعطل تكبير الصورة المعطلة، والمنتج بلا صور لا يعرض زر تكبير. ألوان theme tokens وforced-colors. ProductMedia يحتفظ بأيقونة server-rendered كـslot لمعالجة فشل img في مكوّن صغير.

## الفحوص الفعلية
CI #243 نجح مع Dashboard وأرقامها وتأخر/فشل الفترة وإعادة المحاولة و390/768px. للدفعة 13 frontend build (35 مساراً) وsyntax لملفات browser/gallery/fullstack وgit diff --check ناجحة. فحص Chrome جديد لا يزال ينتظر CI: فتح/تكبير/تنقل/Tab/Escape/focus و404 وغياب الصور و390px/reduced-motion، مع screenshot. الصور الموجودة في repo تستخدم كـfixtures داخل DB صناعية فقط. Chromium المحلي مقيد؛ لا يدعى نجاح الفحص الجديد قبل CI.

## المخطط
الدفعات 7–13 لا تحتاج مخططاً إضافياً في قاعدة المتجر. للمحاكي ملف مستقل جديد فقط في root مؤقت. الدفعة 6 تحتاج جدول OrderStatusEvent، ولم تطبق على Mac. أداة rehearse_order_history.py قراءة فقط للمصدر وكتابة لنسخة مؤقتة، بلا apply. تعليمات وحدود التفعيل في ORDER_STATUS_AUDIT_ROLLOUT.md؛ لا db push أو reset على الحقيقي.

## بيئة الاختبار وPreview
Node 22 وRUST_LOG=info في Work. قواعد الاختبار تحت temp. Preview: نسخة مستقلة ثم bash scripts/preview-local.sh، بورتات 3108/4108 ومالك صناعي مؤقت وتنظيف عند الإيقاف. لا .env أو dev.db حقيقي هنا ولا نشر. Chromium المحلي مقيد؛ Chrome الفعلي يعمل في GitHub CI مع صور صناعية.

## التالي بدقة
تحقق من CI الدفعة 13 وصورة product-gallery-mobile وعالج أي فشل. بعدها البحث: SKU موجود بالـAPI فلا يعاد بناؤه؛ نص البحث لا يشمل category حالياً، وGET /products يتجاهل query arrays/unknowns بدل رفضها، و/search يفترض q string وقد يتعطل عند q متكرر. أصلح حدود الاستعلام والرسائل ووسم البحث، واختبر API/URL/expired-stock على fixture. بعدها رحلة سلة/شراء حقيقية واستعادة فقدان الرد، وبقية WORK_ROADMAP. لا تعاد بروفة ERP أو auth الناجحة دون سبب. لا دفع تاجر حقيقي.
