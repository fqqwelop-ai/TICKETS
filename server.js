const express = require("express");
const session = require("express-session");
const axios   = require("axios");
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const db      = require("./db.js");

const app  = express();
const PORT = process.env.PORT || 8080;

const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "secret_xyz_123",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;direction:rtl;min-height:100vh}
.nav{background:#1a1d27;border-bottom:1px solid #2d3148;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:100}
.nav-brand{font-size:18px;font-weight:800;color:#5865f2}
.nav-links{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
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
.btn-warn{background:#faa61a;color:#000}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:13px;color:#8892a4;margin-bottom:6px;font-weight:500}
.form-group input,.form-group select,.form-group textarea{width:100%;background:#0d1117;border:1px solid #2d3148;border-radius:8px;padding:10px 14px;color:#e2e8f0;font-size:14px;outline:none;font-family:inherit}
.form-group input:focus,.form-group textarea:focus{border-color:#5865f2}
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
.modal{display:none;position:fixed;inset:0;background:#00000099;z-index:1000;align-items:center;justify-content:center}
.modal.open{display:flex}
.modal-box{background:#1a1d27;border:1px solid #2d3148;border-radius:16px;padding:28px;width:500px;max-width:90vw;max-height:90vh;overflow-y:auto}
@media(max-width:768px){.grid-2,.grid-3{grid-template-columns:1fr}.container{padding:16px}}
`;

const JS = `
function toast(msg,ok=true){const t=document.getElementById('toast');t.textContent=msg;t.style.background=ok?'#57f287':'#ed4245';t.style.color=ok?'#000':'#fff';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
async function post(url,data){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return r.json()}
`;

function page(title, body, navLinks) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${CSS}</style></head><body>
<div id="toast" class="toast"></div>
<nav class="nav"><span class="nav-brand">🎫 نظام التيكتات</span><div class="nav-links">${navLinks}</div></nav>
<div class="container">${body}</div>
<script>${JS}</script></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

function requireAdmin(req, res, next) {
  if (!req.session.adminLoggedIn) return res.redirect("/admin/login");
  next();
}

app.get("/admin/login", (req, res) => {
  if (req.session.adminLoggedIn) return res.redirect("/admin");
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Admin</title><style>${CSS}
  .wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#1a1d27;border:1px solid #2d3148;border-radius:20px;padding:40px;width:380px}
  </style></head><body><div class="wrap"><div class="box">
  <div style="font-size:22px;font-weight:800;margin-bottom:24px;text-align:center">⚙️ لوحة الأدمن</div>
  <div class="form-group"><label>اسم المستخدم</label><input type="text" id="u"></div>
  <div class="form-group"><label>كلمة المرور</label><input type="password" id="p" onkeydown="if(event.key==='Enter')login()"></div>
  <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="login()">دخول</button>
  <div id="err" style="color:#ed4245;font-size:13px;margin-top:12px;text-align:center"></div>
  </div></div><script>${JS}
  async function login(){const r=await post('/admin/api/login',{username:document.getElementById('u').value,password:document.getElementById('p').value});if(r.ok)location.href='/admin';else document.getElementById('err').textContent='❌ '+r.error}
  </script></body></html>`);
});

app.post("/admin/api/login", (req, res) => {
  if (req.body.username === ADMIN_USER && req.body.password === ADMIN_PASS) {
    req.session.adminLoggedIn = true;
    return res.json({ ok: true });
  }
  res.json({ ok: false, error: "بيانات خاطئة" });
});

app.get("/admin/logout", (req, res) => { req.session.adminLoggedIn = false; res.redirect("/admin/login"); });

const adminNav = `
  <a href="/admin" class="nav-link">🏠</a>
  <a href="/admin/licenses" class="nav-link">🔑 اللايسنسات</a>
  <a href="/admin/logout" class="nav-link">خروج</a>
`;

app.get("/admin", requireAdmin, async (req, res) => {
  const all     = await db.getAllLicenses();
  const active  = all.filter(l => l.active && (!l.expires_at || new Date(l.expires_at) > new Date())).length;
  const expired = all.filter(l => l.expires_at && new Date(l.expires_at) <= new Date()).length;
  res.send(page("الأدمن", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">🏠 لوحة الأدمن</h2>
    <div class="grid-3" style="margin-bottom:28px">
      <div class="stat-card"><div style="font-size:28px">🔑</div><div class="stat-num">${all.length}</div><div class="stat-label">إجمالي اللايسنسات</div></div>
      <div class="stat-card"><div style="font-size:28px">✅</div><div class="stat-num" style="color:#57f287">${active}</div><div class="stat-label">نشطة</div></div>
      <div class="stat-card"><div style="font-size:28px">⚠️</div><div class="stat-num" style="color:#faa61a">${expired}</div><div class="stat-label">منتهية</div></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <b>آخر اللايسنسات</b><a href="/admin/licenses" class="btn btn-ghost" style="padding:6px 14px;font-size:13px">عرض الكل</a>
      </div>
      <table class="table"><thead><tr><th>العميل</th><th>اليوزرنيم</th><th>الحالة</th><th>الانتهاء</th><th></th></tr></thead><tbody>
      ${all.slice(0,8).map(l => {
        const exp = l.expires_at ? new Date(l.expires_at) : null;
        const st  = !l.active ? "معطّل" : exp && exp<=new Date() ? "منتهي" : "نشط";
        const bc  = !l.active ? "badge-red" : exp && exp<=new Date() ? "badge-yellow" : "badge-green";
        return `<tr><td><b>${l.client_name}</b></td><td>${l.username}</td>
        <td><span class="badge ${bc}">${st}</span></td>
        <td style="color:#8892a4;font-size:13px">${exp ? exp.toLocaleDateString("ar-SA") : "∞"}</td>
        <td><a href="/admin/licenses/${l.license_key}" class="btn btn-ghost" style="padding:4px 12px;font-size:12px">✏️</a></td></tr>`;
      }).join("")}
      </tbody></table>
    </div>
  `, adminNav));
});

app.get("/admin/licenses", requireAdmin, async (req, res) => {
  const all = await db.getAllLicenses();
  res.send(page("اللايسنسات", `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="font-size:22px;font-weight:800">🔑 اللايسنسات</h2>
      <button class="btn btn-primary" onclick="document.getElementById('addModal').classList.add('open')">➕ جديد</button>
    </div>
    <div class="card">
      <table class="table"><thead><tr><th>العميل</th><th>اليوزرنيم</th><th>الحالة</th><th>السيرفرات</th><th>الانتهاء</th><th>إجراءات</th></tr></thead><tbody>
      ${all.map(l => {
        const exp = l.expires_at ? new Date(l.expires_at) : null;
        const st  = !l.active ? "معطّل" : exp && exp<=new Date() ? "منتهي" : "نشط";
        const bc  = !l.active ? "badge-red" : exp && exp<=new Date() ? "badge-yellow" : "badge-green";
        return `<tr>
          <td><div style="font-weight:600">${l.client_name}</div><div style="font-size:11px;color:#8892a4">${l.license_key}</div></td>
          <td>${l.username}</td><td><span class="badge ${bc}">${st}</span></td>
          <td style="text-align:center">${l.max_servers}</td>
          <td style="font-size:13px;color:#8892a4">${exp ? exp.toLocaleDateString("ar-SA") : "∞"}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap">
            <a href="/admin/licenses/${l.license_key}" class="btn btn-ghost" style="padding:4px 12px;font-size:12px">✏️</a>
            <button class="btn btn-danger" style="padding:4px 12px;font-size:12px" onclick="delLic('${l.license_key}','${l.client_name}')">🗑️</button>
            <button class="btn ${l.active?'btn-warn':'btn-success'}" style="padding:4px 12px;font-size:12px" onclick="toggleLic('${l.license_key}',${l.active})">${l.active?"تعطيل":"تفعيل"}</button>
          </td></tr>`;
      }).join("")}
      </tbody></table>
    </div>

    <div id="addModal" class="modal" onclick="if(event.target===this)this.classList.remove('open')">
      <div class="modal-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <b>➕ لايسنس جديد</b>
          <button class="btn btn-ghost" style="padding:4px 10px" onclick="document.getElementById('addModal').classList.remove('open')">✕</button>
        </div>
        <div class="form-group"><label>اسم العميل</label><input id="a_name" placeholder="سيرفر DOJ"></div>
        <div class="form-group"><label>اسم المستخدم</label><input id="a_user" placeholder="client123"></div>
        <div class="form-group"><label>كلمة المرور</label><input type="password" id="a_pass"></div>
        <div class="grid-2">
          <div class="form-group"><label>عدد السيرفرات</label><input type="number" id="a_srv" value="1" min="1"></div>
          <div class="form-group"><label>تاريخ الانتهاء</label><input type="date" id="a_exp"></div>
        </div>
        <button class="btn btn-primary" onclick="createLic()">إنشاء</button>
        <div id="newKey" style="display:none;margin-top:12px;background:#0d1117;padding:12px;border-radius:8px">
          <div style="color:#8892a4;font-size:12px;margin-bottom:4px">مفتاح اللايسنس:</div>
          <div id="newKeyVal" style="font-family:monospace;color:#57f287;word-break:break-all"></div>
        </div>
      </div>
    </div>

    <script>
    async function createLic(){
      const r=await post('/admin/api/licenses/create',{client_name:document.getElementById('a_name').value,username:document.getElementById('a_user').value,password:document.getElementById('a_pass').value,max_servers:parseInt(document.getElementById('a_srv').value)||1,expires_at:document.getElementById('a_exp').value||null});
      if(r.ok){document.getElementById('newKey').style.display='block';document.getElementById('newKeyVal').textContent=r.license_key;toast('✅ تم الإنشاء');setTimeout(()=>location.reload(),3000)}
      else toast('❌ '+r.error,false);
    }
    async function delLic(key,name){if(!confirm('حذف '+name+'؟'))return;const r=await post('/admin/api/licenses/delete',{license_key:key});toast(r.ok?'✅ تم':'❌ '+r.error,r.ok);if(r.ok)setTimeout(()=>location.reload(),1000)}
    async function toggleLic(key,active){const r=await post('/admin/api/licenses/toggle',{license_key:key,active:!active});toast(r.ok?'✅ تم':'❌ '+r.error,r.ok);if(r.ok)setTimeout(()=>location.reload(),800)}
    </script>
  `, adminNav));
});

app.get("/admin/licenses/:key", requireAdmin, async (req, res) => {
  const lic = await db.getLicense(req.params.key);
  if (!lic) return res.redirect("/admin/licenses");
  res.send(page(`تفاصيل: ${lic.client_name}`, `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <h2 style="font-size:20px;font-weight:800">🔑 ${lic.client_name}</h2>
      <a href="/admin/licenses" class="btn btn-ghost">← رجوع</a>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">📋 معلومات اللايسنس</div>
        <div class="form-group"><label>مفتاح اللايسنس</label><input value="${lic.license_key}" readonly onclick="navigator.clipboard.writeText(this.value);toast('✅ نُسخ')"></div>
        <div class="form-group"><label>اسم العميل</label><input id="e_name" value="${lic.client_name||""}"></div>
        <div class="form-group"><label>اسم المستخدم</label><input id="e_user" value="${lic.username||""}"></div>
        <div class="form-group"><label>كلمة مرور جديدة (فارغة = بدون تغيير)</label><input type="password" id="e_pass"></div>
        <div class="grid-2">
          <div class="form-group"><label>عدد السيرفرات</label><input type="number" id="e_srv" value="${lic.max_servers||1}"></div>
          <div class="form-group"><label>الانتهاء</label><input type="date" id="e_exp" value="${lic.expires_at?new Date(lic.expires_at).toISOString().split("T")[0]:""}"></div>
        </div>
        <button class="btn btn-primary" onclick="saveInfo()">💾 حفظ</button>
      </div>
      <div class="card">
        <div class="card-title">🤖 إعدادات البوت</div>
        <div class="form-group"><label>Bot Token</label><input type="password" id="e_tok" value="${lic.bot_token||""}"></div>
        <div class="form-group"><label>Guild ID</label><input id="e_guild" value="${lic.guild_id||""}"></div>
        <div class="form-group"><label>Client ID (OAuth)</label><input id="e_cid" value="${lic.client_id||""}"></div>
        <div class="form-group"><label>Client Secret (OAuth)</label><input type="password" id="e_csec" value="${lic.client_secret||""}"></div>
        <div class="form-group"><label>Dashboard URL</label><input id="e_url" value="${lic.dashboard_url||""}" placeholder="https://ticketss.up.railway.app"></div>
        <div class="form-group"><label>Support Role ID</label><input id="e_role" value="${lic.support_role_id||""}"></div>
        <div class="form-group"><label>Discord ID للمالك</label><input id="e_did" value="${lic.discord_id||""}"></div>
        <button class="btn btn-primary" onclick="saveBotConf()">💾 حفظ</button>
      </div>
    </div>
    <div class="card" style="border-color:#ed424533">
      <div class="card-title" style="color:#ed4245">⚠️ إجراءات</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ${lic.active?"btn-warn":"btn-success"}" onclick="toggle(${lic.active})">${lic.active?"🔴 تعطيل":"🟢 تفعيل"}</button>
        <button class="btn btn-danger" onclick="del()">🗑️ حذف</button>
      </div>
    </div>
    <script>
    const KEY='${lic.license_key}';
    const g=id=>document.getElementById(id).value;
    async function saveInfo(){const r=await post('/admin/api/licenses/update',{license_key:KEY,client_name:g('e_name'),username:g('e_user'),password:g('e_pass')||null,max_servers:parseInt(g('e_srv'))||1,expires_at:g('e_exp')||null});toast(r.ok?'✅ تم':'❌ '+r.error,r.ok)}
    async function saveBotConf(){const r=await post('/admin/api/licenses/update',{license_key:KEY,bot_token:g('e_tok')||null,guild_id:g('e_guild')||null,client_id:g('e_cid')||null,client_secret:g('e_csec')||null,dashboard_url:g('e_url')||null,support_role_id:g('e_role')||null,discord_id:g('e_did')||null});toast(r.ok?'✅ تم':'❌ '+r.error,r.ok)}
    async function toggle(active){const r=await post('/admin/api/licenses/toggle',{license_key:KEY,active:!active});toast(r.ok?'✅ تم':'❌ '+r.error,r.ok);if(r.ok)setTimeout(()=>location.reload(),800)}
    async function del(){if(!confirm('حذف هذا اللايسنس؟'))return;const r=await post('/admin/api/licenses/delete',{license_key:KEY});if(r.ok)location.href='/admin/licenses';else toast('❌ '+r.error,false)}
    </script>
  `, adminNav));
});

// Admin APIs
app.post("/admin/api/licenses/create", requireAdmin, async (req, res) => {
  try {
    const { client_name, username, password, max_servers, expires_at } = req.body;
    if (!client_name || !username || !password) return res.json({ ok: false, error: "بيانات ناقصة" });
    if (await db.getLicenseByUser(username)) return res.json({ ok: false, error: "اسم المستخدم مستخدم" });
    const license_key   = crypto.randomBytes(12).toString("hex").toUpperCase();
    const password_hash = await bcrypt.hash(password, 10);
    await db.createLicense({ license_key, client_name, username, password_hash, expires_at: expires_at || null, max_servers: max_servers || 1 });
    res.json({ ok: true, license_key });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/admin/api/licenses/update", requireAdmin, async (req, res) => {
  try {
    const { license_key, password, ...rest } = req.body;
    const updates = {};
    for (const [k, v] of Object.entries(rest)) updates[k] = v === "" ? null : v;
    if (password) updates.password_hash = await bcrypt.hash(password, 10);
    await db.updateLicense(license_key, updates);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/admin/api/licenses/delete", requireAdmin, async (req, res) => {
  try { await db.deleteLicense(req.body.license_key); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/admin/api/licenses/toggle", requireAdmin, async (req, res) => {
  try { await db.updateLicense(req.body.license_key, { active: req.body.active }); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CLIENT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

async function requireAuth(req, res, next) {
  if (!req.session.licenseKey) return res.redirect("/login");
  const lic = await db.getLicense(req.session.licenseKey);
  if (!lic || !lic.active) { req.session.destroy(() => {}); return res.redirect("/login"); }
  if (lic.expires_at && new Date(lic.expires_at) <= new Date()) {
    req.session.destroy(() => {});
    return res.send(`<h2 style="font-family:sans-serif;color:#ed4245;text-align:center;margin-top:60px">❌ اللايسنس منتهي — تواصل مع الأدمن</h2>`);
  }
  req.license    = lic;
  req.licenseKey = lic.license_key;
  req.isOwner    = req.session.isOwner || false;
  req.userPerms  = req.session.userPerms || [];
  req.isViewer   = !req.isOwner && req.userPerms.length > 0;
  req.hasPerm    = (p) => req.isOwner || req.userPerms.includes("all") || req.userPerms.includes(p);
  next();
}

function requireOwner(req, res, next) {
  if (!req.isOwner) return res.send(`<h2 style="font-family:sans-serif;color:#ed4245;text-align:center;margin-top:60px">🚫 هذه الصفحة للمالك فقط</h2>`);
  next();
}

function dashNav(active, req) {
  const isOwner = req && req.isOwner;
  const hp = (p) => isOwner || (req && req.hasPerm && req.hasPerm(p));
  return `
    <a href="/dashboard" class="nav-link ${active==="home"?"active":""}">🏠</a>
    ${hp("tickets") ? `<a href="/dashboard/tickets" class="nav-link ${active==="tickets"?"active":""}">🎫 التيكتات</a>` : ""}
    ${hp("panels")  ? `<a href="/dashboard/panels"  class="nav-link ${active==="panels"?"active":""}">📋 البانلات</a>`  : ""}
    ${hp("history") ? `<a href="/dashboard/history" class="nav-link ${active==="history"?"active":""}">📁 السجل</a>`    : ""}
    ${hp("settings")? `<a href="/dashboard/settings" class="nav-link ${active==="settings"?"active":""}">⚙️ الإعدادات</a>`: ""}
    ${hp("reset")   ? `<a href="/dashboard/reset"   class="nav-link ${active==="reset"?"active":""}">🔄 تصفير</a>`    : ""}
    <a href="/logout" class="nav-link">خروج</a>
  `;
}

// Login
app.get("/login", (req, res) => {
  if (req.session.licenseKey) return res.redirect("/dashboard");
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تسجيل الدخول</title><style>${CSS}
  .wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#1a1d27;border:1px solid #2d3148;border-radius:20px;padding:40px;width:400px;max-width:90vw}
  .divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:#8892a4;font-size:13px}
  .divider::before,.divider::after{content:'';flex:1;height:1px;background:#2d3148}
  </style></head><body><div class="wrap"><div class="box">
  <div style="font-size:22px;font-weight:800;margin-bottom:6px;text-align:center">🎫 نظام التيكتات</div>
  <div style="color:#8892a4;font-size:14px;margin-bottom:28px;text-align:center">سجّل دخولك للمتابعة</div>
  <div class="form-group"><label>اسم المستخدم</label><input id="u" placeholder="username"></div>
  <div class="form-group"><label>كلمة المرور</label><input type="password" id="p" onkeydown="if(event.key==='Enter')login()"></div>
  <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="login()">دخول</button>
  <div class="divider">أو</div>
  <button class="btn btn-ghost" style="width:100%;justify-content:center;background:#5865f2;color:#fff" onclick="discordLogin()">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.134 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
    الدخول عبر Discord
  </button>
  <div id="err" style="color:#ed4245;font-size:13px;margin-top:12px;text-align:center"></div>
  </div></div><script>${JS}
  async function login(){const r=await post('/api/login',{username:document.getElementById('u').value,password:document.getElementById('p').value});if(r.ok)location.href='/dashboard';else document.getElementById('err').textContent='❌ '+r.error}
  function discordLogin(){const u=prompt('أدخل اسم المستخدم أولاً:');if(u)location.href='/auth/discord?u='+encodeURIComponent(u)}
  </script></body></html>`);
});

app.post("/api/login", async (req, res) => {
  try {
    const lic = await db.getLicenseByUser(req.body.username);
    if (!lic) return res.json({ ok: false, error: "بيانات خاطئة" });
    if (!lic.active) return res.json({ ok: false, error: "اللايسنس معطّل" });
    if (lic.expires_at && new Date(lic.expires_at) <= new Date()) return res.json({ ok: false, error: "اللايسنس منتهي" });
    if (!await bcrypt.compare(req.body.password, lic.password_hash)) return res.json({ ok: false, error: "بيانات خاطئة" });
    req.session.licenseKey = lic.license_key;
    req.session.isOwner    = true;
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Discord OAuth
app.get("/auth/discord", async (req, res) => {
  const username = req.query.u;
  if (!username) return res.redirect("/login");
  const lic = await db.getLicenseByUser(username);
  if (!lic || !lic.client_id || !lic.dashboard_url) return res.redirect("/login?err=noOAuth");
  req.session.pendingUser = username;
  const redirect = `${lic.dashboard_url}/auth/callback`;
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${lic.client_id}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=identify`);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const username = req.session.pendingUser;
  if (!code || !username) return res.redirect("/login");
  const lic = await db.getLicenseByUser(username);
  if (!lic) return res.redirect("/login");
  try {
    const redirect = `${lic.dashboard_url}/auth/callback`;
    const tok = await axios.post("https://discord.com/api/oauth2/token",
      new URLSearchParams({ client_id: lic.client_id, client_secret: lic.client_secret, grant_type: "authorization_code", code, redirect_uri: redirect }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const user = await axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tok.data.access_token}` } });
    const discordId = user.data.id;

    let roles = [];
    try {
      const m = await axios.get(`https://discord.com/api/guilds/${lic.guild_id}/members/${discordId}`, { headers: { Authorization: `Bot ${lic.bot_token}` } });
      roles = m.data.roles || [];
    } catch {}

    const isOwner  = discordId === lic.discord_id;
    const rolePerms = JSON.parse(lic.viewer_role_ids || "[]");
    // viewer_role_ids يخزن الآن [{id, name, perms:[]}]
    let userPerms = [];
    if (!isOwner) {
      for (const rp of rolePerms) {
        if (roles.includes(rp.id || rp)) {
          userPerms = rp.perms || ["tickets","panels","history"];
          break;
        }
      }
    }
    const isViewer = !isOwner && userPerms.length > 0;

    if (!isOwner && !isViewer) return res.send(`<h2 style="font-family:sans-serif;color:#ed4245;text-align:center;margin-top:60px">🚫 ليس لديك صلاحية</h2><a href="/login" style="display:block;text-align:center;margin-top:16px;color:#5865f2">رجوع</a>`);

    req.session.licenseKey = lic.license_key;
    req.session.isOwner    = isOwner;
    req.session.userPerms  = isOwner ? ["all"] : userPerms;
    delete req.session.pendingUser;
    res.redirect("/dashboard");
  } catch(e) { console.error("[OAuth]", e.message); res.redirect("/login"); }
});

app.get("/logout", (req, res) => { req.session.destroy(() => {}); res.redirect("/login"); });
app.get("/", (req, res) => res.redirect("/login"));

// Dashboard Pages
app.get("/dashboard", requireAuth, async (req, res) => {
  const tickets = await db.getActiveTickets(req.licenseKey);
  const panels  = await db.getPanels(req.licenseKey);
  const closed  = await db.getClosedTickets(req.licenseKey);
  const lic     = req.license;
  const exp     = lic.expires_at ? new Date(lic.expires_at) : null;
  const days    = exp ? Math.ceil((exp - new Date()) / 86400000) : null;
  res.send(page("الرئيسية", `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div><h2 style="font-size:22px;font-weight:800">🏠 لوحة التحكم</h2><div style="color:#8892a4;font-size:14px;margin-top:4px">${lic.client_name}</div></div>
      ${days !== null ? `<span class="badge ${days<7?"badge-red":days<30?"badge-yellow":"badge-green"}">⏳ ${days} يوم متبقي</span>` : '<span class="badge badge-green">✅ بلا انتهاء</span>'}
    </div>
    <div class="grid-3" style="margin-bottom:28px">
      <div class="stat-card"><div style="font-size:28px">🎫</div><div class="stat-num">${tickets.length}</div><div class="stat-label">تيكتات مفتوحة</div></div>
      <div class="stat-card"><div style="font-size:28px">📋</div><div class="stat-num">${panels.length}</div><div class="stat-label">بانلات</div></div>
      <div class="stat-card"><div style="font-size:28px">📁</div><div class="stat-num">${closed.length}</div><div class="stat-label">مغلقة</div></div>
    </div>
    ${tickets.length ? `<div class="card"><div class="card-title">🎫 التيكتات المفتوحة</div>
    <table class="table"><thead><tr><th>#</th><th>المستخدم</th><th>البانل</th><th>الوقت</th></tr></thead><tbody>
    ${tickets.slice(0,10).map(t=>`<tr><td><b>#${t.num}</b></td><td>${t.username||t.user_id}</td><td>${t.panel_id}</td><td style="color:#8892a4;font-size:13px">${new Date(t.created_at).toLocaleString("ar-SA")}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="card" style="text-align:center;padding:40px;color:#8892a4">🎫 لا توجد تيكتات مفتوحة</div>`}
  `, dashNav("home", req)));
});

app.get("/dashboard/tickets", requireAuth, async (req, res) => {
  const tickets = await db.getActiveTickets(req.licenseKey);
  res.send(page("التيكتات", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">🎫 التيكتات (${tickets.length})</h2>
    <div class="card"><table class="table"><thead><tr><th>#</th><th>المستخدم</th><th>البانل</th><th>كلايم</th><th>الوقت</th></tr></thead><tbody>
    ${tickets.length ? tickets.map(t=>`<tr><td><b>#${t.num}</b></td><td>${t.username||t.user_id}</td><td><span class="badge badge-green">${t.panel_id}</span></td><td>${t.claimed_by?`<span class="badge badge-yellow">✋ ${t.claimed_by}`:"<span style='color:#8892a4'>—</span>"}</span></td><td style="color:#8892a4;font-size:13px">${new Date(t.created_at).toLocaleString("ar-SA")}</td></tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#8892a4;padding:32px">لا توجد تيكتات</td></tr>`}
    </tbody></table></div>
  `, dashNav("tickets", req)));
});

app.get("/dashboard/panels", requireAuth, async (req, res) => {
  const isViewer = req.isViewer;
  res.send(page("البانلات", `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h2 style="font-size:22px;font-weight:800">📋 البانلات</h2>
      ${!isViewer ? '<button class="btn btn-primary" onclick="document.getElementById(\'addCard\').style.display=\'block\'">➕ جديد</button>' : ""}
    </div>
    <div id="panelsList"><p style="color:#8892a4">جاري التحميل...</p></div>
    ${!isViewer ? `<div id="addCard" class="card" style="display:none;border-color:#5865f244;margin-top:20px">
      <div class="card-title">➕ بانل جديد</div>
      <div class="grid-2">
        <div>
          <div class="form-group"><label>الاسم</label><input id="n_name" placeholder="دعم عام"></div>
          <div class="form-group"><label>العنوان</label><input id="n_title" placeholder="🎫 نظام التيكتات"></div>
          <div class="form-group"><label>الوصف</label><textarea id="n_desc"></textarea></div>
          <div class="form-group"><label>اللون</label><input type="color" id="n_color" value="#5865f2" style="height:40px"></div>
          <div class="form-group"><label>نص الزر</label><input id="n_btn" value="فتح تيكت"></div>
          <div class="form-group"><label>إيموجي الزر</label><input id="n_emoji" value="🎫"></div>
        </div>
        <div>
          <div class="form-group"><label>عنوان الترحيب</label><input id="n_wtitle"></div>
          <div class="form-group"><label>وصف الترحيب <small style="color:#8892a4">({user} للمنشن)</small></label><textarea id="n_wdesc"></textarea></div>
          <div class="form-group"><label>لون الترحيب</label><input type="color" id="n_wcolor" value="#57f287" style="height:40px"></div>
          <div class="form-group"><label>Category ID</label><input id="n_cat"></div>
          <div class="form-group"><label>Support Role ID</label><input id="n_role"></div>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" onclick="createPanel()">إنشاء</button>
        <button class="btn btn-ghost" onclick="document.getElementById('addCard').style.display='none'">إلغاء</button>
      </div>
    </div>` : ""}
    <script>
    const IS_VIEWER=${isViewer};
    async function loadPanels(){
      const ps=await fetch('/api/panels').then(r=>r.json()).catch(()=>[]);
      const c=document.getElementById('panelsList');
      if(!ps.length){c.innerHTML="<div class='card' style='text-align:center;padding:40px;color:#8892a4'>لا توجد بانلات</div>";return}
      c.innerHTML=ps.map((p,i)=>\`<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div><b style="font-size:16px">\${p.name||"بانل #"+(i+1)}</b>
          <div style="color:#8892a4;font-size:12px;margin-top:4px">ID: <code style="background:#0d1117;padding:2px 6px;border-radius:4px">\${p.id}</code> | عداد: <b>\${p.counter||0}</b></div></div>
          \${!IS_VIEWER?\`<div style="display:flex;gap:8px">
            <button class="btn btn-ghost" style="padding:6px 14px;font-size:13px" onclick="toggle('\${p.id}')">✏️ تعديل</button>
            \${i>0?\`<button class="btn btn-danger" style="padding:6px 14px;font-size:13px" onclick="delP('\${p.id}')">🗑️</button>\`:""}
          </div>\`:""}
        </div>
        \${!IS_VIEWER?\`<div id="ef_\${p.id}" style="display:none;margin-top:16px;border-top:1px solid #2d3148;padding-top:16px">
          <div class="grid-2">
            <div>
              <div class="form-group"><label>الاسم</label><input id="e_name_\${p.id}"></div>
              <div class="form-group"><label>العنوان</label><input id="e_title_\${p.id}"></div>
              <div class="form-group"><label>الوصف</label><textarea id="e_desc_\${p.id}"></textarea></div>
              <div class="form-group"><label>اللون</label><input type="color" id="e_color_\${p.id}" style="height:40px"></div>
              <div class="form-group"><label>نص الزر</label><input id="e_btn_\${p.id}"></div>
              <div class="form-group"><label>إيموجي</label><input id="e_emoji_\${p.id}"></div>
              <div class="form-group"><label>فوتر</label><input id="e_footer_\${p.id}"></div>
            </div>
            <div>
              <div class="form-group"><label>عنوان ترحيب</label><input id="e_wtitle_\${p.id}"></div>
              <div class="form-group"><label>وصف ترحيب ({user})</label><textarea id="e_wdesc_\${p.id}"></textarea></div>
              <div class="form-group"><label>لون ترحيب</label><input type="color" id="e_wcolor_\${p.id}" style="height:40px"></div>
              <div class="form-group"><label>Category ID</label><input id="e_cat_\${p.id}"></div>
              <div class="form-group"><label>Support Role ID</label><input id="e_role_\${p.id}"></div>
            </div>
          </div>
          <button class="btn btn-primary" onclick="saveP('\${p.id}')">💾 حفظ</button>
        </div>\`:""}
      </div>\`).join("");
      ps.forEach(p=>{
        const s=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||""};
        s("e_name_"+p.id,p.name);s("e_title_"+p.id,p.title);s("e_desc_"+p.id,p.description);
        s("e_color_"+p.id,p.color||"#5865f2");s("e_btn_"+p.id,p.button_text);s("e_emoji_"+p.id,p.button_emoji);
        s("e_footer_"+p.id,p.footer);s("e_wtitle_"+p.id,p.welcome_title);s("e_wdesc_"+p.id,p.welcome_desc);
        s("e_wcolor_"+p.id,p.welcome_color||"#57f287");s("e_cat_"+p.id,p.category_id);s("e_role_"+p.id,p.support_role_id);
      });
    }
    function toggle(id){const f=document.getElementById("ef_"+id);f.style.display=f.style.display==="none"?"block":"none"}
    async function saveP(id){
      const g=i=>(document.getElementById(i)||{}).value||"";
      const r=await post('/api/panels/save',{id,name:g("e_name_"+id),title:g("e_title_"+id),description:g("e_desc_"+id),color:g("e_color_"+id),button_text:g("e_btn_"+id),button_emoji:g("e_emoji_"+id),footer:g("e_footer_"+id),welcome_title:g("e_wtitle_"+id),welcome_desc:g("e_wdesc_"+id),welcome_color:g("e_wcolor_"+id),category_id:g("e_cat_"+id),support_role_id:g("e_role_"+id)});
      toast(r.ok?"✅ تم":"❌ "+r.error,r.ok);if(r.ok)setTimeout(()=>location.reload(),1200);
    }
    async function delP(id){if(!confirm("حذف؟"))return;const r=await post('/api/panels/delete',{id});toast(r.ok?"✅":"❌ "+r.error,r.ok);if(r.ok)setTimeout(()=>location.reload(),1000)}
    async function createPanel(){
      const g=id=>(document.getElementById(id)||{}).value||"";
      const r=await post('/api/panels/save',{id:'panel_'+Date.now(),name:g('n_name'),title:g('n_title'),description:g('n_desc'),color:g('n_color'),button_text:g('n_btn'),button_emoji:g('n_emoji'),welcome_title:g('n_wtitle'),welcome_desc:g('n_wdesc'),welcome_color:g('n_wcolor'),category_id:g('n_cat'),support_role_id:g('n_role')});
      toast(r.ok?"✅ تم":"❌ "+r.error,r.ok);if(r.ok)setTimeout(()=>location.reload(),1200);
    }
    loadPanels();
    </script>
  `, dashNav("panels", req)));
});

app.get("/dashboard/history", requireAuth, async (req, res) => {
  const tickets = await db.getClosedTickets(req.licenseKey);
  res.send(page("السجل", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">📁 السجل (${tickets.length})</h2>
    <div class="card"><table class="table"><thead><tr><th>#</th><th>المستخدم</th><th>البانل</th><th>أُغلق بواسطة</th><th>السبب</th><th>التاريخ</th><th>📄</th></tr></thead><tbody>
    ${tickets.length ? tickets.map(t=>`<tr><td><b>#${t.num}</b></td><td>${t.username||"—"}</td><td>${t.panel_id||"—"}</td><td>${t.closed_by||"—"}</td><td style="color:#8892a4;font-size:13px">${t.reason||"—"}</td><td style="color:#8892a4;font-size:13px">${new Date(t.closed_at).toLocaleString("ar-SA")}</td><td>${t.transcript?`<a href="/dashboard/transcript/${t.id}" target="_blank" class="btn btn-ghost" style="padding:4px 10px;font-size:12px">📄</a>`:"—"}</td></tr>`).join("")
    : `<tr><td colspan="6" style="text-align:center;color:#8892a4;padding:32px">لا يوجد سجل</td></tr>`}
    </tbody></table></div>
  `, dashNav("history", req)));
});

app.get("/dashboard/settings", requireAuth, requireOwner, async (req, res) => {
  const lic = req.license;
  const viewers = JSON.parse(lic.viewer_role_ids || "[]");
  res.send(page("الإعدادات", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">⚙️ الإعدادات</h2>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">🤖 البوت</div>
        <div class="form-group"><label>Bot Token</label><input type="password" id="s_tok" value="${lic.bot_token||""}"></div>
        <div class="form-group"><label>Guild ID</label><input id="s_guild" value="${lic.guild_id||""}"></div>
        <div class="form-group"><label>Support Role ID</label><input id="s_role" value="${lic.support_role_id||""}"></div>
        <button class="btn btn-primary" onclick="saveBot()">💾 حفظ</button>
      </div>
      <div class="card">
        <div class="card-title">👁️ رتب الصلاحيات</div>
        <p style="color:#8892a4;font-size:13px;margin-bottom:16px">حدد الرتب والصلاحيات المسموحة لكل رتبة</p>
        <div id="rolesList">
          ${viewers.map((r,i) => {
            const robj = typeof r === 'object' ? r : {id: r, name: "", perms: ["tickets","panels","history"]};
            const perms = robj.perms || [];
            return `<div class="card" style="background:#0d1117;margin-bottom:12px" data-idx="${i}">
              <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
                <input class="rname" placeholder="اسم الرتبة" value="${robj.name||""}" style="background:#1a1d27;border:1px solid #2d3148;border-radius:8px;padding:8px 12px;color:#e2e8f0;flex:1;min-width:120px">
                <input class="rid" placeholder="Role ID" value="${robj.id||""}" style="background:#1a1d27;border:1px solid #2d3148;border-radius:8px;padding:8px 12px;color:#e2e8f0;flex:1;min-width:150px">
                <button class="btn btn-danger" style="padding:8px 12px" onclick="this.closest('[data-idx]').remove()">✕</button>
              </div>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                ${[["tickets","🎫 التيكتات"],["panels","📋 البانلات"],["history","📁 السجل"],["settings","⚙️ الإعدادات"],["reset","🔄 التصفير"]].map(([p,label])=>`
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                  <input type="checkbox" class="perm-${p}" ${perms.includes(p)?"checked":""} style="width:16px;height:16px">
                  ${label}
                </label>`).join("")}
              </div>
            </div>`;
          }).join("")}
        </div>
        <button class="btn btn-ghost" style="margin-top:8px" onclick="addRole()">➕ إضافة رتبة</button>
        <button class="btn btn-primary" style="margin-top:12px;margin-right:8px" onclick="saveRoles()">💾 حفظ الرتب</button>
      </div>
    </div>
    <script>
    const g=id=>document.getElementById(id).value;
    async function saveBot(){const r=await post('/api/settings/save',{bot_token:g('s_tok')||null,guild_id:g('s_guild')||null,support_role_id:g('s_role')||null});toast(r.ok?'✅ تم':'❌ '+r.error,r.ok)}
    function addRole(){
      const div=document.createElement('div');
      div.className='card';div.style.cssText='background:#0d1117;margin-bottom:12px';
      div.setAttribute('data-idx','new_'+Date.now());
      const permsHtml=['tickets:🎫 التيكتات','panels:📋 البانلات','history:📁 السجل','settings:⚙️ الإعدادات','reset:🔄 التصفير']
        .map(s=>{const[p,l]=s.split(':');return '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="checkbox" class="perm-'+p+'" style="width:16px;height:16px"> '+l+'</label>';}).join('');
      div.innerHTML='<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
        +'<input class="rname" placeholder="اسم الرتبة" style="background:#1a1d27;border:1px solid #2d3148;border-radius:8px;padding:8px 12px;color:#e2e8f0;flex:1;min-width:120px">'
        +'<input class="rid" placeholder="Role ID" style="background:#1a1d27;border:1px solid #2d3148;border-radius:8px;padding:8px 12px;color:#e2e8f0;flex:1;min-width:150px">'
        +'<button class="btn btn-danger" style="padding:8px 12px" onclick="this.closest('[data-idx]').remove()">✕</button>'
        +'</div><div style="display:flex;gap:12px;flex-wrap:wrap">'+permsHtml+'</div>';
      document.getElementById('rolesList').appendChild(div);
    }
    async function saveRoles(){
      const cards=[...document.querySelectorAll('#rolesList [data-idx]')];
      const roles=cards.map(c=>{
        const id=(c.querySelector('.rid')||{}).value||"";
        const name=(c.querySelector('.rname')||{}).value||"";
        const perms=['tickets','panels','history','settings','reset'].filter(p=>c.querySelector('.perm-'+p)?.checked);
        return id?{id,name,perms}:null;
      }).filter(Boolean);
      const r=await post('/api/settings/save',{viewer_role_ids:JSON.stringify(roles)});
      toast(r.ok?'✅ تم حفظ الرتب':'❌ '+r.error,r.ok);
    }
    </script>
  `, dashNav("settings", req)));
});

app.get("/dashboard/reset", requireAuth, requireOwner, async (req, res) => {
  const panels = await db.getPanels(req.licenseKey);
  res.send(page("التصفير", `
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">🔄 التصفير</h2>
    <div class="card" style="border-color:#ed424533">
      <div class="card-title" style="color:#ed4245">⚠️ منطقة الخطر</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${panels.map(p=>`<div class="card" style="background:#0d1117;border-color:#30363d">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div><b>${p.name||p.id}</b><div style="color:#8892a4;font-size:13px;margin-top:4px">عداد: <b>${p.counter||0}</b></div></div>
            <button class="btn btn-warn" onclick="resetP('${p.id}')">🔢 تصفير</button>
          </div></div>`).join("")}
        <div class="card" style="background:#0d1117;border-color:#ed424533">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div><b style="color:#ed4245">🗑️ حذف السجل</b><div style="color:#8892a4;font-size:13px">لا يمكن التراجع</div></div>
            <button class="btn btn-danger" onclick="clearH()">حذف السجل</button>
          </div></div>
      </div>
    </div>
    <script>
    async function resetP(id){if(!confirm('تصفير؟'))return;const r=await post('/api/reset/panel',{panel_id:id});toast(r.ok?'✅':'❌ '+r.error,r.ok);if(r.ok)setTimeout(()=>location.reload(),800)}
    async function clearH(){if(!confirm('حذف كل السجل؟'))return;const r=await post('/api/reset/history',{});toast(r.ok?'✅':'❌ '+r.error,r.ok)}
    </script>
  `, dashNav("reset", req)));
});



// Transcript
app.get("/dashboard/transcript/:id", requireAuth, async (req, res) => {
  try {
    const r = await db.pool.query("SELECT * FROM closed_tickets WHERE id=$1 AND license_key=$2", [req.params.id, req.licenseKey]);
    const t = r.rows[0];
    if (!t || !t.transcript) return res.send("<h2>لا يوجد transcript</h2>");
    res.send(t.transcript);
  } catch(e) { res.send("<h2>خطأ</h2>"); }
});

// Dashboard APIs
app.get("/api/panels", requireAuth, async (req, res) => res.json(await db.getPanels(req.licenseKey)));

app.post("/api/panels/save", requireAuth, requireOwner, async (req, res) => {
  try { await db.savePanel(req.licenseKey, req.body); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/panels/delete", requireAuth, requireOwner, async (req, res) => {
  try { await db.deletePanel(req.licenseKey, req.body.id); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/settings/save", requireAuth, requireOwner, async (req, res) => {
  try { await db.updateLicense(req.licenseKey, req.body); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/reset/panel", requireAuth, requireOwner, async (req, res) => {
  try { await db.resetPanelCounter(req.licenseKey, req.body.panel_id); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/reset/history", requireAuth, requireOwner, async (req, res) => {
  try { await db.pool.query("DELETE FROM closed_tickets WHERE license_key=$1", [req.licenseKey]); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/message/send", requireAuth, async (req, res) => {
  try {
    const { botManager } = require("./bot.js");
    const bot = botManager.getBot(req.licenseKey);
    if (!bot) return res.json({ ok: false, error: "البوت غير متصل" });
    const ch = await bot.channels.fetch(req.body.channel_id);
    await ch.send(req.body.content);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🌐 الخادم شغال على المنفذ ${PORT}`));
module.exports = app;
