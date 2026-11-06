# THANAYA — نقطة الاستئناف المعتمدة

## هدف RC الحالي
المرجع الإضافي RC_SCOPE.md يثبت النطاق حسب طلب المستخدم الأخير: معاينة حقيقية، تقرير مراجعة المرتجعات، انتقال Schema آمن، فحوص release وتسليم Mac. لا ميزات ثانوية أو توسع مفتوح.

## دفعة RC1-4 — معالجة نتائج الجودة الفعلية
نتيجة #270/#271: Chrome32 عينة بقي فيها contrast واحد في ProductPurchaseActions (4.01:1) وcheckout overflow بالثيمين مع shipping غير محددة. أصلح token النص، وgrid-cols-1/min-w-0 للـcheckout وwrap لزر التأكيد وصفوف المجموع، بلا clipping أو تعديل مبلغ. زيدت عينة320px وتشخيص rectangles وصور rc-checkout-{theme}-{width} (34 عينة قبل WebKit،36 بعد تأكيده). بناء Next35 مساراً ناجح؛ يلزم إثبات القياس الجديد.

الصورة الرسمية #271 عملت دون apt؛ Chromium158 وWebKit27.2. WebKit أكملت التسجيل/reload والسلة وCOD وتأكيد/reload/logout وowner/menu/report دون crash، ثم رسبت assertion errors على native same-origin access-control diagnostics عند hard-navigation/teardown. لم تخفّف الصلاحيات أو CORS أو شرط errors. يُنتظر networkidle والبيانات قبل manual reload/goto، وتستخدم روابط السلة/التقرير الحقيقية. المرجع الأولي لمشكلة المحرك PW43120 يدعم تفسير cancellation، لكن الاختبار التالي يجب أن يثبت خلوها من الأخطاء؛ لا تدّع نجاح WebKit حتى ذلك. JSON تحفظ مرحلة نهاية الرحلة وerrors قبل assertion.

#271 baseline core job + browser job يجب فحصهما معاً؛ browser فشلت لهذه الأسباب، ولو أكملت الوظائف. القياس في نفس artifact: TTFB11/FCP312/observedLCP312ms، shift0.01745، JS429,701bytes. ليست field performance. latest source بعد الحفظ ينتظر CI التالية.

آخر تغيير للـCI: #268 انتهت cancelled بعد20 دقيقة، وسجلاتها أثبتت تنزيل87 حزمة من مرآة azure Ubuntu ببطء شديد، لا مجرد prompt. رُتبت jobs: baseline host/driver1.56.1 كما سبق، وrc-browser-quality مستقلة داخل الصورة الرسمية mcr.microsoft.com/playwright:v1.65.0-noble وdriver1.65.0 مطابق (الإصدار الرسمي متحقق). متصفحات/مكتبات جاهزة، بلا apt عند وجود binary، وChromium bundled fallback. لا runtime/lockfile للتطبيق تغيرا، ولا موقع منشور أو ports عامة. مهلة bootstrap180s تبقى fallback CI-only، مع sudo -E لـinstall-deps ثم download كمستخدم عادي كي لا تضيع noninteractive env أو cache path.

مهم للمتابعة: افحص **كلتا job** في CI الجديدة. artifacts baseline اسمها thanaya-browser-review-N، وأدلة Preview/axe/WebKit الجديدة اسمها **thanaya-rc-browser-review-N**. اقرأ rc-quality.json وchromeFindings حتى لو فشلت WebKit. #270 القديمة تشغّل Chrome أولاً ثم bootstrap bounded؛ نتيجتها لم تصل عند الحفظ. الجولتان269/268 ليستا دليلاً جديداً على التطبيق بعد المرحلة التي وصلتاها.

تحديث تسلسل QA: #268/#269 علقتا في تجهيز WebKit قبل أي Chrome، لذا أزيلت خطوة التجهيز المبكرة. rc-quality-browser تنجز Chrome/axe والقياسات وتحفظ JSON أولاً ثم تشغل CLI WebKit المقفلة بمهلة180s وDEBIAN_FRONTEND/NEEDRESTART غير تفاعليين. الفشل/المهلة يرسبان الفحص مع tail logs؛ لا skip/pass وهمي. تثبيت system dependencies تلقائياً مسموح داخل CI فقط.

أضيفت عينات scroll لهوية المنتج ووصفه (32 عينة مستهدفة)، وتصحيح multiple labels للرفع، وroles لمجموعتي المنتجات والفلاتر، وسطح identity/validation حسب الثيم. بناء Next35 مساراً وsyntax/diff ناجحة؛ تحتاج CI بعد الحفظ. افحص rc-quality.json حتى عند فشل native bootstrap، ثم عالج أي serious/critical/overflow. لا تدّع WebKit ناجحة بعد.

تحديث سلامة البروفة: أضيف BEGIN IMMEDIATE صريح قبل DDL على clone. اختبار late UNIQUE/SKU أثبت فشلاً فعلياً على HEAD السابقة (CREATE/ALTER بقيت بعد الفشل)، ثم نجحت كل 11 فحصاً بعد الإصلاح: rollback كامل، source byte-identical وغياب تقرير نجاح للمحاولة الفاشلة. نتيجة البروفة الصناعية أعيد توليدها على المصدر الحالي. CI #268 لإصلاح الألوان/renderer ما زالت تعمل؛ CI الجديدة بعد هذا الحفظ مطلوبة ولا تعني تفعيل DB.

Draft PR #81، release/rc1-quality-gates-20261106. آخر أساس شامل معتمد #80/d3fea77 وCI #265، و#79/3b51bf3 وCI #264؛ صور Preview والتقرير قُرئت. آخر head قبل هذا الإصلاح 78093e5 وCI #267 فشلت بوضوح، فلا تعلن RC معتمدة بعد.

CI #266 توقفت قبل browser لأن ubuntu-latest الجديدة26.04 لا تدعم WebKit المقفلة1.56.1؛ runner ثبتت إلى ubuntu-24.04 وWebKit ثبتت بنجاح في #267. هذه الجولة اجتازت كل schema/API/build وChrome الأساسية والتقرير و**إنشاء/تعديل المنتج من النموذج**: 10 آلاف →12.5 ألف =12,500، stock2 ثابت.

rc-quality.json من #267 حُمّل وقُرئ: 28 عينة صفحة/ثيم، مشاكل serious كلها color-contrast، بالإضافة إلى moderate region/heading-order. الأصل white على cyan 3.18:1 وmuted خافتة وروابط زرقاء داكنة على dark، وصف مخزون فاتح بخط أبيض. لا selectors مستثناة ولا rules معطلة.

الإصلاح الحالي: foreground داكن واضح على cyan مع بقاء brand، tokens th-link/th-muted وثلاثة ألوان stock حسب الثيم، تصحيح النصوص الضعيفة في catalog/cart/product/dashboard، لون تحذير low-stock، footer، وlandmarks للمعاينة/header وheading hierarchy للمنتجات. labels/id/name/autocomplete لحقول auth/ProductForm، ورفع الصورة native keyboard، محفوظة. بناء Next35 مساراً نجح، وينتظر أثر axe الفعلي في CI التالية.

القياس الأول الحقيقي قبل axe، Chrome390×844 loopback غير مخنوق: TTFB4ms، FCP236ms، observed LCP236ms، shift0.01594، JS429,765 bytes. هذه lab sample لا field p75/INP. أضيفت ميزانيات 1500/2500/3500ms وshift≤0.1 وJS≤600,000 لالتقاط الانحدار.

WebKit الفعلية سجلت/أعادت تحميل الحساب ثم page crashed عند فتح product. السبب لم يثبت؛ أضيف software Mesa وpw:browser crash logs مع بقاء كل خصائص التطبيق واختبارات الرحلة، وتسجيل مرحلة الفشل في JSON. لا تدّع Safari ناجحة قبل نتيجتها؛ ليست iPhone حقيقية. لا تتجاوز crash أو تخفف assertion.

preflight عُززت أثناء مراجعة RC: output لا يتداخل مع صور source، وPrisma Int32/Boolean validity لكل الأعمدة. تجربة فعلية على SQLite صناعية أثبتت أن 3,000,000,000 تقبلها SQLite لكن Prisma المقفلة ترفض قراءتها P2023؛ التحقق يمنعها قبل التفعيل. 10 فحوص جديدة محدثة نجحت. pycache مستبعدة من Git فقط.

## دفعة RC1-3 — بروفة المخطط المتكاملة
الفرع release/rc1-schema-rehearsal-20261106 فوق #79/3b51bf3. آخر أساس شامل معتمد #78/d8c0086 وCI #262؛ #79/CI #264 قيد الفحص بعد تصحيح فتح details في driver فقط.

rc_schema_preflight.py يحصر كل 34 جدولاً/الأعمدة/defaults/PK/FK/indexes مقابل SQL مولدة من Prisma 5.22.0 المقفلة. يقرأ --source mode=ro فقط، ويوقف drift غير إضافي وunknown tables/fields/constraints/triggers وبيانات money/quantity/roles/states/FK/overreturn غير متوافقة. لا drop/rebuild أو تخمين قيم تاريخية. إضافة missing fields/indexes على clone فقط.

--output-dir ينشئ مجلداً خاصاً جديداً خارج repo/source، SQLite backup API تشمل WAL؛ fingerprints لكل صف/حقل أصلي، backup hash، restore hash/قيم وصور متحققة؛ يجرب DDL الإضافية على restored.sqlite فقط. يتحقق من المخطط النهائي الكامل وصفوف الأصل وجداول جديدة فارغة وثبات source DB/WAL/uploads. --verify-backup-dir يراجع الملفات المحفوظة مستقلاً ويكشف تلف backup/restore/images. لا live apply mode.

10 اختبارات متكاملة وverify_rc_schema_reference.py نجحت محلياً. RC_SCHEMA_REHEARSAL_RESULT.json نتيجة صناعية فعلية: 14 جدولاً مفقوداً وpaymentRevision/disposition، حفظ source وكل القيم وrestore والمخطط الكامل، بلا backfill. ليست بيانات Mac. RC_SCHEMA_PLAN.md فيها جرد الأعمدة كلها، خطة migration/rollback وأوامر Mac read-only/clone-only وبوابة إذن التفعيل. CI أضيفت للفحوص ولتغييرات scripts/preview-local.sh.

## أحدث حفظ RC1
- أساس متحقق: Draft PR #78، release/rc1-private-preview-20261106، d8c0086571d6f130c8c5e0a8d0ba611cab749772، CI #262 ناجح بالكامل: https://github.com/joseph2202/thanaya-dental-redesign/actions/runs/42223345924 .
- نفس launcher الإنتاجي اجتاز Chrome الحقيقي: تسجيل حساب، سلة، COD، إدارة وصور desktop/mobile. الصور الخمس حُمّلت وقُرئت: preview-store-desktop/mobile، preview-order-mobile، preview-admin-desktop، preview-financial-mobile. غياب صور المنتجات الصناعية معلن؛ لا تُخترع صور/ماركات حقيقية. المالية 60,000 تحصيل، 25,000 مصاريف، 348,000 مورد، 145,000 ذمم طابقت fixture.
- CI #261 كشفت hydration #418 بسبب flag شريط المعاينة runtime المختلف عن build للـlayout المشتركة؛ أُصلحت إلى build-time، ونجحت #262 دون إخفاء pageerror.
- متصفح Work المنفصل لا يصل إلى loopback حاوية exec؛ ERR_CONNECTION_REFUSED. لا نشر أو Tunnel. طريقة Mac RC_PREVIEW_MAC.md تنشئ نسخة مستقلة وقاعدة مؤقتة؛ Ctrl+C ينظفها.

## دفعة RC1-2 — مراجعة المرتجعات
Draft PR #79، d2ac4c3. CI #263 اجتازت API الست والبناء وChrome السابقة، وواجهة التقرير/التأخر/error/retry حتى محاولة الرابط المالي بعد reload. اختبارها نسي فتح details التي تعاد مغلقة بعد retry؛ أضيف فتح summary قبل الضغط على الرابط، بلا تغيير للتطبيق أو تخفيف assertion. يلزم CI التالية.
الفرع release/rc1-return-review-20261106 فوق d8c0086. GET /api/reports/return-review للـowner/admin من DB فقط، page 20 وحدود صارمة وفترة حسب سند الاستلام. يعرض original cost snapshots/unknown cost، restocked/quarantined، ودفتر الطلب الحالي كاملاً مع تحذير عدم جمعه بين السندات. لا settlement/credit مخترع ولا write أو schema. رابط Dashboard → /admin/reports#return-review ثم دفتر الطلب /admin/finance?orderId=... .

تقرير السندات ليس ادعاء إغلاق تسوية: كل سند يحتاج مراجعة، حتى وجود استرداد لا يثبت التسوية الكاملة. سقف refund ليس ديناً؛ الشحن لا يرد تلقائياً والحجر غير قابل للبيع. الطلبات المرتجعة القديمة بلا دليل تُذكر منفصلة لكل الفترات. التكاليف المتباينة بلا تخصيص لا تؤخذ بمتوسط ولا بسعر اليوم.

6 مجموعات return-review.integration نجحت على temp SQLite: صلاحيات وخصوصية، تكلفة تاريخية/خصم/سقف، تواريخ، pagination ثابتة، قراءة byte-identical للـDB/WAL، ورفض فساد السجلات. بناء Backend وNext 35 مساراً ناجح. نفس launcher HTTP اختبر سنداً محجوراً حقيقياً من APIs، تكلفة 34,000 وصفر تحصيل/رد وعدم زيادة stock، ومنع الزبون من التقرير. Chrome الجديد للتقرير/ربطه/تأخر الفترة/error/retry ينتظر CI بعد الحفظ.

كما أصلح سباق فترات صفحة التقارير العامة: abort واستبعاد أرقام الفترة السابقة فوراً، ومطابقة overview/costs، وعزل خطأ تصدير Excel عن أرقام التقرير. ReturnReviewPanel مستقلة مع retry وpager وبدون أزرار مالية تنفيذية.

## آخر أساس محفوظ قبل هذه الدفعة
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
1. افحص CI لدفعة RC1-4. حمّل rc-quality.json (حتى عند الفشل) والصور؛ أصلح كل serious/critical أو overflow، وتحقق من actual WebKit ورحلة COD. #80/CI #265 آخر أساس كامل معتمد. لا تخفّف القواعد لإمرار CI.
2. جودة RC: شغل WebKit إن توفر، axe للصفحات الرئيسية والنماذج/الإدارة بالثيمين، وقياسات أداء حقيقية. أصلح stop-ship فقط واحفظ commit/Draft PR/Handoff في كل دفعة. لا توسعات ثانوية.
3. صف قيود القياسات بدقة: headless WebKit ليست iPhone حقيقية، lab metrics ليست بيانات مستخدمين، وaxe لا تغطي كل الوصولية؛ keyboard/contrast الأساسية قائمة. ما يفشل يعالج قبل اعتماد RC.
4. قبل تسليم Mac حدّث RC_PREVIEW_MAC إلى آخر فرع وSHA/CI معتمدة وأعد تحقق حفظ Git فقط. لا تحتاج DB/.env من المستخدم لتشغيل Preview. قاعدة Mac الحقيقية غير متاحة؛ تعليمات RC_SCHEMA_PLAN تنفذ backup/restore/rehearsal محلياً ويشارك report.json فقط إن أراد.
5. لا live migration/reset/db push ولا merge/نشر/دفع حقيقي. موافقة التفعيل لا تطلب إلا بعد التقرير المحلي والنسخة المتحققة؛ البروفة الصناعية لا تصادق على الأصل. أغلق RC_SCOPE بالأدلة وحدود التشغيل، لا تعلن المشروع كله مكتملاً دونها.
