(function () {
  if (document.getElementById("tandem-root")) return;

  var PATTERNS = [
    /\blet'?s\b.{0,60}\b(change|update|fix|add|remove|build|create|send|call|deploy|assign)\b/i,
    /\bwe (should|need to|have to|must)\b/i,
    /\bdon'?t forget\b/i,
    /\bneed to\b.{0,50}/i,
    /\bremember to\b/i,
    /\b(todo|to-do|action item):?\s/i,
    /\bdeadline\b/i,
    /\bby (monday|tuesday|wednesday|thursday|friday|eod|tomorrow|next week)\b/i
  ];

  var S = {
    user: null, room: null, members: [], msgs: [], todos: [], invites: [],
    tab: "chat", aiOn: false, view: "loading"
  };
  var dragging = false, dX = 0, dY = 0;

  function keepAlive() {
    try {
      var p = chrome.runtime.connect({ name: "keepalive" });
      p.onDisconnect.addListener(function() { setTimeout(keepAlive, 1000); });
    } catch(e) {}
  }
  keepAlive();

  function bg(type, data, cb) {
    var payload = data || {};
    payload.type = type;
    var tries = 0;
    function attempt() {
      try {
        chrome.runtime.sendMessage(payload, function(r) {
          if (chrome.runtime.lastError) {
            if (tries++ < 5) { setTimeout(attempt, 400); } else { if (cb) cb({}); }
            return;
          }
          if (cb) cb(r || {});
        });
      } catch(e) {
        if (tries++ < 5) { setTimeout(attempt, 400); } else { if (cb) cb({}); }
      }
    }
    attempt();
  }

  function bgP(type, data) {
    return new Promise(function(res) { bg(type, data, res); });
  }

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === "MSGS")    { S.msgs    = msg.msgs;    if (S.view === "chat") renderMsgs(); }
    if (msg.type === "TODOS")   { S.todos   = msg.todos;   if (S.view === "chat") renderTodos(); }
    if (msg.type === "MEMBERS") { S.members = msg.members; if (S.view === "chat") renderPips(); }
    if (msg.type === "ROOM_IN") { S.room = msg.rid; S.view = "chat"; rerender(); }
    if (msg.type === "ROOM_OUT"){ S.room = null; S.msgs = []; S.todos = []; S.members = []; S.view = "lobby"; rerender(); getInvites(); }
  });

  setTimeout(function() {
    Promise.all([bgP("GET_AUTH"), bgP("GET_STATE"), bgP("GET_POS")]).then(function(res) {
      var auth  = res[0];
      var state = res[1];
      var pos   = res[2];

      S.user    = auth.user || null;
      S.room    = state.roomId || null;
      S.msgs    = state.msgs   || [];
      S.todos   = state.todos  || [];
      S.members = state.members|| [];

      S.view = !S.user ? "auth" : !S.room ? "lobby" : "chat";

      var root = document.createElement("div");
      root.id  = "tandem-root";
      root.innerHTML = '<div id="td-shell"><div id="td-body"></div></div>';
      document.body.appendChild(root);

      bindDrag();
      rerender();

      if (pos.mini) setMini(true);
      if (pos.pos)  applyPos(pos.pos);
      if (S.view === "lobby") getInvites();
    });
  }, 300);

  function rerender() {
    var el = document.getElementById("td-body");
    if (!el) return;
    if (S.view === "loading") { el.innerHTML = '<div class="td-center"><div class="td-spin"></div></div>'; return; }
    if (S.view === "auth")    { el.innerHTML = authHTML();  bindAuth();  return; }
    if (S.view === "lobby")   { el.innerHTML = lobbyHTML(); bindLobby(); return; }
    if (S.view === "chat")    { el.innerHTML = chatHTML();  bindChat();  renderMsgs(); renderTodos(); renderPips(); return; }
  }

  function authHTML() {
    return '<div class="td-auth">' +
      '<div id="td-hdr" style="padding:0 0 10px 0; border:none; background:none;">' +
        '<div class="td-hl"><div class="td-dot"></div><span class="td-brand">Tandem</span></div>' +
        '<div class="td-hr"><button class="td-ib" id="td-xbtn">&times;</button></div>' +
      '</div>' +
      '<div class="td-atabs"><button class="td-atab on" data-m="in">Sign in</button><button class="td-atab" data-m="up">Sign up</button></div>' +
      '<div id="td-afields">' + inFields() + '</div>' +
    '</div>';
  }

  function inFields() {
    return field("td-email","email","Email address","email") +
           field("td-pass","password","Password","current-password") +
           '<div class="td-err" id="td-aerr" style="display:none"></div>' +
           '<button class="td-primary" id="td-aok">Sign in</button>';
  }

  function upFields() {
    return field("td-name","text","Your name","name") +
           field("td-email","email","Email address","email") +
           field("td-pass","password","Password (min 6)","new-password") +
           '<div class="td-err" id="td-aerr" style="display:none"></div>' +
           '<button class="td-primary" id="td-aok">Create account</button>';
  }

  function field(id, type, ph, ac) {
    return '<input class="td-input" id="' + id + '" type="' + type + '" placeholder="' + ph + '" autocomplete="' + ac + '"/>';
  }

  function bindAuth() {
    on("td-xbtn", "click", function() { document.getElementById("tandem-root").style.display="none"; });
    var mode = "in";
    qsa(".td-atab", "tandem-root").forEach(function(t) {
      t.addEventListener("click", function() {
        mode = t.getAttribute("data-m");
        qsa(".td-atab","tandem-root").forEach(function(x) { x.classList.toggle("on", x.getAttribute("data-m") === mode); });
        document.getElementById("td-afields").innerHTML = mode === "in" ? inFields() : upFields();
        attachOk();
      });
    });
    attachOk();

    function attachOk() {
      var btn = document.getElementById("td-aok");
      if (!btn) return;
      function go() {
        var e  = val("td-email");
        var p  = val("td-pass");
        var n  = val("td-name");
        var er = document.getElementById("td-aerr");
        if (!e || !p) { showErr(er, "Please fill in all fields."); return; }
        if (mode === "up" && !n) { showErr(er, "Please enter your name."); return; }
        btn.textContent = "…"; btn.disabled = true;
        var type = mode === "in" ? "SIGN_IN" : "SIGN_UP";
        var data = mode === "in" ? { email: e, password: p } : { email: e, pass: p, name: n };
        bgP(type, data).then(function(r) {
          if (r.ok) { S.user = r.user; S.view = "lobby"; rerender(); getInvites(); }
          else { showErr(er, r.err || "Something went wrong."); btn.textContent = mode === "in" ? "Sign in" : "Create account"; btn.disabled = false; }
        });
      }
      btn.addEventListener("click", go);
      ["td-email","td-pass","td-name"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener("keydown", function(e) { if (e.key === "Enter") go(); });
      });
    }
  }

  function lobbyHTML() {
    var uname = S.user ? (S.user.name || S.user.email || "") : "";
    var inv = "";
    if (S.invites.length) {
      inv = '<div class="td-invlist"><div class="td-label">Invites</div>';
      S.invites.forEach(function(i) {
        inv += '<div class="td-invcard">' +
          '<div class="td-invtxt"><b>' + x(i.fromName) + '</b> invited you</div>' +
          '<div class="td-invbtns"><button class="td-sm td-yes" data-id="' + i.id + '" data-rid="' + i.rid + '">Join</button>' +
          '<button class="td-sm td-no" data-id="' + i.id + '">Decline</button></div></div>';
      });
      inv += '</div>';
    }
    return '<div class="td-lobby">' +
      '<div class="td-hd"><div class="td-dot"></div><span class="td-brand">Tandem</span><button class="td-out" id="td-sout">&#8617;</button></div>' +
      '<div class="td-who"><div class="td-av" style="background:' + col(uname) + '">' + (uname[0]||"?").toUpperCase() + '</div><span>' + x(uname) + '</span></div>' +
      inv +
      '<div class="td-lactions">' +
        '<div class="td-label">Start or join a session</div>' +
        '<button class="td-primary" id="td-newroom">Create new session</button>' +
        '<div class="td-or">or join with a code</div>' +
        '<div class="td-row"><input class="td-input" id="td-code" placeholder="swift-amber-1234"/><button class="td-sec" id="td-joinroom">Join</button></div>' +
        '<div class="td-err" id="td-lerr" style="display:none"></div>' +
      '</div>' +
    '</div>';
  }

  function bindLobby() {
    on("td-sout","click",function() { bgP("SIGN_OUT").then(function() { S.user=null; S.view="auth"; S.invites=[]; rerender(); }); });
    on("td-newroom","click",function() {
      var btn = document.getElementById("td-newroom");
      btn.textContent = "Creating…"; btn.disabled = true;
      bgP("CREATE_ROOM").then(function(r) {
        if (r.ok) { S.room = r.rid; S.view = "chat"; rerender(); }
        else { btn.textContent = "Create new session"; btn.disabled = false; showErr(document.getElementById("td-lerr"), r.err || "Error"); }
      });
    });
    on("td-joinroom","click",function() {
      var code = val("td-code").toLowerCase();
      if (!code) return;
      var btn = document.getElementById("td-joinroom");
      btn.textContent = "…"; btn.disabled = true;
      bgP("JOIN_ROOM", { rid: code }).then(function(r) {
        if (r.ok) { S.room = r.rid; S.view = "chat"; rerender(); }
        else { showErr(document.getElementById("td-lerr"), r.err || "Not found"); btn.textContent = "Join"; btn.disabled = false; }
      });
    });
    var codeEl = document.getElementById("td-code");
    if (codeEl) codeEl.addEventListener("keydown", function(e) { if (e.key === "Enter") { var b = document.getElementById("td-joinroom"); if (b) b.click(); } });

    qsa(".td-yes","tandem-root").forEach(function(b) {
      b.addEventListener("click", function() {
        bgP("ACCEPT_INVITE", { id: b.getAttribute("data-id"), rid: b.getAttribute("data-rid") }).then(function(r) {
          if (r.ok) { S.room = r.rid; S.view = "chat"; rerender(); }
        });
      });
    });
    qsa(".td-no","tandem-root").forEach(function(b) {
      b.addEventListener("click", function() {
        var id = b.getAttribute("data-id");
        bgP("DECLINE_INVITE", { id: id }).then(function() {
          S.invites = S.invites.filter(function(i) { return i.id !== id; });
          rerender();
        });
      });
    });
  }

  function chatHTML() {
    return '<div id="td-hdr">' +
        '<div class="td-hl"><div class="td-dot"></div><span class="td-brand">Tandem</span><span class="td-rc">' + x(S.room||"") + '</span></div>' +
        '<div class="td-hr"><div id="td-pips"></div>' +
          '<button class="td-ib" id="td-ibtn">+</button>' +
          '<button class="td-ib" id="td-lbtn">&#8617;</button>' +
          '<button class="td-ib" id="td-mbtn">&ndash;</button>' +
          '<button class="td-ib" id="td-xbtn">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div id="td-ibar" style="display:none">' +
        '<input class="td-input td-sm-inp" id="td-iemail" type="email" placeholder="Teammate\'s email"/>' +
        '<button class="td-sm td-yes" id="td-isend">Send</button>' +
        '<div id="td-ifb" style="display:none;font-size:10px;margin-top:2px;width:100%"></div>' +
      '</div>' +
      '<div class="td-tabs"><button class="td-tab on" data-p="chat">Chat</button><button class="td-tab" data-p="todos">Tasks <span class="td-badge" id="td-tbadge">0</span></button></div>' +
      '<div class="td-pane on" id="td-pane-chat"><div id="td-msgs"></div><div id="td-aibar"><span class="td-spin-sm"></span> AI found an action item…</div><div class="td-inp-row"><input class="td-input td-minp" id="td-minp" placeholder="Message your team…"/><button class="td-sbtn" id="td-sbtn"><svg viewBox="0 0 24 24" fill="white" width="12" height="12"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button></div></div>' +
      '<div class="td-pane" id="td-pane-todos"><div id="td-todos"></div></div>';
  }

  function bindChat() {
    on("td-mbtn","click",function(e) { e.stopPropagation(); toggleMini(); });
    on("td-xbtn","click",function(e) { e.stopPropagation(); document.getElementById("tandem-root").style.display="none"; });
    on("td-lbtn","click",function() { bgP("LEAVE_ROOM").then(function() { S.view="lobby"; S.room=null; S.msgs=[]; S.todos=[]; S.members=[]; rerender(); getInvites(); }); });
    on("td-ibtn","click",function() { var b=document.getElementById("td-ibar"); if(b) b.style.display=b.style.display==="none"?"flex":"none"; });
    on("td-isend","click",function() {
      var email = val("td-iemail");
      if (!email) return;
      bgP("INVITE", { email: email }).then(function(r) {
        var fb = document.getElementById("td-ifb");
        if (fb) { fb.style.display="block"; fb.textContent=r.ok?"Invite sent!":"Error: "+(r.err||"failed"); fb.style.color=r.ok?"#16a34a":"#dc2626"; setTimeout(function(){if(fb)fb.style.display="none";},3000); }
        if (r.ok) { var ie=document.getElementById("td-iemail"); if(ie) ie.value=""; }
      });
    });

    qsa(".td-tab","tandem-root").forEach(function(t) {
      t.addEventListener("click", function() {
        var p = t.getAttribute("data-p");
        qsa(".td-tab","tandem-root").forEach(function(x) { x.classList.toggle("on", x.getAttribute("data-p")===p); });
        qsa(".td-pane","tandem-root").forEach(function(x) { x.classList.toggle("on", x.id==="td-pane-"+p); });
      });
    });

    on("td-sbtn","click", sendMsg);
    var mi = document.getElementById("td-minp");
    if (mi) mi.addEventListener("keydown", function(e) { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

    var hdr = document.getElementById("td-hdr");
    if (hdr) hdr.addEventListener("mousedown", function(e) { if (!e.target.closest(".td-ib")) onDragStart(e); });
  }

  function sendMsg() {
    var mi = document.getElementById("td-minp");
    var text = mi ? mi.value.trim() : "";
    if (!text) return;
    mi.value = "";
    bgP("SEND_MSG", { text: text });
    if (PATTERNS.some(function(p) { return p.test(text); })) {
      var bar = document.getElementById("td-aibar");
      if (bar) bar.classList.add("on");
      S.aiOn = true;
      setTimeout(function() {
        if (bar) bar.classList.remove("on");
        S.aiOn = false;
        var who = S.user ? (S.user.name || S.user.email || "You") : "You";
        bgP("ADD_TODO", { text: text.charAt(0).toUpperCase()+text.slice(1).trim().slice(0,100), who: who });
        var tt = document.querySelector("#tandem-root .td-tab[data-p='todos']");
        if (tt) { tt.classList.add("fl"); setTimeout(function(){tt.classList.remove("fl");},1200); }
      }, 1600);
    }
  }

  function renderMsgs() {
    var c = document.getElementById("td-msgs"); if (!c) return;
    c.innerHTML = "";
    S.msgs.forEach(function(m) {
      var self = S.user && m.uid === S.user.uid;
      var name = m.name || (m.email||"?").split("@")[0];
      var el   = document.createElement("div"); el.className = "td-mg";
      el.innerHTML =
        '<div class="td-mm '+(self?"s":"")+'">'+x(name)+" &middot; "+fmtTs(m.ts)+"</div>"+
        '<div class="td-mr '+(self?"s":"")+'"><div class="td-av" style="background:'+(self?"#4f6ef7":col(name))+'">'+name[0].toUpperCase()+"</div>"+
        '<div class="td-bub '+(self?"s":"o")+'">'+x(m.text)+"</div></div>";
      c.appendChild(el);
    });
    c.scrollTop = c.scrollHeight;
  }

  function renderTodos() {
    var c = document.getElementById("td-todos"); if (!c) return;
    var badge = document.getElementById("td-tbadge"); if (badge) badge.textContent = S.todos.length;
    c.innerHTML = "";
    if (!S.todos.length) { c.innerHTML='<div class="td-empty"><div style="font-size:20px;color:#ddd">&#9675;</div><p>Action items appear here automatically.</p></div>'; return; }
    var open=0; S.todos.forEach(function(t){if(!t.done)open++;});
    var h=document.createElement("div"); h.className="td-th";
    h.innerHTML="<span>"+open+" open &middot; "+(S.todos.length-open)+" done</span><span class='td-ail'>AI extracted</span>";
    c.appendChild(h);
    S.todos.forEach(function(t) {
      var el=document.createElement("div"); el.className="td-todo"+(t.done?" dn":"");
      el.innerHTML='<button class="td-chk'+(t.done?" on":"")+'" data-id="'+t.id+'"></button>'+
        '<div class="td-tb"><div class="td-tt">'+x(t.text)+'</div>'+
        '<div class="td-tm"><span class="td-tag tw">'+x(t.who||"")+'</span><span class="td-tag ti">'+fmtTs(t.ts)+'</span></div></div>'+
        '<button class="td-del" data-id="'+t.id+'">&times;</button>';
      var chk=el.querySelector(".td-chk"); if(chk) chk.addEventListener("click",function(){bgP("TOGGLE_TODO",{id:t.id});});
      var del=el.querySelector(".td-del"); if(del) del.addEventListener("click",function(){bgP("DEL_TODO",{id:t.id});});
      c.appendChild(el);
    });
  }

  function renderPips() {
    var c=document.getElementById("td-pips"); if(!c) return; c.innerHTML="";
    S.members.slice(0,5).forEach(function(m) {
      var n=m.name||m.email||"?";
      var d=document.createElement("div"); d.className="td-pip"; d.style.background=col(n); d.title=n; d.textContent=n[0].toUpperCase();
      c.appendChild(d);
    });
  }

  function getInvites() {
    bgP("GET_INVITES").then(function(r) {
      S.invites = (r && r.invites) ? r.invites : [];
      if (S.view==="lobby") rerender();
    });
  }

  function bindDrag() {
    var root=document.getElementById("tandem-root"); if(!root) return;
    root.addEventListener("mousedown",function(e) {
      var hdr=e.target.closest("#td-hdr");
      if(!hdr || e.target.closest(".td-ib")) return;
      onDragStart(e);
    });
  }
  function onDragStart(e) {
    dragging=true;
    var shell=document.getElementById("td-shell"); if(!shell) return;
    var r=shell.getBoundingClientRect(); dX=e.clientX-r.left; dY=e.clientY-r.top;
    document.addEventListener("mousemove",onDragMove);
    document.addEventListener("mouseup",onDragEnd);
    e.preventDefault();
  }
  function onDragMove(e) {
    if(!dragging) return;
    var shell=document.getElementById("td-shell"); if(!shell) return;
    var l=Math.max(0,Math.min(e.clientX-dX,window.innerWidth-shell.offsetWidth));
    var t=Math.max(0,Math.min(e.clientY-dY,window.innerHeight-shell.offsetHeight));
    shell.style.left=l+"px"; shell.style.top=t+"px"; shell.style.right="auto"; shell.style.bottom="auto";
  }
  function onDragEnd() {
    if(!dragging) return; dragging=false;
    document.removeEventListener("mousemove",onDragMove); document.removeEventListener("mouseup",onDragEnd);
    var shell=document.getElementById("td-shell"); if(!shell) return;
    var r=shell.getBoundingClientRect();
    bgP("SAVE_POS",{pos:{top:r.top,left:r.left},mini:shell.classList.contains("mini")});
  }
  function applyPos(p) {
    var shell=document.getElementById("td-shell"); if(!shell||p.top==null) return;
    shell.style.top=p.top+"px"; shell.style.left=p.left+"px"; shell.style.right="auto"; shell.style.bottom="auto";
  }
  function toggleMini() { var shell=document.getElementById("td-shell"); if(shell){var on=!shell.classList.contains("mini"); setMini(on); bgP("SAVE_POS",{pos:null,mini:on});} }
  function setMini(on) { var shell=document.getElementById("td-shell"); if(shell) shell.classList.toggle("mini",on); }

  function on(id,ev,fn) { var el=document.getElementById(id); if(el) el.addEventListener(ev,fn); }
  function val(id) { var el=document.getElementById(id); return el ? el.value.trim() : ""; }
  function qsa(sel,root) { return Array.prototype.slice.call(document.getElementById(root).querySelectorAll(sel)); }
  function x(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function showErr(el,msg) { if(el){el.textContent=msg;el.style.display="block";} }
  function fmtTs(ts) { if(!ts) return ""; var d=new Date(ts),h=d.getHours(),m=d.getMinutes(),ap=h>=12?"PM":"AM"; h=h%12||12; return h+":"+(m<10?"0":"")+m+" "+ap; }
  function col(n) { var p=["#e05c5c","#d4841a","#2e9e6b","#6b57d4","#1a8fc9","#c45295","#4f6ef7"],h=0,s=n||""; for(var i=0;i<s.length;i++){h=s.charCodeAt(i)+((h<<5)-h);} return p[Math.abs(h)%p.length]; }
})();
