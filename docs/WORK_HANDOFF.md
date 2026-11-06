# THANAYA — نقطة الاستئناف المعتمدة

## ابدأ من هنا
- أحدث فرع متكامل: fix/gallery-photo-consistency-20261106، Draft PR #77.
- آخر commit كود متحقق: a890256a34bd24dffa108353aad8370083872f1c.
- CI #259 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42141710263 .
- هذه النقطة تحدث الوثائق فقط بعد النتيجة؛ HEAD اللاحقة قد تكون checkpoint توثيق فوق المصدر نفسه. افحص head PR وCI الحالية قبل أي تعديل، ولا تبدأ من main.
- آخر مراجعة للـPRs لم تظهر حفظاً أحدث من #77. كل #60–#69 و#71–#76 محفوظة في هذه السلسلة؛ #70 مغلق superseded بـ#71 وفرعه/commitه محفوظان. لا merge أو force push أو حذف لفرع.

## ما اكتمل فعلياً
| الدفعة | المصدر المعتمد | التحقق |
| --- | --- | --- |
| مالية الإدارة #67 | c9d91a35 | CI #243؛ مؤشرات #66/CI #242، فترات متأخرة/error/retry و390/768px؛ الصور قرئت |
| المعرض المتكامل #71 | 6090998a | CI #250؛ CSS Modules/Turbopack، هيدر زائر 320/390px، zoom/RTL/Tab/Escape/focus/fallback وSKU |
| شراء الهاتف #72 | 3541d345 | CI #251؛ تغير السعر/المخزون، شحن/خصم وضياع رد POST مع طلب/قطعة/كوبون واحد وصفر COD collection |
| البحث والفلاتر #73 | 72f919e5 | CI #254؛ 22 API checks (13 فشلت قبل الإصلاح)، category وSKU وURL guards ونموذج الهاتف/التوفر/الترتيب |
| تباين تأكيد الطلب #74 | 7a1d6f29 | CI #256؛ min 4.67:1، dark/light و320/390/768px وكل الحالات، وصورتا الثيمين قُرئتا |
| استعادة السلة #75 | f83342d0 | CI #257؛ 9 state checks وChrome لفساد/جزئية/تكرار التخزين وquote جديد وتخزين محجوب بسلة ذاكرة عاملة |
| إبطال جلسة الخروج #76 | c6bc70e6 | CI #258؛ replay/Cookie/Bearer/CSRF/جهاز آخر/restart/outage، 8 بروفات clone/WAL، وNext copied-cookie replay |
| اتساق الصورة #77 | a890256a | CI #259؛ gallery-only تحمل صورة حقيقية بالبطاقة بلا ادعاء غياب، مع تعطيل زر المخزون صفر وكل فحوص الأعمال السابقة |

التنفيذ يحافظ على العمليات المالية/الموردين/الطلبات/FEFO/المرتجعات/الحجر. ذمم fixture الصحيحة 68,000 = 98,000−30,000. لا ربح صافٍ أو رصيد صندوق مخترع. productImages مشترك للبطاقة/المعرض/الرسالة وsnapshot السلة، مع أولوية image ثم gallery ومعالجة localhost uploads القديمة.

## الأمان والمخطط — لا تشغيل على الحقيقي بعد
- RevokedSession من #76 جدول جديد: digest فقط، وتسجيل الإبطال قبل مسح cookies، وفحص كل API بعد CSRF بلا cache سلبية. كل login لها jti مستقلة، وCookie/Bearer القديمة قابلة للإبطال. غياب/تعطل journal يعيد 503، بلا حساب جزئي أو ادعاء خروج ناجح.
- الكود اختبر على temp SQLite فقط. وجود RevokedSession الصحيحة شرط تسجيل الدخول على DB قديمة. rehearsal_session_revocation.py يقرأ --source mode=ro ويكتب clone فقط؛ لا apply/activation mode. 8 فحوصه تحافظ على المصدر وWAL؛ ليست تفعيل متجر.
- ما زال يلزم مسار activation محمي بbackup متحقق وتصريح تشغيل لـRevokedSession وOrderStatusEvent وERP05/06 قبل أي استعمال حقيقي. لا db push/reset/Migration على Mac، ولا تدوير أسرار/تعديل credentials حقيقية.
- لا .env أو dev.db أو ملفات زبائن من جهاز يوسف هنا. لا نشر عام أو merge أو دفع/استرداد حقيقي. محاكي الدفع له journal مستقل وowner-only داخل Preview صناعية، ولا يكتب أموال المتجر.

## التشغيل والفحوص
Node 22؛ RUST_LOG=info في Work. نسخة مستقلة ثم bash scripts/preview-local.sh تنشئ واجهة 3108 وAPI 4108 وقاعدة/مالكاً صناعيين ومفتاح محاكي مؤقتاً؛ Ctrl+C ينظفها. المحاكي يحتاج Node >=22.13. Chrome المحلي مقيد، فلا تحاول تجاوزه. CI تشغل Chrome على SQLite مؤقتة والصور تحفظ 7 أيام.

تشغيل الفحوص المركزة عند تعديل مجالها فقط: backend: npm run test:sessions أو test:catalog؛ frontend: node --experimental-strip-types --test tests/cart-state.test.cjs ثم npm run build. لا تكرر المجموعات الناجحة محلياً دون تغيير/فشل؛ CI المطلوبة تشغلها تلقائياً. auth/roles أعيدتا في #76 لأن بوابة المصادقة تغيرت. syntax/YAML/diff checks ناجحة، وآخر worktree كانت نظيفة ومتطابقة مع GitHub.

## حدود النتيجة
المشروع غير مكتمل؛ WORK_MISSION.md هو المرجع وWORK_ROADMAP.md مصفوفة المتبقي. لا إدارة أجهزة/revoke-all أو إبطال تلقائي جديد عند تغيير role/password في #76؛ دور DB الفعلي ما زال يضبط الصلاحية. WebKit وتدقيق وصولية شامل وقياسات أداء وتحسين الرئيسية/ماركات/جديد وGlass مختار ما زالت مراحل لاحقة. قياس التباين المنجز يخص صفحة تأكيد الطلب، وليس اعتماداً شاملاً للموقع.

## المهمة التالية الدقيقة
1. تحقق من HEAD #77 وCI للـcheckpoint إن وجدت؛ المصدر a890256a/CI #259 معتمد. حافظ على كل إصلاحاته ولا تعاود تشخيص CI #229 أو #242 أو المراحل المكتملة من الصفر.
2. أكمل المالية بواجهة مراجعة مرتجعات غير مسواة للـowner/admin فقط: تقرير read-only من OrderReturn/returnLines وpaymentEvents وcostSnapshots، يميز restocked/quarantined والموثق/مجهول التكلفة، مع تاريخ حدث الإرجاع وpagination وحدود وصلاحيات واضحة، ثم اربطه بـFinancialDashboard وتقارير الإدارة. ابدأ بـbackend/src/lib/operationalSummary.ts وpaymentLedger.ts وorderReturnLedger.ts وroutes/reports.ts وdocs/OPERATIONAL_REPORTS.md.
3. لا تحول refundableCeilingIqd إلى دين/credit معتمد؛ هو سقف رد مسموح وليس إثبات تسوية أو تحصيل. الشحن لا يرد تلقائياً، والحجر لا يعني بضاعة صالحة. احفظ الاستبعاد المعلن من الربح/الذمم حتى وجود أساس تسوية صريح، واختبر الجزئي/الكامل والتالف والخصم والتوقيت والخصوصية على fixtures.
4. بعد تقرير المراجعة أكمل الرئيسية/المنتجات والبحث وتجربة الهاتف وGlass المحدود، ثم WebKit/الأداء وبقية التدقيق. التكامل التجاري الحقيقي ينتظر credentials/عقد/تصريح؛ لا تنتظر ذلك لإنجاز ما لا يعتمد عليه. كل دفعة commit وDraft PR وHandoff وCI فعلية.
