// One-time local bootstrap. Explicitly select your EXISTING administrator email.
// No account creation, password changes, or automatic selection.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main(){
 const email=process.argv[2]?.trim().toLowerCase();
 if(!email||process.argv.length!==3){console.error('Usage: node scripts/bootstrap-owner.cjs YOUR_EXISTING_ADMIN_EMAIL');process.exitCode=1;return;}
 if(await prisma.user.count({where:{role:'owner'}})){console.error('STOP: owner already exists; nothing changed');process.exitCode=1;return;}
 const user=await prisma.user.findUnique({where:{email},select:{id:true,email:true,role:true}});
 if(!user||user.role!=='admin'){console.error('STOP: exact email not found as an existing admin; nothing changed');process.exitCode=1;return;}
 const changed=await prisma.user.updateMany({where:{id:user.id,role:'admin'},data:{role:'owner'}});
 if(changed.count!==1)throw new Error('Concurrent role change; nothing promoted');
 console.log('OWNER_ENABLED:',user.email,'Existing login and password preserved.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
