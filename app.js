'use strict';
const $=id=>document.getElementById(id), KEY='hitori-plus-pwa-v1';
const THEME_KEY='talkraft-theme';
const prefersDark=window.matchMedia('(prefers-color-scheme: dark)');
function themePreference(){try{return localStorage.getItem(THEME_KEY)||'system'}catch{return 'system'}}
function effectiveTheme(){const mode=themePreference();return mode==='system'?(prefersDark.matches?'dark':'light'):mode}
function applyTheme(){const theme=effectiveTheme();document.documentElement.dataset.theme=theme;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#252529':'#f6f8fc';const picker=document.getElementById('themeMode');if(picker)picker.value=themePreference();if(typeof page!=='undefined'&&page==='chat'&&typeof renderChat==='function')renderChat()}
(prefersDark.addEventListener?prefersDark.addEventListener.bind(prefersDark):prefersDark.addListener.bind(prefersDark))('change',()=>{if(themePreference()==='system')applyTheme()});
const uid=()=> (crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random());
const presets={characters:[],folders:[{id:'folder0',name:'すべての会話'}],projects:[],settings:{bg:'#a9cff0',font:14,gap:12,interval:3,speed:1,nameSize:14,showNames:true,narratorSize:14,narratorBold:false}};
const clone=o=>JSON.parse(JSON.stringify(o)); let db;try{db=JSON.parse(localStorage.getItem(KEY))||clone(presets)}catch{db=clone(presets)};db.settings.nameSize ??=14;db.settings.showNames ??=true;let current='',page='home',history=[],redoStack=[],activeMessage=null,chosenEmoji='',chosenImage=null,selectedSpeaker=null,playing=false,editingMessageId=null,openFolderId=null,iconChooserOpen=false;
// Preserve older saved projects, but keep bubble alignment on each message.
db.projects.forEach(project=>project.messages.forEach(m=>{if(!m.side)m.side=db.characters.find(c=>c.id===m.characterId)?.side||'left'}));
// Imported or earlier demo data is preserved; original built-in speakers are not offered as new choices.
const selectableCharacters=()=>db.characters.filter(c=>!(c.id==='self'&&c.name==='自分'&&!c.image)||!(c.id==='voice'&&c.name==='心の声'&&!c.image)).sort((a,b)=>(a.displayOrder??db.characters.indexOf(a))-(b.displayOrder??db.characters.indexOf(b)));
const getProject=()=>db.projects.find(p=>p.id===current);const character=id=>db.characters.find(c=>c.id===id)||{name:'未登録',icon:'❔',color:'#fff',side:'left'};
applyTheme();
let lastChatId=null;let storageReady=false,storageQueue=Promise.resolve(),storageFailure=false;
function openDatabase(){return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('IndexedDBを利用できません'));const req=indexedDB.open('hitori-plus-db',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('state'))req.result.createObjectStore('state')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
let disk=null;
function idbRead(){return new Promise((resolve,reject)=>{const req=disk.transaction('state','readonly').objectStore('state').get('main');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function idbWrite(snapshot){return new Promise((resolve,reject)=>{const tx=disk.transaction('state','readwrite');tx.objectStore('state').put(snapshot,'main');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
function save(){history.push(JSON.stringify(db));redoStack=[];updateUndoControls()}
let saveState='saved',saveHideTimer=null;
function showSaveState(state){
 saveState=state;const el=$('saveState');if(!el)return;
 if(saveHideTimer){clearTimeout(saveHideTimer);saveHideTimer=null}
 el.dataset.status=state;el.textContent=({saving:'保存中…',saved:'✓ 保存済み',error:'⚠ 保存失敗'}[state]||state);
 el.title=state==='error'?'保存できませんでした。タップすると再試行・バックアップを選べます。':'';
 el.hidden=false;
 if(state==='saved')saveHideTimer=setTimeout(()=>{if(saveState==='saved')el.hidden=true;saveHideTimer=null},2000);
}
function persist(){const snapshot=clone(db);showSaveState('saving');
 if(disk){storageQueue=storageQueue.then(()=>idbWrite(snapshot)).then(()=>{storageFailure=false;showSaveState('saved')}).catch(err=>{storageFailure=true;showSaveState('error');console.error('保存失敗',err);});}
 else{try{localStorage.setItem(KEY,JSON.stringify(db));storageFailure=false;showSaveState('saved')}catch(e){storageFailure=true;showSaveState('error');console.error('保存失敗',e)}}
}
$('saveState').onclick=()=>{if(saveState==='error')sheet('保存に失敗しました',host=>host.append(button('再試行',()=>{close();persist()}),button('バックアップを書き出す',()=>{close();$('exportJson').click()}),button('閉じる',close)))};
function applySnapshot(snapshot){db=snapshot;persist();renderAll();updateUndoControls()}
async function initializeStorage(){try{disk=await openDatabase();const stored=await idbRead();if(stored&&Array.isArray(stored.projects)&&Array.isArray(stored.characters)){db=stored}else{await idbWrite(clone(db))}storageReady=true;renderAll();pageTo('home')}catch(e){console.warn('IndexedDB unavailable, old storage remains',e);disk=null;storageReady=true;renderAll();pageTo('home');alert('IndexedDBが使用できません。旧保存方式で起動しました。バックアップを保存してください。')}}
function mutate(fn){save();fn();persist();renderAll();updateUndoControls()};function notify(s){alert(s)};
function updateChatSummary(){
 const label=$('chatSummary'),p=getProject();if(!label)return;
 const show=page==='chat'&&!!p;label.classList.toggle('hidden',!show);
 if(!show)return;
 const ms=p.messages.length?timeline().duration:0; const total=Math.max(0,Math.ceil(ms/1000));
 label.textContent=`${p.messages.length}コメント ・ 動画 約${Math.floor(total/60)}分${String(total%60).padStart(2,'0')}秒`;
}
function pageTo(p){if(editingMessageId&&p!=='chat')saveEditing();page=p;updateChatSummary();document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===p));$('back').style.visibility=(p==='chat'||p==='video')?'visible':'hidden';$('title').textContent=p==='chat'?(getProject()?.title||'会話'):({'home':'トークラフト','characters':'キャラクター','settings':'設定','video':'動画'}[p]);$('topAdd').style.visibility=(p==='home'||p==='chat')?'visible':'hidden';$('topAdd').textContent=p==='chat'?'🎥':'＋';['searchToggle','textMenu','chatMore'].forEach(id=>$(id).classList.toggle('hidden',p!=='chat'));if(p==='characters')renderCharacters();if(p==='chat'){renderChat();if(lastChatId!==current){lastChatId=current;requestAnimationFrame(()=>{$('messages').scrollTop=$('messages').scrollHeight})}}if(p==='video'){$('videoProjectName').textContent=getProject()?.title||'';drawVideo(9999);}}
$('title').addEventListener('click',()=>{if(page!=='chat')return;const p=getProject();if(!p)return;ask('会話のタイトルを変更',p.title,v=>{mutate(()=>p.title=v);$('title').textContent=v})});
function button(text,fn,danger=false){const b=document.createElement('button');b.className='action'+(danger?' danger':'');b.textContent=text;b.onclick=fn;return b}
function sheet(title,make){$('sheet').replaceChildren();const h=document.createElement('h3');h.textContent=title;$('sheet').append(h);make($('sheet'));$('shade').classList.add('open')};function close(){ $('shade').classList.remove('open')};$('shade').onclick=e=>{if(e.target===$('shade'))close()};
function ask(label,value,cb){const v=prompt(label,value);if(v!==null&&v.trim())cb(v.trim())};
let favoritesOnly=false;function renderHome(){const host=$('projectList');const scrollBefore=host.scrollTop;host.replaceChildren();const term=$('search').value.trim().toLowerCase();const active=db.folders.find(f=>f.id===openFolderId);if(openFolderId&&!active)openFolderId=null;$('folderBack').classList.toggle('hidden',!openFolderId);const title=$('currentFolderTitle');title.textContent=active?'📂 '+active.name+' の会話一覧':'📁 フォルダ一覧';title.classList.remove('hidden');$('newFolder').classList.toggle('hidden',!!openFolderId);const folders=openFolderId?db.folders.filter(f=>f.id===openFolderId):db.folders;if(favoritesOnly){folders.splice(0,folders.length,...db.folders);}
for(const f of folders){const list=db.projects.filter(p=>p.folderId===f.id&&(!favoritesOnly||p.favorite)&&(p.title.toLowerCase().includes(term)||p.messages.some(m=>m.text.toLowerCase().includes(term))));if(term&&!list.length)continue;
if(!openFolderId&&!favoritesOnly){const row=document.createElement('div');row.className='folder-row';row.innerHTML='<span>📁</span><span class="grow"></span><span class="arrow">›</span>';row.querySelector('.grow').textContent=f.name+' ('+list.length+')';row.onclick=()=>{openFolderId=f.id;renderHome()};const menu=document.createElement('button');menu.textContent='⋯';menu.setAttribute('aria-label','フォルダの操作');menu.onclick=e=>{e.stopPropagation();folderMenu(f.id)};row.append(menu);host.append(row);continue}
const heading=document.createElement('div');heading.className='section-heading';heading.textContent='📁 '+f.name+'　('+list.length+' 件)';heading.onclick=()=>folderMenu(f.id);host.append(heading);
for(const p of list){const row=document.createElement('button');row.className='item';row.innerHTML='<span class="emo">💬</span><div class="grow"><div></div><div class="sub"></div></div><span class="arrow">›</span>';row.querySelector('.grow>div').textContent=(p.favorite?'★ ':'')+p.title;row.querySelector('.sub').textContent=p.messages.length+' 件のコメント';row.onclick=()=>{current=p.id;activeMessage=null;pageTo('chat')};row.oncontextmenu=e=>{e.preventDefault();projectMenu(p.id)};let press;row.addEventListener('touchstart',()=>press=setTimeout(()=>projectMenu(p.id),550),{passive:true});['touchend','touchcancel','touchmove'].forEach(k=>row.addEventListener(k,()=>clearTimeout(press),{passive:true}));const more=document.createElement('button');more.textContent='⋯';more.className='iconbtn';more.onclick=e=>{e.stopPropagation();projectMenu(p.id)};row.append(more);host.append(row)} }
host.scrollTop=openFolderId?scrollBefore:0;}
function folderMenu(id){const f=db.folders.find(x=>x.id===id);sheet('フォルダ：'+f.name,host=>{host.append(button('名前を変更',()=>{close();ask('フォルダ名',f.name,v=>mutate(()=>f.name=v))}));if(id!=='folder0')host.append(button('フォルダを削除（会話は「すべての会話」へ）',()=>{if(!confirm('このフォルダを削除しますか？\n会話は「すべての会話」に移動します。'))return;close();mutate(()=>{db.projects.filter(p=>p.folderId===id).forEach(p=>p.folderId='folder0');db.folders=db.folders.filter(x=>x.id!==id)})},true));host.append(button('閉じる',close))})}
function newProject(){ask('新しい会話のタイトル','新しい会話',v=>{const f=openFolderId||db.folders[0].id;mutate(()=>{const p={id:uid(),folderId:f,title:v,favorite:false,messages:[]};db.projects.unshift(p);current=p.id;activeMessage=null});pageTo('chat')})}
function projectMenu(id){const p=db.projects.find(x=>x.id===id);sheet(p.title,host=>{host.append(button('開く',()=>{current=id;close();pageTo('chat')}),button('タイトル変更',()=>{close();ask('タイトル',p.title,v=>mutate(()=>p.title=v))}),button('会話全体を複製',()=>{close();mutate(()=>{const cp=clone(p);cp.id=uid();cp.title+='（コピー）';cp.messages.forEach(m=>m.id=uid());db.projects.unshift(cp)})}),button(p.favorite?'★ お気に入り解除':'☆ お気に入り登録',()=>{close();mutate(()=>p.favorite=!p.favorite)}),button('別のフォルダに移動',()=>chooseFolder(p)),button('テキスト書き出し・コピー',()=>openProjectTextExport(p)),button('テキスト一括読み込み',()=>{current=p.id;openTextImport()}),button('会話を削除',()=>{if(confirm('この会話を削除しますか？')){close();mutate(()=>{db.projects=db.projects.filter(x=>x.id!==id);if(current===id)current=db.projects[0]?.id||''});pageTo('home')}},true))})}
function chooseFolder(p){sheet('移動先フォルダを選択',host=>db.folders.forEach(f=>host.append(button(f.name,()=>{close();mutate(()=>p.folderId=f.id)}))))}
function setIcon(host,c){host.replaceChildren();if(c.image){const img=document.createElement('img');img.src=c.image;img.alt=c.name;host.append(img)}else host.textContent=c.icon||'🙂'}
function syncSpeakerSelection(){const chars=selectableCharacters();if(!chars.length){selectedSpeaker=null;$('speaker').value='';return null}if(!selectedSpeaker||!chars.some(c=>c.id===selectedSpeaker))selectedSpeaker=chars[0].id;$('speaker').value=selectedSpeaker;return chars.find(c=>c.id===selectedSpeaker)||chars[0]}
function renderSpeakerPicker(){const host=$('speakerPicker');if(!host)return;host.replaceChildren();const c=syncSpeakerSelection();const avatar=document.createElement('div');avatar.className='avatar';if(c)setIcon(avatar,c);else avatar.textContent='＋';host.append(avatar)}
function renderAvatarStrip(){const host=$('avatarStrip');const previousScroll=host.scrollLeft;host.replaceChildren();const chars=selectableCharacters();syncSpeakerSelection();host.classList.toggle('open',iconChooserOpen&&chars.length>0);chars.forEach(c=>{const b=document.createElement('button');b.title=c.name;b.classList.toggle('selected',$('speaker').value===c.id);setIcon(b,c);b.onclick=()=>{$('speaker').value=c.id;selectedSpeaker=c.id;iconChooserOpen=false;renderSpeakerPicker();renderAvatarStrip();previewEditingSpeaker()};host.append(b)});host.scrollLeft=previousScroll;renderSpeakerPicker();}
// During message editing the picker also chooses that message's speaker.
// Preview only: save on Enter/Send, discard on Done.
function previewEditingSpeaker(){
  if(!editingMessageId||!selectedSpeaker)return;
  const message=getProject()?.messages.find(m=>m.id===editingMessageId);
  if(!message||message.side==='center')return;
  const row=[...$('messages').querySelectorAll('.message')].find(el=>el.dataset.messageId===editingMessageId);
  if(!row)return;
  const speaker=character(selectedSpeaker);
  const avatar=row.querySelector('.avatar'), name=row.querySelector('.who');
  if(avatar)setIcon(avatar,speaker);
  if(name)name.textContent=speaker.name;
}
function selectedMessage(){return getProject()?.messages.find(x=>x.id===activeMessage)}
function selectedIndex(){return getProject()?.messages.findIndex(x=>x.id===activeMessage)??-1}
function onSelected(fn){const m=selectedMessage();if(!m)return alert('操作するコメントを選択してください');fn(m)}
function moveSelected(step){onSelected(()=>{const id=activeMessage;saveEditing();activeMessage=id;const p=getProject(),i=selectedIndex(),to=i+step;if(to<0||to>=p.messages.length)return;mutate(()=>{const [m]=p.messages.splice(i,1);p.messages.splice(to,0,m)});const m=p.messages.find(x=>x.id===id);if(m)beginEditing(m);renderChat()})}
$('deleteMsg').onclick=()=>deleteSelectedDirect();
$('duplicateMsg').onclick=()=>onSelected(m=>{const id=m.id;saveEditing();const p=getProject(),i=p.messages.findIndex(x=>x.id===id);if(i<0)return;const copy={...clone(p.messages[i]),id:uid()};mutate(()=>p.messages.splice(i+1,0,copy));selectMessage(copy.id);});
$('upMsg').onclick=()=>moveSelected(-1);$('downMsg').onclick=()=>moveSelected(1);
$('sideMsg').onclick=()=>onSelected(m=>{const id=m.id;saveEditing();const msg=getProject().messages.find(x=>x.id===id);if(!msg)return;mutate(()=>msg.side=msg.side==='left'?'center':msg.side==='center'?'right':'left');beginEditing(msg);renderChat()});
function updateEditNavigator(){const el=$('editNavigator');if(!el)return;const p=getProject(),i=p?.messages.findIndex(m=>m.id===editingMessageId)??-1;el.classList.toggle('hidden',i<0);if(i>=0){$('editPosition').textContent=(i+1)+' / '+p.messages.length;$('editPrev').disabled=i===0;$('editNext').disabled=i===p.messages.length-1}}
function switchEditing(delta){const p=getProject(),i=p?.messages.findIndex(m=>m.id===editingMessageId)??-1;if(i<0||i+delta<0||i+delta>=p.messages.length)return;saveEditing();selectMessage(p.messages[i+delta].id)}
$('editPrev').onclick=()=>switchEditing(-1);$('editNext').onclick=()=>switchEditing(1);
function openInlineCharacterPicker(message){sheet('このコメントのキャラクターを変更',host=>{selectableCharacters().forEach(c=>{const b=button(c.name,()=>{close();if(editingMessageId)saveEditing();mutate(()=>message.characterId=c.id)});const image=document.createElement('span');image.className='avatar';image.style.cssText='display:inline-flex;width:30px;height:30px;vertical-align:middle;margin-right:8px';setIcon(image,c);b.prepend(image);host.append(b)});host.append(button('キャンセル',close))})}
function cancelEditing(){if(editingMessageId){const m=getProject()?.messages.find(x=>x.id===editingMessageId);if(m){const row=[...$('messages').querySelectorAll('.message')].find(el=>el.dataset.messageId===editingMessageId);if(row&&m.side!=='center'){const avatar=row.querySelector('.avatar'),name=row.querySelector('.who');if(avatar)setIcon(avatar,character(m.characterId));if(name)name.textContent=character(m.characterId).name}}}editingMessageId=null;$('entry').value='';$('entry').placeholder='メッセージを入力…';resizeEntry()}
function beginEditing(m){
  activeMessage=m.id;
  editingMessageId=m.id;
  // The picker must match the selected comment, not the last composed comment.
  if(m.side!=='center'&&selectableCharacters().some(c=>c.id===m.characterId)){selectedSpeaker=m.characterId;renderAvatarStrip()}
  $('entry').value=m.text;
  updateEditNavigator();
  $('entry').placeholder='コメントを編集中…';
  // Do not focus the editor here: browsers scroll focused inputs into view.
}
function isEditDirty(){const m=getProject()?.messages.find(x=>x.id===editingMessageId);return !!m&&($('entry').value!==m.text||(m.side!=='center'&&selectedSpeaker!==m.characterId));}
function confirmLeaveEdit(){return true;}
function saveEditing(){
 if(!editingMessageId)return;
 const m=getProject()?.messages.find(x=>x.id===editingMessageId);
 if(!m){finishEdit();return;}
 const text=$('entry').value;
 const speaker=selectedSpeaker;
 if(text!==m.text||(m.side!=='center'&&speaker&&speaker!==m.characterId)){
  mutate(()=>{m.text=text;if(m.side!=='center'&&speaker&&selectableCharacters().some(c=>c.id===speaker))m.characterId=speaker});
 }
 finishEdit();
}
function previewEditingText(){
 if(!editingMessageId)return;
 const row=[...$('messages').querySelectorAll('.message')].find(el=>el.dataset.messageId===editingMessageId);
 const bubble=row?.querySelector('.bubble');if(!bubble)return;
 bubble.textContent=$('entry').value;
}

function deleteSelectedDirect(){const m=selectedMessage();if(!m)return;const id=m.id;finishEdit();mutate(()=>{const p=getProject();p.messages=p.messages.filter(x=>x.id!==id)});}
function selectMessage(id){
  if(editingMessageId && editingMessageId!==id)saveEditing();
  const m=getProject()?.messages.find(x=>x.id===id);if(!m)return;
  if(editingMessageId&&editingMessageId!==id)saveEditing();
  // Selection must not rebuild the message DOM or change scroll position.
  beginEditing(m);
  document.querySelectorAll('#messages .message').forEach(row=>row.classList.toggle('selected',row.dataset.messageId===id));
  $('messageTools').classList.add('show');
  updateEditNavigator();
  resizeEntry();
  // Wait until the toolbar has changed the message viewport before measuring.
  requestAnimationFrame(()=>requestAnimationFrame(()=>ensureSelectedVisible(id)));
}
// Keep selected message above the editing toolbar, without jumping when already visible.
function ensureSelectedVisible(id=activeMessage){
  if(!id||page!=='chat')return;
  const host=$('messages');
  const row=[...host.querySelectorAll('.message')].find(n=>n.dataset.messageId===id);
  if(!row)return;
  const viewport=host.getBoundingClientRect(),rect=row.getBoundingClientRect();
  const margin=12;
  if(rect.bottom>viewport.bottom-margin){
    host.scrollTop+=rect.bottom-(viewport.bottom-margin);
  }else if(rect.top<viewport.top+margin){
    host.scrollTop-=viewport.top+margin-rect.top;
  }
}
$('doneMsg').onclick=()=>{saveEditing();$('entry').blur()};$('clearTextMsg').onclick=()=>{if(!editingMessageId)return;$('entry').value='';resizeEntry();previewEditingText();$('entry').focus({preventScroll:true})};
$('speaker').onchange=()=>{selectedSpeaker=$('speaker').value;renderAvatarStrip();renderSpeakerPicker()};
$('speakerPicker').onclick=()=>{iconChooserOpen=!iconChooserOpen;renderAvatarStrip()};
let speakerTouchX=null;
$('speakerPicker').addEventListener('touchstart',e=>{speakerTouchX=e.touches[0]?.clientX??null},{passive:true});
$('speakerPicker').addEventListener('touchend',e=>{if(speakerTouchX===null)return;const dx=(e.changedTouches[0]?.clientX??speakerTouchX)-speakerTouchX;speakerTouchX=null;if(Math.abs(dx)<24)return;e.preventDefault();e.stopPropagation();const chars=selectableCharacters();if(!chars.length)return;const i=chars.findIndex(c=>c.id===selectedSpeaker);const next=chars[(i+(dx<0?1:-1)+chars.length)%chars.length];selectedSpeaker=next.id;renderSpeakerPicker();renderAvatarStrip();if(editingMessageId)previewEditingSpeaker()},{passive:false});

function renderChat(){const p=getProject();if(!p)return;updateChatSummary();const host=$('messages');host.style.background=db.settings.bg||'#a9cff0';host.style.gap=db.settings.gap+'px';host.style.setProperty('--msg-size',db.settings.font+'px');const scrollBefore=host.scrollTop;host.replaceChildren();const sel=$('speaker'),old=sel.value;sel.replaceChildren();selectableCharacters().forEach(c=>{const op=document.createElement('option');op.value=c.id;op.textContent=c.icon+' '+c.name;sel.append(op)});if(selectableCharacters().some(c=>c.id===old))sel.value=old; if(selectedSpeaker&&selectableCharacters().some(c=>c.id===selectedSpeaker))sel.value=selectedSpeaker;renderAvatarStrip();for(const m of p.messages){const c=character(m.characterId),row=document.createElement('div');const side=((m.side||c.side)==='right'?'right':m.side==='center'?'center':'left');row.className='message '+(side==='left'?'':side);row.dataset.messageId=m.id;const av=document.createElement('div');av.className='avatar';setIcon(av,c);const meta=document.createElement('div');meta.className='msgcontent';const name=document.createElement('div');name.className='who';name.textContent=c.name;name.style.fontSize=(db.settings.nameSize??14)+'px';name.hidden=db.settings.showNames===false||m.side==='center';const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=m.text;if(m.side==='center'){bubble.style.fontSize=(db.settings.narratorSize||14)+'px';bubble.style.fontWeight=db.settings.narratorBold?'700':'400'}meta.append(name,bubble);if(m.side==='center'){av.remove();row.append(meta)}else row.append(av,meta);row.classList.toggle('selected',activeMessage===m.id);const activate=()=>{if(bulkMode){toggleBulk(m.id);return}selectMessage(m.id)};
 bubble.addEventListener('click',activate);
 if(m.side==='center'){/* narrator body is clickable */}
 else{av.addEventListener('click',e=>{e.stopPropagation();openInlineCharacterPicker(m)});}
 let swipeX=0,swipeY=0,swipeStamp=0,swiped=false;
 bubble.addEventListener('touchstart',e=>{if(!e.touches.length)return;swipeX=e.touches[0].clientX;swipeY=e.touches[0].clientY;swipeStamp=Date.now();swiped=false},{passive:true});
 bubble.addEventListener('touchend',e=>{const touch=e.changedTouches[0];if(!touch)return;const dx=touch.clientX-swipeX,dy=touch.clientY-swipeY;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.6&&Date.now()-swipeStamp<1000&&m.side!=='center'){swiped=true;if(editingMessageId)saveEditing();mutate(()=>m.side=dx>0?'right':'left');setTimeout(()=>swiped=false,350)}},{passive:true});
 bubble.addEventListener('click',e=>{if(swiped){e.stopImmediatePropagation();e.preventDefault()}},true);let timer;row.addEventListener('touchstart',()=>timer=setTimeout(()=>{if(!bulkMode)startBulk();toggleBulk(m.id)},550),{passive:true});['touchend','touchmove','touchcancel'].forEach(ev=>row.addEventListener(ev,()=>clearTimeout(timer),{passive:true}));host.append(row);if(bulkSelected.has(m.id))row.classList.add('bulk-selected')}$('messageTools').classList.toggle('show',!!activeMessage&&!bulkMode);updateEditNavigator();host.scrollTop=scrollBefore;applySearchHighlights();if(activeMessage)requestAnimationFrame(()=>requestAnimationFrame(()=>ensureSelectedVisible()));}
document.addEventListener('pointerdown',e=>{
 if(page!=='chat'||!editingMessageId||bulkMode||$('shade').classList.contains('open'))return;
 if(e.target.closest('#messageTools,#entry,#composer,#composerHelpers,#avatarStrip,#speakerPicker,#chatSearchPanel,.message,.bar,.tabs'))return;
 saveEditing();
},true);
function luminance(s){if(!/^#[0-9a-f]{6}$/i.test(s))return 1;const n=parseInt(s.slice(1),16);return (((n>>16)&255)*.299+((n>>8)&255)*.587+(n&255)*.114)/255}
function messageMenu(id){const p=getProject();if(!p)return;const i=p.messages.findIndex(m=>m.id===id);if(i<0)return;const m=p.messages[i];sheet('コメントを操作',host=>{host.append(button('✎ 編集',()=>{close();ask('コメントを編集',m.text,v=>mutate(()=>m.text=v))}),button('⧉ コメントを複製',()=>{close();mutate(()=>p.messages.splice(i+1,0,{...clone(m),id:uid()}))}),button('↑ 上へ移動',()=>{close();if(i>0)mutate(()=>[p.messages[i-1],p.messages[i]]=[p.messages[i],p.messages[i-1]])}),button('↓ 下へ移動',()=>{close();if(i<p.messages.length-1)mutate(()=>[p.messages[i],p.messages[i+1]]=[p.messages[i+1],p.messages[i]])}),button('↔ 左・中央・右を切替',()=>{close();mutate(()=>m.side=m.side==='left'?'center':m.side==='center'?'right':'left')}),button('🙂 発言キャラクター変更',()=>chooseCharacter(m)),button('🗑 削除',()=>{close();finishEdit();mutate(()=>p.messages.splice(i,1))},true))})}
function chooseCharacter(m){sheet('発言者を選択',host=>db.characters.forEach(c=>host.append(button(c.icon+' '+c.name,()=>{close();mutate(()=>m.characterId=c.id)}))))}
// Live drag-and-drop: item follows the pointer; siblings move while hovering.
function enableLiveSort(list,selector,key,onCommit){
 const grips=[...list.querySelectorAll(selector+' .reorder-grip, '+selector+' .char-handle')];
 grips.forEach(handle=>{
  handle.draggable=false;
  handle.addEventListener('pointerdown',e=>{
   if(e.button!==0&&e.pointerType==='mouse')return;
   const row=handle.closest(selector);if(!row)return;
   const startY=e.clientY,startX=e.clientX;
   let active=false,ghost=null,origin=Array.from(list.querySelectorAll(selector)).map(r=>r.dataset[key]);
   let pointerY=startY,offsetY=0,offsetX=0;
   const prevTouchAction=document.body.style.touchAction;
   const move=ev=>{
    if(ev.pointerId!==e.pointerId)return;
    pointerY=ev.clientY;
    if(!active){if(Math.hypot(ev.clientX-startX,ev.clientY-startY)<7)return;
     active=true;ev.preventDefault();
     const rect=row.getBoundingClientRect();offsetY=startY-rect.top;offsetX=startX-rect.left;
     ghost=row.cloneNode(true);ghost.classList.add('sort-ghost');
     Object.assign(ghost.style,{position:'fixed',zIndex:'99999',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',pointerEvents:'none',boxSizing:'border-box'});
     document.body.append(ghost);row.classList.add('sort-placeholder');document.body.style.touchAction='none';
    }
    ev.preventDefault();ghost.style.top=(ev.clientY-offsetY)+'px';ghost.style.left=(ev.clientX-offsetX)+'px';
    const siblings=[...list.querySelectorAll(selector)].filter(x=>x!==row);
    const target=siblings.find(x=>{const b=x.getBoundingClientRect();return ev.clientY>=b.top&&ev.clientY<=b.bottom;});
    if(target){const b=target.getBoundingClientRect();const before=recordRectsForList(list,selector,key);
      if(ev.clientY<b.top+b.height/2)list.insertBefore(row,target);else list.insertBefore(row,target.nextSibling);
      animateListReflow(list,selector,key,before,row);
    }
   };
   const stop=ev=>{
    if(ev.pointerId!==e.pointerId)return;
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',cancel);
    document.body.style.touchAction=prevTouchAction;
    if(ghost)ghost.remove();row.classList.remove('sort-placeholder');
    if(!active)return;
    const ordered=[...list.querySelectorAll(selector)].map(r=>r.dataset[key]);
    if(ordered.join('\0')!==origin.join('\0'))onCommit(ordered);
   };
   const cancel=ev=>{if(ev.pointerId!==e.pointerId)return;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',cancel);document.body.style.touchAction=prevTouchAction;if(ghost)ghost.remove();row.classList.remove('sort-placeholder');const mapping=new Map([...list.querySelectorAll(selector)].map(r=>[r.dataset[key],r]));origin.forEach(k=>list.append(mapping.get(k)))};
   window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',cancel);
  });
 });
}
function recordRectsForList(list,selector,key){return new Map([...list.querySelectorAll(selector)].map(r=>[r.dataset[key],r.getBoundingClientRect()]))}
function animateListReflow(list,selector,key,before,exclude){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;list.querySelectorAll(selector).forEach(r=>{if(r===exclude)return;const b=before.get(r.dataset[key]);if(!b)return;const dy=b.top-r.getBoundingClientRect().top;if(Math.abs(dy)>2)r.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:170,easing:'ease-out'})})}
function dragList(){
 const p=getProject();if(!p)return;
 sheet('コメントの並べ替え',host=>{
  const hint=document.createElement('p');hint.className='reorder-hint';hint.textContent='左の ≡ をドラッグして並べ替え（iPhoneでは上下にスワイプ）';
  const list=document.createElement('div');list.className='reorder-list';
  function moveMessage(fromId,toId){
   const from=p.messages.findIndex(x=>x.id===fromId),to=p.messages.findIndex(x=>x.id===toId);
   if(from<0||to<0||from===to)return;
   const before=recordRects('.reorder-list .reorder-row','messageId');
   mutate(()=>{const [v]=p.messages.splice(from,1);p.messages.splice(to,0,v)});
   const rows=[...list.querySelectorAll('.reorder-row')];rows.sort((a,b)=>p.messages.findIndex(m=>m.id===a.dataset.messageId)-p.messages.findIndex(m=>m.id===b.dataset.messageId));list.replaceChildren(...rows);animateRects('.reorder-list .reorder-row','messageId',before);
  }
  p.messages.forEach(m=>{
   const row=document.createElement('div');row.className='reorder-row';row.dataset.messageId=m.id;
   const grip=document.createElement('span');grip.className='reorder-grip';grip.textContent='⠿';grip.title='ここをドラッグして並べ替え';grip.setAttribute('aria-label','並べ替えハンドル');
   const avatar=document.createElement('span');avatar.className='avatar reorder-avatar';
   const isNarrator=m.side==='center';
   if(isNarrator){avatar.textContent='☰';avatar.classList.add('reorder-narrator-avatar')}else{setIcon(avatar,character(m.characterId))}
   const content=document.createElement('div');content.className='reorder-content';
   const name=document.createElement('div');name.className='reorder-name';name.textContent=isNarrator?'ナレーター':character(m.characterId).name;
   const body=document.createElement('div');body.className='reorder-text';body.textContent=m.text;
   content.append(name,body);row.append(grip,avatar,content);list.append(row);

  });
  host.append(hint,list,button('完了',close));
  enableLiveSort(list,'.reorder-row','messageId',ids=>mutate(()=>{p.messages=ids.map(id=>p.messages.find(m=>m.id===id))}));
 });
}
const EMOJIS='😀 😇 😎 🤖 🌙 🌸 🐱 🐻 🦊 🐰 🧑 👩 👦🏻 👻 💡 🔥 🦋 🎀 🌿'.split(' ');async function compressImage(file){if(!file)return null;if(file.size>10*1024*1024){alert('画像は10MB以下にしてください');return null}const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const cn=document.createElement('canvas');cn.width=160;cn.height=160;const g=cn.getContext('2d');const min=Math.min(img.width,img.height);g.drawImage(img,(img.width-min)/2,(img.height-min)/2,min,min,0,0,160,160);return cn.toDataURL('image/jpeg',.8)}catch(e){alert('画像を読み込めませんでした');return null}finally{URL.revokeObjectURL(url)}}
function recordRects(selector,key){const map=new Map();document.querySelectorAll(selector).forEach(el=>map.set(el.dataset[key],el.getBoundingClientRect()));return map}
function animateRects(selector,key,before){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.querySelectorAll(selector).forEach(el=>{const prev=before.get(el.dataset[key]);if(!prev)return;const next=el.getBoundingClientRect(),dy=prev.top-next.top;if(Math.abs(dy)<2)return;el.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'})})}
function changeCharacterOrder(fromId,toId){const before=recordRects('#characterList .item','id');const sorted=selectableCharacters();const from=sorted.findIndex(c=>c.id===fromId),to=sorted.findIndex(c=>c.id===toId);if(from<0||to<0||from===to)return;const [m]=sorted.splice(from,1);sorted.splice(to,0,m);mutate(()=>sorted.forEach((c,i)=>c.displayOrder=i));animateRects('#characterList .item','id',before)}
function renderCharacters(){const list=$('characterList');list.replaceChildren();const chars=selectableCharacters();chars.forEach(c=>{const row=document.createElement('div');row.className='item character-sort-row';row.dataset.id=c.id;const handle=document.createElement('button');handle.className='char-handle';handle.textContent='☰';handle.title='ここをドラッグして並び替え';const ava=document.createElement('span');ava.className='avatar';setIcon(ava,c);const name=document.createElement('button');name.textContent=c.name;name.style.cssText='background:transparent;border:0;color:var(--ui-fg);text-align:left;flex:1;font-size:14px;min-height:42px';name.onclick=()=>characterMenu(c);row.append(handle,ava,name);list.append(row)});enableLiveSort(list,'.character-sort-row','id',ids=>mutate(()=>{ids.forEach((id,i)=>{const c=db.characters.find(ch=>ch.id===id);if(c)c.displayOrder=i})}))}
function characterMenu(c){sheet('キャラクター：'+c.name,host=>{host.append(button('名前変更',()=>{close();ask('名前',c.name,v=>mutate(()=>c.name=v))}),button('画像アイコンに変更',()=>{close();const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=async()=>{const image=await compressImage(input.files[0]);if(image)mutate(()=>c.image=image)};input.click()}),button('削除',()=>{if(db.projects.some(p=>p.messages.some(m=>m.characterId===c.id)))return notify('使用中のキャラクターは削除できません');if(!confirm('キャラクター「'+c.name+'」を削除しますか？'))return;close();mutate(()=>db.characters=db.characters.filter(x=>x.id!==c.id))},true))})}
function renderSettings(){const s=db.settings; if($('themeMode'))$('themeMode').value=themePreference();[['bgColor',s.bg],['fontSize',s.font],['bubbleGap',s.gap],['interval',s.interval],['speed',s.speed]].forEach(([id,v])=>$(id).value=v);$('fontSizeLabel').textContent=s.font+'px';$('bubbleGapLabel').textContent=s.gap+'px';$('intervalLabel').textContent=Number(s.interval).toFixed(1)+'秒';$('nameSize').value=s.nameSize??14;$('nameSizeLabel').textContent=(s.nameSize??14)+'px';$('showNames').checked=s.showNames!==false;}
function renderVideoSelect(){$('videoProjectName').textContent=getProject()?.title||''}
function renderAll(){renderHome();renderCharacters();renderSettings();renderVideoSelect();updateChatSummary();if(page==='chat')renderChat();if(page==='video'&&!playing)drawVideo(9999)}
function download(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
// Text exchange: character lines are 名前「本文」; unadorned lines are narration.
// A quoted character line can contain embedded newlines, for lossless export/import.
function exportConversationText(p){return p.messages.map(m=>m.side==='center'?m.text:character(m.characterId).name+'「'+m.text+'」').join('\n')}
function downloadText(p){download(p.title+'.txt',new Blob([exportConversationText(p)],{type:'text/plain;charset=utf-8'}))}
function parseConversationText(raw){
 const lines=raw.replace(/\r\n?/g,'\n').split('\n'),out=[];
 let name=null,body=[],openedAt=0;
 for(const [lineIndex,line] of lines.entries()){const lineNo=lineIndex+1;
  if(name!==null){
   const end=line.lastIndexOf('」');
   if(end<0){body.push(line);continue}
   if(line.slice(end+1).trim())throw Error(lineNo+'行目：キャラクターのコメントは キャラ名「文章」 の形式にしてください。');
   body.push(line.slice(0,end));out.push({name,text:body.join('\n'),line:openedAt});name=null;body=[];continue;
  }
  if(!line.trim())continue;
  const start=line.match(/^\s*(.+?)「(.*)$/);
  if(start){
   const who=start[1].trim(),rest=start[2];
   if(!who)throw Error(lineNo+'行目：キャラクター名がありません。');
   const end=rest.lastIndexOf('」');
   if(end>=0){
    if(rest.slice(end+1).trim())throw Error(lineNo+'行目：キャラクターのコメントは キャラ名「文章」 の形式にしてください。');
    out.push({name:who,text:rest.slice(0,end),line:lineNo});
   }else{name=who;body=[rest];openedAt=lineNo}
  }else{out.push({name:'ナレーター',text:line,line:lineNo})}
 }
 if(name!==null)throw Error(openedAt+'行目：「」が閉じられていません：'+name);
 return out.filter(v=>v.text.trim());
}
function openTextImport(){const p=getProject();if(!p)return;sheet('テキストからコメントを一括追加',host=>{
 const hint=document.createElement('p');hint.className='hint';hint.textContent='キャラ名「セリフ」で入力。文章だけの行はナレーターになります。';
 const area=document.createElement('textarea');area.className='import-area';area.style.fontSize='16px';area.placeholder='キャラA「おはよう！」\nキャラB「今日はいい天気だね」\n二人は駅で待ち合わせをした。';
 const status=document.createElement('div');status.className='import-preview';status.setAttribute('aria-live','polite');
 const validate=()=>{status.replaceChildren();let parsed=[];try{parsed=parseConversationText(area.value)}catch(e){status.textContent=e.message;return null}
 const names=new Set(db.characters.map(c=>c.name));const bad=parsed.filter(x=>x.name!=='ナレーター'&&!names.has(x.name));if(bad.length){const summary=document.createElement('p');summary.textContent='未登録のキャラクターが含まれています。'+bad.length+'件のエラー。全件を中止します。';status.append(summary);const issues=new Set(bad.map(x=>x.line));area.value.split('\n').forEach((line,i)=>{const div=document.createElement('div');div.className=issues.has(i+1)?'bad-line':'good-line';div.textContent=(i+1)+'行目 '+line;status.append(div)});return null}
 status.textContent=parsed.length+'件を読み込み予定';return parsed};
 const go=button('末尾にコメントを追加',()=>{const parsed=validate();if(!parsed||!parsed.length)return;const indexed=db.characters.map((c,i)=>({...c,_created:c.createdOrder??i})).sort((a,b)=>a._created-b._created);const staged=p.messages.slice();const add=parsed.map(v=>{const characterId=v.name==='ナレーター'?null:indexed.find(c=>c.name===v.name).id;const m={id:uid(),characterId,side:characterId?nextCommentSide(staged,characterId):'center',text:v.text};staged.push(m);return m});mutate(()=>p.messages.push(...add));close();activeMessage=null;renderChat();$('messages').scrollTop=$('messages').scrollHeight;alert(add.length+'件を追加しました')});
 area.oninput=validate;host.append(hint,area,status,go)
})}

function openProjectTextExport(p){current=p.id;openTextExport()}
function openTextExport(){const p=getProject();if(!p)return;sheet('会話テキストを書き出す',host=>{const area=document.createElement('textarea');area.className='import-area';area.value=exportConversationText(p);host.append(area,button('テキストをコピー',async()=>{try{await navigator.clipboard.writeText(area.value);alert('コピーしました')}catch{area.select();document.execCommand('copy')}}),button('TXTファイルを保存',()=>downloadText(p)))})}

$('exportJson').onclick=()=>{download('hitori-backup-'+new Date().toISOString().slice(0,10)+'.json',new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));try{localStorage.setItem('hitori-last-backup',String(Date.now()))}catch{}};$('importJson').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.projects)||!Array.isArray(data.characters)||!Array.isArray(data.folders)||!data.settings)throw Error();if(!confirm('現在のデータをバックアップで置き換えますか？'))return;mutate(()=>db=data);pageTo('home')}catch{alert('バックアップファイルが正しくありません')}e.target.value=''};
function updateUndoControls(){
 const u=$('helperUndo'),r=$('helperRedo');
 if(u)u.disabled=history.length===0;
 if(r)r.disabled=redoStack.length===0;
}
function undoAction(){const last=history.pop();if(!last)return;redoStack.push(JSON.stringify(db));applySnapshot(JSON.parse(last))}
function redoAction(){const next=redoStack.pop();if(!next)return;history.push(JSON.stringify(db));applySnapshot(JSON.parse(next))}
$('undo').onclick=undoAction;$('redo').onclick=redoAction;
$('helperUndo').onclick=undoAction;$('helperRedo').onclick=redoAction;
$('helperPhrases').onclick=()=>showQuickPanel('phrases');
$('helperScript').onclick=()=>showQuickPanel('script');
// Reuse the validated existing newline insertion handler, including cursor preservation.
$('helperNewline').addEventListener('pointerdown',e=>e.preventDefault());
$('helperNewline').onclick=e=>{$('newline').click()};
updateUndoControls();
$('newFolder').onclick=()=>ask('新しいフォルダ名','新しいフォルダ',v=>{mutate(()=>db.folders.push({id:uid(),name:v}));});$('folderBack').onclick=()=>{openFolderId=null;$('search').value='';renderHome()};$('topAdd').onclick=()=>{if(page==='chat')pageTo('video');else if(page==='home')sheet('新規作成',host=>host.append(button('会話を作成',()=>{close();newProject()}),button('フォルダを作成',()=>{close();$('newFolder').click()})));else newProject()};$('search').oninput=renderHome;$('back').onclick=()=>pageTo(page==='video'?'chat':'home');document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>pageTo(b.dataset.page));$('shade').addEventListener('keydown',e=>{if(e.key==='Escape')close()});
function finishEdit(){cancelEditing();$('editNavigator').classList.add('hidden');activeMessage=null;$('messageTools').classList.remove('show');document.querySelectorAll('#messages .selected').forEach(n=>n.classList.remove('selected'))}
function resizeEntry(){const el=$('entry');el.style.height='auto';el.style.height=Math.min(120,el.scrollHeight)+'px'}
function nextCommentSide(messages, speakerId){
  const previous=[...messages].reverse().find(m=>m.side!=='center'&&m.characterId);
  if(!previous)return 'left';
  const prevSide=previous.side==='right'?'right':'left';
  return previous.characterId===speakerId?prevSide:(prevSide==='right'?'left':'right');
}
let lastPostedId=null;
function sendEntry(){const p=getProject(),input=$('entry'),value=input.value.trim();if(!p)return;if(editingMessageId&&!value){deleteSelectedDirect();return}if(!value)return;
if(editingMessageId){saveEditing();input.blur();return}
const who=selectedSpeaker||$('speaker').value||selectableCharacters()[0]?.id;if(!who)return alert('先にキャラクターを登録してください');const message={id:uid(),characterId:who,side:nextCommentSide(p.messages,who),text:value};mutate(()=>p.messages.push(message));lastPostedId=message.id;input.value='';activeMessage=null;iconChooserOpen=false;resizeEntry();renderChat();requestAnimationFrame(()=>{$('messages').scrollTop=$('messages').scrollHeight})}
$('nameSize').onchange=e=>{db.settings.nameSize=Number(e.target.value);persist();renderSettings();if(page==='chat')renderChat();if(page==='video'&&!playing)drawVideo(9999)};$('showNames').onchange=e=>{db.settings.showNames=e.target.checked;persist();renderSettings();if(page==='chat')renderChat();if(page==='video'&&!playing)drawVideo(9999)};
$('entry').addEventListener('input',()=>{resizeEntry();previewEditingText()});$('entry').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();sendEntry()}});let caretStart=0,caretEnd=0;
const captureCaret=()=>{caretStart=$('entry').selectionStart;caretEnd=$('entry').selectionEnd};
['keyup','click','select','input'].forEach(type=>$('entry').addEventListener(type,captureCaret));
$('newline').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();captureCaret()});
$('newline').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const el=$('entry');const start=Math.min(caretStart,el.value.length),end=Math.min(caretEnd,el.value.length);el.setRangeText('\n',start,end,'end');captureCaret();resizeEntry();previewEditingText();el.focus({preventScroll:true})});
$('addCharacter').onclick=async()=>{const n=$('charName').value.trim();if(!n)return alert('名前を入力してください');const image=$('charImage').files[0]?await compressImage($('charImage').files[0]):null;if(!image)return alert('キャラクターの画像を選択してください');mutate(()=>db.characters.push({id:uid(),name:n,icon:'',image,createdOrder:Math.max(-1,...db.characters.map((c,i)=>c.createdOrder??i))+1,displayOrder:db.characters.length}));$('charName').value='';$('charImage').value=''};
for(const [id,key,cast] of [['bgColor','bg',String],['fontSize','font',Number],['bubbleGap','gap',Number],['interval','interval',Number],['speed','speed',Number]])$(id).oninput=e=>{db.settings[key]=cast(e.target.value);persist();renderSettings();updateChatSummary()};
// Canvas video preview: pop-in only, no typing indicator.
const imageCache={};function loadAvatar(c){if(!c.image||imageCache[c.id]?.src===c.image)return;const pic=new Image();pic.src=c.image;imageCache[c.id]=pic}
const canvas=$('videoCanvas'),ctx=canvas.getContext('2d'),CW=360,CH=640;ctx.setTransform(3,0,0,3,0,0);
function wrapText(text,max,font){ctx.font=font;const lines=[];for(const para of text.split('\n')){let line='';for(const ch of para){if(ctx.measureText(line+ch).width>max&&line){lines.push(line);line=ch}else line+=ch}lines.push(line)}return lines}
function round(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
let videoHitRects=[];function drawVideo(revealed,pop=0){
 videoHitRects=[];
 const p=getProject();ctx.fillStyle=db.settings.bg;ctx.fillRect(0,0,CW,CH);if(!p)return;
 const fontSize=Number(db.settings.font)||14, lineHeight=Math.round(fontSize*1.48);
 const padH=10,padV=7, maxBubble=256, minBubble=42;
 const gap=Math.max(4,Math.min(28,Number(db.settings.gap)||12));const showNames=db.settings.showNames!==false,nameSize=Number(db.settings.nameSize??14);
 const layouts=[];
 for(let i=0;i<Math.min(revealed,p.messages.length);i++){
  const m=p.messages[i],c=character(m.characterId);const textSize=m.side==='center'?(db.settings.narratorSize||14):fontSize;const lines=wrapText(m.text,maxBubble-padH*2,`${textSize}px sans-serif`);
  ctx.font=`${fontSize}px sans-serif`;const maxLine=Math.max(0,...lines.map(x=>ctx.measureText(x).width));
  const w=Math.min(maxBubble,Math.max(minBubble,Math.ceil(maxLine+padH*2)));
  const nameHeight=m.side==='center'||!showNames?0:nameSize+6;const effectiveLine=m.side==='center'?Math.round((db.settings.narratorSize||14)*1.48):lineHeight;const h=(m.side==='center'?Math.max(26,lines.length*effectiveLine+8):Math.max(35,lines.length*lineHeight+padV*2))+nameHeight;
  layouts.push({c,m,lines,w,h,index:i,nameHeight});
 }
 const padTop=30,padBottom=22;
 const full=layouts.reduce((sum,v)=>sum+v.h+gap,0)-gap;
 let y=padTop-Math.max(0,full-(CH-padTop-padBottom));
 ctx.save();ctx.beginPath();ctx.rect(0,0,CW,CH);ctx.clip();
 layouts.forEach(({c,m,lines,w,h,index,nameHeight})=>{
  const center=m.side==='center',right=(m.side||c.side)==='right';const bx=center?(CW-w)/2:right?CW-48-w:49;const avatarX=right?CW-36:14;const contentY=y+nameHeight;
  videoHitRects.push({id:m.id,x:center?0:right?bx-4:avatarX-4,y:y-3,w:center?CW:(right?CW-bx+4:w+55),h:h+6});
  const alpha=(index===revealed-1&&pop>0)?1-pop*.6:1;
  ctx.save();ctx.globalAlpha=alpha;
  if(!center){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(avatarX+13,contentY+16,13,0,Math.PI*2);ctx.fill();
  if(c.image){const pic=imageCache[c.id];if(pic?.complete&&pic.naturalWidth){ctx.save();ctx.beginPath();ctx.arc(avatarX+13,contentY+16,13,0,Math.PI*2);ctx.clip();ctx.drawImage(pic,avatarX,contentY+3,26,26);ctx.restore()}else{loadAvatar(c);ctx.fillStyle='#333';ctx.font='20px sans-serif';ctx.fillText(c.icon||'🙂',avatarX+1,contentY+22)}}else{ctx.fillStyle='#333';ctx.font='20px sans-serif';ctx.fillText(c.icon||'🙂',avatarX+1,contentY+22)}
  if(showNames){ctx.font=nameSize+'px sans-serif';ctx.fillStyle='#273947';if(right){ctx.textAlign='right';ctx.fillText(c.name,CW-49,y+nameSize);ctx.textAlign='left'}else ctx.fillText(c.name,49,y+nameSize)}}
  if(!center){ctx.fillStyle='#fff';round(bx,contentY,w,h-nameHeight,12)}
  ctx.fillStyle='#172333';ctx.font=(center&&db.settings.narratorBold?'bold ':'')+`${center?(db.settings.narratorSize||14):fontSize}px sans-serif`;ctx.textBaseline='top';
  if(center){ctx.textAlign='center';lines.forEach((t,j)=>ctx.fillText(t,CW/2,contentY+4+j*Math.round((db.settings.narratorSize||14)*1.48)));ctx.textAlign='left'}else lines.forEach((t,j)=>ctx.fillText(t,bx+padH,contentY+padV+j*lineHeight));
  ctx.textBaseline='alphabetic';ctx.restore();y+=h+gap;
 });ctx.restore();
}

let animationToken=0;async function animate(record){if(playing)return;const p=getProject();if(!p?.messages.length)return alert('動画にする会話を作成してください');if(record&&(!canvas.captureStream||!window.MediaRecorder))return alert('このブラウザでは動画書き出しに対応していません。別のブラウザを試してください。');playing=true;const token=++animationToken;$('preview').disabled=true;$('record').disabled=true;$('download').classList.add('hidden');if(record){$('progress').classList.remove('hidden');$('progress').value=0;$('videoProgressText').classList.remove('hidden');$('videoProgressText').textContent='描画進捗 0%';}let recorder=null,chunks=[],stream=null,recordType='';if(record){try{stream=canvas.captureStream(30);const formats=['video/mp4;codecs="avc1.42E01E"','video/mp4','video/webm;codecs=vp9','video/webm'];recordType=formats.find(x=>MediaRecorder.isTypeSupported(x))||'';recorder=new MediaRecorder(stream,recordType?{mimeType:recordType}:undefined);recordType=recorder.mimeType||recordType;recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start(250)}catch(e){playing=false;$('preview').disabled=false;$('record').disabled=false;stream?.getTracks().forEach(t=>t.stop());return alert('動画録画を開始できませんでした：'+e.message)}}const delays=p.messages.map(m=>Math.max(.3,Number(m.videoInterval)||Number(db.settings.interval)||3)*1000/Number(db.settings.speed||1));const boundaries=[];let sum=0;delays.forEach(t=>{sum+=t;boundaries.push(sum)});const dur=sum+1300;const start=performance.now();$('videoStatus').textContent=record?'録画中…画面を閉じないでください':'プレビュー再生中…';await new Promise(resolve=>{function frame(now){const elapsed=Math.min(dur,now-start);const count=Math.min(p.messages.length,1+boundaries.filter(t=>t<=elapsed).length);const age=elapsed-(boundaries[count-2]||0);drawVideo(count,age<140?1-age/140:0);$('progress').value=elapsed/dur*100;if(record)$('videoProgressText').textContent='描画進捗 '+Math.min(99,Math.floor(elapsed/dur*100))+'%';if(elapsed<dur&&token===animationToken)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});if(recorder){$('videoProgressText').textContent='描画完了・ファイル生成中…';const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await stopped;const type=recordType.includes('mp4')?'video/mp4':'video/webm',ext=type==='video/mp4'?'mp4':'webm',blob=new Blob(chunks,{type});const url=URL.createObjectURL(blob),a=$('download');a.href=url;a.download=(p.title||'会話動画')+'.'+ext;a.textContent='⬇ '+ext.toUpperCase()+'をダウンロード';a.classList.remove('hidden');$('videoStatus').textContent='動画が完成しました。下のボタンから保存できます。';$('progress').value=100;$('videoProgressText').textContent='100% 完了';stream?.getTracks().forEach(t=>t.stop())}else $('videoStatus').textContent='プレビューが終了しました';playing=false;$('preview').disabled=false;$('record').disabled=false;drawVideo(p.messages.length)}
// Horizontal icon strip: touch swipe, trackpad and mouse drag.
(()=>{const strip=$('avatarStrip');let down=false,lastX=0,moved=false;
 strip.addEventListener('wheel',e=>{if(strip.scrollWidth<=strip.clientWidth)return;if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){strip.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
 strip.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;down=true;lastX=e.clientX;moved=false;strip.classList.add('dragging')});
 window.addEventListener('pointermove',e=>{if(!down)return;const delta=e.clientX-lastX;if(Math.abs(delta)>2)moved=true;strip.scrollLeft-=delta;lastX=e.clientX});
 window.addEventListener('pointerup',()=>{down=false;strip.classList.remove('dragging')});
 strip.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false}},true);
})();

// Additional UI, intentionally created without changing existing saved schemas.
const header=$('topAdd').parentElement;
const searchToggle=document.createElement('button');searchToggle.id='searchToggle';searchToggle.className='iconbtn head-extra hidden';searchToggle.textContent='⌕';searchToggle.title='会話内検索';header.insertBefore(searchToggle,$('topAdd'));
const textMenu=document.createElement('button');textMenu.id='textMenu';textMenu.className='iconbtn head-extra hidden';textMenu.textContent='▤';textMenu.title='テキスト操作';header.insertBefore(textMenu,$('topAdd'));
textMenu.onclick=()=>sheet('テキスト操作',host=>host.append(button('会話をテキストでコピー・書き出す',()=>openTextExport()),button('テキストを一括読み込み',()=>openTextImport()),button('閉じる',close)));
const moreMenu=document.createElement('button');moreMenu.id='chatMore';moreMenu.className='iconbtn head-extra hidden';moreMenu.textContent='⋯';moreMenu.title='会話の操作';header.insertBefore(moreMenu,$('topAdd'));
function openChatOperations(){
 if(editingMessageId)saveEditing();
 sheet('会話の操作',host=>{
  host.append(button('☰ コメントの並べ替え',()=>{close();dragList()}));
  host.append(button('☑ コメントの複数選択',()=>{close();startBulk()}));
  host.append(button('↔ キャラごとのコメント位置',()=>{close();openCharacterSideSettings()}));
  host.append(button('💬 定型文・よく使うセリフ',()=>{close();showQuickPanel('phrases')}));
  host.append(button('▤ 簡易台本モード',()=>{close();showQuickPanel('script')}));
  host.append(button('↶ 直前の投稿を取り消す',()=>{close();undoRecentPost()}));
  host.append(button('閉じる',close));
 });
}
moreMenu.onclick=openChatOperations;
function undoRecentPost(){const p=getProject();if(!p||!lastPostedId||p.messages[p.messages.length-1]?.id!==lastPostedId)return alert('取り消せる直前の投稿がありません');const id=lastPostedId;lastPostedId=null;mutate(()=>p.messages=p.messages.filter(m=>m.id!==id))}
const PHRASES_KEY='talkraft-quick-phrases';
function phrasesRead(){try{return JSON.parse(localStorage.getItem(PHRASES_KEY))||['おはよう！','なるほど！','それで？']}catch{return []}}
function showQuickPanel(mode){const panel=$('quickPanel');panel.replaceChildren();panel.classList.remove('hidden');const heading=document.createElement('div');heading.textContent=mode==='phrases'?'よく使うセリフ':'簡易台本モード';panel.append(heading);
 const controls=document.createElement('div');controls.className='quick-actions';panel.append(controls);
 if(mode==='phrases'){const refresh=()=>{controls.replaceChildren();phrasesRead().forEach(phrase=>{const b=button(phrase,()=>{const entry=$('entry');entry.setRangeText(phrase,entry.selectionStart,entry.selectionEnd,'end');entry.dispatchEvent(new Event('input'));panel.classList.add('hidden');entry.focus({preventScroll:true})});controls.append(b)});};refresh();const entry=document.createElement('input');entry.placeholder='登録するセリフ';const add=button('定型文を登録',()=>{const value=entry.value.trim();if(!value)return;const phrases=phrasesRead();if(!phrases.includes(value))phrases.push(value);localStorage.setItem(PHRASES_KEY,JSON.stringify(phrases));entry.value='';refresh()});panel.append(entry,add)}
 else{const area=document.createElement('textarea');area.placeholder='キャラA「おはよう！」\nキャラB「こんにちは！」\nその日の午後……';const status=document.createElement('div');const add=button('会話にまとめて追加',()=>{const p=getProject();if(!p)return;let parsed;try{parsed=parseConversationText(area.value)}catch(e){status.textContent=e.message;return}const indexed=db.characters.map((c,i)=>({...c,_created:c.createdOrder??i})).sort((a,b)=>a._created-b._created);const unknown=parsed.filter(v=>v.name!=='ナレーター'&&!indexed.some(c=>c.name===v.name));if(unknown.length){status.textContent=unknown.map(v=>v.line+'行目：未登録 '+v.name).join(' / ');return}if(!parsed.length)return;const staged=p.messages.slice();const additions=parsed.map(v=>{const characterId=v.name==='ナレーター'?null:indexed.find(c=>c.name===v.name).id;const m={id:uid(),text:v.text,characterId,side:characterId?nextCommentSide(staged,characterId):'center'};staged.push(m);return m});mutate(()=>p.messages.push(...additions));panel.classList.add('hidden')});panel.append(area,status,add)}
 panel.append(button('閉じる',()=>panel.classList.add('hidden')))
}
function openCharacterSideSettings(){
 const p=getProject();if(!p)return;
 const used=[...new Set(p.messages.filter(m=>m.side!=='center'&&m.characterId).map(m=>m.characterId))];
 sheet('キャラごとのコメント位置',host=>{
  const desc=document.createElement('p');desc.className='hint';desc.textContent='現在の会話の既存コメントを、キャラごとにまとめて移動します。ナレーターは中央のままです。';host.append(desc);
  const selects=[];
  for(const id of used){
   const c=character(id);const row=document.createElement('div');row.className='side-settings-row';
   const avatar=document.createElement('div');avatar.className='avatar';setIcon(avatar,c);
   const name=document.createElement('span');name.textContent=c.name;name.className='side-char-name';
   const select=document.createElement('select');select.className='field';select.setAttribute('aria-label',c.name+'の表示位置');
   [['keep','変更しない'],['left','左'],['center','中央'],['right','右']].forEach(([v,t])=>{const op=document.createElement('option');op.value=v;op.textContent=t;select.append(op)});
   row.append(avatar,name,select);host.append(row);selects.push([id,select]);
  }
  if(!used.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='変更できるキャラクターのコメントがありません。';host.append(empty)}
  const actions=document.createElement('div');actions.className='chiplist';
  actions.append(button('キャンセル',close),button('適用する',()=>{
   const changes=new Map(selects.filter(([,sel])=>sel.value!=='keep').map(([id,sel])=>[id,sel.value]));
   if(changes.size)mutate(()=>p.messages.forEach(m=>{if(m.characterId&&m.side!=='center'&&changes.has(m.characterId))m.side=changes.get(m.characterId)}));
   close();
  }));host.append(actions);
 });
}

const folderTitle=document.createElement('div');folderTitle.id='currentFolderTitle';folderTitle.className='folder-title hidden';$('folderToolbar').after(folderTitle);
const favoriteBtn=document.createElement('button');favoriteBtn.className='btn gray';favoriteBtn.textContent='☆ お気に入り一覧';$('folderToolbar').append(favoriteBtn);favoriteBtn.onclick=()=>{favoritesOnly=!favoritesOnly;openFolderId=null;favoriteBtn.textContent=favoritesOnly?'★ すべて表示':'☆ お気に入り一覧';renderHome()};
let searchOpen=false,searchMatches=[],searchPos=0;
function applySearchHighlights(){
 const q=$('chatSearchInput').value.trim().toLocaleLowerCase();searchMatches=[];
 const canonical=new Map((getProject()?.messages||[]).map(m=>[m.id,m.text]));
 document.querySelectorAll('#messages .message').forEach(row=>{
  const bubble=row.querySelector('.bubble');if(!bubble)return;
  const txt=canonical.get(row.dataset.messageId)||'';bubble.replaceChildren();
  row.classList.remove('search-hit');if(!searchOpen||!q){bubble.textContent=txt;return;}
  const lower=txt.toLocaleLowerCase();if(!lower.includes(q)){bubble.textContent=txt;return;}
  searchMatches.push(row);let at=0;
  while(at<txt.length){const found=lower.indexOf(q,at);if(found<0){bubble.append(document.createTextNode(txt.slice(at)));break}
   if(found>at)bubble.append(document.createTextNode(txt.slice(at,found)));
   const mark=document.createElement('mark');mark.textContent=txt.slice(found,found+q.length);bubble.append(mark);at=found+q.length;
  }
 });
 searchPos=Math.min(searchPos,Math.max(0,searchMatches.length-1));
 $('searchCount').textContent=searchMatches.length?`${searchPos+1}/${searchMatches.length}`:'0件';
 if(searchMatches.length)searchMatches[searchPos].classList.add('search-hit');
}
searchToggle.onclick=()=>{searchOpen=!searchOpen;$('chatSearchPanel').classList.toggle('hidden',!searchOpen);searchToggle.textContent=searchOpen?'×':'⌕';if(!searchOpen){$('chatSearchInput').value='';applySearchHighlights()}else $('chatSearchInput').focus({preventScroll:true})};
$('chatSearchInput').oninput=()=>{searchPos=0;applySearchHighlights()};
function stepSearch(d){if(!searchMatches.length)return;searchPos=(searchPos+d+searchMatches.length)%searchMatches.length;searchMatches.forEach((r,i)=>r.classList.toggle('search-hit',i===searchPos));searchMatches[searchPos].scrollIntoView({block:'nearest'});$('searchCount').textContent=`${searchPos+1}/${searchMatches.length}`}
$('prevMatch').onclick=()=>stepSearch(-1);$('nextMatch').onclick=()=>stepSearch(1);
let bulkMode=false,bulkSelected=new Set(),rangeStart=null;
function startBulk(){saveEditing();bulkMode=true;bulkSelected.clear();rangeStart=null;updateBulk()}
function toggleBulk(id){if(bulkSelected.has(id))bulkSelected.delete(id);else bulkSelected.add(id);rangeStart??=id;updateBulk()}
function updateBulk(){ $('bulkTools').classList.toggle('hidden',!bulkMode);$('messageTools').classList.remove('show');$('bulkCount').textContent=bulkSelected.size+'件選択';document.querySelectorAll('#messages .message').forEach(el=>el.classList.toggle('bulk-selected',bulkSelected.has(el.dataset.messageId)))}
// Bulk selection is launched from the chat header overflow menu.
$('bulkDone').onclick=()=>{bulkMode=false;bulkSelected.clear();updateBulk()};
$('selectRange').onclick=()=>{const list=getProject()?.messages||[];if(!rangeStart){alert('開始コメントを選択してください');return}const end=[...bulkSelected].at(-1);const from=list.findIndex(x=>x.id===rangeStart),to=list.findIndex(x=>x.id===end);if(from<0||to<0)return;for(let i=Math.min(from,to);i<=Math.max(from,to);i++)bulkSelected.add(list[i].id);updateBulk()};
$('bulkDelete').onclick=()=>{if(!bulkSelected.size)return;if(!confirm(bulkSelected.size+'件のコメントを削除しますか？'))return;mutate(()=>{getProject().messages=getProject().messages.filter(m=>!bulkSelected.has(m.id))});$('bulkDone').click()};
$('bulkDuplicate').onclick=()=>{if(!bulkSelected.size)return;mutate(()=>{const p=getProject();p.messages=p.messages.flatMap(m=>bulkSelected.has(m.id)?[m,{...clone(m),id:uid()}]:[m])});$('bulkDone').click()};
$('bulkMove').onclick=()=>{if(!bulkSelected.size)return;const count=getProject().messages.length;const target=prompt('移動先の位置（1〜'+(count+1)+'）を入力してください','1');if(target===null)return;const pos=Number(target);if(!Number.isInteger(pos)||pos<1||pos>count+1)return alert('移動先が正しくありません');mutate(()=>{const p=getProject(),picked=p.messages.filter(m=>bulkSelected.has(m.id));p.messages=p.messages.filter(m=>!bulkSelected.has(m.id));p.messages.splice(Math.min(pos-1,p.messages.length),0,...picked)});$('bulkDone').click()};
// Individual timing via comment menu.
const oldMessageMenu=messageMenu;

const oldRenderSettings=renderSettings;renderSettings=function(){oldRenderSettings();$('narratorSize').value=db.settings.narratorSize||14;$('narratorSizeLabel').textContent=(db.settings.narratorSize||14)+'px';$('narratorBold').checked=!!db.settings.narratorBold};
$('narratorSize').onchange=e=>{db.settings.narratorSize=Number(e.target.value);persist();renderSettings();if(page==='chat')renderChat()};
$('narratorBold').onchange=e=>{db.settings.narratorBold=e.target.checked;persist();renderSettings();if(page==='chat')renderChat()};
// One-week reminder, only when the app opens.
function remindBackup(){let last=0;try{last=Number(localStorage.getItem('hitori-last-backup'))||0}catch{}if(Date.now()-last>=7*86400000&&db.projects.length){setTimeout(()=>{if(confirm('7日以上バックアップしていません。今バックアップを保存しますか？'))$('exportJson').click()},700)}}
// Interactive preview clock. Export recording continues to use the existing renderer and timeline.
let previewElapsed=0,previewRunning=false,previewRaf=0,previewLast=0,exporting=false;
function timeline(){const p=getProject(),list=p?.messages||[];const speed=Number(db.settings.speed)||1;const delays=list.map(m=>Math.max(.3,Number(m.videoInterval)||Number(db.settings.interval)||3)*1000/speed);const boundaries=[];let sum=0;delays.forEach(d=>{sum+=d;boundaries.push(sum)});return {list,boundaries,duration:sum+1300};}
function clockText(ms){const n=Math.floor(Math.max(0,ms)/1000);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')}
function paintPreview(){if(page!=='video')return;const t=timeline();previewElapsed=Math.max(0,Math.min(previewElapsed,t.duration));const count=t.list.length?Math.min(t.list.length,1+t.boundaries.filter(v=>v<=previewElapsed).length):0;const age=previewElapsed-(t.boundaries[count-2]||0);drawVideo(count,age<140?1-age/140:0);$('videoSeek').value=t.duration?Math.round(previewElapsed/t.duration*1000):0;$('videoClock').textContent=clockText(previewElapsed)+' / '+clockText(t.duration);$('preview').textContent=previewRunning?'⏸ 一時停止':'▶ 再生';}
function pausePreview(){previewRunning=false;cancelAnimationFrame(previewRaf);previewRaf=0;paintPreview()}
function tickPreview(now){if(!previewRunning||page!=='video'){pausePreview();return}previewElapsed+=Math.max(0,Math.min(100,now-previewLast));previewLast=now;const t=timeline();if(previewElapsed>=t.duration){previewElapsed=t.duration;pausePreview();$('videoStatus').textContent='プレビューが終了しました';return}paintPreview();previewRaf=requestAnimationFrame(tickPreview)}
function togglePreview(){if(exporting)return;const t=timeline();if(!t.list.length)return alert('動画にする会話を作成してください');if(previewRunning){pausePreview();$('videoStatus').textContent='一時停止中';return}if(previewElapsed>=t.duration)previewElapsed=0;previewRunning=true;previewLast=performance.now();$('videoStatus').textContent='プレビュー再生中（コメントをタップして秒数変更）';paintPreview();previewRaf=requestAnimationFrame(tickPreview)}
function seekPreview(fraction){if(exporting)return;pausePreview();previewElapsed=timeline().duration*fraction;paintPreview();$('videoStatus').textContent='再生位置を移動しました'}
function editPreviewTiming(id){if(exporting)return;const m=getProject()?.messages.find(x=>x.id===id);if(!m)return;pausePreview();const original=m.videoInterval;const choices=Array.from({length:21},(_,i)=>(2+i/10).toFixed(1));sheet('コメントの表示間隔',host=>{const hint=document.createElement('p');hint.className='hint';hint.textContent='次のコメントまでの秒数を選択してください（2.0〜4.0秒、0.1秒刻み）。';const sample=document.createElement('p');sample.className='hint';sample.textContent=m.text.slice(0,90);const sel=document.createElement('select');sel.className='field';sel.setAttribute('aria-label','コメントの表示間隔');const common=document.createElement('option');common.value='';common.textContent='共通設定を使う（'+Number(db.settings.interval||3).toFixed(1)+'秒）';sel.append(common);choices.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v+' 秒';sel.append(o)});sel.value=original==null?'':Number(original).toFixed(1);if(sel.selectedIndex<0)sel.value='';const row=document.createElement('div');row.className='chiplist';const cancel=button('キャンセル',close);const ok=button('決定',()=>{const v=sel.value;mutate(()=>{if(v==='')delete m.videoInterval;else m.videoInterval=Number(v)});close();paintPreview();$('videoStatus').textContent='表示間隔を保存しました。再生ボタンで続きから再開できます。'});row.append(cancel,ok);host.append(hint,sample,sel,row)})}
canvas.addEventListener('click',e=>{if(page!=='video'||exporting)return;const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*CW,y=(e.clientY-r.top)/r.height*CH;const match=[...videoHitRects].reverse().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);if(match)editPreviewTiming(match.id)});
$('videoSeek').oninput=e=>seekPreview(Number(e.target.value)/1000);
$('preview').onclick=togglePreview;
$('restartPreview').onclick=()=>seekPreview(0);
$('record').onclick=async()=>{if(exporting)return;const t=timeline();if(!t.list.length)return alert('動画にする会話を作成してください');const mime=['video/mp4;codecs="avc1.42E01E"','video/mp4','video/webm;codecs=vp9','video/webm'].find(x=>window.MediaRecorder?.isTypeSupported(x));if(!confirm('動画を書き出しますか？\n\n解像度：1080 × 1920（9:16）\nコメント数：'+t.list.length+'件\n動画の長さ：約'+clockText(t.duration)+'\n出力形式：'+(mime?.includes('mp4')?'MP4':mime?'WebM':'この環境では未対応')))return;pausePreview();exporting=true;$('videoSeek').disabled=true;$('restartPreview').disabled=true;try{await animate(true)}finally{exporting=false;$('videoSeek').disabled=false;$('restartPreview').disabled=false;paintPreview()}};
const previousPageTo=pageTo;pageTo=function(p){if(page==='video'&&p!=='video')pausePreview();previousPageTo(p);if(p==='video'){previewElapsed=0;paintPreview()}};
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn);initializeStorage().then(remindBackup);

$('themeMode').addEventListener('change',e=>{try{localStorage.setItem(THEME_KEY,e.target.value)}catch(err){alert('テーマ設定を保存できませんでした')}applyTheme()});
