import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ProviderError} from './paymentProvider';

const blocked=()=>new ProviderError(404,'sandbox_disabled','محاكي الدفع غير متاح في هذه البيئة');
// This prevents accidental live-store use. The OS administrator is trusted;
// it is not a defense against somebody deliberately forging the whole preview.
export function paymentSandboxLocation(env:NodeJS.ProcessEnv=process.env){
 if(env.NODE_ENV==='production'||env.THANAYA_PAYMENT_SANDBOX!=='1'||env.THANAYA_PREVIEW_ONLY!=='1'||
  !env.THANAYA_PREVIEW_ROOT||!env.DATABASE_URL||!/^[a-f0-9]{64}$/.test(env.THANAYA_PAYMENT_MOCK_SECRET||''))throw blocked();
 try{
  const root=path.resolve(env.THANAYA_PREVIEW_ROOT),temp=fs.realpathSync(os.tmpdir());
  if(fs.lstatSync(root).isSymbolicLink()||fs.realpathSync(root)!==root||
   !root.startsWith(temp+path.sep)||!path.basename(root).startsWith('thanaya-preview-')||
   (fs.statSync(root).mode&0o077)!==0)throw blocked();
  const database=path.join(root,'preview.sqlite'),journal=path.join(root,'payment-sandbox.sqlite');
  if(env.DATABASE_URL!=='file:'+database||fs.lstatSync(database).isSymbolicLink()||
   !fs.statSync(database).isFile()||fs.realpathSync(database)!==database)throw blocked();
  const markerPath=path.join(root,'payment-sandbox.json');
  if(fs.lstatSync(markerPath).isSymbolicLink()||(fs.statSync(markerPath).mode&0o077)!==0)throw blocked();
  const marker=JSON.parse(fs.readFileSync(markerPath,'utf8'));
  const stat=fs.statSync(database);
  if(marker.kind!=='thanaya-synthetic-preview-v1'||marker.database!==database||
   marker.device!==stat.dev||marker.inode!==stat.ino)throw blocked();
  if(fs.existsSync(journal)&&(fs.lstatSync(journal).isSymbolicLink()||!fs.statSync(journal).isFile()))throw blocked();
  return {journal,secret:Buffer.from(env.THANAYA_PAYMENT_MOCK_SECRET!,'hex')};
 }catch(error){if(error instanceof ProviderError)throw error;throw blocked();}
}
