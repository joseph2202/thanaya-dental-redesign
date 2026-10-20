import {Router,Request,Response,NextFunction} from 'express';
import {Prisma,PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import {getJwtSecret} from '../config/auth';
import {isProvince} from './delivery';

const router=Router(),prisma=new PrismaClient();
class AddressError extends Error {constructor(public status:number,message:string){super(message)}}
type AddressBody={label:string;name:string;phone:string;city:string;address:string};

async function requireCustomer(req:Request,res:Response,next:NextFunction){
  const auth=req.headers.authorization;
  if(!auth?.startsWith('Bearer ')){res.status(401).json({error:'سجّل الدخول لإدارة عناوينك'});return}
  try{
    const token=jwt.verify(auth.slice(7),getJwtSecret());
    if(typeof token==='string'||typeof token.userId!=='string'){res.status(401).json({error:'جلسة غير صالحة'});return}
    const user=await prisma.user.findUnique({where:{id:token.userId},select:{id:true}});
    if(!user){res.status(401).json({error:'الحساب غير موجود'});return}
    res.locals.addressUserId=user.id;
    next();
  }catch(e){
    if(e instanceof jwt.JsonWebTokenError){res.status(401).json({error:'انتهت الجلسة، سجّل الدخول مجدداً'});return}
    next(e);
  }
}
router.use(requireCustomer);

function clean(body:unknown):AddressBody {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AddressError(400,'بيانات العنوان غير صالحة');
  const x=body as Record<string,unknown>;
  const keys=['label','name','phone','city','address'];
  if(Object.keys(x).some(key=>!keys.includes(key)))throw new AddressError(400,'حقول العنوان غير صالحة');
  const value=(key:string)=>typeof x[key]==='string'?x[key].trim():'';
  const label=value('label'),name=value('name'),phone=value('phone'),city=value('city'),address=value('address');
  if(!label||label.length>40||name.length<2||name.length>120||!/^07\d{9}$/.test(phone)||
      !isProvince(city)||address.length<5||address.length>500){
    throw new AddressError(400,'تحقق من اسم العنوان والمستلم والهاتف والمحافظة والعنوان التفصيلي');
  }
  return {label,name,phone,city,address};
}
function fail(res:Response,e:unknown){
  if(e instanceof AddressError){res.status(e.status).json({error:e.message});return}
  if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2028'].includes(e.code)){
    res.status(409).json({error:'تغيّرت العناوين أثناء الحفظ، أعد المحاولة'});return
  }
  console.error('saved addresses',e);
  res.status(500).json({error:'تعذّر حفظ العنوان'});
}
const userId=(res:Response):string=>res.locals.addressUserId as string;

router.get('/',async(_req,res)=>{
  try{
    const rows=await prisma.customerAddress.findMany({where:{userId:userId(res)},orderBy:[{isDefault:'desc'},{createdAt:'asc'},{id:'asc'}]});
    res.json(rows);
  }catch(e){fail(res,e)}
});

router.post('/',async(req,res)=>{
  try{
    const fields=clean(req.body),owner=userId(res);
    const created=await prisma.$transaction(async tx=>{
      const count=await tx.customerAddress.count({where:{userId:owner}});
      if(count>=5)throw new AddressError(409,'الحد الأقصى خمسة عناوين محفوظة');
      return tx.customerAddress.create({data:{...fields,userId:owner,isDefault:count===0}});
    });
    res.status(201).json(created);
  }catch(e){fail(res,e)}
});

router.put('/:id',async(req,res)=>{
  try{
    const fields=clean(req.body),owner=userId(res),id=String(req.params.id);
    const changed=await prisma.customerAddress.updateMany({where:{id,userId:owner},data:fields});
    if(changed.count===0)throw new AddressError(404,'العنوان غير موجود');
    res.json(await prisma.customerAddress.findUniqueOrThrow({where:{id}}));
  }catch(e){fail(res,e)}
});

router.post('/:id/default',async(req,res)=>{
  try{
    const owner=userId(res),id=String(req.params.id);
    const address=await prisma.$transaction(async tx=>{
      const own=await tx.customerAddress.findFirst({where:{id,userId:owner}});
      if(!own)throw new AddressError(404,'العنوان غير موجود');
      await tx.customerAddress.updateMany({where:{userId:owner,isDefault:true},data:{isDefault:false}});
      return tx.customerAddress.update({where:{id},data:{isDefault:true}});
    });
    res.json(address);
  }catch(e){fail(res,e)}
});

router.delete('/:id',async(req,res)=>{
  try{
    const owner=userId(res),id=String(req.params.id);
    await prisma.$transaction(async tx=>{
      const own=await tx.customerAddress.findFirst({where:{id,userId:owner}});
      if(!own)throw new AddressError(404,'العنوان غير موجود');
      await tx.customerAddress.deleteMany({where:{id,userId:owner}});
      if(own.isDefault){
        const replacement=await tx.customerAddress.findFirst({where:{userId:owner},orderBy:[{createdAt:'asc'},{id:'asc'}]});
        if(replacement)await tx.customerAddress.update({where:{id:replacement.id},data:{isDefault:true}});
      }
    });
    res.json({deleted:true});
  }catch(e){fail(res,e)}
});
export default router;
