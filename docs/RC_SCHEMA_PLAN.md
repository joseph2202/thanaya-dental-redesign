# RC1 — خطة انتقال Schema وحماية بيانات Mac

هذه الخطة وبروفتها لا تمنحان موافقة التفعيل. لا توجد live apply mode في rc_schema_preflight.py، ولا تنفذ db push/reset أو SQL المرجعية على قاعدة المتجر. البيانات الحقيقية و.env وuploads الخاصة بيوسف غير متاحة في Work؛ النتيجة الصناعية لا تصادق على قاعدة لم نفحصها.

## ماذا يحتاج المخطط؟

كل الفروع المتسلسلة محفوظة في أساس RC الحالي. rc1-target.sql **مرجع لا سكربت live**، مولد بـPrisma 5.22.0 migrate diff من schema.prisma كاملة؛ hash المصدر في رأسه، وCI تقارن كل table/column/default/PK/FK/index بالمولد المقفل. الجرد الكامل أدناه يغطي الأساس والإضافات، وليس فقط اسمَي RevokedSession وOrderStatusEvent.

مجموعات الفجوات التي قد تظهر على Mac:

| المجموعة | الإضافات | سياسة التاريخ |
| --- | --- | --- |
| مرتجعات البضاعة | OrderReturn/Line، Order.returnRevision، OrderItem.productName، disposition | لا اختلاق سند/اسم تاريخي؛ restocked توافق سلوك المرتجعات القديمة التي كانت تعاد للمخزون |
| التحصيل والاسترداد | Order.paymentRevision، OrderPaymentEvent وفهارسه | لا تحويل delivered إلى تحصيل أو returned إلى refund |
| المشتريات | Supplier، PurchaseOrder/Line/Event، revisions والفهارس | لا أوامر/اعتمادات/إرسال تاريخي مخترع |
| استلام المورد | PurchaseReceipt/Line، receiptRevision | لا إعادة إنشاء stock أو تغيير الأرصدة |
| ذمم المورد | SupplierInvoice/Payment، invoiceRevision | لا دين/تسديد تاريخي مفترض |
| التكلفة والمصاريف | purchaseCostIqd/costRevision، ProductCostChange، OrderItemCostSnapshot، StoreExpense، CashAdjustment | NULL تبقى مجهولة؛ لا backfill تكلفة أو ربح أو رصيد صندوق |
| دليل حالة الطلب | OrderStatusEvent وفهارس order/actor | القديم بلا حدث يبقى بلا حدث؛ لا توقيت/فاعل مخترع |
| إبطال الجلسات | RevokedSession مع PK tokenHash وexpiresAt index | لا raw JWT أو backfill إبطال؛ الجدول شرط للتشغيل الجديد |
| أساس المتجر | User/roles، المنتجات والصور/SKU/specs، عناوين/إعدادات/توصيل/كوبونات/تنبيهات/مخزون/FEFO | تتحقق جميع الأعمدة والقيود وتبقى القيم الأصلية كما هي |

## آلية preflight والبروفة

1. يفتح --source صراحةً بـmode=ro وquery_only؛ لا يقرأ DATABASE_URL المحيطة لتحديد وجهة كتابة. يرفض links والمصدر الغائب، ويفحص integrity/FK والمخطط الكامل.
2. يذكر missing tables/columns/indexes. لا drop/rebuild، ولا تعديل type/default/nullability أو FK أو required field بلا قيمة تاريخية. جدول/عمود/index مخصص أو trigger/view غير معروف يوقف العملية للمراجعة؛ لا يتخطاه تلقائياً.
3. يفحص توافق كل INTEGER مع Prisma Int32 (وليس حدود SQLite الأوسع)، وBOOLEAN0/1، ومبالغ وكميات صحيحة غير سالبة، صلاحيات وحالات معروفة، معادلة inventory movements، حدود الكميات المرتجعة والتحصيل/الرد. owner غير وحيد يطلب مراجعة بلا إنشاء حساب. هذا ليس مطابقة مالية مع المصرف أو جرد صندوق.
4. الخيار --output-dir ينشئ مجلداً خاصاً جديداً خارج المستودع ومجلد DB، ودون تداخل مع uploads المصدر. SQLite backup API تشمل WAL الملتزمة. كل جدول قائم يقارن بعدد وصفوف digest، وليس counts وحدها. لا تطبع قيم/كلمات مرور/أرقام زبائن.
5. يستعيد backup إلى restored.sqlite وصوراً منفصلة، يتحقق من hash والصفوف/integrity/FK، ثم يشغل **DDL الإضافية على هذه النسخة المستعادة فقط** في BEGIN IMMEDIATE صريحة؛ فشل unique index متأخر يتراجع بكل CREATE/ALTER. يتحقق من المخطط الكامل وكل القيم الأصلية والجداول الجديدة الفارغة. لا events أو snapshots أو أسعار مخترعة.
6. يتحقق مجدداً من backup والـmanifest المستقلتين والصور المستعادة، ومن ثبات DB/WAL/rows/uploads المصدر. تغيير أثناء العمل يفشل؛ توقف الخدمات وأعده إلى output جديد. الملف report.json ملخص schema/counts فقط؛ DB والصور/manifest تبقى خاصة على جهازك.

إن انتهت محاولة بفشل، لا تعتبر مجلدها نسخة معتمدة ولا تعاود الكتابة داخله؛ احتفظ به للفحص واستخدم اسماً جديداً بعد تصحيح السبب. فقدان index تضاف بروفته، أما قيد غير متوافق فيحتاج migration مصممة للمخطط الفعلي بعد مراجعته.

## أوامر Mac — لا تفعيل حقيقي

استخدم Python 3.10+ ونسخة RC النظيفة المذكورة في RC_PREVIEW_MAC.md. أوقف خوادم المتجر الأصلية من Terminal الذي شغّلها، وتحقق أن مسار DB يطابق DATABASE_URL الأصلية دون مشاركة .env أو أسرارها. الأسماء التالية توافق مسار المشروع المعروف؛ صححها إذا نقلت المشروع:

```bash
THANAYA_LIVE_DB="$HOME/Documents/thanaya-dental-redesign/backend/prisma/dev.db"
THANAYA_RC_DIR="$HOME/Documents/thanaya-rc-preview-20261106"
python3 "$THANAYA_RC_DIR/backend/scripts/rc_schema_preflight.py" --source "$THANAYA_LIVE_DB"
```

راجع JSON أولاً. إذا لم يُحظر الفحص، جهّز backup/restore/rehearsal معاً، **على clone فقط**:

```bash
mkdir -p -m 700 "$HOME/Thanaya-Backups"
THANAYA_RC_BACKUP="$HOME/Thanaya-Backups/RC1-$(date +%Y%m%d-%H%M%S)"
python3 "$THANAYA_RC_DIR/backend/scripts/rc_schema_preflight.py" \
  --source "$THANAYA_LIVE_DB" \
  --uploads "$HOME/Documents/thanaya-dental-redesign/backend/uploads" \
  --output-dir "$THANAYA_RC_BACKUP"
python3 "$THANAYA_RC_DIR/backend/scripts/rc_schema_preflight.py" \
  --verify-backup-dir "$THANAYA_RC_BACKUP"
```

إذا لا يوجد مجلد uploads أصلاً، احذف خيار --uploads فقط؛ إذا كان THANAYA_UPLOAD_DIR يحدد مكاناً آخر فاستخدمه صراحةً. لا تضع backup داخل git أو ترسل database.sqlite/manifest/images. يمكن مشاركة **report.json فقط** بعد مراجعته؛ يحوي schema/counts ونتائج الحماية دون صفوف شخصية.

## بوابة تفعيل لاحقة — تحتاج إذن يوسف

بعد مراجعة report.json المحلية وbackup/restore ناجحتين: ثبّت SHA RC المعتمدة وأوقف الخدمات، تحقق من حداثة المصدر مقابل backup، ثم صمّم وراجع migration إضافية من delta الفعلية فقط في transaction واختبر rollback. التفعيل الحقيقي منفصل ويحتاج موافقة صريحة؛ لا سكربت في هذه الدفعة يفعله. لا تستخدم safe scripts القديمة ذات نطاق return-only كاعتماد شامل.

خطة التراجع قبل أي تفعيل لاحق: أبقِ نسخة المصدر وWAL وbackup المتحققة بدون استبدال، واستعد في مجلد آخر أولاً مع hashes/integrity/FK/كل الصفوف والصور. لا تستبدل DB قيد التشغيل ولا تنسخ فوق WAL؛ مراجعة الاستبدال وبدء الخدمات تأتيان بعد إيقافها وإذن منفصل. لا تعاد كتابات جديدة على قاعدة أقدم بعد تشغيل مستخدمين دون خطة حفظها.

## النتيجة المنفذة في Work

RC_SCHEMA_REHEARSAL_RESULT.json ناتجة فعلياً من قاعدة صناعية تمثل مرحلة قبل المالية/ERP/history/revocations، وفيها طلب وبند ومرتجع حقيقيان. البروفة حمت القيم، أضافت المخطط على restore فقط، أبقت الجداول الجديدة فارغة، وحافظت على DB/WAL المصدر. 11 اختباراً نجح: legacy/current، WAL، index، read-only، source/output/links، unknown schema، money/stock/FK/overreturn، تلف backup/restore/images. verify_rc_schema_reference.py نجحت مقابل Prisma المقفلة. ليست نتيجة تشغيل على Mac أو تصريح Migration.

## الجرد الكامل للمخطط المرجعي

34 جدولاً؛ SQL مولدة من Prisma المقفلة ومطابقتها تختبر في CI. أسماء الجداول والأعمدة ليست بيانات عملاء.

| الجدول | الأعمدة المطلوبة في RC |
| --- | --- |
| CashAdjustment | id, requestId, actorId, direction, amountIqd, reference, note, createdAt |
| Category | id, name, icon |
| Coupon | id, code, discount, active, kind, minSubtotal, maxUses, usedCount, expiresAt, createdAt |
| CustomerAddress | id, userId, label, name, phone, city, address, isDefault, createdAt, updatedAt |
| DeliveryConfig | id, enabled, revision, updatedAt |
| DeliveryRate | province, fee, available |
| DeliverySettingsChange | id, actorId, before, after, createdAt |
| InventoryMovement | id, productId, delta, before, after, reason, referenceId, actorId, createdAt |
| Notification | id, recipientId, kind, title, message, orderId, createdAt, readAt |
| Order | id, userId, customerName, customerPhone, customerAddress, customerCity, total, subtotal, shippingFee, couponCode, discountAmount, status, paymentMethod, createdAt, returnRevision, paymentRevision |
| OrderItem | id, orderId, productId, quantity, price, productName |
| OrderItemCostSnapshot | id, orderItemId, lotId, quantity, unitCostIqd, source, createdAt |
| OrderItemLot | id, orderItemId, lotId, quantity |
| OrderPaymentEvent | id, orderId, requestId, actorId, kind, method, amountIqd, note, createdAt |
| OrderReturn | id, orderId, requestId, actorId, reason, createdAt |
| OrderReturnLine | id, orderReturnId, orderItemId, lotId, quantity, disposition |
| OrderStatusEvent | id, orderId, actorId, actorName, actorRole, kind, fromStatus, toStatus, reason, referenceId, createdAt |
| Product | id, name, description, price, usdPrice, category, brand, icon, image, gallery, specs, sku, model, size, saleUnit, published, lotTracking, purchaseCostIqd, costRevision, badge, stock, createdAt |
| ProductCostChange | id, productId, lotId, actorId, beforeCostIqd, afterCostIqd, revision, createdAt |
| ProductLot | id, productId, code, expiryDate, stock, purchaseCostIqd, costRevision, createdAt |
| PurchaseOrder | id, requestId, supplierId, createdById, status, revision, receiptRevision, invoiceRevision, note, createdAt, updatedAt |
| PurchaseOrderEvent | id, purchaseOrderId, requestId, actorId, action, fromStatus, toStatus, note, createdAt |
| PurchaseOrderLine | id, purchaseOrderId, productId, productName, sku, quantity, unitCostIqd |
| PurchaseReceipt | id, purchaseOrderId, requestId, actorId, note, createdAt |
| PurchaseReceiptLine | id, receiptId, purchaseOrderLineId, quantity, unitCostIqd, lotId, lotCode, expiryDate |
| RevokedSession | tokenHash, userId, expiresAt, createdAt |
| RoleChange | id, actorId, targetId, previousRole, newRole, createdAt |
| StoreExpense | id, requestId, actorId, category, method, amountIqd, reference, note, createdAt |
| StoreSettings | id, siteName, siteDescription, phone, email, address, workingHours, usdToIqdRate, showUsdApprox, bannerEnabled, bannerEyebrow, bannerTitle, bannerDescription, bannerButtonLabel, bannerButtonHref, bannerImage, revision, updatedAt |
| StoreSettingsChange | id, actorId, before, after, createdAt |
| Supplier | id, code, name, contact, phone, email, city, address, note, active, revision, createdAt, updatedAt |
| SupplierInvoice | id, requestId, supplierId, purchaseOrderId, invoiceNumber, amountIqd, invoiceDate, dueDate, note, createdById, paymentRevision, createdAt |
| SupplierPayment | id, invoiceId, requestId, actorId, method, amountIqd, reference, createdAt |
| User | id, name, email, phone, password, role, createdAt |
