export function serverBinding(env:NodeJS.ProcessEnv=process.env){
  const raw=env.PORT??'4000';
  if(!/^[0-9]{1,5}$/.test(raw)||Number(raw)<1||Number(raw)>65535)throw new Error('PORT must be an integer from 1 to 65535');
  const host=env.THANAYA_BIND_HOST??'127.0.0.1';
  if(!['127.0.0.1','0.0.0.0'].includes(host))throw new Error('THANAYA_BIND_HOST must be 127.0.0.1 or an explicitly configured 0.0.0.0');
  if(env.THANAYA_PREVIEW_ONLY==='1'&&host!=='127.0.0.1')throw new Error('Private preview must bind to loopback');
  return {port:Number(raw),host};
}
