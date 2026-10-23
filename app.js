import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* Fill in config.js with your own Supabase project URL and anon key.
   Never place the service-role key in browser code. */
const cfg = window.SAMEXA_CONFIG || {};
const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey &&
  !cfg.supabaseUrl.includes("YOUR_") && !cfg.supabaseAnonKey.includes("YOUR_"));
let db = configured ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
let sessionUser = null, isOwner = false, room = null, roomChannel = null;
let onlineQuestion = null, onlineRenderedQuestionId = null, lastOnlineAnswer = null, roomPlayers = [], roomTeams = [];
let soloIndex = 0, soloScore = 0, soloChoice = null, soloMistakes = [];
const demoQuestions = [
 {q:"Which statement best describes a business?",options:["An activity that only provides free services","An organised activity providing goods or services to meet needs and wants","An activity that always belongs to government","An activity with no customers"],correct:1,topic:"Business and its environment",explanation:"A business organises resources to provide goods or services that meet customer needs or wants. Check the exact wording against your prescribed textbook."},
 {q:"Which is an example of a service?",options:["A school bag","A wooden desk","A haircut provided by a barber","A packet of rice"],correct:2,topic:"Business and its environment",explanation:"A haircut is a service; the other choices are physical goods."},
 {q:"An entrepreneur is commonly associated with…",options:["Identifying opportunities and organising a business","Avoiding all decisions","Only working in a government office","Never accepting responsibility"],correct:0,topic:"Entrepreneurship",explanation:"Entrepreneurs identify opportunities and organise resources to establish or develop business activity."},
 {q:"Why do businesses keep accounting records?",options:["To make transactions disappear","To record and communicate financial information","To guarantee profit every month","To avoid serving customers"],correct:1,topic:"Introduction to accounting",explanation:"Accounting records capture, organise and communicate financial information for decision-making and accountability."},
 {q:"What is a common purpose of marketing?",options:["Understand customer needs and offer suitable products","Stop all competition","Make products without considering customers","Remove the need for communication"],correct:0,topic:"Marketing",explanation:"Marketing involves understanding customers and creating, communicating and delivering value. This is general practice content, not a verified past-paper question."}
];
let statsData = {xp:0,total:0,correct:0,mistakes:[],completed:0};
try { statsData = {...statsData,...JSON.parse(localStorage.getItem("sameXaStats") || "{}")}; } catch {}
const $ = id => document.getElementById(id);
const escapeHTML = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function persistStats(){ try{localStorage.setItem("sameXaStats",JSON.stringify(statsData));}catch{} renderStats(); }
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3200);}
window.toggleNav=()=> $("nav").classList.toggle("open");
window.showScreen = name => {
 document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id==="screen-"+name));
 document.querySelectorAll(".nav [data-screen]").forEach(b=>b.classList.toggle("active",b.dataset.screen===name));
 $("nav").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
 if(name==="progress")renderProgress();
};
function renderStats(){
 $("topXP").textContent=statsData.xp+" XP";$("statXP").textContent=statsData.xp;$("statAnswered").textContent=statsData.total;
 $("statMistakes").textContent=statsData.mistakes.length;$("statAccuracy").textContent=statsData.total?Math.round(statsData.correct/statsData.total*100)+"%":"—";
 $("pAccuracy").textContent=statsData.total?Math.round(statsData.correct/statsData.total*100)+"%":"—";$("pXP").textContent=statsData.xp;
 $("pTotal").textContent=statsData.total;$("pErrors").textContent=statsData.mistakes.length;
}
function tickCountdown(){
 const now=Date.now();
 const configuredDate=window.samexaExamDate||localStorage.getItem("samexaExamDate")||"2026-12-08";
 const target=new Date(configuredDate+"T00:00:00+05:30").getTime(),diff=target-now;
 if(diff<=0){$("cdDays").textContent="0";$("cdHours").textContent="00";$("cdMins").textContent="00";$("cdSecs").textContent="00";$("cdLabel").textContent="Exam date reached — follow your official schedule.";return;}
 const days=Math.floor(diff/86400000),hours=Math.floor(diff%86400000/3600000),mins=Math.floor(diff%3600000/60000),secs=Math.floor(diff%60000/1000);
 $("cdDays").textContent=String(days);$("cdHours").textContent=String(hours).padStart(2,"0");$("cdMins").textContent=String(mins).padStart(2,"0");$("cdSecs").textContent=String(secs).padStart(2,"0");
}
const topicData=[
["Business and its environment","Purpose and context of business","⌂"],["Entrepreneurship","Opportunities, enterprise and initiative","✦"],["Business ownership","Ways to establish and organise a business","♧"],["Management and organisation","Planning and business decisions","↗"],["Marketing","Customers, products and value","◈"],["Business communication","Sharing information effectively","✉"],["Introduction to accounting","Recording business transactions","▤"],["Financial statements","Presenting financial information","▥"],["Banking and financial services","Money and financial services","⌁"],["Business finance","Funding and financial choices","＄"],["Trade and supporting services","Services that enable trade","⇄"],["Business ethics and responsibility","Responsible business practice","◎"]
];
window.renderTopics=()=>{
 const q=($("topicSearch")?.value||"").toLowerCase();
 $("topicList").innerHTML=topicData.filter(t=>t[0].toLowerCase().includes(q)).map(t=>`<div class="topic-row"><div class="topic-icon">${t[2]}</div><div class="topic-label"><b>${escapeHTML(t[0])}</b><small>${escapeHTML(t[1])} · source verification pending</small></div><button class="mini-btn" onclick="topicPractice('${escapeHTML(t[0])}')">Practise</button></div>`).join("")||"<p class='auth-status'>No matching topic.</p>";
};
window.topicPractice=name=>{const i=demoQuestions.findIndex(q=>q.topic===name);if(i>=0){demoQuestions.unshift(demoQuestions.splice(i,1)[0]);window.showScreen("arena");window.startSoloQuiz();}else showToast("Topic placeholder only. Upload the government textbook to build verified topic content.");};
window.startSoloQuiz=()=>{soloIndex=0;soloScore=0;soloChoice=null;soloMistakes=[];$("soloIntro").style.display="none";$("soloResult").style.display="none";$("soloQuiz").classList.add("active");drawSolo();$("soloPanel").scrollIntoView({behavior:"smooth",block:"start"});};
function drawSolo(){
 const q=demoQuestions[soloIndex];soloChoice=null;$("soloQNum").textContent=`Question ${soloIndex+1} of ${demoQuestions.length}`;$("soloScore").textContent=soloScore+" correct";$("soloBar").style.width=((soloIndex+1)/demoQuestions.length*100)+"%";$("soloQText").textContent=q.q;$("soloFeedback").className="feedback";$("soloNext").disabled=true;$("soloNext").textContent=soloIndex===demoQuestions.length-1?"See results →":"Next →";
 $("soloAnswers").innerHTML=q.options.map((a,i)=>`<button class="answer" onclick="soloAnswer(${i},this)"><span class="letter">${"ABCD"[i]}</span><span>${escapeHTML(a)}</span></button>`).join("");
}
window.soloAnswer=(i,btn)=>{
 if(soloChoice!==null)return;soloChoice=i;const q=demoQuestions[soloIndex];
 document.querySelectorAll("#soloAnswers .answer").forEach((b,j)=>{b.disabled=true;if(j===q.correct)b.classList.add("correct")});
 const f=$("soloFeedback");if(i===q.correct){soloScore++;statsData.correct++;statsData.xp+=10;f.textContent="Correct · +10 XP. "+q.explanation;f.style.borderColor="#148d75";f.style.color="#bcffef";}
 else{btn.classList.add("wrong");const mistake={q:q.q,chosen:q.options[i],correct:q.options[q.correct],topic:q.topic,explanation:q.explanation};soloMistakes.push(mistake);statsData.mistakes.push(mistake);statsData.mistakes=statsData.mistakes.slice(-100);f.textContent="Not quite. Correct answer: "+q.options[q.correct]+". "+q.explanation;f.style.borderColor="#8b2f52";f.style.color="#ffc7d9";}
 statsData.total++;statsData.completed++;f.classList.add("show");$("soloNext").disabled=false;persistStats();
};
window.nextSolo=()=>{if(soloChoice===null)return;if(soloIndex<demoQuestions.length-1){soloIndex++;drawSolo();}else finishSolo();};
function finishSolo(){ $("soloQuiz").classList.remove("active");$("soloResult").style.display="block";$("soloResult").innerHTML=`<div style="text-align:center;padding:18px"><div style="font-size:40px">✦</div><h3>${soloScore>=4?"Excellent run!":soloScore>=3?"Momentum built!":"Keep learning from each attempt."}</h3><div style="font-size:42px;font-weight:950;color:var(--cyan)">${soloScore}/${demoQuestions.length}</div><p class="auth-status">Demo practice score, not an official O/L mark.</p><button class="btn btn-main" onclick="reviewSolo()">Review corrections</button> <button class="btn btn-alt" onclick="startSoloQuiz()">Play again</button></div>`; }
window.reviewSolo=()=>{const body=soloMistakes.length?soloMistakes.map(m=>`<div class="notice"><b>${escapeHTML(m.topic)}</b><p>${escapeHTML(m.q)}</p><p>Chosen: ${escapeHTML(m.chosen)}<br>Correct: ${escapeHTML(m.correct)}</p>${escapeHTML(m.explanation)}</div>`).join(""):"No mistakes in this attempt. Open Progress to review saved mistakes.";openGenericModal("Correction review",body);};
window.endSolo=()=>{$("soloQuiz").classList.remove("active");$("soloIntro").style.display="block";};
function renderProgress(){renderStats();const arr=statsData.mistakes.slice().reverse();$("mistakeList").innerHTML=arr.length?arr.map((m,i)=>`<div class="notice"><b>${escapeHTML(m.topic||"Practice question")}</b><p>${escapeHTML(m.q)}</p><p>Chosen: ${escapeHTML(m.chosen)}<br>Correct: ${escapeHTML(m.correct)}</p>${escapeHTML(m.explanation||"")}</div>`).join(""):"<p class='auth-status'>No saved errors yet. Start a solo practice run to build your revision list.</p>";}
window.exportProgress=()=>{const blob=new Blob([JSON.stringify({statsData,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="samexa-progress.json";a.click();URL.revokeObjectURL(a.href);};
function openGenericModal(title,html){$("modalTitle").textContent=title;$("modalBody").innerHTML=html;$("modalBackdrop").classList.add("open");}
window.closeModal=()=>{$("modalBackdrop").classList.remove("open");};
window.openAdmin=async()=>{
 if(!db){openGenericModal("Owner access · Setup required",`<p class="auth-status">This copy is not yet connected to a database. Set your Supabase URL and anon key in <code>config.js</code>, run <code>schema.sql</code>, then create your owner account and add its UUID to <code>app_admins</code>. Only approved owner accounts can edit shared content.</p><div class="notice">The Owner tab is not protected by hiding buttons alone: database Row Level Security controls who can write to shared questions. Never put a service-role key in this website.</div><button class="btn btn-alt" onclick="closeModal()">Close</button>`);return;}
 let {data:{session}}=await db.auth.getSession();sessionUser=session?.user||null;
 openGenericModal("SAMEXA · Owner Studio",ownerLoginHTML());
 if(sessionUser)await checkOwnerAndRender();
 if(db){const {data:settings}=await db.from("site_settings").select("tagline,exam_date").eq("id",1).maybeSingle();if(settings){if($("siteTagline"))$("siteTagline").value=settings.tagline;if($("siteExamDate"))$("siteExamDate").value=settings.exam_date;}}
};
function ownerLoginHTML(){return `<p class="auth-status">This sign-in is for the owner/editor account. Players can join rooms without access to these tools.</p><div class="field"><label>OWNER EMAIL</label><input id="adminEmail" type="email" autocomplete="username" placeholder="Your owner email"></div><div class="field"><label>PASSWORD</label><input id="adminPassword" type="password" autocomplete="current-password" placeholder="Your password"></div><div class="hero-actions"><button class="btn btn-main" onclick="adminLogin()">Sign in</button><button class="btn btn-alt" onclick="closeModal()">Cancel</button></div><div id="adminAuthMsg" class="auth-status" style="margin-top:10px"></div><div id="ownerTools"></div>`;}
window.adminLogin=async()=>{if(!db){showToast("Configure Supabase first.");return;}const email=$("adminEmail").value.trim(),password=$("adminPassword").value;if(!email||!password){$("adminAuthMsg").textContent="Enter your owner email and password.";return;}const {data,error}=await db.auth.signInWithPassword({email,password});if(error){$("adminAuthMsg").textContent="Sign-in failed: "+error.message;return;}sessionUser=data.user;await checkOwnerAndRender();};
async function checkOwnerAndRender(){const {data,error}=await db.rpc("is_app_admin");if(error||data!==true){isOwner=false;$("adminAuthMsg").textContent="This account is not authorised as the SAMEXA owner. Ask the database owner to grant admin access.";return;}isOwner=true;$("adminAuthMsg").textContent="Owner verified. Changes are protected by database permissions.";const tools=$("ownerTools");tools.innerHTML=ownerToolsHTML();await loadAdminQuestions();await loadVisitorAnalytics();}
function ownerToolsHTML(){return `<div class="admin-section"><h4>BRAND / APP SETTINGS</h4>
<p class="auth-status">Edit the tagline and exam countdown date for everyone using this app. The main brand stays SAMEXA.</p>
<div class="fields-two"><div class="field"><label>TAGLINE</label><input id="siteTagline" value="Your mind. Your mission. Your future."></div><div class="field"><label>EXAM DATE</label><input id="siteExamDate" type="date" value="2026-12-08"></div></div>
<button class="btn btn-alt" onclick="saveSharedSettings()">Save shared settings</button><div id="settingsMessage" class="auth-status" style="margin-top:8px"></div>
</div><div class="admin-section"><h4>ADD / EDIT QUESTION BANK</h4><input type="hidden" id="editQuestionId"><div class="field"><label>QUESTION TEXT</label><textarea id="bankQuestion" placeholder="Enter question text"></textarea></div><div class="fields-two">${["A","B","C","D"].map(x=>`<div class="field"><label>OPTION ${x}</label><input id="bank${x}" placeholder="Answer option ${x}"></div>`).join("")}</div><div class="fields-two"><div class="field"><label>CORRECT OPTION</label><select id="bankCorrect"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div><div class="field"><label>TOPIC</label><input id="bankTopic" placeholder="Topic name"></div></div><div class="field"><label>EXPLANATION / MARKING NOTE</label><textarea id="bankExplanation" placeholder="Explain the correct answer"></textarea></div><div class="fields-two"><div class="field"><label>SOURCE TYPE</label><select id="bankSource"><option value="generated_practice">Generated practice</option><option value="verified_official">Verified official question</option><option value="demo">Demo only</option></select></div><div class="field"><label>SOURCE REFERENCE (required for official)</label><input id="bankSourceRef" placeholder="Year, paper, question, page"></div></div><div class="fields-two"><div class="field"><label>YEAR (optional)</label><input id="bankYear" type="number" min="2000" max="2100" placeholder="2025"></div><div class="field"><label>STATUS</label><select id="bankPublished"><option value="false">Draft / hidden</option><option value="true">Publish to learners</option></select></div></div><div class="hero-actions"><button class="btn btn-main" onclick="saveBankQuestion()">Save question</button><button class="btn btn-alt" onclick="resetBankForm()">Clear</button></div><div id="bankMessage" class="auth-status" style="margin-top:10px"></div></div><div class="admin-section"><h4>SHARED QUESTION BANK</h4><div id="adminQuestionList" class="auth-status">Loading…</div></div><div class="admin-section"><h4>VISITOR ANALYTICS</h4><p class="auth-status">Aggregate visit count plus profile details voluntarily shared by learners. This panel does not reveal a visitor's private browser or device data.</p><div id="visitorMetrics" class="auth-status">Loading visit stats…</div><div id="visitorList" class="auth-status" style="margin-top:8px"></div><div class="hero-actions"><button class="btn btn-alt" onclick="loadVisitorAnalytics()">Refresh visitor stats</button></div></div><div class="admin-section"><h4>OWNER SESSION</h4><button class="btn btn-danger" onclick="adminLogout()">Sign out</button></div>`;}
window.saveSharedSettings=async()=>{
 if(!db||!isOwner){showToast("Owner sign-in required.");return;}
 const tagline=$("siteTagline").value.trim(),examDate=$("siteExamDate").value;
 if(!tagline||!examDate){$("settingsMessage").textContent="Enter a tagline and date.";return;}
 const {error}=await db.from("site_settings").update({tagline,exam_date:examDate,updated_at:new Date().toISOString()}).eq("id",1);
 if(error){$("settingsMessage").textContent="Settings save failed: "+error.message+" (make sure you ran the latest schema.sql).";return;}
 $("settingsMessage").textContent="Saved for all visitors.";localStorage.setItem("samexaTagline",tagline);localStorage.setItem("samexaExamDate",examDate);
 applySharedSettings({tagline,exam_date:examDate});showToast("Shared settings updated.");
};
function applySharedSettings(settings){
 if(settings?.tagline){$("brandName").innerHTML='SAMEXA<small>'+escapeHTML(settings.tagline)+'</small>'; const title=$("heroCopy");if(title)title.dataset.sharedTagline=settings.tagline; }
 if(settings?.exam_date){window.samexaExamDate=settings.exam_date;const dt=$("exam-date-visible");const node=document.querySelector(".count-date");if(node)node.textContent=new Date(settings.exam_date+"T00:00:00+05:30").toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric",timeZone:"Asia/Colombo"}).toUpperCase();tickCountdown();}
}
async function loadSharedSettings(){
 if(!db)return;const {data,error}=await db.from("site_settings").select("tagline,exam_date").eq("id",1).maybeSingle();
 if(!error&&data)applySharedSettings(data);
}
window.resetBankForm=()=>{["editQuestionId","bankQuestion","bankA","bankB","bankC","bankD","bankTopic","bankExplanation","bankSourceRef","bankYear"].forEach(id=>$(id).value="");$("bankCorrect").value="0";$("bankSource").value="generated_practice";$("bankPublished").value="false";};
window.saveBankQuestion=async()=>{
 if(!isOwner||!db)return;const id=$("editQuestionId").value,q=$("bankQuestion").value.trim(),opts=["A","B","C","D"].map(x=>$("bank"+x).value.trim()),topic=$("bankTopic").value.trim(),explanation=$("bankExplanation").value.trim(),source_type=$("bankSource").value,source_ref=$("bankSourceRef").value.trim(),year=$("bankYear").value?Number($("bankYear").value):null,is_published=$("bankPublished").value==="true",correct_option=Number($("bankCorrect").value);
 if(!q||opts.some(x=>!x)||!topic||!explanation){$("bankMessage").textContent="Complete the question, four options, topic and explanation.";return;}
 if(source_type==="verified_official"&&!source_ref){$("bankMessage").textContent="Add the official source reference before publishing this as verified.";return;}
 const publicRow={question_text:q,options:opts,topic,source_type,source_ref:source_ref||null,source_year:year,is_published};
 let result;
 if(id){result=await db.from("question_bank").update(publicRow).eq("id",id).select("id").single();}
 else{result=await db.from("question_bank").insert(publicRow).select("id").single();}
 if(result.error){$("bankMessage").textContent="Save failed: "+result.error.message;return;}
 const questionId=result.data.id;
 const keyRow={question_id:questionId,correct_option,explanation};
 const keyResult=await db.from("question_keys").upsert(keyRow,{onConflict:"question_id"});
 if(keyResult.error){$("bankMessage").textContent="Question text saved, but answer key save failed: "+keyResult.error.message;return;}
 $("bankMessage").textContent="Saved. Verify all official material against the original source.";resetBankForm();await loadAdminQuestions();
};
window.editBankQuestion=async id=>{if(!db||!isOwner)return;const {data,error}=await db.from("question_bank").select("*").eq("id",id).single();if(error){showToast(error.message);return;}const {data:key}=await db.from("question_keys").select("*").eq("question_id",id).single();$("editQuestionId").value=id;$("bankQuestion").value=data.question_text;$("bankA").value=data.options[0]||"";$("bankB").value=data.options[1]||"";$("bankC").value=data.options[2]||"";$("bankD").value=data.options[3]||"";$("bankTopic").value=data.topic;$("bankExplanation").value=key?.explanation||"";$("bankCorrect").value=key?.correct_option??0;$("bankSource").value=data.source_type;$("bankSourceRef").value=data.source_ref||"";$("bankYear").value=data.source_year||"";$("bankPublished").value=String(data.is_published);$("bankQuestion").scrollIntoView({behavior:"smooth",block:"center"});};
window.deleteBankQuestion=async id=>{if(!db||!isOwner||!confirm("Delete this question from the shared bank?"))return;const {error}=await db.from("question_bank").delete().eq("id",id);if(error)showToast(error.message);else{showToast("Question deleted.");await loadAdminQuestions();}};
async function loadAdminQuestions(){if(!db)return;const {data,error}=await db.from("question_bank").select("id,question_text,topic,source_type,source_year,is_published,created_at").order("created_at",{ascending:false}).limit(100);if(error){$("adminQuestionList").textContent=error.message;return;}$("adminQuestionList").innerHTML=data.length?data.map(q=>`<div class="question-admin-row"><span><b>${escapeHTML(q.question_text)}</b><br><small>${escapeHTML(q.topic)} · ${escapeHTML(q.source_type)} · ${q.is_published?"Published":"Draft"}</small></span><div class="small-actions"><button onclick="editBankQuestion('${q.id}')">Edit</button><button onclick="deleteBankQuestion('${q.id}')">Delete</button></div></div>`).join(""):"No database questions yet. Add your verified practice set above.";}
window.adminLogout=async()=>{if(db)await db.auth.signOut();sessionUser=null;isOwner=false;showToast("Owner signed out.");closeModal();};

window.openProfile=async()=>{
 if(!db){openGenericModal("Optional learner profile",`<p class="auth-status">Profile registration is available after the site owner connects the online backend. You can use the public site without registering.</p>`);return;}
 openGenericModal("Learner profile · Optional",`<p class="auth-status">Your display name is required for a profile. Contact details are optional. Your contact information is only visible to the SAMEXA owner if you agree below. Multiplayer only needs a nickname.</p><div class="field"><label>DISPLAY NAME</label><input id="profileName" maxlength="40" placeholder="Name you want to show"></div><div class="field"><label>CONTACT (OPTIONAL)</label><input id="profileContact" maxlength="120" placeholder="Email or phone, only if you choose"></div><label style="display:flex;gap:9px;align-items:flex-start;color:#b8cce7;font-size:11px;line-height:1.5;margin:12px 0"><input id="profileConsent" type="checkbox" style="margin-top:2px"><span>I agree that SAMEXA's owner may see my display name and the contact information I choose to provide, for study-community administration. I understand I can use SAMEXA without creating a profile.</span></label><button class="btn btn-main" onclick="saveProfile()">Save my profile</button><div id="profileMessage" class="auth-status" style="margin-top:9px"></div><div class="notice">Do not share passwords, identity numbers, payment details or sensitive information.</div>`);
};
window.saveProfile=async()=>{
 if(!db){return;}const name=$("profileName")?.value.trim(),contact=$("profileContact")?.value.trim()||null,consent=$("profileConsent")?.checked;
 if(!name){$("profileMessage").textContent="Enter a display name, or close this panel to continue without a profile.";return;}
 if(!consent){$("profileMessage").textContent="Consent is required before a profile is stored and made visible to the owner. You may also choose not to register.";return;}
 const user=await ensureGuest();if(!user)return;
 const {error}=await db.from("visitor_profiles").upsert({user_id:user.id,display_name:name,contact_info:contact,owner_view_consent:true,last_seen_at:new Date().toISOString()},{onConflict:"user_id"});
 if(error){$("profileMessage").textContent="Could not save profile: "+error.message+" (the owner needs to run the latest schema.sql).";return;}
 $("profileMessage").textContent="Profile saved. Your chosen details can now be viewed by the SAMEXA owner.";showToast("Profile saved.");
};
async function loadVisitorAnalytics(){
 if(!db||!isOwner||!$("visitorMetrics"))return;
 $("visitorMetrics").textContent="Loading analytics…";
 const [visits,profiles]=await Promise.all([
   db.from("visit_events").select("id",{count:"exact",head:true}),
   db.from("visitor_profiles").select("user_id,display_name,contact_info,created_at,last_seen_at,owner_view_consent",{count:"exact"}).order("last_seen_at",{ascending:false}).limit(200)
 ]);
 if(visits.error||profiles.error){$("visitorMetrics").textContent="Analytics setup error: "+(visits.error?.message||profiles.error?.message)+" — run the latest schema.sql.";return;}
 $("visitorMetrics").innerHTML=`<div class="notice"><b>${visits.count||0}</b> recorded page visits · <b>${profiles.count||0}</b> opted-in learner profiles.<br>Visit counts are aggregate events; names/contact below are shown only for people who submitted a profile with consent.</div>`;
 $("visitorList").innerHTML=profiles.data?.length?profiles.data.map(p=>`<div class="question-admin-row"><span><b>${escapeHTML(p.display_name)}</b><br><small>${escapeHTML(p.contact_info||"No contact supplied")} · Last active ${p.last_seen_at?new Date(p.last_seen_at).toLocaleDateString():"date not recorded"}</small></span></div>`).join(""):"<p>No opted-in profiles yet. Visitors can use the site without registering.";
}
async function trackVisit(){
 if(!db)return;
 try{
  let {data:{session}}=await db.auth.getSession();
  if(!session){const {data,error}=await db.auth.signInAnonymously();if(error)return;session=data.session;}
  if(!session?.user)return;
  sessionUser=session.user;
  await db.rpc("track_page_visit",{p_page_path:(location.pathname||"/").slice(0,160)});
 }catch{}
}

/* Multiplayer: database-backed rooms, password verification and answer scoring.
   If credentials are absent, UI remains navigable but live room actions explain setup needed. */
function needBackend(){if(!db){showToast("Online multiplayer needs Supabase setup. See README.md and schema.sql in the source package.");return false;}return true;}
async function ensureGuest(){if(!needBackend())return null;let {data:{session}}=await db.auth.getSession();if(session?.user){sessionUser=session.user;return session.user;}const {data,error}=await db.auth.signInAnonymously();if(error){showToast("Guest login failed: "+error.message+" — enable Anonymous Sign-Ins in Supabase.");return null;}sessionUser=data.user;return data.user;}
function playerName(){return ($("playerName").value.trim()||"Player").slice(0,24);}
window.createRoom=async()=>{
 if(!await ensureGuest())return;const name=playerName(),pin=$("roomPin").value,mode=$("roomMode").value;
 if(pin.length<4){showToast("Choose a room password of at least 4 characters.");return;}
 const {data,error}=await db.rpc("create_game",{p_display_name:name,p_mode:mode,p_pin:pin});
 if(error){showToast("Room creation failed: "+error.message);return;}
 room={id:data.room_id,code:data.room_code,mode:data.mode,host_id:sessionUser.id};await enterRoom(pin);showToast("Private room created. Share the code and password with your friends.");
};
window.joinRoom=async()=>{
 if(!await ensureGuest())return;const code=$("joinCode").value.trim().toUpperCase(),pin=$("joinPin").value,name=playerName();
 if(!code||!pin){showToast("Enter both room code and password.");return;}
 const {data,error}=await db.rpc("join_game",{p_room_code:code,p_pin:pin,p_display_name:name});
 if(error){showToast("Could not join: "+error.message);return;}
 room={id:data.room_id,code:data.room_code,mode:data.mode,host_id:data.host_id};await enterRoom(pin);showToast("Joined room "+room.code+".");
};
async function enterRoom(pin){
 if(roomChannel){await db.removeChannel(roomChannel);roomChannel=null;}
 $("roomEmpty").style.display="none";$("roomLive").style.display="block";$("roomCodeText").textContent="ROOM "+room.code;$("roomModeText").textContent=room.mode==="duel"?"Single-to-single · 1v1":"Team battle";$("teamsArea").style.display=room.mode==="teams"?"block":"none";
 $("connectionNotice").textContent="Connected to online room. Share code "+room.code+" and your chosen password with invited friends.";
 roomChannel=db.channel("samexa-room-"+room.id).on("postgres_changes",{event:"*",schema:"public",table:"game_rooms",filter:"id=eq."+room.id},()=>refreshRoom()).on("postgres_changes",{event:"*",schema:"public",table:"game_players",filter:"room_id=eq."+room.id},()=>refreshRoom()).on("postgres_changes",{event:"*",schema:"public",table:"game_teams",filter:"room_id=eq."+room.id},()=>refreshRoom()).subscribe();
 await refreshRoom();
}
window.refreshRoom=async()=>{
 if(!db||!room)return;const {data:r,error}=await db.from("game_rooms").select("*").eq("id",room.id).single();if(error){showToast("Room refresh: "+error.message);return;}
 room={...room,...r};const [pr,tr]=await Promise.all([db.from("game_players").select("id,user_id,display_name,score,team_id,last_answered_question_id").eq("room_id",room.id).order("joined_at"),db.from("game_teams").select("id,name").eq("room_id",room.id).order("created_at")]);
 roomPlayers=pr.data||[];roomTeams=tr.data||[];$("playerCount").textContent=roomPlayers.length+" connected";
 $("playersList").innerHTML=roomPlayers.map(p=>`<div class="player-row"><span class="player-dot"></span><span>${escapeHTML(p.display_name)}${p.user_id===room.host_id?" <b style='color:var(--gold)'>(HOST)</b>":""}${p.team_id?" · "+escapeHTML(roomTeams.find(t=>t.id===p.team_id)?.name||"Team"):""}</span><span class="score">${p.score} XP</span></div>`).join("");
 $("teamSelect").innerHTML='<option value="">Choose a team...</option>'+roomTeams.map(t=>`<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("");
 $("startGameBtn").style.display=room.status==="lobby"&&room.host_id===sessionUser?.id?"inline-block":"none";
 $("nextQuestionBtn").style.display=room.status==="playing"&&room.host_id===sessionUser?.id?"inline-block":"none";
 $("hostActions").style.display=room.status==="finished"?"none":"flex";
 if(room.status==="playing"&&room.current_question_id)await showOnlineQuestion();
 else if(room.status==="finished"){$("onlineQuestion").style.display="block";$("onlineQText").textContent="Battle complete! Final scores are shown above."; $("onlineAnswers").innerHTML="";$("onlineFeedback").className="feedback";}
 else $("onlineQuestion").style.display="none";
};
window.copyRoom=async()=>{if(!room)return;const text=`SAMEXA invite\\nRoom code: ${room.code}\\nRoom password: (share the password you created privately)\\nOpen the SAMEXA app link and join the room.`;try{await navigator.clipboard.writeText(text);showToast("Invite details copied. Add the room password before sending.");}catch{showToast("Room code: "+room.code+" — share the password separately.");}};
window.createTeam=async()=>{if(!needBackend()||!room)return;const name=$("teamName").value.trim();if(!name){showToast("Enter a team name.");return;}const {error}=await db.rpc("create_game_team",{p_room_id:room.id,p_team_name:name});if(error){showToast(error.message);return;}$("teamName").value="";await refreshRoom();};
window.chooseTeam=async()=>{if(!needBackend()||!room)return;const team=$("teamSelect").value;if(!team){showToast("Choose a team first.");return;}const {error}=await db.rpc("set_game_team",{p_room_id:room.id,p_team_id:team});if(error){showToast(error.message);return;}await refreshRoom();showToast("Team updated.");};
window.startOnlineGame=async()=>{if(!needBackend()||!room)return;const {error}=await db.rpc("start_game",{p_room_id:room.id});if(error){showToast(error.message);return;}await refreshRoom();};
window.nextOnlineQuestion=async()=>{if(!needBackend()||!room)return;const {error}=await db.rpc("next_game_question",{p_room_id:room.id});if(error){showToast(error.message);return;}await refreshRoom();};
async function showOnlineQuestion(){
 if(!room?.current_question_id)return;
 if(onlineRenderedQuestionId===room.current_question_id){return;}
 const {data,error}=await db.from("question_bank").select("id,question_text,options,topic,source_type,source_ref").eq("id",room.current_question_id).single();if(error){showToast("Question load failed: "+error.message);return;}
 onlineQuestion=data;onlineRenderedQuestionId=data.id;lastOnlineAnswer=null;$("onlineQuestion").style.display="block";$("onlineQNum").textContent=`Question ${Number(room.question_index)+1} · ${data.topic}`;$("onlineTimer").textContent=data.source_type==="verified_official"?"VERIFIED SOURCE":"PRACTICE";$("onlineQText").textContent=data.question_text;$("onlineFeedback").className="feedback";$("onlineProgress").textContent="Submit your answer. The server checks it and updates the shared score.";
 $("onlineAnswers").innerHTML=data.options.map((a,i)=>`<button class="answer" onclick="submitOnlineAnswer(${i})"><span class="letter">${"ABCD"[i]}</span><span>${escapeHTML(a)}</span></button>`).join("");
}
window.submitOnlineAnswer=async option=>{
 if(!needBackend()||!room||!onlineQuestion||lastOnlineAnswer!==null)return;lastOnlineAnswer=option;const {data,error}=await db.rpc("submit_game_answer",{p_room_id:room.id,p_selected_option:option});
 document.querySelectorAll("#onlineAnswers .answer").forEach((b,i)=>{b.disabled=true;if(i===option)b.classList.add("wrong");});
 if(error){$("onlineFeedback").textContent="Answer not accepted: "+error.message;$("onlineFeedback").classList.add("show");return;}
 document.querySelectorAll("#onlineAnswers .answer").forEach((b,i)=>{if(i===data.correct_option){b.classList.remove("wrong");b.classList.add("correct");}});
 $("onlineFeedback").textContent=(data.is_correct?"Correct! +10 points. ":"Keep going. Correct option: "+"ABCD"[data.correct_option]+". ")+data.explanation;$("onlineFeedback").classList.add("show");$("onlineProgress").textContent="Your room score: "+data.score+" points. The host controls when to advance.";await refreshRoom();
};
window.leaveRoom=async()=>{
 if(room&&db){const {error}=await db.rpc("leave_game",{p_room_id:room.id});if(error)showToast("You left this screen, but server cleanup failed: "+error.message);}
 if(roomChannel&&db)await db.removeChannel(roomChannel);
 roomChannel=null;room=null;roomPlayers=[];onlineQuestion=null;onlineRenderedQuestionId=null;lastOnlineAnswer=null;
 $("roomLive").style.display="none";$("roomEmpty").style.display="block";$("roomEmpty").textContent="You left the room. Create or join another battle any time.";
};
window.openGenericModal=openGenericModal;
window.openModal=kind=>{if(kind==="papers"){openGenericModal("Past Paper Vault",`<p class="auth-status">The 2014–2025 index is ready, but source PDFs and marking schemes must be uploaded and verified before the platform can claim they are available.</p><div class="paper-grid">${Array.from({length:12},(_,i)=>`<div class="year-card"><b>${2014+i}</b><small>Source pending</small></div>`).join("")}</div><div class="notice">Upload official English-medium O/L papers and marking schemes. Never invent missing questions, answers or mark allocations.</div>`);}else if(kind==="mistakes"){renderProgress();openGenericModal("Mistake Lab",$("mistakeList").innerHTML);}else if(kind==="textbook"){openGenericModal("Textbook Navigator",`<p class="auth-status">The exact government textbook is not included. Once provided, this area can display chapter summaries, page references, definitions and practice questions with source details.</p>`);}else{openAdmin();}};
if(new URLSearchParams(location.search).get("owner")==="1"){setTimeout(()=>window.openAdmin(),350);}
if(db){
 $("connectionNotice").textContent="Online backend configured. Sign-in, room creation, room passwords and live multiplayer are ready when the database setup is complete.";
 db.auth.onAuthStateChange((_event,session)=>{sessionUser=session?.user||null;});
 trackVisit();
}else{
 $("connectionNotice").textContent="Demo preview. To enable real online rooms and shared scores, set up Supabase using README.md, config.js and schema.sql.";
}
renderTopics();renderStats();tickCountdown();setInterval(tickCountdown,1000);if(db)loadSharedSettings();
try{if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./service-worker.js").catch(()=>{});}catch{}
