import type {Prisma} from '@prisma/client';

export class OrderHistoryError extends Error {
  constructor(public status:number,message:string){super(message);}
}

type StatusEvidence={
  orderId:string;actorId:string;kind:'placed'|'status_changed'|'full_return';
  fromStatus:string|null;toStatus:string;reason?:string;referenceId?:string;
};

// Called only within the transaction that changes the order/stock. A failure
// rolls back both the action and its evidence; no separate best-effort logging.
export async function recordOrderStatus(tx:Prisma.TransactionClient,input:StatusEvidence){
  const actor=await tx.user.findUnique({where:{id:input.actorId},select:{name:true,role:true}});
  if(!actor)throw new OrderHistoryError(401,'تعذّر التحقق من منفّذ الإجراء');
  const roles=input.kind==='full_return'?['owner','admin']:['owner','admin','sales'];
  if(input.kind!=='placed'&&!roles.includes(actor.role))
    throw new OrderHistoryError(403,'تغيّرت صلاحية تنفيذ الإجراء؛ حدّث الصفحة');
  return tx.orderStatusEvent.create({data:{
    ...input,actorName:actor.name,actorRole:actor.role
  }});
}
