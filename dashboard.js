const express = require("express");
const session = require("express-session");
const axios   = require("axios");
const bcrypt  = require("bcryptjs");
const db      = require("./db.js");

const app = require("./admin.js"); // نفس الـ express instance

// ─── CSS مشترك (نفس admin) ───────────────────────────────────────────────────
const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;direction:rtl;min-height:100vh}
  .nav{background:#1a1d27;border-bottom:1px solid #2d3148;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:100}
  .nav-brand{font-size:18px;font-weight:800;color:#5865f2}
  .nav-links{display:flex;gap:8px;align-items:center}
  .nav-link{padding:6px 14px;border-radius:8px;color:#8892a4;text-decoration:none;font-size:14px;transition:.2s}
  .nav-link:hover,.nav-link.active{background:#5865f222;color:#fff}
  .container{max-width:1100px;margin:0 auto;padding:32px 24px}
  .card{background:#1a1d27;border:1px solid #2d3148;border-radius:16px;padding:24px;margin-bottom:20px}
  .card-title{font-size:16px;font-weight:700;margin-bottom:16px;color:#fff}
  .btn{padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;transition:.2s;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
  .btn-primary{background:#5865f2;color:#fff}.btn-primary:hover{background:#4752c4}
  .btn-danger{background:#ed4245;color:#fff}.btn-danger:hover{background:#c23030}
  .btn-success{background:#57f287;color:#000}.btn-success:hover{background:#3ebd6a}
  .btn-ghost{background:#2d3148;color:#e2e8f0}.btn-ghost:hover{background:#3d4168}
  .btn-warn{background:#faa61a;color:#000}.btn-warn:hover{background:#d48c10}
  .form-group{margin-bottom:14px}
  .form-group label{display:block;font-size:13px;color:#8892a4;margin-bottom:6px;font-weight:500}
  .form-group input,.form-group select,.form-group textarea{width:100%;background:#0d1117;border:1px solid #2d3148;border-radius:8px;padding:10px 14px;color:#e2e8f0;font-size:14px;outline:none;font-family:inherit}
  .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:#5865f2}
  .form-group textarea{min-height:80px;resize:vertical}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .badge{padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
  .badge-green{background:#57f28722;color:#57f287}
  .badge-red{background:#ed424522;color:#ed4245}
  .badge-yellow{background:#faa61a22;color:#faa61a}
  .table{width:100%;border-collapse:collapse}
  .table th{text-align:right;padding:10px 14px;font-size:12px;color:#8892a4;border-bottom:1px solid #2d3148;font-weight:600}
  .table td{padding:12px 14px;border-bottom:1px solid #1a1d27;font-size:14px;vertical-align:middle}
  .table tr:hover td{background:#1e2130}
  .stat-card{background:#1a1d27;border:1px solid #2d3148;border-radius:16px;padding:20px;text-align:center}
  .stat-num{font-size:32px;font-weight:800;color:#5865f2;margin:8px 0}
  .stat-label{font-size:13px;color:#8892a4}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);background:#57f287;color:#000;padding:12px 24px;border-radius:12px;font-weight:600;transition:.3s;opacity:0;z-index:9999}
  .toast.show{transform:translateX(-50%) translateY(0);opacity:1}
  .ro-overlay{position:fixed;top:60px;right:16px;background:#faa61a;color:#000;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;z-index:999}
  @media(max-width:768px){.grid-2,.grid-3{grid-template-columns:1fr}.container{padding:16px}}
`;

function dashPage(title, body, active = "", isViewer = false) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Dashboard</title><style>${CSS}</style></head>
  <body>
  <div id="toast" class="toast"></div>
  ${isViewer ? '<div class="ro-overlay">👁️ وضع العرض فقط</div>' : ""}
  <nav class="nav">
    <span class="nav-brand">🎫 نظام التيكتات</span>
    <div class="nav-links">
      <a href="/dashboard" class="nav-link ${active==="home"?"active":""}">🏠</a>
      <a href="/dashboard/tickets" class="nav-link ${active==="tickets"?"active":""}">🎫 التيكتات</a>
      <a href="/dashboard/panels" class="nav-link ${active==="panels"?"active":""}">📋 البانلات</a>
      <a href="/dashboard/history" class="nav-link ${active==="history"?"active":""}">📁 السجل</a>
      ${!isViewer ? `
      <a href="/dashboard/settings" class="nav-link ${active==="settings"?"active":""}">⚙️ الإعدادات</a>
      <a href="/dashboard/reset" class="nav-link ${active==="reset"?"active":""}">🔄 تصفير</a>
      ` : ""}
      <a href="/dashboard/messages" class="nav-link ${active==="messages"?"active":""}">📢 رسائل</a>
      <a href="/logout" class="nav-link">خروج</a>
    </div>
  </nav>
  <div class="container">${body}</div>
  <script>
  function toast(msg,ok=true){const t=document.getElementById('toast');t.textContent=msg;t.style.background=ok?'#57f287':'#ed4245';t.style.color=ok?'#000':'#fff';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
  async function post(url,data){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return r.json()}
  </script>
  </body></html>`;
}

// ─── Auth Middleware ───────────────────────────────────────────────────────────
async function requireDashAuth(req, res, next) {
  if (!req.session.licenseKey) return res.redirect("/login");
  const lic = await db.getLicense(req.session.licenseKey);
  if (!lic || !lic.active) { req.session.destroy(); return res.redirect("/login"); }
  if (lic.expires_at && new Date(lic.expires_at) <= new Date()) {
    req.session.destroy();
    return res.send(`<h2 style="font-family:sans-serif;color:#ed4245;text-align:center;margin-top:40px">❌ اللايسنس منتهي — تواصل مع الأدمن</h2>`);
  }
  req.license    = lic;
  req.licenseKey = lic.license_key;
  req.isOwner    = req.session.userId === lic.discord_id || req.session.isPasswordLogin;
  req.isViewer   = !req.isOwner && req.session.isViewer;
  next();
}

function requireOwner(req, res, next) {
  if (!req.isOwner) return res.send(`<h2 style="font-family:sans-serif;color:#ed4245;text-align:center;margin-top:40px">🚫 هذه الصفحة للمالك فقط</h2>`);
  next();
}

// ─── Login Page ────────────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  if (req.session.licenseKey) return res.redirect("/dashboard");
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تسجيل الدخول</title>
  <style>${CSS}
  .login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .login-box{background:#1a1d27;border:1px solid #2d3148;border-radius:20px;padding:40px;width:400px;max-width:90vw}
  .login-title{font-size:22px;font-weight:800;margin-bottom:6px;text-align:center}
  .login-sub{color:#8892a4;font-size:14px;margin-bottom:28px;text-align:center}
  .divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:#8892a4;font-size:13px}
  .divider::before,.divider::after{content:'';flex:1;height:1px;background:#2d3148}
  </style></head><body>
  <div class="login-wrap"><div class="login-box">
    <div class="login-title">🎫 نظام التيكتات</div>
    <div class="login-sub">سجّل دخولك للمتابعة</div>

    <div class="form-group"><label>اسم المستخدم</label><input type="text" id="u" placeholder="username"></div>
    <div class="form-group"><label>كلمة المرور</label><input type="password" id="p" placeholder="••••••••" onkeydown="if(event.key==='Enter')login()"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="login()">دخول</button>

    <div class="divider">أو</div>
    <a href="/auth/discord" class="btn btn-ghost" style="width:100%;justify-content:center;background:#5865f2;color:#fff">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.134 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
      الدخول عبر Discord
    </a>
    <div id="err" style="color:#ed4245;font-size:13px;margin-top:12px;text-align:center"></div>
  </div></div>
  <script>
  async function login(){
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('u').value,password:document.getElementById('p').value})});
    const d=await r.json();
    if(d.ok) location.href='/dashboard';
    else document.getElementById('err').textContent='❌ '+d.error;
  }
  </script></body></html>`);
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const lic = await db.getLicenseByUser(username);
    if (!lic) return res.json({ ok: false, error: "اسم المستخدم أو كلمة المرور غلط" });
    if (!lic.active) return res.json({ ok: false, error: "اللايسنس معطّل" });
    if (lic.expires_at && new Date(lic.expires_at) <= new Date()) return res.json({ ok: false, error: "اللايسنس منتهي" });
    const match = await bcrypt.compare(password, lic.password_hash);
    if (!match) return res.json({ ok: false, error: "اسم المستخدم أو كلمة المرور غلط" });
    req.session.licenseKey      = lic.license_key;
    req.session.isPasswordLogin = true;
    req.session.isViewer        = false;
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ─── Discord OAuth ─────────────────────────────────────────────────────────────
app.get("/auth/discord", (req, res) => {
  // نحتاج redirect لصفحة مؤقتة تسأل العميل يدخل license key أولاً
  res.redirect("/auth/discord/select");
});

app.get("/auth/discord/select", (req, res) => {
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>اختر اللايسنس</title>
  <style>${CSS}.wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#1a1d27;border:1px solid #2d3148;border-radius:20px;padding:40px;width:400px;max-width:90vw;text-align:center}
  </style></head><body><div class="wrap"><div class="box">
    <div style="font-size:22px;font-weight:800;margin-bottom:8px">🎫 الدخول بالديسكورد</div>
    <div style="color:#8892a4;font-size:14px;margin-bottom:24px">أدخل اسم المستخدم الخاص بك أولاً</div>
    <div class="form-group"><input type="text" id="u" placeholder="اسم المستخدم"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="go()">متابعة →</button>
    <div id="err" style="color:#ed4245;font-size:13px;margin-top:12px"></div>
  </div></div>
  <script>
  async function go(){
    const u=document.getElementById('u').value.trim();
    if(!u){document.getElementById('err').textContent='أدخل اسم المستخدم';return}
    const r=await fetch('/api/check-user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u})});
    const d=await r.json();
    if(d.ok) location.href='/auth/discord/go?u='+encodeURIComponent(u);
    else document.getElementById('err').textContent='❌ '+d.error;
  }
  </script></body></html>`);
});

app.post("/api/check-user", async (req, res) => {
  const lic = await db.getLicenseByUser(req.body.username);
  if (!lic) return res.json({ ok: false, error: "اسم المستخدم غير موجود" });
  if (!lic.active) return res.json({ ok: false, error: "اللايسنس معطّل" });
  if (!lic.client_id) return res.json({ ok: false, error: "لم يتم إعداد Discord OAuth بعد" });
  res.json({ ok: true });
});

app.get("/auth/discord/go", async (req, res) => {
  const username = req.query.u;
  if (!username) return res.redirect("/login");
  const lic = await db.getLicenseByUser(username);
  if (!lic || !lic.client_id || !lic.dashboard_url) return res.redirect("/login");
  req.session.pendingUsername = username;
  const redirectUri = `${lic.dashboard_url}/auth/callback`;
  const url = `https://discord.com/api/oauth2/authorize?client_id=${lic.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/login");
  const username = req.session.pendingUsername;
  if (!username) return res.redirect("/login");
  const lic = await db.getLicenseByUser(username);
  if (!lic) return res.redirect("/login");

  try {
    const redirectUri = `${lic.dashboard_url}/auth/callback`;
    const tokenRes = await axios.post("https://discord.com/api/oauth2/token",
      new URLSearchParams({ client_id: lic.client_id, client_secret: lic.client_secret, grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });

    const discordId = userRes.data.id;

    // جلب roles
    let userRoles = [];
    try {
      const memberRes = await axios.get(`https://discord.com/api/guilds/${lic.guild_id}/members/${discordId}`,
        { headers: { Authorization: `Bot ${lic.bot_token}` } });
      userRoles = memberRes.data.roles || [];
    } catch {}

    // تحقق إذا هو المالك
    const isOwner = discordId === lic.discord_id;

    // تحقق إذا عنده رتبة مشاهدة
    const viewerRoles = JSON.parse(lic.viewer_role_ids || "[]");
    const isViewer = !isOwner && viewerRoles.some(r => userRoles.includes(r));

    if (!isOwner && !isViewer) {
      return res.send(`<h2 style="font-family:sans-serif;color:#ed4245;text-align:center;margin-top:40px">🚫 ليس لديك صلاحية الدخول</h2><a href="/login" style="display:block;text-align:center;margin-top:16px;color:#5865f2">رجوع</a>`);
    }

    req.session.licenseKey      = lic.license_key;
    req.session.userId          = discordId;
    req.session.isPasswordLogin = false;
    req.session.isViewer        = isViewer;
    delete req.session.pendingUsername;
    res.redirect("/dashboard");
  } catch(e) {
    console.log("[OAuth Error]", e.message);
    res.redirect("/login");
  }
});

app.get("/logout", (req, res) => { req.session.destroy(); res.redirect("/login"); });

// ─── Dashboard Home ────────────────────────────────────────────────────────────
app.get("/dashboard", requireDashAuth, async (req, res) => {
  const lic     = req.license;
  const tickets = await db.getActiveTickets(req.licenseKey);
  const panels  = await db.getPanels(req.licenseKey);
  const closed  = await db.getClosedTickets(req.licenseKey);
  const exp     = lic.expires_at ? new Date(lic.expires_at) : null;
  const daysLeft = exp ? Math.ceil((exp - new Date()) / 86400000) : null;

  res.send(dashPage("الرئيسية", `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:22px;font-weight:800">🏠 لوحة التحكم</h2>
        <div style="color:#8892a4;font-size:14px;margin-top:4px">${lic.client_name}</div>
      </div>
      ${daysLeft !== null ? `<div class="badge ${daysLeft < 7 ? "badge-red" : daysLeft < 30 ? "badge-yellow" : "badge-green"}">⏳ ${daysLeft} يوم متبقي</div>` : '<div class="badge badge-green">✅ بلا انتهاء</div>'}
    </div>

    <div class="grid-3" style="margin-bottom:28px">
      <div class="stat-card"><div style="font-size:24px">🎫</div><div class="stat-num">${tickets.length}</div><div class="stat-label">تيكتات مفتوحة</div></div>
      <div class="stat-card"><div style="font-size:24px">📋</div><div class="stat-num">${panels.length}</div><div class="stat-label">بانلات</div></div>
      <div class="stat-card"><div style="font-size:24px">📁</div><div class="stat-num">${closed.length}</div><div class="stat-label">تيكتات مغلقة</div></div>
    </div>

    ${tickets.length > 0 ? `
    <div class="card">
      <div class="card-title">🎫 التيكتات المفتوحة</div>
      <table class="table">
        <thead><tr><th>#</th><th>المستخدم</th><th>البانل</th><th>الوقت</th></tr></thead>
        <tbody>${tickets.slice(0,10).map(t => `
          <tr>
            <td><b>#${t.num}</b></td>
            <td>${t.username || t.user_id}</td>
            <td>${t.panel_id}</td>
            <td style="color:#8892a4;font-size:13px">${new Date(t.created_at).toLocaleString("ar-SA")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : `<div class="card" style="text-align:center;padding:40px"><div style="font-size:40px;margin-bottom:12px">🎫</div><div style="color:#8892a4">لا توجد تيكتات مفتوحة</div></div>`}
  `, "home", req.isViewer));
});

// ─── Tickets ───────────────────────────────────────────────────────────────────
app.get("/dashboard/tickets", requireDashAuth, async (req, res) => {
  const tickets = await db.getActiveTickets(req.licenseKey);
  res.send(dashPage("التيكتات", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">🎫 التيكتات المفتوحة (${tickets.length})</h2>
    <div class="card">
      <table class="table">
        <thead><tr><th>#</th><th>المستخدم</th><th>البانل</th><th>كلايم</th><th>الوقت</th></tr></thead>
        <tbody>${tickets.length ? tickets.map(t => `<tr>
          <td><b>#${t.num}</b></td>
          <td>${t.username || t.user_id}</td>
          <td><span class="badge badge-green">${t.panel_id}</span></td>
          <td>${t.claimed_by ? `<span class="badge badge-yellow">✋ ${t.claimed_by}</span>` : "<span style='color:#8892a4'>—</span>"}</td>
          <td style="color:#8892a4;font-size:13px">${new Date(t.created_at).toLocaleString("ar-SA")}</td>
        </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;color:#8892a4;padding:32px">لا توجد تيكتات مفتوحة</td></tr>`}
        </tbody>
      </table>
    </div>
  `, "tickets", req.isViewer));
});

// ─── Panels ────────────────────────────────────────────────────────────────────
app.get("/dashboard/panels", requireDashAuth, async (req, res) => {
  res.send(dashPage("البانلات", `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="font-size:22px;font-weight:800">📋 البانلات</h2>
      ${!req.isViewer ? '<button class="btn btn-primary" onclick="showAdd()">➕ بانل جديد</button>' : ""}
    </div>
    <div id="panelsList"><p style="color:#8892a4">جاري التحميل...</p></div>

    <script>
    const IS_VIEWER = ${req.isViewer};
    async function loadPanels(){
      const panels = await fetch('/api/panels').then(r=>r.json()).catch(()=>[]);
      const c = document.getElementById('panelsList');
      if(!panels.length){ c.innerHTML="<div class='card' style='text-align:center;padding:40px;color:#8892a4'>لا توجد بانلات — أنشئ بانلاً جديداً</div>"; return; }
      c.innerHTML = panels.map((p,i) => \`
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
            <div>
              <b style="font-size:16px">\${p.name||"بانل #"+(i+1)}</b>
              <div style="color:#8892a4;font-size:12px;margin-top:4px">ID: <code style="background:#0d1117;padding:2px 6px;border-radius:4px">\${p.id}</code> | عداد: <b>\${p.counter||0}</b></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              \${!IS_VIEWER ? \`
              <button class="btn btn-ghost" style="padding:6px 14px;font-size:13px" onclick="toggleEdit('\${p.id}')">✏️ تعديل</button>
              \${i>0 ? \`<button class="btn btn-danger" style="padding:6px 14px;font-size:13px" onclick="delPanel('\${p.id}')">🗑️</button>\` : ""}
              \` : ""}
            </div>
          </div>
          \${!IS_VIEWER ? \`
          <div id="ef_\${p.id}" style="display:none;margin-top:16px;border-top:1px solid #2d3148;padding-top:16px">
            <div class="grid-2">
              <div>
                <div class="form-group"><label>الاسم</label><input id="e_name_\${p.id}"></div>
                <div class="form-group"><label>العنوان</label><input id="e_title_\${p.id}"></div>
                <div class="form-group"><label>الوصف</label><textarea id="e_desc_\${p.id}"></textarea></div>
                <div class="form-group"><label>اللون</label><input type="color" id="e_color_\${p.id}" style="height:40px;cursor:pointer"></div>
                <div class="form-group"><label>نص الزر</label><input id="e_btn_\${p.id}"></div>
                <div class="form-group"><label>إيموجي الزر</label><input id="e_emoji_\${p.id}"></div>
                <div class="form-group"><label>الفوتر</label><input id="e_footer_\${p.id}"></div>
              </div>
              <div>
                <div class="form-group"><label>عنوان الترحيب</label><input id="e_wtitle_\${p.id}"></div>
                <div class="form-group"><label>وصف الترحيب <small style="color:#8892a4">({user} للمنشن)</small></label><textarea id="e_wdesc_\${p.id}"></textarea></div>
                <div class="form-group"><label>لون الترحيب</label><input type="color" id="e_wcolor_\${p.id}" style="height:40px;cursor:pointer"></div>
                <div class="form-group"><label>Category ID</label><input id="e_cat_\${p.id}"></div>
                <div class="form-group"><label>Support Role ID</label><input id="e_role_\${p.id}"></div>
              </div>
            </div>
            <button class="btn btn-primary" onclick="savePanel('\${p.id}')">💾 حفظ</button>
          </div>\` : ""}
        </div>\`).join("");

      // تحميل القيم مباشرة بدون HTML encoding
      panels.forEach(p => {
        const set = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||""; };
        set("e_name_"+p.id, p.name); set("e_title_"+p.id, p.title);
        set("e_desc_"+p.id, p.description); set("e_color_"+p.id, p.color||"#5865f2");
        set("e_btn_"+p.id, p.button_text); set("e_emoji_"+p.id, p.button_emoji);
        set("e_footer_"+p.id, p.footer); set("e_wtitle_"+p.id, p.welcome_title);
        set("e_wdesc_"+p.id, p.welcome_desc); set("e_wcolor_"+p.id, p.welcome_color||"#57f287");
        set("e_cat_"+p.id, p.category_id); set("e_role_"+p.id, p.support_role_id);
      });
    }
    function toggleEdit(id){ const f=document.getElementById("ef_"+id); f.style.display=f.style.display==="none"?"block":"none"; }
    async function savePanel(id){
      const g = i => { const el=document.getElementById(i); return el?el.value:""; };
      const r = await post('/api/panels/save',{
        id, name:g("e_name_"+id), title:g("e_title_"+id), description:g("e_desc_"+id),
        color:g("e_color_"+id), button_text:g("e_btn_"+id), button_emoji:g("e_emoji_"+id),
        footer:g("e_footer_"+id), welcome_title:g("e_wtitle_"+id), welcome_desc:g("e_wdesc_"+id),
        welcome_color:g("e_wcolor_"+id), category_id:g("e_cat_"+id), support_role_id:g("e_role_"+id),
      });
      toast(r.ok?"✅ تم الحفظ":"❌ "+r.error, r.ok);
      if(r.ok) setTimeout(()=>location.reload(),1200);
    }
    async function delPanel(id){
      if(!confirm("حذف هذا البانل؟")) return;
      const r=await post('/api/panels/delete',{id});
      toast(r.ok?"✅ تم":"❌ "+r.error,r.ok);
      if(r.ok) setTimeout(()=>location.reload(),1200);
    }
    function showAdd(){document.getElementById('addCard').style.display='block';document.getElementById('addCard').scrollIntoView({behavior:'smooth'})}
    loadPanels();
    </script>

    ${!req.isViewer ? `
    <div id="addCard" class="card" style="display:none;border-color:#5865f244;margin-top:20px">
      <div class="card-title">➕ بانل جديد</div>
      <div class="grid-2">
        <div>
          <div class="form-group"><label>الاسم</label><input id="n_name" placeholder="دعم عام"></div>
          <div class="form-group"><label>العنوان</label><input id="n_title" placeholder="🎫 نظام التيكتات"></div>
          <div class="form-group"><label>الوصف</label><textarea id="n_desc" placeholder="اضغط لفتح تيكت..."></textarea></div>
          <div class="form-group"><label>اللون</label><input type="color" id="n_color" value="#5865f2" style="height:40px"></div>
          <div class="form-group"><label>نص الزر</label><input id="n_btn" value="فتح تيكت"></div>
          <div class="form-group"><label>إيموجي الزر</label><input id="n_emoji" value="🎫"></div>
        </div>
        <div>
          <div class="form-group"><label>عنوان الترحيب</label><input id="n_wtitle" placeholder="حياك الله {user}"></div>
          <div class="form-group"><label>وصف الترحيب</label><textarea id="n_wdesc" placeholder="أهلاً {user}!&#10;سيتواصل معك أحد الأعضاء قريباً"></textarea></div>
          <div class="form-group"><label>لون الترحيب</label><input type="color" id="n_wcolor" value="#57f287" style="height:40px"></div>
          <div class="form-group"><label>Category ID</label><input id="n_cat"></div>
          <div class="form-group"><label>Support Role ID</label><input id="n_role"></div>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" onclick="createPanel()">إنشاء</button>
        <button class="btn btn-ghost" onclick="document.getElementById('addCard').style.display='none'">إلغاء</button>
      </div>
    </div>
    <script>
    async function createPanel(){
      const g=id=>(document.getElementById(id)||{}).value||"";
      const r=await post('/api/panels/save',{
        id:'panel_'+Date.now(), name:g('n_name'), title:g('n_title'), description:g('n_desc'),
        color:g('n_color'), button_text:g('n_btn'), button_emoji:g('n_emoji'),
        welcome_title:g('n_wtitle'), welcome_desc:g('n_wdesc'), welcome_color:g('n_wcolor'),
        category_id:g('n_cat'), support_role_id:g('n_role'),
      });
      toast(r.ok?"✅ تم الإنشاء":"❌ "+r.error, r.ok);
      if(r.ok) setTimeout(()=>location.reload(),1200);
    }
    </script>` : ""}
  `, "panels", req.isViewer));
});

// ─── History ───────────────────────────────────────────────────────────────────
app.get("/dashboard/history", requireDashAuth, async (req, res) => {
  const tickets = await db.getClosedTickets(req.licenseKey);
  res.send(dashPage("السجل", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">📁 سجل التيكتات المغلقة (${tickets.length})</h2>
    <div class="card">
      <table class="table">
        <thead><tr><th>#</th><th>المستخدم</th><th>البانل</th><th>أُغلق بواسطة</th><th>السبب</th><th>التاريخ</th></tr></thead>
        <tbody>${tickets.length ? tickets.map(t => `<tr>
          <td><b>#${t.num}</b></td>
          <td>${t.username||t.user_id||"—"}</td>
          <td>${t.panel_id||"—"}</td>
          <td>${t.closed_by||"—"}</td>
          <td style="color:#8892a4;font-size:13px">${t.reason||"—"}</td>
          <td style="color:#8892a4;font-size:13px">${new Date(t.closed_at).toLocaleString("ar-SA")}</td>
        </tr>`).join("") : `<tr><td colspan="6" style="text-align:center;color:#8892a4;padding:32px">لا يوجد سجل</td></tr>`}
        </tbody>
      </table>
    </div>
  `, "history", req.isViewer));
});

// ─── Settings ──────────────────────────────────────────────────────────────────
app.get("/dashboard/settings", requireDashAuth, requireOwner, async (req, res) => {
  const lic = req.license;
  const viewerRoles = JSON.parse(lic.viewer_role_ids || "[]");
  res.send(dashPage("الإعدادات", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">⚙️ الإعدادات</h2>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">🤖 البوت</div>
        <div class="form-group"><label>Bot Token</label><input type="password" id="s_token" value="${lic.bot_token||""}" placeholder="Bot Token"></div>
        <div class="form-group"><label>Guild ID</label><input id="s_guild" value="${lic.guild_id||""}"></div>
        <div class="form-group"><label>Support Role ID</label><input id="s_role" value="${lic.support_role_id||""}"></div>
        <button class="btn btn-primary" onclick="saveSettings()">💾 حفظ</button>
      </div>
      <div class="card">
        <div class="card-title">👁️ رتب المشاهدة</div>
        <p style="color:#8892a4;font-size:13px;margin-bottom:16px">أضف Role IDs للأشخاص الذين يمكنهم مشاهدة الداشبورد (التابات العامة فقط)</p>
        <div id="rolesList">
          ${viewerRoles.map((r,i) => `
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input class="viewer-role" value="${r}" style="background:#0d1117;border:1px solid #2d3148;border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:14px;flex:1">
              <button class="btn btn-danger" style="padding:8px 12px" onclick="this.parentElement.remove()">✕</button>
            </div>`).join("")}
        </div>
        <button class="btn btn-ghost" style="margin-top:8px" onclick="addRole()">➕ إضافة رتبة</button>
        <button class="btn btn-primary" style="margin-top:12px" onclick="saveRoles()">💾 حفظ الرتب</button>
      </div>
    </div>

    <script>
    function addRole(){
      const div=document.createElement('div');div.style.cssText='display:flex;gap:8px;margin-bottom:8px';
      div.innerHTML='<input class="viewer-role" placeholder="Role ID" style="background:#0d1117;border:1px solid #2d3148;border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:14px;flex:1"><button class="btn btn-danger" style="padding:8px 12px" onclick="this.parentElement.remove()">✕</button>';
      document.getElementById('rolesList').appendChild(div);
    }
    async function saveSettings(){
      const r=await post('/api/settings/save',{
        bot_token:document.getElementById('s_token').value||null,
        guild_id:document.getElementById('s_guild').value||null,
        support_role_id:document.getElementById('s_role').value||null,
      });
      toast(r.ok?"✅ تم الحفظ":"❌ "+r.error,r.ok);
    }
    async function saveRoles(){
      const roles=[...document.querySelectorAll('.viewer-role')].map(el=>el.value.trim()).filter(Boolean);
      const r=await post('/api/settings/save',{viewer_role_ids:JSON.stringify(roles)});
      toast(r.ok?"✅ تم حفظ الرتب":"❌ "+r.error,r.ok);
    }
    </script>
  `, "settings"));
});

// ─── Reset ─────────────────────────────────────────────────────────────────────
app.get("/dashboard/reset", requireDashAuth, requireOwner, async (req, res) => {
  const panels = await db.getPanels(req.licenseKey);
  res.send(dashPage("التصفير", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">🔄 التصفير</h2>
    <div class="card" style="border-color:#ed424533">
      <div class="card-title" style="color:#ed4245">⚠️ منطقة الخطر</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${panels.map(p => `
          <div class="card" style="background:#0d1117;border-color:#30363d">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <div><b>${p.name||p.id}</b><div style="color:#8892a4;font-size:13px;margin-top:4px">عداد: <b>${p.counter||0}</b></div></div>
              <button class="btn btn-warn" onclick="resetPanel('${p.id}')">🔢 تصفير العداد</button>
            </div>
          </div>`).join("")}
        <div class="card" style="background:#0d1117;border-color:#ed424533">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div><b style="color:#ed4245">🗑️ حذف سجل التيكتات المغلقة</b><div style="color:#8892a4;font-size:13px;margin-top:4px">لا يمكن التراجع</div></div>
            <button class="btn btn-danger" onclick="clearHistory()">حذف السجل</button>
          </div>
        </div>
      </div>
    </div>
    <script>
    async function resetPanel(id){
      if(!confirm('تصفير عداد هذا البانل؟')) return;
      const r=await post('/api/reset/panel',{panel_id:id});
      toast(r.ok?"✅ تم التصفير":"❌ "+r.error,r.ok);
      if(r.ok) setTimeout(()=>location.reload(),1000);
    }
    async function clearHistory(){
      if(!confirm('حذف كل سجل التيكتات المغلقة؟')) return;
      const r=await post('/api/reset/history',{});
      toast(r.ok?"✅ تم الحذف":"❌ "+r.error,r.ok);
    }
    </script>
  `, "reset"));
});

// ─── Messages ──────────────────────────────────────────────────────────────────
app.get("/dashboard/messages", requireDashAuth, async (req, res) => {
  res.send(dashPage("رسائل", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">📢 إرسال رسالة</h2>
    <div class="card">
      <div class="form-group"><label>Channel ID</label><input id="m_ch" placeholder="1234567890"></div>
      <div class="form-group"><label>الرسالة</label><textarea id="m_msg" style="min-height:120px" placeholder="اكتب رسالتك..."></textarea></div>
      <button class="btn btn-primary" onclick="sendMsg()">📤 إرسال</button>
    </div>
    <script>
    async function sendMsg(){
      const r=await post('/api/message/send',{channel_id:document.getElementById('m_ch').value,content:document.getElementById('m_msg').value});
      toast(r.ok?"✅ تم الإرسال":"❌ "+r.error,r.ok);
    }
    </script>
  `, "messages", req.isViewer));
});

// ─── Dashboard APIs ────────────────────────────────────────────────────────────
app.get("/api/panels", requireDashAuth, async (req, res) => {
  const panels = await db.getPanels(req.licenseKey);
  res.json(panels);
});

app.post("/api/panels/save", requireDashAuth, requireOwner, async (req, res) => {
  try {
    await db.savePanel(req.licenseKey, req.body);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/panels/delete", requireDashAuth, requireOwner, async (req, res) => {
  try {
    await db.deletePanel(req.licenseKey, req.body.id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/settings/save", requireDashAuth, requireOwner, async (req, res) => {
  try {
    await db.updateLicense(req.licenseKey, req.body);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/reset/panel", requireDashAuth, requireOwner, async (req, res) => {
  try {
    await db.resetPanelCounter(req.licenseKey, req.body.panel_id);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/reset/history", requireDashAuth, requireOwner, async (req, res) => {
  try {
    await db.pool.query("DELETE FROM closed_tickets WHERE license_key=$1", [req.licenseKey]);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/message/send", requireDashAuth, async (req, res) => {
  try {
    const { botManager } = require("./bot.js");
    const lic = req.license;
    const bot = botManager.getBot(lic.license_key);
    if (!bot) return res.json({ ok: false, error: "البوت غير متصل" });
    const ch = await bot.channels.fetch(req.body.channel_id);
    await ch.send(req.body.content);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = app;
