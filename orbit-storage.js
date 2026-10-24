/* Per-record sync avoids overwriting another device's entire report history. */
(function(root){
  'use strict';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const tables={audits:'orbit_checkins',actions:'orbit_actions',reviews:'orbit_reviews',feedback:'orbit_feedback',momentDetails:'orbit_moment_details'};
  const empty=()=>({audits:[],actions:[],reviews:[],feedback:{},momentDetails:{}});
  const clone=value=>JSON.parse(JSON.stringify(value));
  function create({client,identity,storage,questions,onChange=()=>{},randomUUID=()=>crypto.randomUUID()}){
    const states=new Map();
    function owner(){const u=identity();return u?.id&&!u.demo&&!u.anonymous&&UUID.test(u.id)?u.id:null;}
    function key(){return identity()?.demo?'example':owner()||'guest';}
    function state(){
      const id=key();
      if(!states.has(id)){
        let saved;try{saved=JSON.parse(storage.getItem('orbit-sync-v2:'+id)||'null');}catch{}
        states.set(id,{id,data:{...empty(),...saved?.data},pending:saved?.pending||[],imported:!!saved?.imported,status:id==='example'?'demo':'loading',error:'',busy:null,loading:null,importWarning:''});
      }
      return states.get(id);
    }
    function persist(s){
      try{storage.setItem('orbit-sync-v2:'+s.id,JSON.stringify({data:s.data,pending:s.pending,imported:s.imported}));s.durable=true;return true;}
      catch{s.durable=false;s.error='The browser could not keep a backup. Keep this page open until your account save succeeds.';return false;}
    }
    function emit(s){if(s.id===key())onChange(status());}
    function status(){const s=state();return {mode:s.status,pending:s.pending.length,error:s.error,importWarning:s.importWarning};}
    function snapshot(){return clone(state().data);}
    function setRecord(data,kind,id,record){
      if(kind==='feedback')data.feedback[id]=record.fit;
      else if(kind==='momentDetails')data.momentDetails[id]={action:record.action,trigger_cat:record.trigger_cat,action_type:record.action_type};
      else {const index=data[kind].findIndex(r=>r.id===id);if(index<0)data[kind].push(record);else data[kind][index]=record;data[kind].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));}
    }
    function row(kind,record,id){
      const base={user_id:id};
      if(kind==='audits')return {...base,id:record.id,version:record.version,answers:record.answers,created_at:record.created_at};
      if(kind==='actions')return {...base,id:record.id,goal:record.goal,text:record.text,when_text:record.when,created_at:record.created_at};
      if(kind==='reviews')return {...base,id:record.id,action_id:record.actionId,outcome:record.outcome,text:record.text,created_at:record.created_at};
      if(kind==='feedback')return {...base,moment_id:record.moment_id,fit:record.fit,updated_at:record.updated_at};
      return {...base,moment_id:record.moment_id,action:record.action,trigger_cat:record.trigger_cat||'',action_type:record.action_type||'',updated_at:record.updated_at};
    }
    function fromRow(kind,r){
      if(kind==='audits')return {id:r.id,version:r.version,answers:r.answers,created_at:r.created_at,...root.OrbitCore.scoreAnswers(questions,r.answers)};
      if(kind==='actions')return {id:r.id,goal:r.goal,text:r.text,when:r.when_text,created_at:r.created_at};
      if(kind==='reviews')return {id:r.id,actionId:r.action_id,outcome:r.outcome,text:r.text,created_at:r.created_at};
      return r;
    }
    function queue(s,kind,id,record){
      setRecord(s.data,kind,id,record);
      const op={kind,id,record:clone(record),token:randomUUID()};
      const old=s.pending.findIndex(p=>p.kind===kind&&p.id===id);
      if(old<0)s.pending.push(op);else s.pending[old]=op;
      s.status='pending';persist(s);emit(s);
    }
    function importLegacy(s){
      if(s.imported)return;
      let legacy;try{legacy=JSON.parse(storage.getItem('orbit-personal-v1:'+s.id)||'null');}catch{}
      let invalid=0;
      for(const kind of ['audits','actions','reviews'])for(const r of legacy?.[kind]||[]){
        if(!r.id)r.id=randomUUID();
        const valid=UUID.test(r.id)&&Number.isFinite(Date.parse(r.created_at)) && (kind!=='audits'||(r.version==='orbit-checkin-v1'&&Array.isArray(r.answers)&&r.answers.length===8));
        if(valid)queue(s,kind,r.id,r);else invalid++;
      }
      for(const [id,fit] of Object.entries(legacy?.feedback||{})){
        if(UUID.test(id))queue(s,'feedback',id,{moment_id:id,fit,updated_at:new Date().toISOString()});else invalid++;
      }
      for(const [id,detail] of Object.entries(legacy?.momentDetails||{})){
        if(UUID.test(id)&&detail.action)queue(s,'momentDetails',id,{...detail,moment_id:id,updated_at:new Date().toISOString()});else invalid++;
      }
      s.imported=true;
      if(invalid)s.importWarning='Some older entries could not be synced. The original browser records are retained; export them before clearing browser data.';
      persist(s);
    }
    async function flush(s=state()){
      if(s.id!==owner()){if(s.id==='example'){s.status='demo';persist(s);}emit(s);return {synced:false};}
      if(s.busy)return s.busy;
      const id=s.id;
      s.busy=Promise.resolve().then(async()=>{
        s.error='';
        try{
          // Parents before children, including migrated data and retries.
          const priority={audits:0,actions:1,reviews:2,feedback:3,momentDetails:4};
          while(s.pending.length){
            if(owner()!==id)throw new Error('Account changed before synchronization finished.');
            const op=[...s.pending].sort((a,b)=>priority[a.kind]-priority[b.kind])[0];
            const immutable=['audits','actions','reviews'].includes(op.kind);
            const {error}=await client.from(tables[op.kind]).upsert(row(op.kind,op.record,id),{onConflict:immutable?'user_id,id':'user_id,moment_id',ignoreDuplicates:immutable});
            if(error)throw new Error('Your account save did not finish. Your entry is waiting to sync; retry when connected.');
            if(owner()!==id)throw new Error('Account changed before synchronization finished.');
            s.pending=s.pending.filter(p=>p.token!==op.token);persist(s);
          }
          s.status='synced';s.error='';persist(s);emit(s);return {synced:true,kept:s.durable};
        }catch(error){s.status='pending';s.error=error.message;persist(s);if(s.durable===false)s.error='Not saved in your account or browser. Keep this page open and copy your entry before leaving.';emit(s);return {synced:false,kept:s.durable,error:s.error};}
        finally{s.busy=null;}
      });
      return s.busy;
    }
    async function fetchRows(table,id){
      const rows=[];
      for(let start=0;;start+=500){
        const order=table==='orbit_feedback'||table==='orbit_moment_details'?'moment_id':'id';
        const result=await client.from(table).select('*').eq('user_id',id).order(order).range(start,start+499);
        if(result.error)throw new Error('Could not load your account history. A browser backup may be shown; reconnect and retry.');
        rows.push(...(result.data||[]));if((result.data||[]).length<500)return rows;
      }
    }
    async function load(){
      const s=state(),id=owner();
      if(!id){s.status=s.id==='example'?'demo':'local';emit(s);return snapshot();}
      if(s.loading)return s.loading;
      s.loading=(async()=>{
        s.status='loading';emit(s);importLegacy(s);
        try{
          // Finish acknowledged writes before fetching a new account snapshot.
          if(s.busy)await s.busy;
          if(owner()!==id)return null;
          const results=await Promise.all(Object.entries(tables).map(async([kind,table])=>[kind,await fetchRows(table,id)]));
          if(owner()!==id)return null;
          const remote=empty();
          for(const [kind,rows] of results)for(const r of rows){const record=fromRow(kind,r);setRecord(remote,kind,r.id||r.moment_id,record);}
          for(const p of s.pending)setRecord(remote,p.kind,p.id,p.record);
          s.data=remote;persist(s);
          await flush(s);
          return snapshot();
        }catch(error){s.status='error';s.error=error.message;emit(s);return snapshot();}
        finally{s.loading=null;}
      })();
      return s.loading;
    }
    async function save(kind,record){
      const s=state();
      // A refresh must not replace a record just acknowledged by an overlapping save.
      if(s.loading)await s.loading;
      if(s.id!==key())throw new Error('Your account changed before this entry could be saved.');
      if(!tables[kind])throw new Error('Unsupported record type');
      if(s.id!=='example'&&!owner())throw new Error('Sign in to save to your account.');
      const r=clone(record);
      if(['audits','actions','reviews'].includes(kind)){r.id ||= randomUUID();r.created_at ||= new Date().toISOString();}
      else r.updated_at=new Date().toISOString();
      const id=r.id||r.moment_id;
      if(s.id!=='example'&&!UUID.test(id||''))throw new Error('This record has no valid account identifier.');
      if(s.id==='example'){setRecord(s.data,kind,id,r);const kept=persist(s);emit(s);return {synced:false,demo:true,kept};}
      queue(s,kind,id,r);return flush(s);
    }
    async function removeAll(){
      const s=state(),id=owner();
      if(s.loading)await s.loading;if(s.busy)await s.busy;
      if(s.id!=='example'){
        if(!id||id!==owner())throw new Error('Sign in to delete your account records.');
        const {error}=await client.rpc('orbit_delete_personal_records');
        if(error)throw new Error('Deletion did not finish. Your records have been retained.');
        if(owner()!==id)throw new Error('Account changed while deleting records.');
      }
      s.data=empty();s.pending=[];s.imported=true;s.status=s.id==='example'?'demo':'synced';s.error='';
      storage.removeItem('orbit-personal-v1:'+s.id);persist(s);emit(s);
    }
    function exportData(){
      const s=state();let originalBrowserRecords=null;
      try{originalBrowserRecords=JSON.parse(storage.getItem('orbit-personal-v1:'+s.id)||'null');}catch{}
      return {format:'orbit-personal-export-v2',exported_at:new Date().toISOString(),account:s.id,records:snapshot(),pending:s.pending.map(p=>({kind:p.kind,id:p.id})),originalBrowserRecords};
    }
    return {load,save,retry:async()=>{await flush();return load();},snapshot,status,removeAll,exportData};
  }
  root.OrbitStorage={create};
  if(typeof module!=='undefined')module.exports=root.OrbitStorage;
})(typeof window==='undefined'?globalThis:window);
