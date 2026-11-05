import type {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MockProviderRecord,MockProviderRepository} from './mockPaymentProvider';
import {ProviderError,ProviderObservation,ProviderSnapshot,parseProviderObservation,reconcileProviderObservation} from './paymentProvider';

export type SandboxActor={id:string;name:string};
type Source='created'|'webhook'|'reconciliation';
type Row=Record<string,string|number|bigint|Uint8Array|null>;
export class PaymentSandboxJournal implements MockProviderRepository{
 private constructor(private db:DatabaseSync){}
 static async open(file:string){
  // Lazy: the normal shop never loads node:sqlite or opens a sandbox file.
  const {DatabaseSync}=await import('node:sqlite');
  const existed=fs.existsSync(file);
  const db=new DatabaseSync(file,{enableForeignKeyConstraints:true,allowExtension:false});
  if(existed){
   const application=db.prepare('PRAGMA application_id').get() as Row;
   const version=db.prepare('PRAGMA user_version').get() as Row;
   if(application.application_id!==1414024258||version.user_version!==1){
    db.close();throw new ProviderError(503,'unknown_journal','ملف المحاكي غير معروف؛ لم يجر تحديثه');
   }
  }
  fs.chmodSync(file,0o600);
  db.exec(`PRAGMA busy_timeout=5000;
   BEGIN IMMEDIATE;
   CREATE TABLE IF NOT EXISTS provider_records(
    reference TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,
    sequence INTEGER NOT NULL CHECK(sequence>=1),record_json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS intents(
    reference TEXT PRIMARY KEY REFERENCES provider_records(reference),order_id TEXT NOT NULL,
    amount_iqd INTEGER NOT NULL CHECK(amount_iqd BETWEEN 1 AND 2000000000),
    snapshot_json TEXT NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS intents_order_idx ON intents(order_id);
   CREATE TABLE IF NOT EXISTS event_receipts(
    event_id TEXT PRIMARY KEY,reference TEXT NOT NULL REFERENCES intents(reference),
    sequence INTEGER NOT NULL,content_hash TEXT NOT NULL,status TEXT NOT NULL,
    refunded_iqd INTEGER NOT NULL,source TEXT NOT NULL,outcome TEXT NOT NULL,
    actor_id TEXT,actor_name TEXT,occurred_at TEXT NOT NULL,recorded_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS events_reference_idx ON event_receipts(reference,sequence);
   PRAGMA application_id=1414024258;
   PRAGMA user_version=1;
   COMMIT;`);
  return new PaymentSandboxJournal(db);
 }
 close(){this.db.close();}
 private transaction<T>(action:()=>T):T{
  this.db.exec('BEGIN IMMEDIATE');
  try{const result=action();this.db.exec('COMMIT');return result;}
  catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 async createIfAbsent(record:MockProviderRecord){
  this.db.prepare('INSERT INTO provider_records(reference,request_id,sequence,record_json) VALUES(?,?,?,?) ON CONFLICT(request_id) DO NOTHING')
   .run(record.reference,record.requestId,record.sequence,JSON.stringify(record));
  const saved=this.db.prepare('SELECT record_json FROM provider_records WHERE request_id=?').get(record.requestId) as Row;
  return JSON.parse(saved.record_json as string) as MockProviderRecord;
 }
 async get(reference:string){
  const row=this.db.prepare('SELECT record_json FROM provider_records WHERE reference=?').get(reference) as Row|undefined;
  return row?JSON.parse(row.record_json as string) as MockProviderRecord:null;
 }
 async compareAndSwap(next:MockProviderRecord,expectedSequence:number){
  const result=this.db.prepare('UPDATE provider_records SET sequence=?,record_json=? WHERE reference=? AND sequence=?')
   .run(next.sequence,JSON.stringify(next),next.reference,expectedSequence);
  return Number(result.changes)===1;
 }
 createIntent(payment:ProviderSnapshot,actor:SandboxActor){
  return this.transaction(()=>{
   const row=this.db.prepare('SELECT snapshot_json FROM intents WHERE reference=?').get(payment.reference) as Row|undefined;
   if(row)return JSON.parse(row.snapshot_json as string) as ProviderSnapshot;
   if(payment.status!=='pending'||payment.sequence!==1)
    throw new ProviderError(409,'missing_intent','يلزم مراجعة محاولة المحاكي التي لم يحفظ أصلها');
   this.db.prepare('INSERT INTO intents VALUES(?,?,?,?,?,?,?)').run(payment.reference,payment.orderId,
    payment.amountIqd,JSON.stringify(payment),actor.id,actor.name,new Date().toISOString());
   return payment;
  });
 }
 intent(reference:string){
  const row=this.db.prepare('SELECT snapshot_json FROM intents WHERE reference=?').get(reference) as Row|undefined;
  if(!row)throw new ProviderError(404,'intent_not_found','محاولة المحاكي غير موجودة');
  return JSON.parse(row.snapshot_json as string) as ProviderSnapshot;
 }
 // Atomic event uniqueness and normalized state update. No raw body or card
 // field is retained. The caller already verified the signature/query.
 accept(observations:ProviderObservation[],source:Source,actor?:SandboxActor){
  return this.transaction(()=>observations.map(value=>{
   const event=parseProviderObservation(value),current=this.intent(event.reference);
   const hash=createHash('sha256').update(JSON.stringify(Object.keys(event).sort().map(key=>[key,event[key as keyof ProviderObservation]]))).digest('hex');
   const seen=this.db.prepare('SELECT content_hash FROM event_receipts WHERE event_id=?').get(event.eventId) as Row|undefined;
   if(seen){
    if(seen.content_hash!==hash)throw new ProviderError(409,'conflicting_event_id','معرّف إشعار أعيد بمحتوى مختلف');
    return {outcome:'duplicate' as const,payment:current};
   }
   const result=reconcileProviderObservation(current,event);
   this.db.prepare('INSERT INTO event_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
    event.eventId,event.reference,event.sequence,hash,event.status,event.refundedIqd,source,result.outcome,
    actor?.id??null,actor?.name??null,event.occurredAt,new Date().toISOString());
   if(result.outcome==='updated')this.db.prepare('UPDATE intents SET snapshot_json=? WHERE reference=?')
    .run(JSON.stringify(result.payment),event.reference);
   return result;
  }));
 }
 list(){
  return (this.db.prepare('SELECT snapshot_json,actor_name,created_at FROM intents ORDER BY rowid DESC LIMIT 20').all() as Row[])
   .map(row=>({payment:JSON.parse(row.snapshot_json as string) as ProviderSnapshot,createdBy:row.actor_name,createdAt:row.created_at}));
 }
 history(reference:string){
  this.intent(reference);
  return this.db.prepare('SELECT event_id AS eventId,sequence,status,refunded_iqd AS refundedIqd,source,outcome,actor_name AS actorName,occurred_at AS occurredAt,recorded_at AS recordedAt FROM event_receipts WHERE reference=? ORDER BY sequence,event_id LIMIT 100').all(reference);
 }
}
