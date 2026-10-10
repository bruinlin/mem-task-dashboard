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
 run(fs.readFileSync('notice.js','utf8'));
 run(source.replace('renderGroups();updateSummary();initDatabase();','renderGroups();updateSummary();'));
 return {dom,w,run,doc:w.document};
}
function mockDb(initial){
 const state={rows:clone(initial),meta:[],writes:0,fail:false,failMeta:false,beforeUpdate:null,event:null,noticeEvent:null};
 const db={from(table){
  let kind='select',value,options,filters=[],single=false;
  const q={select(){return q},maybeSingle(){single=true;return q},update(v){kind='update';value=clone(v);return q},upsert(v,o){kind='upsert';value=clone(v);options=o;return q},eq(k,v){filters.push([k,v]);return q},then(resolve,reject){return Promise.resolve().then(()=>{
   if(state.failMeta&&table==='dashboard_meta')return {data:null,error:{message:'table unavailable',code:'PGRST205'}};
   if(state.fail&&kind!=='select')return {data:null,error:{message:'simulated failure'}};
   const tableRows=table==='dashboard_meta'?state.meta:state.rows;
   const key=table==='dashboard_meta'?'key':'task_id';
   let result=[];
   const matches=row=>filters.every(([k,v])=>k==='owners'?'{'+row.owners.map(JSON.stringify).join(',')+'}'===v:row[k]===v);
   if(kind==='update'){
    state.beforeUpdate?.(state,filters);state.beforeUpdate=null;
    for(const row of tableRows){if(matches(row)){Object.assign(row,value);result.push(row);state.writes++}}
   }
   if(kind==='upsert')for(const v of Array.isArray(value)?value:[value]){
    const row=tableRows.find(r=>r[key]===v[key]);
    if(row&&options?.ignoreDuplicates)continue;
    if(row){Object.assign(row,v);result.push(row)}else{const added={updated_at:'2026-09-20T12:00:00Z',...v};tableRows.push(added);result.push(added)}state.writes++;
   }
   if(kind==='select')result=tableRows.filter(matches);
   return {data:clone(single?(result[0]||null):result),error:null};
  }).then(resolve,reject)}};return q;
 },removeChannel:async()=>{},channel(){return {on(_,filter,fn){if(filter.table==='dashboard_meta')state.noticeEvent=fn;else state.event=fn;return this},subscribe(fn){fn('SUBSCRIBED');return this}}}};
 return {db,state};
}
async function offline(){
 const p=page(), {run,doc,w}=p;
 const defaults=clone(run('allSteps()'));
 assert.equal(defaults.length,13);assert.deepEqual(defaults.map(s=>s.id),['m1','m4','m5','m6','m8','d1','d1b','d2','d3','d4','e1','e2','ec1']);
 assert.equal(doc.querySelectorAll('#timelineDates > div').length,33);
 assert.equal(run('pct("2026-09-22")'),0.5/33*100);assert.equal(run('pct("2026-10-24")'),32.5/33*100);
 assert.equal(doc.querySelector('#statGroups').textContent,'4');
 assert.equal(doc.querySelector('#statSteps').textContent,'13');
 assert(defaults.slice(0,10).every(s=>s.status==='已完成'));
 assert(defaults.slice(10).every(s=>s.status==='未开始'));
 assert.equal(parseFloat(doc.querySelector('#laneDiscussion .bar').style.left),0.5/33*100);
 assert.equal(doc.querySelector('.course-archive').open,false);
 assert(doc.querySelector('#laneEconomics .milestone').title.includes('2026-10-24'));
 assert.equal(doc.querySelectorAll('.submission-check').length,6);
 assert.equal(doc.querySelectorAll('.submission-check:checked').length,4);
 assert.deepEqual([...doc.querySelectorAll('.submission-table tbody th')].map(e=>e.textContent),['廖璇','高森林','王玺','史圣田','钟润超','周圣昌']);
 assert.equal(defaults.at(-1).date,'2026-10-24');
 assert.equal(doc.querySelectorAll('.step-date strong').length,13);
 run('now.setTime(new Date("2026-09-21T00:00:00").getTime())');
 assert.equal(run('deadlineClass({date:"2026-09-20",status:"未开始"})'),'overdue');
 assert.equal(run('deadlineClass({date:"2026-09-20",status:"已完成"})'),'done');
 assert.equal(run('deadlineClass({date:"2026-09-24",status:"未开始"})'),'soon');
 assert.equal(run('deadlineClass({date:"2026-09-25",status:"未开始"})'),'later');
 assert.equal(run('ownerText(["史圣田","周圣昌","廖璇"])'),'廖璇 · 史圣田 · 周圣昌');
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
 await run('initDatabase()');assert.equal(doc.querySelector('#statDoing').textContent,'3');
 assert.equal(doc.querySelector('#statDone').textContent,'10');
 assert.deepEqual(state.rows.find(r=>r.task_id==='d1').owners,['钟润超','王玺','史圣田']);
 assert.equal(state.rows.find(r=>r.task_id==='d1').status,'已完成');
 const meetingWrites=state.writes;await run('migrateDiscussionMeeting()');assert.equal(state.writes,meetingWrites);
 run('now.setTime(new Date("2026-09-20T00:00:00").getTime());updateSummary()');
 assert(doc.querySelector('#nextCard').textContent.includes('10 / 11'));
 const btn=doc.querySelector('[data-step-id="m8"] .owner-button');btn.click();
 let picker=doc.querySelector('[data-step-id="m8"] .owner-picker');
 assert(picker.classList.contains('open'));
 picker.querySelector('input[value="王玺"]').click();await new Promise(r=>setTimeout(r,0));
 assert(picker.classList.contains('open'));assert(state.rows.find(r=>r.task_id==='m8').owners.includes('王玺'));
 state.event({new:clone(state.rows.find(r=>r.task_id==='m8'))});
 picker=doc.querySelector('[data-step-id="m8"] .owner-picker');assert(picker.classList.contains('open'));
 picker.querySelector('.owner-close').click();assert(!picker.classList.contains('open'));
 doc.querySelector('[data-step-id="m8"] .owner-button').click();doc.body.click();assert(!picker.classList.contains('open'));
 const sel=doc.querySelector('[data-step-id="m1"] select');sel.value='进行中';sel.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(doc.querySelector('#syncText').textContent,'保存中');await new Promise(r=>setTimeout(r,0));
 assert.equal(doc.querySelector('#syncText').textContent,'已同步');assert.equal(state.rows.find(r=>r.task_id==='m1').status,'进行中');
 assert.equal(doc.querySelector('#statDone').textContent,'9');
 const onceWrites=state.writes;await run('migrateModernizationCompletion()');assert.equal(state.writes,onceWrites);
 assert.equal(state.rows.find(r=>r.task_id==='m1').status,'进行中');
 const check=doc.querySelector('[data-submission-id="e1_submission_shishengtian"]');check.click();await new Promise(r=>setTimeout(r,0));
 assert.equal(state.rows.find(r=>r.task_id==='e1_submission_shishengtian').status,'已完成');
 assert.equal(doc.querySelectorAll('.submission-check:checked').length,5);
 assert.equal(doc.querySelector('#statDone').textContent,'9');
 const archive=doc.querySelector('.course-archive');archive.open=true;archive.dispatchEvent(new w.Event('toggle'));run('renderGroups()');assert(doc.querySelector('.course-archive').open);
 state.event({new:{task_id:'e1_submission_zhongrunchao',owners:['钟润超'],status:'已完成'}});
 assert.equal(doc.querySelectorAll('.submission-check:checked').length,6);
 assert.equal(doc.querySelector('#statDone').textContent,'9');
 state.fail=true;doc.querySelector('[data-submission-id="e1_submission_zhongrunchao"]').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(doc.querySelector('[data-submission-id="e1_submission_zhongrunchao"]').checked,true);
 assert.equal(doc.querySelector('#syncText').textContent,'保存失败');
 state.fail=false;
 state.fail=true;await run('saveStep(findStep("m1"))');assert.equal(doc.querySelector('#syncText').textContent,'保存失败');
 const failed=page(), failing=mockDb(rows);failing.state.fail=true;failed.w.testDb=failing.db;failed.w.snapshot=rows;failed.run('db=testDb');
 await assert.rejects(failed.run('migrateOwners(snapshot)'));assert(!failing.state.rows.some(r=>r.task_id.startsWith('__migration')));
 failed.dom.window.close();p.dom.window.close();
 console.log('PASS: syntax, 13 tasks/4 groups/33 dates, collapsed archive/toggle preservation, submission defaults/save/rollback/realtime/stat isolation, deadline colors, migrations/CAS/once-only/failure, owner controls, summaries and realtime DOM updates.');
}
async function noticeTests(){
 const p=page(),{run,w,doc}=p,{db,state}=mockDb([]);w.testDb=db;run('db=testDb');
 await run('initNotice()');await new Promise(r=>setTimeout(r,0));
 assert.equal(doc.querySelector('#noticeEdit').disabled,false);
 doc.querySelector('#noticeEdit').click();
 const text='中文 English，标点！\n第二行\n<img src=x onerror=alert(1)>\n'+'长'.repeat(1200);
 doc.querySelector('#noticeInput').value=text;
 const pending=run('saveNotice()');assert.equal(doc.querySelector('#noticeFeedback').textContent,'保存中…');await pending;
 assert.equal(state.meta[0].value,text);assert.equal(doc.querySelector('#noticeBody').textContent,text);assert.equal(doc.querySelector('#noticeBody img'),null);
 assert.equal(doc.querySelector('#noticeFeedback').textContent,'已保存');
 const other=page();other.w.testDb=db;other.run('db=testDb');await other.run('initNotice()');await new Promise(r=>setTimeout(r,0));
 assert.equal(other.doc.querySelector('#noticeBody').textContent,text);
 doc.querySelector('#noticeEdit').click();doc.querySelector('#noticeInput').value='我的草稿';
 state.meta[0]={...state.meta[0],value:'其他组员的新留言',updated_at:'2099-01-01T00:00:00Z'};
 w.remoteRow=clone(state.meta[0]);run('applyNotice(remoteRow)');
 assert.equal(doc.querySelector('#noticeInput').value,'我的草稿');await run('saveNotice()');
 assert(doc.querySelector('#noticeFeedback').textContent.startsWith('保存失败'));assert.equal(state.meta[0].value,'其他组员的新留言');
 doc.querySelector('#noticeCancel').click();assert.equal(doc.querySelector('#noticeBody').textContent,'其他组员的新留言');
 state.noticeEvent({new:clone(state.meta[0])});assert.equal(other.doc.querySelector('#noticeBody').textContent,'其他组员的新留言');
 doc.querySelector('#noticeEdit').click();doc.querySelector('#noticeInput').value='离线草稿';state.fail=true;await run('saveNotice()');
 assert.equal(doc.querySelector('#noticeInput').value,'离线草稿');assert(doc.querySelector('#noticeFeedback').textContent.startsWith('保存失败'));
 state.fail=false;doc.querySelector('#noticeCancel').click();
 doc.querySelector('#noticeEdit').click();doc.querySelector('#noticeInput').value='';await run('saveNotice()');assert.equal(state.meta[0].value,'');
 state.failMeta=true;await run('initNotice()');assert.equal(doc.querySelector('#noticeEdit').disabled,true);
 assert.equal(doc.querySelector('#noticeRetry').hidden,false);
 const missing=page();missing.w.testDb=db;missing.w.MEM_CONFIG={SUPABASE_URL:'https://example.test',SUPABASE_KEY:'test'};missing.w.supabase={createClient:()=>db};
 await missing.run('initDatabase()');assert.equal(missing.run('databaseReady'),true);assert.equal(missing.doc.querySelector('#statSteps').textContent,'13');
 p.dom.window.close();other.dom.window.close();missing.dom.window.close();
 console.log('PASS: notice editing/cancel/save, 1200+ characters/newlines/plain text, reload/second-page, realtime/draft preservation, conflict/network errors, empty notice, missing-table task isolation.');
}
async function live(){
 const p=page(),{w,run,doc}=p;
 Object.assign(w,{fetch,Headers,Request,Response,WebSocket,AbortController,TextEncoder,TextDecoder});
 w.eval(fs.readFileSync('config.js','utf8'));
 const cfg=w.MEM_CONFIG;
 async function rows(){const r=await fetch(cfg.SUPABASE_URL+'/rest/v1/task_state?select=*',{headers:{apikey:cfg.SUPABASE_KEY}});assert(r.ok);return r.json()}
 const before=await rows();fs.mkdirSync('.verification',{recursive:true});fs.writeFileSync('.verification/before-dashboard-20261010.json',JSON.stringify(before,null,2));
 const defaults=clone(run('newDefaultOwners')),old=clone(run('oldDefaultOwners')),marker=run('ownerMigrationId');
 const sdk=await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');assert(sdk.ok);const sdkCode=await sdk.text();w.eval(sdkCode);
 await run('initDatabase()');assert.equal(doc.querySelector('#errorBox').style.display,'none',doc.querySelector('#errorBox').textContent);
 const after=await rows();assert(after.some(r=>r.task_id===marker));
 for(const prev of before){const next=after.find(r=>r.task_id===prev.task_id);assert(next);
  if(prev.task_id==='d1'&&!before.some(r=>r.task_id===run('meetingMigrationId'))){assert.equal(next.status,'已完成');assert.deepEqual(next.owners,['钟润超','王玺','史圣田']);continue}
  const modernizationIds=['m1','m2','m3','m4','m5','m6','m7','m8','d1','d1b','d2','d3','d4'];
  const completing=modernizationIds.includes(prev.task_id)&&!before.some(r=>r.task_id===run('modernizationCompletionId'));
  assert.equal(next.status,completing?'已完成':prev.status);
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
 const second=page();Object.assign(second.w,{fetch,Headers,Request,Response,WebSocket,AbortController,TextEncoder,TextDecoder});second.w.MEM_CONFIG=cfg;second.w.eval(sdkCode);
 await second.run('initDatabase()');assert.equal(second.doc.querySelector('#errorBox').style.display,'none');
 assert.deepEqual(clone(second.run('allSteps().map(s=>({id:s.id,owners:s.owners,status:s.status}))')),clone(run('allSteps().map(s=>({id:s.id,owners:s.owners,status:s.status}))')));
 await second.run('db.removeAllChannels()');second.dom.window.close();
 console.log('PASS: live conditional migrations, authorized modernization completion, other statuses/owners preserved, write/read/realtime, second-page refresh.');
 console.log(JSON.stringify(clone(run('allSteps().map(s=>({id:s.id,owners:s.owners,status:s.status,date:s.date}))')),null,2));p.dom.window.close();
}

async function completionTests(){
 const p=page(),{run,w}=p;
 const sourceRows=[
  {task_id:'m1',owners:['廖璇','高森林'],status:'进行中',updated_at:'old'},
  {task_id:'m2',owners:['王玺'],status:'未开始',updated_at:'old'},
  {task_id:'e1',owners:['全员'],status:'进行中',updated_at:'old'},
  {task_id:'other_history',owners:['史圣田'],status:'待汇总',updated_at:'old'}
 ];
 const {db,state}=mockDb(sourceRows);w.testDb=db;run('db=testDb');
 await run('migrateModernizationCompletion()');
 assert.equal(state.rows.find(r=>r.task_id==='m1').status,'已完成');
 assert.deepEqual(state.rows.find(r=>r.task_id==='m1').owners,['廖璇','高森林']);
 assert.equal(state.rows.find(r=>r.task_id==='m2').status,'已完成');
 for(const id of ['e1','other_history'])assert.deepEqual(state.rows.find(r=>r.task_id===id),sourceRows.find(r=>r.task_id===id));
 state.rows.find(r=>r.task_id==='m1').status='进行中';
 const writes=state.writes;await run('migrateModernizationCompletion()');assert.equal(state.writes,writes);
 const race=mockDb(sourceRows);w.raceDb=race.db;run('db=raceDb');
 race.state.beforeUpdate=s=>{s.rows.find(r=>r.task_id==='m1').updated_at='concurrent'};
 await assert.rejects(run('migrateModernizationCompletion()'));
 assert.equal(race.state.rows.find(r=>r.task_id==='m1').status,'进行中');
 assert(!race.state.rows.some(r=>r.task_id===run('modernizationCompletionId')));
 const failing=mockDb(sourceRows);failing.state.fail=true;w.failingDb=failing.db;run('db=failingDb');
 await assert.rejects(run('migrateModernizationCompletion()'));
 assert(!failing.state.rows.some(r=>r.task_id===run('modernizationCompletionId')));
 p.dom.window.close();
 console.log('PASS: completion migration keeps owners/other courses/history; CAS race, failure and once-only marker.');
}

offline().then(completionTests).then(noticeTests).then(()=>process.argv.includes('--live')?live():null).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
