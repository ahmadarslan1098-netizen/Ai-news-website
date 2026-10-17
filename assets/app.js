/* AI News.tech shared behavior: theme, clock, saved briefs, filters, desk, tools.
   Every module is guarded: a page uses only the parts it contains. */
(function(){
  var d=document,root=d.documentElement;
  root.classList.add('js');
  function qs(s,e){return (e||d).querySelector(s)}
  function qsa(s,e){return Array.prototype.slice.call((e||d).querySelectorAll(s))}

  /* Theme */
  var themeBtn=qs('#themeToggle');
  if(themeBtn){
    var themeLabel=qs('#themeLabel');
    (function(){
      function applyTheme(t){
        root.setAttribute('data-theme',t);
        if(themeLabel)themeLabel.textContent=(t==='dark'?'Light':'Dark');
        themeBtn.setAttribute('aria-pressed',t==='dark'?'true':'false');
        try{localStorage.setItem('ain-theme',t)}catch(e){}
      }
      var savedTheme=null;try{savedTheme=localStorage.getItem('ain-theme')}catch(e){}
      var initial=savedTheme||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
      applyTheme(initial);
      themeBtn.addEventListener('click',function(){applyTheme(root.getAttribute('data-theme')==='dark'?'light':'dark')});
    })();
  }
  function toggleTheme(){if(themeBtn)themeBtn.click()}

  /* Clock */
  var todayLine=qs('#todayLine');
  if(todayLine){
    (function(){
      function tick(){
        var now=new Date();
        var date=now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
        var hh=String(now.getHours()).padStart(2,'0'),mm=String(now.getMinutes()).padStart(2,'0');
        todayLine.textContent=date+' \u00b7 '+hh+':'+mm;
      }
      tick();setInterval(tick,30000);
    })();
  }

  /* Saved briefs */
  var savedIds=[];
  try{var svArr=JSON.parse(localStorage.getItem('ain-saved')||'[]');if(Array.isArray(svArr))savedIds=svArr}catch(e){}
  var applyFilters=null;
  function persistSaved(){try{localStorage.setItem('ain-saved',JSON.stringify(savedIds))}catch(e){}}
  function isSaved(id){return savedIds.indexOf(id)!==-1}
  function toggleSave(id){
    var i=savedIds.indexOf(id);
    if(i===-1){savedIds.push(id)}else{savedIds.splice(i,1)}
    persistSaved();updateSaveUI();
    if(applyFilters)applyFilters();
  }
  function updateSaveUI(){
    qsa('[data-save]').forEach(function(b){
      var on=isSaved(b.getAttribute('data-save'));
      b.classList.toggle('saved',on);
      b.setAttribute('aria-pressed',on?'true':'false');
      b.setAttribute('aria-label',(on?'Remove from saved: ':'Save: ')+(b.getAttribute('data-title')||''));
      var tl=qs('.tl',b);if(tl)tl.textContent=on?'Saved':'Save';
    });
  }

  /* Save buttons on story cards (injected; article pages carry their own tool button) */
  qsa('[data-story]').forEach(function(card){
    var id=card.getAttribute('data-story');
    var kick=qs('.kicker',card);
    if(!kick||qs('.save-btn',card))return;
    var b=d.createElement('button');
    b.type='button';b.className='save-btn';b.setAttribute('data-save',id);
    b.setAttribute('data-title',qs('.s-title',card).textContent);
    b.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>';
    kick.appendChild(b);
  });
  d.addEventListener('click',function(e){
    var sv=e.target.closest('[data-save]');
    if(sv)toggleSave(sv.getAttribute('data-save'));
  });

  /* Front page: section, saved, keyword and time-window filters */
  var chips=qsa('.chip');
  if(chips.length&&qs('#briefSearch')){
    (function(){
      var countEl=qs('#storyCount'),emptyBox=qs('#storyEmpty'),emptyMsg=qs('#storyEmptyMsg');
      var briefSearch=qs('#briefSearch'),briefRange=qs('#briefRange');
      var filterState={cat:'all',q:'',range:'all'};
      var CATNAMES={all:'all sections',models:'Models',industry:'Industry',policy:'Policy',safety:'Safety',chips:'Chips',funding:'Funding',saved:'Saved'};
      applyFilters=function(){
        chips.forEach(function(c){c.setAttribute('aria-pressed',c.getAttribute('data-cat')===filterState.cat?'true':'false')});
        var q=filterState.q.toLowerCase(),range=filterState.range==='all'?0:parseFloat(filterState.range);
        var now=Date.now(),n=0;
        qsa('#view-home [data-story]').forEach(function(s){
          var ds=s.dataset;
          var on=(filterState.cat==='all'||ds.cat===filterState.cat||(filterState.cat==='saved'&&isSaved(ds.story)));
          if(on&&q){
            var txt=(qs('.s-title',s).textContent+' '+qs('.dek',s).textContent).toLowerCase();
            on=txt.indexOf(q)!==-1;
          }
          if(on&&range){
            var t=qs('time',s),dt=t?new Date(t.getAttribute('datetime')):null;
            on=dt?((now-dt.getTime())/86400000)<=range:true;
          }
          s.hidden=!on;if(on)n++;
        });
        countEl.textContent=n+(n===1?' brief':' briefs');
        emptyBox.hidden=n>0;
        qs('#clearCat').hidden=(filterState.cat==='all'&&!q&&!range);
        if(!n){
          if(filterState.cat==='saved'&&!q)emptyMsg.textContent='Nothing saved yet. Use the bookmark on any brief to keep it here.';
          else{
            var bits=[];
            if(filterState.cat!=='all')bits.push(CATNAMES[filterState.cat]);
            if(q)bits.push('\u201c'+filterState.q+'\u201d');
            if(range)bits.push('the last '+range+' days');
            emptyMsg.textContent='Nothing filed under '+(bits.join(' and ')||'these filters')+'. The desk covers what ships, not what it cannot verify.';
          }
        }
      };
      chips.forEach(function(c){c.addEventListener('click',function(){filterState.cat=c.getAttribute('data-cat');applyFilters()})});
      briefSearch.addEventListener('input',function(){filterState.q=briefSearch.value.trim();applyFilters()});
      briefRange.addEventListener('change',function(){filterState.range=briefRange.value;applyFilters()});
      qs('#clearCat').addEventListener('click',function(){filterState.cat='all';applyFilters()});
      qs('#clearCat2').addEventListener('click',function(){filterState.cat='all';filterState.q='';briefSearch.value='';filterState.range='all';briefRange.value='all';applyFilters()});
      updateSaveUI();
      applyFilters();
    })();
  }

  /* Model desk */
  var rows=qsa('#modelRows tr');
  if(rows.length){
    (function(){
      var tbody=qs('#modelRows'),mCount=qs('#modelCount'),mEmpty=qs('#modelEmpty'),mEmptyMsg=qs('#modelEmptyMsg');
      var mSearch=qs('#modelSearch'),mLic=qs('#modelLic');
      var mstate={q:'',lic:'all',key:'date',dir:-1};
      function num(v){return v===''?Infinity:parseFloat(v)}
      function renderModels(){
        var q=mstate.q.toLowerCase();
        var list=rows.filter(function(tr){
          var ds=tr.dataset;
          if(mstate.lic!=='all'&&ds.lic!==mstate.lic)return false;
          if(q&&(ds.model+' '+ds.org+' '+ds.note).toLowerCase().indexOf(q)===-1)return false;
          return true;
        });
        var k=mstate.key,dir=mstate.dir;
        list.sort(function(a,b){
          var av,bv;
          if(k==='in'||k==='out'){av=num(a.dataset[k]);bv=num(b.dataset[k]);return (av-bv)*dir}
          if(k==='date'){av=a.dataset.date;bv=b.dataset.date;return av<bv?-dir:av>bv?dir:0}
          av=a.dataset[k].toLowerCase();bv=b.dataset[k].toLowerCase();
          return av<bv?-dir:av>bv?dir:0;
        });
        list.forEach(function(tr){tbody.appendChild(tr)});
        rows.forEach(function(tr){tr.hidden=(list.indexOf(tr)===-1)});
        mCount.textContent=list.length+(list.length===1?' model':' models');
        mEmpty.hidden=list.length>0;
        if(!list.length){
          var bits=[];
          if(q)bits.push('\u201c'+mstate.q+'\u201d');
          if(mstate.lic!=='all')bits.push(mstate.lic==='open'?'open weights':'proprietary');
          mEmptyMsg.textContent='Nothing on the desk matches '+(bits.join(' and ')||'your filters')+'.';
        }
      }
      mSearch.addEventListener('input',function(){mstate.q=mSearch.value.trim();renderModels()});
      mLic.addEventListener('change',function(){mstate.lic=mLic.value;renderModels()});
      qs('#clearModels').addEventListener('click',function(){mSearch.value='';mLic.value='all';mstate.q='';mstate.lic='all';renderModels()});
      qsa('.th-btn').forEach(function(btn){
        btn.addEventListener('click',function(){
          var k=btn.getAttribute('data-key');
          if(mstate.key===k){mstate.dir=-mstate.dir}
          else{mstate.key=k;mstate.dir=(k==='date')?-1:1}
          qsa('th[data-key]').forEach(function(th){
            th.setAttribute('aria-sort',th===btn.parentNode?(mstate.dir===1?'ascending':'descending'):'none');
          });
          renderModels();
        });
      });

      /* Compare column + tray + dialog */
      var selModels=[];
      var thRow=qs('.table-wrap thead tr');
      var cth=d.createElement('th');cth.className='cmp-cell';cth.innerHTML='<span class="sr">Compare</span>';
      thRow.insertBefore(cth,thRow.firstChild);
      var cmpBar=qs('#cmpBar'),cmpNames=qs('#cmpNames'),cmpGo=qs('#cmpGo');
      function renderCmpBar(){
        if(selModels.length){cmpBar.classList.add('on');cmpNames.textContent=selModels.join(' + ');cmpGo.disabled=selModels.length<2}
        else{cmpBar.classList.remove('on')}
      }
      rows.forEach(function(tr){
        var td=d.createElement('td');td.className='cmp-cell';
        var cb=d.createElement('input');cb.type='checkbox';cb.className='cmp-check';
        cb.setAttribute('aria-label','Compare '+tr.dataset.model);
        cb.addEventListener('change',function(){
          var id=tr.dataset.model;
          if(cb.checked){if(selModels.indexOf(id)===-1)selModels.push(id)}
          else{var ix=selModels.indexOf(id);if(ix!==-1)selModels.splice(ix,1)}
          qsa('.cmp-check').forEach(function(c){if(!c.checked)c.disabled=(selModels.length>=3)});
          renderCmpBar();
        });
        td.appendChild(cb);tr.insertBefore(td,tr.firstChild);
      });
      qs('#cmpClear').addEventListener('click',function(){
        selModels=[];qsa('.cmp-check').forEach(function(c){c.checked=false;c.disabled=false});renderCmpBar();
      });
      qs('#cmpGo').addEventListener('click',function(){
        if(selModels.length<2)return;
        var picked=rows.filter(function(tr){return selModels.indexOf(tr.dataset.model)!==-1});
        var body=qs('#cmpBody');body.innerHTML='';
        var tbl=d.createElement('table');tbl.className='cmp-table';
        var hr=d.createElement('tr');hr.appendChild(d.createElement('th'));
        picked.forEach(function(tr){var th=d.createElement('th');th.textContent=tr.dataset.model;hr.appendChild(th)});
        var thead=d.createElement('thead');thead.appendChild(hr);tbl.appendChild(thead);
        var tb=d.createElement('tbody');
        var maxIn=0,maxOut=0;
        picked.forEach(function(tr){
          var a=parseFloat(tr.dataset.in);if(!isNaN(a)&&a>maxIn)maxIn=a;
          var b=parseFloat(tr.dataset.out);if(!isNaN(b)&&b>maxOut)maxOut=b;
        });
        function addRow(label,fn){
          var r=d.createElement('tr');var l=d.createElement('th');l.setAttribute('scope','row');l.textContent=label;r.appendChild(l);
          picked.forEach(function(tr){var c=d.createElement('td');fn(tr,c);r.appendChild(c)});
          tb.appendChild(r);
        }
        function priceRow(label,key,max){
          addRow(label,function(tr,c){
            var v=tr.dataset[key];
            if(v===''){c.innerHTML='<span class="na">n/a</span><span class="bar na"></span>'}
            else{
              c.innerHTML='<span class="v">$'+v+'</span>';
              if(max){var bar=d.createElement('span');bar.className='bar';bar.style.width=Math.round((parseFloat(v)/max)*100)+'%';c.appendChild(bar)}
            }
          });
        }
        addRow('Organization',function(tr,c){c.textContent=tr.dataset.org});
        addRow('Released',function(tr,c){c.textContent=qs('td:nth-child(4)',tr).textContent.trim()});
        addRow('Context',function(tr,c){c.textContent=tr.dataset.ctx});
        priceRow('Input $/1M','in',maxIn);
        priceRow('Output $/1M','out',maxOut);
        addRow('License',function(tr,c){c.textContent=tr.dataset.lic==='open'?'Open weights':'Proprietary'});
        addRow('Note',function(tr,c){c.style.fontSize='.74rem';c.textContent=tr.dataset.note});
        body.appendChild(tbl);
        qs('#compareDialog').showModal();
      });
      qs('#cmpClose').addEventListener('click',function(){qs('#compareDialog').close()});

      /* Row drawer */
      var dlg=qs('#modelDialog'),lastBtn=null;
      function openDrawer(tr){
        lastBtn=qs('.rowlink',tr);
        var ds=tr.dataset;
        qs('#dlgName').textContent=ds.model;
        qs('#dlgOrg').textContent=ds.org;
        qs('#dlgDate').textContent=qs('td:nth-child(4)',tr).textContent.trim();
        qs('#dlgCtx').textContent=ds.ctx;
        qs('#dlgIn').textContent=ds.in===''?'n/a':'$'+ds.in;
        qs('#dlgOut').textContent=ds.out===''?'n/a':'$'+ds.out;
        qs('#dlgLic').textContent=ds.lic==='open'?'Open weights':'Proprietary';
        qs('#dlgNote').textContent=ds.note;
        var src=qs('#dlgSrc');
        if(ds.src){src.hidden=false;src.href=ds.src}else{src.hidden=true}
        dlg.showModal();
      }
      rows.forEach(function(tr){
        qs('.rowlink',tr).addEventListener('click',function(){openDrawer(tr)});
        tr.addEventListener('click',function(e){if(e.target.closest('button')||e.target.closest('.cmp-cell'))return;openDrawer(tr)});
      });
      qs('#dlgClose').addEventListener('click',function(){dlg.close()});
      dlg.addEventListener('close',function(){if(lastBtn)lastBtn.focus()});

      renderModels();
    })();
  }

  /* Article page tools: text size + copy link */
  var articleBox=qs('#articleBox');
  if(articleBox&&qs('#articleTools')){
    (function(){
      var FS=['sm','','lg','xl'];
      try{var f0=localStorage.getItem('ain-fs');if(f0!==null&&f0!=='')articleBox.setAttribute('data-fs',f0);else articleBox.removeAttribute('data-fs')}catch(e){}
      function stepFs(dir){
        var cur=articleBox.getAttribute('data-fs')||'';
        var i=FS.indexOf(cur);if(i===-1)i=1;
        i=Math.max(0,Math.min(FS.length-1,i+dir));
        articleBox.setAttribute('data-fs',FS[i]);
        try{localStorage.setItem('ain-fs',FS[i])}catch(e){}
      }
      qs('[data-fs-btn="lg"]').addEventListener('click',function(){stepFs(1)});
      qs('[data-fs-btn="sm"]').addEventListener('click',function(){stepFs(-1)});
      var copyBtn=qs('#copyLink');
      if(copyBtn){
        copyBtn.addEventListener('click',function(){
          var tl=qs('.tl',copyBtn);
          function ok(){copyBtn.classList.add('copied');tl.textContent='Copied';setTimeout(function(){copyBtn.classList.remove('copied');tl.textContent='Copy link'},1600)}
          function fail(){tl.textContent='Copy failed';setTimeout(function(){tl.textContent='Copy link'},1600)}
          if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(location.href).then(ok,fail)}
          else{
            try{
              var ta=d.createElement('textarea');ta.value=location.href;ta.style.position='fixed';ta.style.opacity='0';
              d.body.appendChild(ta);ta.select();var okk=d.execCommand('copy');d.body.removeChild(ta);
              if(okk)ok();else fail();
            }catch(e){fail()}
          }
        });
      }
    })();
  }
  var toolSave=qs('#toolSave');
  if(toolSave)updateSaveUI();

  /* Radar countdowns */
  qsa('#view-radar [data-when]').forEach(function(li){
    var w=li.getAttribute('data-when');if(!w)return;
    var t=new Date(w+'T00:00:00');if(isNaN(t))return;
    var days=Math.ceil((t.getTime()-Date.now())/86400000);
    var span=d.createElement('span');span.className='cd';
    span.textContent=days>1?('in '+days+' days'):days===1?'tomorrow':days===0?'today':'under way';
    var tm=qs('time',li);if(tm)tm.appendChild(span);
  });

  /* Keyboard: / desk search, T theme */
  d.addEventListener('keydown',function(e){
    var t=e.target,tag=(t.tagName||'').toLowerCase();
    if(tag==='input'||tag==='select'||tag==='textarea'||t.isContentEditable)return;
    if(e.key==='/'){
      e.preventDefault();
      var m=qs('#modelSearch');
      if(m){try{m.focus({preventScroll:true})}catch(err){m.focus()}}
      else{location.href='models.html'}
    }else if(e.key==='t'||e.key==='T'){toggleTheme()}
  });
})();
