const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      id            SERIAL PRIMARY KEY,
      license_key   TEXT UNIQUE NOT NULL,
      client_name   TEXT NOT NULL,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      discord_id    TEXT,
      bot_token     TEXT,
      guild_id      TEXT,
      client_id     TEXT,
      client_secret TEXT,
      dashboard_url TEXT,
      dashboard_secret TEXT DEFAULT 'secret_change_me',
      support_role_id  TEXT,
      viewer_role_ids  TEXT DEFAULT '[]',
      max_servers   INT  DEFAULT 1,
      expires_at    TIMESTAMPTZ,
      active        BOOLEAN DEFAULT TRUE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id          SERIAL PRIMARY KEY,
      license_key TEXT NOT NULL,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT UNIQUE NOT NULL,
      user_id     TEXT NOT NULL,
      username    TEXT,
      panel_id    TEXT DEFAULT 'default',
      num         INT  DEFAULT 1,
      closed      BOOLEAN DEFAULT FALSE,
      claimed_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS panels (
      id               TEXT NOT NULL,
      license_key      TEXT NOT NULL,
      name             TEXT,
      title            TEXT,
      description      TEXT,
      color            TEXT DEFAULT '#5865f2',
      button_text      TEXT DEFAULT 'فتح تيكت',
      button_emoji     TEXT DEFAULT '🎫',
      footer           TEXT,
      welcome_title    TEXT,
      welcome_desc     TEXT,
      welcome_color    TEXT DEFAULT '#57f287',
      category_id      TEXT,
      support_role_id  TEXT,
      counter          INT  DEFAULT 0,
      PRIMARY KEY (id, license_key)
    );

    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS log_channel_id TEXT;

    CREATE TABLE IF NOT EXISTS closed_tickets (
      id          SERIAL PRIMARY KEY,
      license_key TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      user_id     TEXT,
      username    TEXT,
      panel_id    TEXT,
      num         INT,
      closed_by   TEXT,
      reason      TEXT,
      transcript  TEXT,
      closed_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ قاعدة البيانات جاهزة");
}

// ─── Licenses ─────────────────────────────────────────────────────────────────
async function getLicense(key)     { const r = await pool.query("SELECT * FROM licenses WHERE license_key=$1", [key]); return r.rows[0]; }
async function getLicenseByUser(u) { const r = await pool.query("SELECT * FROM licenses WHERE username=$1", [u]); return r.rows[0]; }
async function getLicenseByDiscord(id) { const r = await pool.query("SELECT * FROM licenses WHERE discord_id=$1", [id]); return r.rows[0]; }
async function getAllLicenses()    { const r = await pool.query("SELECT * FROM licenses ORDER BY created_at DESC"); return r.rows; }
async function createLicense(data) {
  const { license_key, client_name, username, password_hash, expires_at, max_servers } = data;
  await pool.query(
    "INSERT INTO licenses (license_key, client_name, username, password_hash, expires_at, max_servers) VALUES ($1,$2,$3,$4,$5,$6)",
    [license_key, client_name, username, password_hash, expires_at || null, max_servers || 1]
  );
}
async function updateLicense(key, data) {
  const fields = Object.keys(data).map((k, i) => `${k}=$${i+2}`).join(",");
  await pool.query(`UPDATE licenses SET ${fields} WHERE license_key=$1`, [key, ...Object.values(data)]);
}
async function deleteLicense(key) { await pool.query("DELETE FROM licenses WHERE license_key=$1", [key]); }

// ─── Tickets ──────────────────────────────────────────────────────────────────
async function saveTicket(t) {
  await pool.query(
    `INSERT INTO tickets (license_key, guild_id, channel_id, user_id, username, panel_id, num)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (channel_id) DO UPDATE SET closed=FALSE`,
    [t.licenseKey, t.guildId, t.channelId, t.userId, t.username, t.panelId || "default", t.num || 1]
  );
}
async function getTicket(channelId) { const r = await pool.query("SELECT * FROM tickets WHERE channel_id=$1", [channelId]); return r.rows[0]; }
async function getOpenTicket(licenseKey, userId, panelId) {
  const r = await pool.query(
    "SELECT * FROM tickets WHERE license_key=$1 AND user_id=$2 AND panel_id=$3 AND closed=FALSE",
    [licenseKey, userId, panelId]
  );
  return r.rows[0];
}
async function closeTicket(channelId) { await pool.query("UPDATE tickets SET closed=TRUE WHERE channel_id=$1", [channelId]); }
async function claimTicket(channelId, userId) { await pool.query("UPDATE tickets SET claimed_by=$2 WHERE channel_id=$1", [channelId, userId]); }
async function getActiveTickets(licenseKey) {
  const r = await pool.query("SELECT * FROM tickets WHERE license_key=$1 AND closed=FALSE ORDER BY created_at DESC", [licenseKey]);
  return r.rows;
}
async function nextTicketNum(licenseKey, panelId) {
  const r = await pool.query(
    "UPDATE panels SET counter=counter+1 WHERE license_key=$1 AND id=$2 RETURNING counter",
    [licenseKey, panelId]
  );
  return r.rows[0]?.counter || 1;
}

// ─── Panels ───────────────────────────────────────────────────────────────────
async function getPanels(licenseKey) {
  const r = await pool.query("SELECT * FROM panels WHERE license_key=$1 ORDER BY id", [licenseKey]);
  return r.rows;
}
async function getPanel(licenseKey, panelId) {
  const r = await pool.query("SELECT * FROM panels WHERE license_key=$1 AND id=$2", [licenseKey, panelId]);
  return r.rows[0];
}
async function savePanel(licenseKey, p) {
  await pool.query(
    `INSERT INTO panels (id, license_key, name, title, description, color, button_text, button_emoji, footer, welcome_title, welcome_desc, welcome_color, category_id, support_role_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id, license_key) DO UPDATE SET
       name=$3, title=$4, description=$5, color=$6, button_text=$7, button_emoji=$8,
       footer=$9, welcome_title=$10, welcome_desc=$11, welcome_color=$12, category_id=$13, support_role_id=$14`,
    [p.id, licenseKey, p.name, p.title, p.description, p.color||"#5865f2", p.button_text||"فتح تيكت",
     p.button_emoji||"🎫", p.footer, p.welcome_title, p.welcome_desc, p.welcome_color||"#57f287", p.category_id, p.support_role_id]
  );
}
async function deletePanel(licenseKey, panelId) {
  await pool.query("DELETE FROM panels WHERE license_key=$1 AND id=$2", [licenseKey, panelId]);
}
async function resetPanelCounter(licenseKey, panelId) {
  await pool.query("UPDATE panels SET counter=0 WHERE license_key=$1 AND id=$2", [licenseKey, panelId]);
}

// ─── Closed Tickets ───────────────────────────────────────────────────────────
async function saveClosedTicket(t) {
  await pool.query(
    "INSERT INTO closed_tickets (license_key, channel_id, user_id, username, panel_id, num, closed_by, reason, transcript) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [t.licenseKey, t.channelId, t.userId, t.username, t.panelId, t.num, t.closedBy, t.reason, t.transcript]
  );
}
async function saveClosedTicketReturn(t) {
  const r = await pool.query(
    "INSERT INTO closed_tickets (license_key, channel_id, user_id, username, panel_id, num, closed_by, reason, transcript) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [t.licenseKey, t.channelId, t.userId, t.username, t.panelId, t.num, t.closedBy, t.reason, t.transcript]
  );
  return r.rows[0];
}
async function getClosedTickets(licenseKey) {
  const r = await pool.query("SELECT * FROM closed_tickets WHERE license_key=$1 ORDER BY closed_at DESC LIMIT 200", [licenseKey]);
  return r.rows;
}

module.exports = {
  pool, initDB,
  getLicense, getLicenseByUser, getLicenseByDiscord, getAllLicenses, createLicense, updateLicense, deleteLicense,
  saveTicket, getTicket, getOpenTicket, closeTicket, claimTicket, getActiveTickets, nextTicketNum,
  getPanels, getPanel, savePanel, deletePanel, resetPanelCounter,
  saveClosedTicket, saveClosedTicketReturn, getClosedTickets,
};
