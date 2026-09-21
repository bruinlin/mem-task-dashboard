// Shared notice is independent of task loading: a missing metadata table must not block tasks.
let noticeRow=null, noticeChannel=null, noticeEditing=false, noticeSaving=false, noticeVersion=null;
function noticeFeedback(text,error=false){
 const el=document.getElementById("noticeFeedback");el.textContent=text;el.className="notice-feedback"+(error?" error":"");
}
function renderNotice(){
 document.getElementById("noticeBody").textContent=noticeRow?.value||"暂无重要留言，点击编辑添加。";
 document.getElementById("noticeBody").hidden=noticeEditing;
 document.getElementById("noticeEditor").hidden=!noticeEditing;
 document.getElementById("noticeEdit").hidden=noticeEditing;
 document.getElementById("noticeEdit").disabled=!noticeRow;
}
function applyNotice(row){
 const changed=noticeRow&&noticeRow.updated_at!==row.updated_at;
 noticeRow=row;renderNotice();
 if(changed&&noticeEditing&&!noticeSaving)noticeFeedback("其他组员已更新留言。你的草稿已保留；取消可查看最新留言。",true);
}
async function loadNotice(){
 const {data,error}=await db.from("dashboard_meta").select("key,value,updated_at").eq("key","important_notice").maybeSingle();
 if(error)throw error;
 if(!data)throw new Error("留言记录尚未就绪");
 applyNotice(data);
}
async function initNotice(){
 document.getElementById("noticeRetry").hidden=true;
 try{
  const {error}=await db.from("dashboard_meta").upsert({key:"important_notice",value:""},{onConflict:"key",ignoreDuplicates:true});
  if(error)throw error;
  await loadNotice();noticeFeedback("");
  if(noticeChannel)await db.removeChannel(noticeChannel);
  noticeChannel=db.channel("mem-important-notice")
   .on("postgres_changes",{event:"*",schema:"public",table:"dashboard_meta"},payload=>{
    if(payload.new?.key==="important_notice")applyNotice(payload.new);
   })
   .subscribe((status)=>{
    if(status==="SUBSCRIBED")loadNotice().catch(()=>noticeFeedback("留言刷新失败，请重试。",true));
    if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){
     noticeFeedback("留言实时连接异常，刷新页面可重新读取。",true);document.getElementById("noticeRetry").hidden=false;
    }
   });
 }catch(error){
  if(!noticeRow)document.getElementById("noticeBody").textContent="留言暂不可用。";
  document.getElementById("noticeEdit").disabled=true;
  document.getElementById("noticeRetry").hidden=false;
  noticeFeedback("留言服务尚未就绪或连接失败，请联系维护者或稍后重试。",true);
  console.warn("Shared notice unavailable:",error.message);
 }
}
document.getElementById("noticeEdit").onclick=()=>{
 if(!noticeRow||noticeSaving)return;
 noticeEditing=true;noticeVersion=noticeRow.updated_at;
 document.getElementById("noticeInput").value=noticeRow.value;
 renderNotice();noticeFeedback("");document.getElementById("noticeInput").focus();
};
document.getElementById("noticeCancel").onclick=()=>{if(noticeSaving)return;noticeEditing=false;renderNotice();noticeFeedback("");};
document.getElementById("noticeRetry").onclick=()=>{if(db)initNotice();};
async function saveNotice(){
 if(!db||!noticeEditing||noticeSaving)return;
 const value=document.getElementById("noticeInput").value;
 if(value.length>10000){noticeFeedback("留言不能超过 10000 字符。",true);return;}
 noticeSaving=true;document.getElementById("noticeSave").disabled=true;document.getElementById("noticeCancel").disabled=true;
 noticeFeedback("保存中…");
 try{
  const {data,error}=await db.from("dashboard_meta").update({value,updated_at:new Date().toISOString()})
   .eq("key","important_notice").eq("updated_at",noticeVersion).select("key,value,updated_at");
  if(error)throw error;
  if(!data.length)throw new Error("留言已被其他组员更新。草稿已保留，请先复制草稿，再取消并查看最新留言。");
  // Re-read after saving so another writer's later update cannot be replaced by a delayed response.
  noticeRow=data[0];noticeEditing=false;renderNotice();noticeFeedback("已保存");
  try{await loadNotice()}catch{noticeFeedback("已保存；重新读取失败，请刷新确认。",true)}
 }catch(error){noticeFeedback("保存失败："+error.message,true)}
 finally{noticeSaving=false;document.getElementById("noticeSave").disabled=false;document.getElementById("noticeCancel").disabled=false;}
}
document.getElementById("noticeSave").onclick=saveNotice;
