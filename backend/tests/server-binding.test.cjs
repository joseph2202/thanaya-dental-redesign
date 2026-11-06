const {test}=require('node:test'),assert=require('node:assert/strict');
const {serverBinding}=require('../dist/config/server');
test('backend defaults to a loopback TCP listener',()=>assert.deepEqual(serverBinding({}),{host:'127.0.0.1',port:4000}));
test('preview refuses a public interface even when explicitly configured',()=>{
 assert.throws(()=>serverBinding({THANAYA_PREVIEW_ONLY:'1',THANAYA_BIND_HOST:'0.0.0.0'}),/loopback/);
 assert.deepEqual(serverBinding({THANAYA_PREVIEW_ONLY:'1',PORT:'4108'}),{host:'127.0.0.1',port:4108});
});
test('non-preview public binding requires an explicit valid setting',()=>{
 assert.deepEqual(serverBinding({THANAYA_BIND_HOST:'0.0.0.0',PORT:'8080'}),{host:'0.0.0.0',port:8080});
 for(const PORT of ['0','-1','3.5','4000x','65536',''])assert.throws(()=>serverBinding({PORT}),/PORT/);
 assert.throws(()=>serverBinding({THANAYA_BIND_HOST:'example.invalid'}),/THANAYA_BIND_HOST/);
});
