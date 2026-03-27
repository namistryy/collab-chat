function m(type, data) {
  var d = data || {}; d.type = type;
  return new Promise(function(res) { chrome.runtime.sendMessage(d, function(r) { res(r || {}); }); });
}
function x(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

document.addEventListener("DOMContentLoaded", function() {
  var pb = document.getElementById("pb");
  Promise.all([m("GET_AUTH"), m("GET_STATE")]).then(function(res) {
    var user  = res[0].user || null;
    var state = res[1];
    if (!user) { pb.innerHTML = '<div class="na">Sign in via the Tandem widget on any page.</div>'; return; }
    var name = user.name || user.email || "?";
    pb.innerHTML =
      '<div class="sec"><div class="lbl">Signed in as</div><div class="urow"><div class="av">'+name[0].toUpperCase()+'</div><div><div style="font-weight:500">'+x(user.name||"")+'</div><div style="font-size:10px;color:#aaa">'+x(user.email)+'</div></div></div></div>'+
      '<div class="sec"><div class="lbl">Session</div><div class="srow">'+(state.roomId?'<div class="sdot"></div>In room <span class="pill">'+x(state.roomId)+'</span>':'<span style="color:#aaa">Not in a session</span>')+'</div></div>'+
      '<div class="sec"><div class="lbl">Stats</div><div class="stats"><div class="stat"><div class="stat-l">Messages</div><div class="stat-v">'+(state.msgs||[]).length+'</div></div><div class="stat"><div class="stat-l">Tasks</div><div class="stat-v">'+(state.todos||[]).length+'</div></div></div></div>'+
      '<div class="acts"><button class="btn" id="tb">&#128065; Show / hide widget</button><button class="btn d" id="so">&#8617; Sign out</button></div>';

    document.getElementById("tb").addEventListener("click", function() {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0]) {
          chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: function() {
            var r = document.getElementById("tandem-root");
            if (r) r.style.display = r.style.display === "none" ? "" : "none";
          }});
        }
        window.close();
      });
    });
    document.getElementById("so").addEventListener("click", function() {
      if (!confirm("Sign out of Tandem?")) return;
      m("SIGN_OUT").then(function() { window.close(); });
    });
  });
});
