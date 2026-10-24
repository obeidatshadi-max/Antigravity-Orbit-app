const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const root=require('node:path').resolve(__dirname,'..')+require('node:path').sep;
global.OrbitCore=require(root+'orbit-core.js');
const {create}=require(root+'orbit-storage.js');
const A=randomUUID(),B=randomUUID(),moment=randomUUID();
const questions=['Thinking','Thinking','Emotional','Behavioral','Physical','Distance','Reactivity','Energy'].map(domain=>({domain}));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const database=new Map();let fail=false,delay=null,readDelay=null,writes=[];
function fixture(user){
 return {from(table){
   const q={eq(){return q;},order(){return q;},select(){return q;},range:async(start,end)=>{
     if(readDelay)await readDelay;
     if(fail)return {error:{message:'offline'}};
     return {data:[...(database.get(table)||new Map()).values()].filter(r=>r.user_id===user.id).slice(start,end+1)};
   },upsert:async(row,options)=>{
     if(delay)await delay;
     if(fail)return {error:{message:'offline'}};
     if(row.user_id!==user.id)return {error:{message:'RLS'}};
     const rows=database.get(table)||new Map();database.set(table,rows);
     const id=row.id||row.moment_id,key=row.user_id+':'+id;
     if(!options.ignoreDuplicates||!rows.has(key))rows.set(key,structuredClone(row));writes.push({table,row});return {data:null};
   }};return q;
 },rpc:async()=>{if(fail)return {error:{message:'offline'}};for(const rows of database.values())for(const [key,row] of rows)if(row.user_id===user.id)rows.delete(key);return {data:null};}};
}
function device(user,storage=memory()) {return {store:create({client:fixture(user),identity:()=>user,storage,questions,randomUUID}),storage};}
const action=()=>({id:randomUUID(),goal:'Speak clearly',text:'Ask one question.',when:'Tuesday',created_at:new Date().toISOString()});
(async()=>{
 const user={id:A},one=device(user);await one.store.load();
 assert.equal(one.store.status().mode,'synced');
 const plan=action();assert.equal((await one.store.save('actions',plan)).synced,true,'Save works after an empty initial load');
 const check={id:randomUUID(),version:'orbit-checkin-v1',answers:Array(8).fill(0),created_at:new Date().toISOString(),score:0,domains:{}};
 await one.store.save('audits',check);
 await one.store.save('reviews',{actionId:plan.id,text:'I tried it.',outcome:'done'});
 await one.store.save('feedback',{moment_id:moment,fit:'disagree'});
 await one.store.save('momentDetails',{moment_id:moment,action:'I asked directly.'});
 const two=device({id:A});await two.store.load();
 assert.equal(two.store.snapshot().actions[0].text,'Ask one question.');assert.equal(two.store.snapshot().audits[0].score,0);
 assert.equal(two.store.snapshot().feedback[moment],'disagree');assert.equal(two.store.snapshot().reviews[0].outcome,'done');assert.equal(two.store.snapshot().momentDetails[moment].action,'I asked directly.');
 const otherPlan=action();await two.store.save('actions',otherPlan);await one.store.load();assert.equal(one.store.snapshot().actions.length,2,'Another device is merged, not overwritten');
 fail=true;const offlinePlan=action();const result=await one.store.save('actions',offlinePlan);assert.equal(result.synced,false);assert.equal(result.kept,true);assert.equal(one.store.status().pending,1);
 const reloaded=device(user,one.storage);assert.ok(reloaded.store.snapshot().actions.find(a=>a.id===offlinePlan.id));
 await reloaded.store.load();assert.equal(reloaded.store.status().mode,'error');assert.equal(reloaded.store.status().pending,1);
 fail=false;await reloaded.store.retry();await two.store.load();assert.equal(two.store.snapshot().actions.length,3);assert.equal(reloaded.store.status().pending,0);
 // Duplicate retries do not duplicate immutable records.
 await one.store.retry();await two.store.load();assert.equal(two.store.snapshot().actions.length,3);
 // A new account cannot inherit another account's in-memory data or pending queue.
 user.id=B;assert.equal(one.store.snapshot().actions.length,0);await one.store.load();assert.equal(one.store.snapshot().audits.length,0);
 user.id=A;assert.equal(one.store.snapshot().actions.length,3);
 // Saving during a refresh waits for the snapshot, then adds the new record.
 let releaseRead;readDelay=new Promise(resolve=>releaseRead=resolve);const refreshing=one.store.load();const duringRefresh=action();const saving=one.store.save('actions',duringRefresh);await new Promise(r=>setTimeout(r,0));releaseRead();await refreshing;await saving;readDelay=null;assert.ok(one.store.snapshot().actions.find(a=>a.id===duringRefresh.id));
 // Import the old per-account browser format and preserve it as an export backup.
 const legacyMem=memory(),legacyPlan=action();legacyMem.setItem('orbit-personal-v1:'+B,JSON.stringify({audits:[{version:'orbit-checkin-v1',answers:Array(8).fill(3),score:100,created_at:new Date().toISOString()}],actions:[legacyPlan],reviews:[{actionId:legacyPlan.id,text:'Legacy review',outcome:'partly',created_at:new Date().toISOString()}]}));
 const legacy=device({id:B},legacyMem);await legacy.store.load();assert.equal(legacy.store.snapshot().reviews.length,1);const legacyId=legacy.store.snapshot().reviews[0].id;await legacy.store.load();assert.equal(legacy.store.snapshot().reviews[0].id,legacyId);assert.ok(legacy.store.exportData().originalBrowserRecords);
 const firstActionWrite=writes.findIndex(w=>w.row.id===legacyPlan.id),firstReviewWrite=writes.findIndex(w=>w.row.action_id===legacyPlan.id);assert.ok(firstActionWrite<firstReviewWrite);
 // Pending writes never change account identity midway through a request.
 let release;delay=new Promise(resolve=>release=resolve);const blocked=one.store.save('actions',action());await new Promise(r=>setTimeout(r,0));user.id=B;release();await blocked;delay=null;assert.equal(one.store.snapshot().reviews.length,0);user.id=A;await one.store.retry();
 // Example data never enters the account database.
 const before=writes.length,demo=device({id:'orbit-example',demo:true});await demo.store.load();await demo.store.save('actions',action());assert.equal(writes.length,before);assert.equal(demo.store.status().mode,'demo');
 // Failure in both storage layers must not claim durable saving.
 fail=true;const bad=device({id:A},{getItem:()=>null,setItem:()=>{throw new Error('quota');},removeItem:()=>{}});await bad.store.load();const badResult=await bad.store.save('actions',action());assert.equal(badResult.kept,false);assert.match(bad.store.status().error,/Not saved/);fail=false;
 // Deletion is scoped, and a fresh device sees the deletion without re-uploading cache.
 await two.store.removeAll();await reloaded.store.load();assert.equal(reloaded.store.snapshot().actions.length,0);await legacy.store.load();assert.equal(legacy.store.snapshot().actions.length,1);
 console.log('PASS: cross-device retrieval, concurrent devices, zero scores, offline/reload/retry, idempotency, legacy migration, account switching, sample isolation, storage failure, export and scoped deletion.');
})().catch(e=>{console.error(e);process.exitCode=1;});
