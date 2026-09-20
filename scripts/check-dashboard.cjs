// npm install --prefix .verification --cache .verification/npm-cache --no-save --package-lock=false jsdom
// node scripts/check-dashboard.cjs [--live]
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {JSDOM}=require('../.verification/node_modules/jsdom');
const html=fs.readFileSync('index.html','utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean).join('\n');
new vm.Script(source);
const clone=x=>JSON.parse(JSON.stringify(x));
function page(){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/'});
 const w=dom.window;
 const run=s=>vm.runInContext(s,dom.getInternalVMContext());
 run(source.replace('renderGroups();updateSummary();initDatabase();','renderGroups();updateSummary();'));
 return {dom,w,run,doc:w.document};
}
function mockDb(initial){
 const state={rows:clone(initial),writes:0,fail:false,beforeUpdate:null,event:null};
 const db={from(){
  let kind='select',value,options,filters=[];
  const q={select(){return q},update(v){kind='update';value=clone(v);return q},upsert(v,o){kind='upsert';value=clone(v);options=o;return q},eq(k,v){filters.push([k,v]);return q},then(resolve,reject){return Promise.resolve().then(()=>{
   if(state.fail&&kind!=='select')return {data:null,error:{message:'simulated failure'}};
   if(kind==='update'){
    state.beforeUpdate?.(state,filters);state.beforeUpdate=null;
    for(const row of state.rows){if(filters.every(([k,v])=>k==='owners'?'{'+row.owners.map(JSON.stringify).join(',')+'}'===v:row[k]===v)){Object.assign(row,value);state.writes++}}
   }
   if(kind==='upsert')for(const v of Array.isArray(value)?value:[value]){
    const row=state.rows.find(r=>r.task_id===v.task_id);
    if(row&&options?.ignoreDuplicates)continue;
    if(row)Object.assign(row,v);else state.rows.push({updated_at:'2026-09-20T12:00:00Z',...v});state.writes++;
   }
   return {data:clone(state.rows),error:null};
  }).then(resolve,reject)}};return q;
 },channel(){return {on(_,__,fn){state.event=fn;return this},subscribe(fn){fn('SUBSCRIBED');return this}}}};
 return {db,state};
}
async function offline(){
 const p=page(), {run,doc,w}=p;
 const defaults=clone(run('allSteps()'));
 assert.equal(defaults.length,11);assert.deepEqual(defaults.map(s=>s.id),['m1','m4','m5','m6','m8','d1','d2','d3','d4','e1','e2']);
 assert.equal(doc.querySelectorAll('#timelineDates > div').length,20);
 assert.equal(run('pct("2026-09-22")'),2.5);assert.equal(run('pct("2026-10-11")'),97.5);
 assert.equal(doc.querySelector('#statGroups').textContent,'3');
 assert.equal(doc.querySelector('#statSteps').textContent,'11');
 assert(defaults.slice(0,9).every(s=>s.status==='未开始'));
 assert.equal(run('ownerText(["史圣田","周圣昌","廖璇"])'),'周圣昌 · 廖璇 · 史圣田');
 const old=clone(run('oldDefaultOwners'));
 const rows=defaults.map(s=>({task_id:s.id,owners:old[s.id]||s.owners,status:'进行中',updated_at:'2026-09-20T00:00:00Z'}));
 rows.find(r=>r.task_id==='d3').owners=['廖璇'];
 rows.push({task_id:'m2',owners:['周圣昌'],status:'已完成',updated_at:'2026-09-20T00:00:00Z'});
 const {db,state}=mockDb(rows);w.testDb=db;run('db=testDb');
 state.beforeUpdate=(s)=>{const r=s.rows.find(r=>r.task_id==='m5');r.owners=['史圣田'];r.updated_at='2026-09-20T01:00:00Z'};
 w.snapshot=clone(rows);await run('migrateOwners(snapshot)');
 assert.deepEqual(state.rows.find(r=>r.task_id==='m4').owners,['廖璇']);
 assert.deepEqual(state.rows.find(r=>r.task_id==='m5').owners,['史圣田']);
 assert.deepEqual(state.rows.find(r=>r.task_id==='d3').owners,['廖璇']);
 assert(state.rows.filter(r=>r.task_id!=='m2'&&!r.task_id.startsWith('__')).every(r=>r.status==='进行中'));
 assert.deepEqual(state.rows.find(r=>r.task_id==='m2'),rows.at(-1));
 state.rows.find(r=>r.task_id==='m4').owners=['待分配'];
 const writes=state.writes;w.snapshot=clone(state.rows);await run('migrateOwners(snapshot)');assert.equal(state.writes,writes);
 w.MEM_CONFIG={SUPABASE_URL:'https://example.test',SUPABASE_KEY:'test'};w.supabase={createClient:()=>db};
 await run('initDatabase()');assert.equal(doc.querySelector('#statDoing').textContent,'11');
 assert.equal(doc.querySelector('#statDone').textContent,'0');
 run('now.setTime(new Date("2026-09-20T00:00:00").getTime());updateSummary()');
 assert(doc.querySelector('#nextCard').textContent.includes('09 / 22'));
 const btn=doc.querySelector('[data-step-id="m8"] .owner-button');btn.click();
 let picker=doc.querySelector('[data-step-id="m8"] .owner-picker');
 assert(picker.classList.contains('open'));
 picker.querySelector('input[value="王玺"]').click();await new Promise(r=>setTimeout(r,0));
 assert(picker.classList.contains('open'));assert(state.rows.find(r=>r.task_id==='m8').owners.includes('王玺'));
 state.event({new:clone(state.rows.find(r=>r.task_id==='m8'))});
 picker=doc.querySelector('[data-step-id="m8"] .owner-picker');assert(picker.classList.contains('open'));
 picker.querySelector('.owner-close').click();assert(!picker.classList.contains('open'));
 doc.querySelector('[data-step-id="m8"] .owner-button').click();doc.body.click();assert(!picker.classList.contains('open'));
 const sel=doc.querySelector('[data-step-id="m1"] select');sel.value='已完成';sel.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(doc.querySelector('#syncText').textContent,'保存中');await new Promise(r=>setTimeout(r,0));
 assert.equal(doc.querySelector('#syncText').textContent,'已同步');assert.equal(state.rows.find(r=>r.task_id==='m1').status,'已完成');
 assert.equal(doc.querySelector('#statDone').textContent,'1');
 state.fail=true;await run('saveStep(findStep("m1"))');assert.equal(doc.querySelector('#syncText').textContent,'保存失败');
 const failed=page(), failing=mockDb(rows);failing.state.fail=true;failed.w.testDb=failing.db;failed.w.snapshot=rows;failed.run('db=testDb');
 await assert.rejects(failed.run('migrateOwners(snapshot)'));assert(!failing.state.rows.some(r=>r.task_id.startsWith('__migration')));
 failed.dom.window.close();p.dom.window.close();
 console.log('PASS: syntax, 11 tasks/3 groups/20 dates, owner ordering, migration preservation/CAS/once-only/failure, multi-select/close, status saving/error, summaries and realtime DOM updates.');
}
async function live(){
 const p=page(),{w,run,doc}=p;
 Object.assign(w,{fetch,Headers,Request,Response,WebSocket,AbortController,TextEncoder,TextDecoder});
 w.eval(fs.readFileSync('config.js','utf8'));
 const cfg=w.MEM_CONFIG;
 async function rows(){const r=await fetch(cfg.SUPABASE_URL+'/rest/v1/task_state?select=*',{headers:{apikey:cfg.SUPABASE_KEY}});assert(r.ok);return r.json()}
 const before=await rows();fs.mkdirSync('.verification',{recursive:true});fs.writeFileSync('.verification/before-migration.json',JSON.stringify(before,null,2));
 const defaults=clone(run('newDefaultOwners')),old=clone(run('oldDefaultOwners')),marker=run('ownerMigrationId');
 const sdk=await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');assert(sdk.ok);w.eval(await sdk.text());
 await run('initDatabase()');assert.equal(doc.querySelector('#errorBox').style.display,'none',doc.querySelector('#errorBox').textContent);
 const after=await rows();assert(after.some(r=>r.task_id===marker));
 for(const prev of before){const next=after.find(r=>r.task_id===prev.task_id);assert(next);assert.equal(next.status,prev.status);
  const expected=!before.some(r=>r.task_id===marker)&&old[prev.task_id]&&JSON.stringify(prev.owners)===JSON.stringify(old[prev.task_id])?defaults[prev.task_id]:prev.owners;
  assert.deepEqual(next.owners,expected,prev.task_id);
 }
 let event=false;const ch=run('db.channel("mem-schedule-verification")');
 ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'task_state'},()=>{event=true});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Realtime timeout')),20000);ch.subscribe(s=>{if(s==='SUBSCRIBED'){clearTimeout(t);resolve()}})});
 // Same-value conditional write tests the real save transport without replacing a concurrent edit.
 const original=after.find(r=>r.task_id==='m1');
 w.checkRow=original;
 const result=await run('db.from("task_state").update({owners:checkRow.owners,status:checkRow.status,updated_at:new Date().toISOString()}).eq("task_id","m1").eq("updated_at",checkRow.updated_at).select()');
 assert.equal(result.error,null);assert.equal(result.data.length,1);
 for(let i=0;i<60&&!event;i++)await new Promise(r=>setTimeout(r,250));assert(event,'Realtime update not received');
 const final=await rows();
 for(const prev of after){const next=final.find(r=>r.task_id===prev.task_id);assert.deepEqual(next.owners,prev.owners);assert.equal(next.status,prev.status)}
 await run('db.removeAllChannels()');
 const second=page();Object.assign(second.w,{fetch,Headers,Request,Response,WebSocket,AbortController,TextEncoder,TextDecoder});second.w.MEM_CONFIG=cfg;second.w.supabase=w.supabase;
 await second.run('initDatabase()');assert.equal(second.doc.querySelector('#errorBox').style.display,'none');
 assert.deepEqual(clone(second.run('allSteps().map(s=>({id:s.id,owners:s.owners,status:s.status}))')),clone(run('allSteps().map(s=>({id:s.id,owners:s.owners,status:s.status}))')));
 await second.run('db.removeAllChannels()');second.dom.window.close();
 console.log('PASS: live conditional migration, statuses preserved, write/read/realtime, second-page refresh.');
 console.log(JSON.stringify(clone(run('allSteps().map(s=>({id:s.id,owners:s.owners,status:s.status,date:s.date}))')),null,2));p.dom.window.close();
}
offline().then(()=>process.argv.includes('--live')?live():null).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
