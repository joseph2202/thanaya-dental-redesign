// Sanity checks for the *actual* preview seed used to show the shop on a Mac.
// All operations happen under a unique OS temp directory; never real dev.db.
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path');
const cwd=path.resolve(__dirname,'..');
const root=mkdtempSync(path.join(os.tmpdir(),'thanaya-preview-'));
const url='file:'+path.join(root,'preview.sqlite');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,
 THANAYA_PREVIEW_ROOT:root,THANAYA_PREVIEW_ONLY:'1'};
let db;
async function main(){
 try{
  const check=spawnSync('bash',['-n',path.join(cwd,'../scripts/preview-local.sh')],
    {cwd,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  const install=spawnSync(path.join(cwd,'node_modules','.bin','prisma'),['db','push','--skip-generate'],
    {cwd,env,encoding:'utf8',timeout:90000});
  assert.equal(install.status,0,install.stderr+' '+install.stdout);
  const seed=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],
    {cwd,env,encoding:'utf8',timeout:45000});
  assert.equal(seed.status,0,seed.stderr+' '+seed.stdout);
  assert.match(seed.stdout,/THANAYA PRIVATE PREVIEW — DEMO ONLY/);
  process.env.DATABASE_URL=url;
  const {PrismaClient}=require('@prisma/client');
  db=new PrismaClient({datasources:{db:{url}}});
  assert.equal(await db.user.count(),2);
  assert.equal(await db.product.count(),3);
  assert.equal(await db.order.count(),2);
  assert.equal(await db.supplierInvoice.count(),1);
  assert.equal(await db.supplierPayment.count(),1);
  assert.equal(await db.orderItemCostSnapshot.count(),2);
  const bad=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],
    {cwd,env:{...env,THANAYA_PREVIEW_ONLY:'0'},encoding:'utf8',timeout:15000});
  assert.notEqual(bad.status,0,'must reject non-preview execution');
  const rerun=spawnSync(process.execPath,['scripts/seed_isolated_preview.cjs'],
    {cwd,env,encoding:'utf8',timeout:15000});
  assert.notEqual(rerun.status,0,'never overwrite an existing preview DB');
  console.log('PASS preview: real isolated seed, demo invoice and margin, safe refusal and bash syntax');
 }finally{
  if(db)await db.$disconnect();
  rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 }
}
main().catch(e=>{console.error('PREVIEW SMOKE FAILED',e);process.exitCode=1;});
