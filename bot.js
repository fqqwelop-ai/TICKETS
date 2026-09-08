const {
  Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, REST, Routes,
} = require("discord.js");

const db = require("./db.js");

// ─── إعدادات افتراضية لخيارات الإغلاق التلقائي ─────────────────────────────────
const DEFAULT_CLOSE_DURATIONS = [
  { label: "15 دقيقة", minutes: 15 },
  { label: "30 دقيقة", minutes: 30 },
  { label: "ساعة", minutes: 60 },
  { label: "ساعتين", minutes: 120 },
  { label: "3 ساعات", minutes: 180 },
  { label: "يوم", minutes: 1440 },
  { label: "يومين", minutes: 2880 },
];

// تبريد للتذكيرات عشان محد يسبح الإداريين/الأعضاء برسائل
const reminderCooldown = new Map(); // key → timestamp
function checkCooldown(key, ms) {
  const last = reminderCooldown.get(key);
  const now = Date.now();
  if (last && now - last < ms) return false;
  reminderCooldown.set(key, now);
  return true;
}

// ─── Bot Manager ───────────────────────────────────────────────────────────────
class BotManager {
  constructor() {
    this.bots = new Map(); // licenseKey → Client
  }

  async startAll() {
    const licenses = await db.getAllLicenses();
    for (const lic of licenses) {
      if (lic.active && lic.bot_token) {
        await this.startBot(lic).catch(e => console.error(`[Bot] فشل تشغيل ${lic.client_name}:`, e.message));
      }
    }
  }

  async startBot(lic) {
    if (this.bots.has(lic.license_key)) return;
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent],
      partials: [Partials.Channel],
    });

    client.licenseKey = lic.license_key;
    client.license    = lic;

    client.on("ready", async () => {
      console.log(`✅ البوت شغال: ${client.user.tag} (${lic.client_name})`);
      await registerCommands(lic).catch(e => console.error("[Commands]", e.message));
    });

    client.on("interactionCreate", interaction => handleInteraction(interaction, lic));
    client.on("messageCreate", message => handleTicketReply(message));

    await client.login(lic.bot_token);
    this.bots.set(lic.license_key, client);
  }

  async stopBot(licenseKey) {
    const client = this.bots.get(licenseKey);
    if (client) { client.destroy(); this.bots.delete(licenseKey); }
  }

  getBot(licenseKey) { return this.bots.get(licenseKey); }
}

const botManager = new BotManager();

// ─── Slash Commands ────────────────────────────────────────────────────────────
async function registerCommands(lic) {
  if (!lic.client_id || !lic.guild_id || !lic.bot_token) return;
  const commands = [
    new SlashCommandBuilder().setName("send-panel").setDescription("إرسال بانل التيكتات")
      .addStringOption(o => o.setName("panel").setDescription("ID البانل").setRequired(true)),
    new SlashCommandBuilder().setName("close-ticket").setDescription("إغلاق التيكت الحالي")
      .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(false)),
    new SlashCommandBuilder().setName("claim-ticket").setDescription("كلايم التيكت الحالي"),
    new SlashCommandBuilder().setName("add-user").setDescription("إضافة مستخدم للتيكت")
      .addUserOption(o => o.setName("user").setDescription("المستخدم").setRequired(true)),
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(lic.bot_token);
  await rest.put(Routes.applicationGuildCommands(lic.client_id, lic.guild_id), { body: commands });
}

// ─── Interaction Handler ───────────────────────────────────────────────────────
async function handleInteraction(interaction, lic) {
  try {
    // تحديث الـ license من DB لضمان أحدث البيانات
    lic = await db.getLicense(lic.license_key) || lic;

    if (interaction.isButton()) {
      const [action, ...rest] = interaction.customId.split(":");
      if (action === "open_ticket")   await handleOpenTicket(interaction, lic, rest[0]);
      if (action === "close_ticket")  await handleCloseTicket(interaction, lic);
      if (action === "claim_ticket")  await handleClaimTicket(interaction, lic);
      if (action === "confirm_close") await handleConfirmClose(interaction, lic);
      if (action === "delete_ticket") await handleDeleteTicket(interaction, lic);
      if (action === "close_dur")     await handleCloseDurButton(interaction, lic, rest[0]);
      if (action === "close_dur_custom") await handleCloseCustomButton(interaction);
      if (action === "remind_admin")  await handleRemindAdmin(interaction, lic);
      if (action === "remind_player") await handleRemindPlayer(interaction, lic);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("close_reason:")) {
        await handleCloseModal(interaction, lic);
      }
      if (interaction.customId.startsWith("close_custom:")) {
        await handleCloseCustomSubmit(interaction);
      }
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "send-panel")  await cmdSendPanel(interaction, lic);
      if (interaction.commandName === "close-ticket") await cmdCloseTicket(interaction, lic);
      if (interaction.commandName === "claim-ticket") await cmdClaimTicket(interaction, lic);
      if (interaction.commandName === "add-user")    await cmdAddUser(interaction, lic);
    }
  } catch(e) {
    console.error("[Interaction Error]", e.message);
    try { await interaction.reply({ content: "❌ حصل خطأ", flags: 64 }); } catch {}
  }
}

// ─── Transcript HTML ──────────────────────────────────────────────────────────
function buildTranscriptHTML(ticket, messages, dashUrl) {
  const msgs = [...messages.values()].reverse();
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>تيكت #${ticket.num}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;padding:24px;direction:rtl}
.header{background:#1a1d27;border:1px solid #2d3148;border-radius:16px;padding:24px;margin-bottom:24px}
.header h1{font-size:20px;font-weight:800;margin-bottom:16px;color:#5865f2}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.meta-item{background:#0d1117;border-radius:10px;padding:12px}
.meta-label{font-size:11px;color:#8892a4;margin-bottom:4px}
.meta-val{font-size:14px;font-weight:600}
.msgs{display:flex;flex-direction:column;gap:8px}
.msg{background:#1a1d27;border-radius:10px;padding:12px 16px;border-right:3px solid #5865f2}
.msg.bot{border-right-color:#57f287}
.msg-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.author{font-weight:700;font-size:14px}
.time{font-size:12px;color:#8892a4}
.content{font-size:14px;line-height:1.5;white-space:pre-wrap}
.attach{color:#5865f2;font-size:13px;margin-top:4px}
</style></head><body>
<div class="header">
  <h1>🎫 تيكت #${ticket.num} — ${ticket.username || ticket.user_id}</h1>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">👤 فاتح التيكت</div><div class="meta-val">${ticket.username || ticket.user_id}</div></div>
    <div class="meta-item"><div class="meta-label">📋 البانل</div><div class="meta-val">${ticket.panel_id}</div></div>
    <div class="meta-item"><div class="meta-label">💬 عدد الرسائل</div><div class="meta-val">${msgs.length}</div></div>
    <div class="meta-item"><div class="meta-label">🕐 تاريخ الفتح</div><div class="meta-val">${new Date(ticket.created_at).toLocaleString("ar-SA")}</div></div>
  </div>
</div>
<div class="msgs">
${msgs.map(m => `<div class="msg${m.author.bot?" bot":""}">
  <div class="msg-header"><span class="author">${m.author.username}</span><span class="time">${new Date(m.createdTimestamp).toLocaleString("ar-SA")}</span></div>
  ${m.content ? `<div class="content">${m.content.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>` : ""}
  ${m.attachments.size ? `<div class="attach">📎 ${[...m.attachments.values()].map(a=>`<a href="${a.url}" style="color:#5865f2">${a.name}</a>`).join(", ")}</div>` : ""}
</div>`).join("")}
</div>
</body></html>`;
}

// ─── Send Log ──────────────────────────────────────────────────────────────────
async function sendCloseLog(guild, lic, ticket, closedBy, reason, transcriptId, dashUrl) {
  try {
    let ch = null;

    // حاول تجيب القناة الموجودة
    if (lic.log_channel_id) {
      ch = await guild.channels.fetch(lic.log_channel_id).catch(() => null);
    }

    // لو ما موجودة، أنشئ قناة اللوق تلقائياً
    if (!ch) {
      const { ChannelType, PermissionFlagsBits } = require("discord.js");
      try {
        ch = await guild.channels.create({
          name: "ticket-logs",
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ...(lic.support_role_id ? [{ id: lic.support_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
          ],
        });
        // احفظ الـ ID في DB
        await require("./db.js").updateLicense(lic.license_key, { log_channel_id: ch.id });
        lic.log_channel_id = ch.id;
      } catch(e2) {
        console.error("[Log Channel Create Error]", e2.message);
        return;
      }
    }

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    const embed = new EmbedBuilder()
      .setTitle(`📁 سجّل تيكت #${ticket.num}`)
      .setColor(0xed4245)
      .addFields(
        { name: "👤 فاتح التيكت", value: `<@${ticket.user_id}>`, inline: true },
        { name: "🔒 أُغلق بواسطة", value: closedBy, inline: true },
        { name: "📋 البانل", value: ticket.panel_id || "—", inline: true },
        { name: "📝 السبب", value: reason || "—", inline: false },
        { name: "🕐 وقت الإغلاق", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false },
      )
      .setFooter({ text: `ticket-${ticket.num}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("📄 عرض المحادثة الكاملة")
        .setURL(dashUrl && transcriptId ? `${dashUrl}/transcript/${transcriptId}` : "https://example.com")
        .setStyle(ButtonStyle.Link)
    );

    await ch.send({ embeds: [embed], components: row ? [row] : [] });
  } catch(e) { console.error("[Log Error]", e.message); }
}

// ─── DM على إغلاق التيكت ──────────────────────────────────────────────────────
async function dmOnClose(client, ticket, reason, transcriptId, dashUrl) {
  try {
    console.log("[DM Debug] dashUrl:", dashUrl, "| transcriptId:", transcriptId);
    const user = await client.users.fetch(ticket.user_id).catch(() => null);
    if (!user) return;
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    const transcriptUrl = dashUrl && transcriptId ? `${dashUrl}/transcript/${transcriptId}` : null;

    const embed = new EmbedBuilder()
      .setTitle("🔒 تم إغلاق تيكتك")
      .setColor(0xed4245)
      .setDescription(`تم إغلاق تيكتك **#${ticket.num}**`)
      .addFields(
        { name: "📝 السبب", value: reason || "—", inline: false },
        { name: "🕐 وقت الإغلاق", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false },
        ...(transcriptUrl ? [{ name: "📄 المحادثة", value: transcriptUrl, inline: false }] : []),
      );

    const dmRow = transcriptUrl ? new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("📄 عرض المحادثة الكاملة")
        .setURL(transcriptUrl)
        .setStyle(ButtonStyle.Link)
    ) : null;

    await user.send({ embeds: [embed], ...(dmRow ? { components: [dmRow] } : {}) });
  } catch(e) { console.error("[DM Error]", e.message); }
}

// ─── Open Ticket ───────────────────────────────────────────────────────────────
async function handleOpenTicket(interaction, lic, panelId) {
  await interaction.deferReply({ flags: 64 });
  const guild    = interaction.guild;
  const userId   = interaction.user.id;
  const username = interaction.user.username;
  const panel    = await db.getPanel(lic.license_key, panelId);
  if (!panel) return interaction.editReply({ content: "❌ البانل غير موجود" });

  // منع فتح نفس البانل مرتين
  const existing = await db.getOpenTicket(lic.license_key, userId, panelId);
  if (existing) {
    const ch = guild.channels.cache.get(existing.channel_id) || await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (ch) return interaction.editReply({ content: `❌ لديك تيكت مفتوح في هذا البانل: ${ch}` });
    await db.closeTicket(existing.channel_id);
  }

  const num        = await db.nextTicketNum(lic.license_key, panelId);
  const roleId     = panel.support_role_id || lic.support_role_id;
  const categoryId = panel.category_id;

  // إنشاء القناة
  const channelOptions = {
    name: `ticket-${num}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ...(roleId ? [{ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  };
  if (categoryId) {
    try { channelOptions.parent = categoryId; } catch {}
  }

  const channel = await guild.channels.create(channelOptions);

  // حفظ التيكت
  await db.saveTicket({ licenseKey: lic.license_key, guildId: guild.id, channelId: channel.id, userId, username, panelId, num });

  // رسالة الترحيب
  const title = (panel.welcome_title || "🎫 تيكت")
    .replace(/\{user\}/g, username).replace(/\{username\}/g, username).replace(/\{num\}/g, String(num));
  const desc = (panel.welcome_desc || "أهلاً {user}!\nسيتواصل معك أحد الأعضاء قريباً.")
    .replace(/\{user\}/g, `<@${userId}>`).replace(/\{username\}/g, username).replace(/\{num\}/g, String(num))
    .replace(/\{SUPPORT\}/g, roleId ? `<@&${roleId}>` : "").replace(/\\n/g, "\n");
  const color = parseInt((panel.welcome_color || "#57f287").replace("#", ""), 16);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(color)
    .addFields(
      { name: "📋 البانل", value: panel.name || panelId, inline: true },
      { name: "🔢 رقم التيكت", value: `#${num}`, inline: true },
      { name: "👤 فاتح التيكت", value: `<@${userId}>`, inline: true },
      { name: "🕐 وقت الفتح", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("close_ticket").setLabel("إغلاق التيكت").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("claim_ticket").setLabel("كلايم التيكت").setEmoji("✋").setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ content: roleId ? `<@&${roleId}>` : `<@${userId}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ تم فتح تيكتك: ${channel}` });
}

// ─── Close Ticket ──────────────────────────────────────────────────────────────
async function handleCloseTicket(interaction, lic) {
  const modal = new ModalBuilder().setCustomId(`close_reason:${interaction.channelId}`).setTitle("إغلاق التيكت");
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("reason").setLabel("سبب الإغلاق").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("تم الحل")
  ));
  await interaction.showModal(modal);
}

async function handleCloseModal(interaction, lic) {
  await interaction.deferReply({ flags: 64 });
  const reason    = interaction.fields.getTextInputValue("reason") || "تم الحل";
  const channelId = interaction.customId.split(":")[1];
  const ticket    = await db.getTicket(channelId);
  if (!ticket) return interaction.editReply({ content: "❌ تيكت غير موجود" });

  // بناء transcript
  const messages = await interaction.channel.messages.fetch({ limit: 100 });
  const transcript = buildTranscriptHTML(ticket, messages, lic.dashboard_url || "");

  const saved = await db.saveClosedTicketReturn({
    licenseKey: lic.license_key, channelId, userId: ticket.user_id, username: ticket.username,
    panelId: ticket.panel_id, num: ticket.num, closedBy: interaction.user.username, reason, transcript,
  });
  await db.closeTicket(channelId);

  const dashUrl = lic.dashboard_url || "";
  // DM فقط هنا — اللوق يُرسل داخل lockTicketChannel مع الرابط
  if (saved) await dmOnClose(interaction.client, ticket, reason, saved.id, dashUrl);

  await interaction.editReply({ content: "🔒 Closing ticket..." });
  if (saved) await lockTicketChannel(interaction.channel, interaction.guild, lic, ticket, saved.id, dashUrl, interaction.user.username, reason);
}

async function cmdCloseTicket(interaction, lic) {
  const reason  = interaction.options.getString("reason") || "تم الحل";
  const ticket  = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ هذا الأمر يعمل داخل تيكت فقط", flags: 64 });

  const messages = await interaction.channel.messages.fetch({ limit: 100 });
  const transcript = buildTranscriptHTML(ticket, messages, lic.dashboard_url || "");

  const saved2 = await db.saveClosedTicketReturn({
    licenseKey: lic.license_key, channelId: interaction.channelId, userId: ticket.user_id,
    username: ticket.username, panelId: ticket.panel_id, num: ticket.num,
    closedBy: interaction.user.username, reason, transcript,
  });
  await db.closeTicket(interaction.channelId);

  const dashUrl2 = lic.dashboard_url || "";
  if (saved2) await dmOnClose(interaction.client, ticket, reason, saved2.id, dashUrl2);

  await interaction.reply({ content: `🔒 Ticket closed by ${interaction.user} — Reason: ${reason}` });
  if (saved2) await lockTicketChannel(interaction.channel, interaction.guild, lic, ticket, saved2.id, dashUrl2, interaction.user.username, reason);
}

// ─── Lock Ticket Channel (بعد الإغلاق) ───────────────────────────────────────
async function lockTicketChannel(channel, guild, lic, ticket, transcriptId, dashUrl, closedBy = "—", reason = "—") {
  try {
    const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

    // ١. إخفاء القناة عن الجميع إلا الرتبة المخصصة
    const closedRoleId = lic.closed_role_id; // رتبة تشوف التيكتات المغلقة
    await channel.permissionOverwrites.set([
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: channel.client.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ...(closedRoleId ? [{ id: closedRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
    ]);

    // تغيير اسم القناة
    await channel.setName(`closed-${ticket.num}`).catch(() => {});

    // ٢. إرسال رسالة مع رابط التيكت
    const embed = new EmbedBuilder()
      .setTitle(`📁 سجّل تيكت #${ticket.num}`)
      .setDescription(`تم إغلاق هذا التيكت`)
      .setColor(0x2b2d31)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      ...(dashUrl && transcriptId ? [
        new ButtonBuilder()
          .setLabel("📄 عرض المحادثة الكاملة")
          .setURL(`${dashUrl}/dashboard/transcript/${transcriptId}`)
          .setStyle(ButtonStyle.Link)
      ] : []),
      new ButtonBuilder()
        .setCustomId(`delete_ticket:${ticket.num}`)
        .setLabel("🗑️ حذف التيكت")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });

    // ٣. Log Channel — من البانل أولاً ثم من الإعدادات العامة
    const panel = await require("./db.js").getPanel(lic.license_key, ticket.panel_id).catch(() => null);
    const licForLog = panel && panel.log_channel_id
      ? { ...lic, log_channel_id: panel.log_channel_id }
      : lic;
    await sendCloseLog(guild, licForLog, ticket, closedBy, reason, transcriptId, dashUrl);

  } catch(e) {
    console.error("[LockChannel Error]", e.message);
    // في حال فشل أي شيء، احذف القناة
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
}

// ─── Claim Ticket ──────────────────────────────────────────────────────────────
// تتبع الكلايمات المؤقتة لمنع الضغط المزدوج
const claimCooldown = new Map(); // channelId → { userId, timeout }

async function handleClaimTicket(interaction, lic) {
  const ticket = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ غير موجود", flags: 64 });

  // تحقق إن المستخدم عنده Support Role
  const supportRoleId = ticket.support_role_id || lic.support_role_id;
  const member = interaction.member;
  const hasSupport = !supportRoleId
    || member.roles.cache.has(supportRoleId)
    || member.permissions.has("Administrator");
  if (!hasSupport) return interaction.reply({ content: "❌ Only support staff can claim tickets", flags: 64 });

  const existing = claimCooldown.get(interaction.channelId);

  // 4. لو عنده كلايم مسبق من نفس اليوزر → تجاهل
  if (existing && existing.userId === interaction.user.id) {
    return interaction.reply({ content: "⏳ انتظر قبل الضغط مرة أخرى", flags: 64 });
  }

  // 3. لو ضغط شخص ثاني خلال 6 ثواني → unclaim
  if (existing && existing.userId !== interaction.user.id) {
    clearTimeout(existing.timeout);
    claimCooldown.delete(interaction.channelId);
    await db.claimTicket(interaction.channelId, null);
    try { await interaction.channel.setName(`ticket-${ticket.num}`); } catch {}
    return interaction.reply({ content: `🔓 تم إزالة الكلايم` });
  }

  // كلايم جديد
  await db.claimTicket(interaction.channelId, interaction.user.username, interaction.user.id);
  // 1. اسم القناة: 🟡username-num
  try { await interaction.channel.setName(`🟡${interaction.user.username}-${ticket.num}`); } catch {}
  const claimMsg = (lic.claim_message || "📌 Ticket claimed by {claimer}")
    .replace(/\{claimer\}/g, `${interaction.user}`)
    .replace(/\{username\}/g, interaction.user.username);
  // إرسال الرسالة حسب الإعداد
  if (lic.claim_type === 'dm') {
    await interaction.reply({ content: claimMsg, flags: 64 }); // dismiss message
  } else {
    await interaction.channel.send({ content: claimMsg });
    await interaction.reply({ content: "✅", flags: 64 });
  }

  // لوحة الإغلاق التلقائي + التذكيرات تطلع تلقائياً بعد الكلايم (تظهر للمويظف اللي كلايم بس)
  await sendPostClaimPanel(interaction, lic, ticket);

  // 3. بعد 6 ثواني يُسمح بالـ unclaim
  const t = setTimeout(() => claimCooldown.delete(interaction.channelId), 6000);
  claimCooldown.set(interaction.channelId, { userId: interaction.user.id, timeout: t });
}

async function cmdClaimTicket(interaction, lic) {
  await handleClaimTicket(interaction, lic);
}

// ─── Delete Ticket ────────────────────────────────────────────────────────────
async function handleDeleteTicket(interaction, lic) {
  // تحقق من الصلاحية — support role أو closed role
  try {
    const member = interaction.member;
    const supportRole = lic.support_role_id;
    const closedRole  = lic.closed_role_id;
    const hasRole = (supportRole && member.roles.cache.has(supportRole))
                 || (closedRole  && member.roles.cache.has(closedRole))
                 || member.permissions.has("Administrator");
    if (!hasRole) return interaction.reply({ content: "❌ ليس لديك صلاحية حذف التيكت", flags: 64 });
    await interaction.reply({ content: "🗑️ جاري حذف القناة...", flags: 64 });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
  } catch(e) {
    interaction.reply({ content: "❌ " + e.message, flags: 64 });
  }
}

// ─── Send Panel ────────────────────────────────────────────────────────────────
async function cmdSendPanel(interaction, lic) {
  const panelId = interaction.options.getString("panel");
  const panel   = await db.getPanel(lic.license_key, panelId);
  if (!panel) return interaction.reply({ content: "❌ البانل غير موجود — استخدم ID البانل من الداشبورد", flags: 64 });

  const color = parseInt((panel.color || "#5865f2").replace("#", ""), 16);
  const embed = new EmbedBuilder()
    .setTitle(panel.title || "🎫 نظام التيكتات")
    .setDescription(panel.description || "اضغط على الزر لفتح تيكت")
    .setColor(color);
  if (panel.footer) embed.setFooter({ text: panel.footer });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_ticket:${panelId}`)
      .setLabel(panel.button_text || "فتح تيكت")
      .setEmoji(panel.button_emoji || "🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ content: "✅ تم إرسال البانل" , flags: 64 });
  await interaction.channel.send({ embeds: [embed], components: [row] });
}

// ─── إلغاء الإغلاق التلقائي تلقائياً لو رد العضو ────────────────────────────────
async function handleTicketReply(message) {
  try {
    if (message.author.bot || !message.guild) return;
    const ticket = await db.getTicket(message.channel.id);
    if (!ticket || ticket.closed) return;
    if (message.author.id !== ticket.user_id) return;
    if (!ticket.scheduled_close_at) return;
    if (new Date(ticket.scheduled_close_at).getTime() <= Date.now()) return; // خلاص فات وقتها، خله يتكفل بها المجدول

    await db.clearScheduledClose(message.channel.id);
    await message.channel.send({ content: "✅ تم إلغاء الإغلاق التلقائي لأن العضو رد." }).catch(() => {});
    if (ticket.claimed_by_id) {
      const staff = await message.client.users.fetch(ticket.claimed_by_id).catch(() => null);
      if (staff) await staff.send(`✅ رد العضو <@${ticket.user_id}> بتذكرة #${ticket.num}، تم إلغاء الإغلاق التلقائي المجدول.`).catch(() => {});
    }
  } catch (e) {
    console.error("[AutoCancel Error]", e.message);
  }
}

// ─── لوحة ما بعد الكلايم (إغلاق تلقائي + تذكيرات) ───────────────────────────────
async function sendPostClaimPanel(interaction, lic, ticket) {
  let options;
  try { options = JSON.parse(lic.close_duration_options || "[]"); } catch { options = []; }
  if (!Array.isArray(options) || !options.length) options = DEFAULT_CLOSE_DURATIONS;
  options = options.slice(0, 8);

  const embed = new EmbedBuilder()
    .setTitle("⏰ الإغلاق التلقائي المؤقت")
    .setColor(0xf59e0b)
    .setDescription("اختر مدة من الأزرار تحت.\nلو رد العضو قبل ما تنتهي المدة، يتم إلغاء المؤقت وتوصلك رسالة خاصة.")
    .addFields(
      { name: "Ticket", value: `#${ticket.num}`, inline: true },
      { name: "Player", value: `<@${ticket.user_id}>`, inline: true },
    );

  const durBtns = options.map(o =>
    new ButtonBuilder().setCustomId(`close_dur:${o.minutes}`).setLabel(o.label).setStyle(ButtonStyle.Secondary)
  );
  durBtns.push(new ButtonBuilder().setCustomId("close_dur_custom").setLabel("✏️ مخصص").setStyle(ButtonStyle.Primary));

  const rows = [];
  for (let i = 0; i < durBtns.length; i += 5) rows.push(new ActionRowBuilder().addComponents(durBtns.slice(i, i + 5)));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("remind_admin").setLabel(lic.admin_reminder_label || "🔔 تذكير الإداري").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("remind_player").setLabel(lic.player_reminder_label || "🔔 تذكير العضو").setStyle(ButtonStyle.Secondary),
  ));

  await interaction.followUp({ embeds: [embed], components: rows.slice(0, 5), flags: 64 });
}

async function handleCloseDurButton(interaction, lic, minutesStr) {
  const minutes = parseInt(minutesStr, 10);
  if (!minutes) return interaction.reply({ content: "❌ خطأ", flags: 64 });
  const closeAt = new Date(Date.now() + minutes * 60000);
  await db.scheduleTicketClose(interaction.channelId, closeAt);
  const ts = Math.floor(closeAt.getTime() / 1000);
  await interaction.reply({ content: `✅ تم جدولة إغلاق التذكرة تلقائياً <t:${ts}:R>`, flags: 64 });
  await interaction.channel.send({ content: `⏰ سيتم إغلاق هذه التذكرة تلقائياً <t:${ts}:R> ما لم يرد العضو أو يتم إلغاء الجدولة.` }).catch(() => {});
}

async function handleCloseCustomButton(interaction) {
  const modal = new ModalBuilder().setCustomId(`close_custom:${interaction.channelId}`).setTitle("مدة مخصصة");
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("minutes").setLabel("المدة بالدقائق").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 90")
  ));
  await interaction.showModal(modal);
}

async function handleCloseCustomSubmit(interaction) {
  const channelId = interaction.customId.split(":")[1];
  const minutes = parseInt(interaction.fields.getTextInputValue("minutes"), 10);
  if (!minutes || minutes <= 0) return interaction.reply({ content: "❌ رقم غير صحيح", flags: 64 });
  const closeAt = new Date(Date.now() + minutes * 60000);
  await db.scheduleTicketClose(channelId, closeAt);
  const ts = Math.floor(closeAt.getTime() / 1000);
  await interaction.reply({ content: `✅ تم جدولة إغلاق التذكرة تلقائياً <t:${ts}:R>`, flags: 64 });
  const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (ch) await ch.send({ content: `⏰ سيتم إغلاق هذه التذكرة تلقائياً <t:${ts}:R> ما لم يرد العضو أو يتم إلغاء الجدولة.` }).catch(() => {});
}

// ─── تذكير الإداري ──────────────────────────────────────────────────────────────
async function handleRemindAdmin(interaction, lic) {
  const ticket = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ غير موجود", flags: 64 });

  if (!checkCooldown(`admin:${interaction.channelId}`, 2 * 60 * 1000)) {
    return interaction.reply({ content: "⏳ تم إرسال تذكير قبل قليل، حاول بعد دقيقتين", flags: 64 });
  }

  const supportRoleId = ticket.support_role_id || lic.support_role_id;
  if (!supportRoleId) return interaction.reply({ content: "❌ ما فيه رتبة دعم محددة", flags: 64 });

  await interaction.deferReply({ flags: 64 });
  const role = await interaction.guild.roles.fetch(supportRoleId).catch(() => null);
  const msg  = lic.admin_reminder_message || "🔔 تذكير: هذه التذكرة تحتاج ردكم";
  let sent = 0;
  if (role) {
    for (const [, m] of role.members) {
      if (m.user.bot) continue;
      try { await m.send(`${msg}\nالقناة: ${interaction.channel}`); sent++; } catch {}
    }
  }
  await interaction.editReply({ content: sent ? "✅ تم إرسال التذكير للإداريين" : "❌ ما قدرنا نوصل التذكير (تأكد الخاص مفتوح عند الإداريين)" });
}

// ─── تذكير العضو ────────────────────────────────────────────────────────────────
async function handleRemindPlayer(interaction, lic) {
  const ticket = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ غير موجود", flags: 64 });

  const supportRoleId = ticket.support_role_id || lic.support_role_id;
  const member = interaction.member;
  const hasSupport = !supportRoleId
    || member.roles.cache.has(supportRoleId)
    || member.permissions.has("Administrator");
  if (!hasSupport) return interaction.reply({ content: "❌ لفريق الدعم فقط", flags: 64 });

  if (!checkCooldown(`player:${interaction.channelId}`, 2 * 60 * 1000)) {
    return interaction.reply({ content: "⏳ تم إرسال تذكير قبل قليل، حاول بعد دقيقتين", flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  const user = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  const msg  = lic.player_reminder_message || "🔔 تذكير: الرجاء الرد على تذكرتك";
  if (!user) return interaction.editReply({ content: "❌ ما قدرنا نلقى العضو" });
  try {
    await user.send(`${msg}\nالقناة: ${interaction.channel}`);
    await interaction.editReply({ content: "✅ تم إرسال التذكير للعضو" });
  } catch {
    await interaction.editReply({ content: "❌ ما قدرنا نوصل الخاص للعضو (خاصه مقفول)" });
  }
}

// ─── منفّذ الإغلاق التلقائي المجدول ──────────────────────────────────────────────
async function autoCloseTicket(client, ticket) {
  try {
    const guild = await client.guilds.fetch(ticket.guild_id).catch(() => null);
    if (!guild) return;
    const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
    if (!channel) { await db.closeTicket(ticket.channel_id); return; }

    const lic = await db.getLicense(ticket.license_key);
    if (!lic) return;

    const messages  = await channel.messages.fetch({ limit: 100 }).catch(() => new Map());
    const transcript = buildTranscriptHTML(ticket, messages, lic.dashboard_url || "");
    const reason = "انتهت مدة الإغلاق التلقائي المجدولة";

    const saved = await db.saveClosedTicketReturn({
      licenseKey: lic.license_key, channelId: ticket.channel_id, userId: ticket.user_id,
      username: ticket.username, panelId: ticket.panel_id, num: ticket.num,
      closedBy: "⏰ إغلاق تلقائي", reason, transcript,
    });
    await db.closeTicket(ticket.channel_id);

    const dashUrl = lic.dashboard_url || "";
    if (saved) await dmOnClose(client, ticket, reason, saved.id, dashUrl);
    if (saved) await lockTicketChannel(channel, guild, lic, ticket, saved.id, dashUrl, "⏰ إغلاق تلقائي", reason);
  } catch (e) {
    console.error("[AutoClose Error]", e.message);
  }
}

function startAutoCloseScheduler() {
  setInterval(async () => {
    try {
      const due = await db.getDueTickets();
      for (const ticket of due) {
        const client = botManager.getBot(ticket.license_key);
        if (!client) continue;
        await db.clearScheduledClose(ticket.channel_id);
        await autoCloseTicket(client, ticket);
      }
    } catch (e) { console.error("[Scheduler Error]", e.message); }
  }, 60 * 1000);
}

// ─── Add User ──────────────────────────────────────────────────────────────────
async function cmdAddUser(interaction, lic) {
  const ticket = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ هذا الأمر يعمل داخل تيكت فقط", flags: 64 });
  const user = interaction.options.getUser("user");
  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true
  });
  await interaction.reply({ content: `✅ تم إضافة ${user} للتيكت` });
}

// ─── Start ─────────────────────────────────────────────────────────────────────
botManager.startAll().catch(e => console.error("[BotManager]", e.message));
startAutoCloseScheduler();

module.exports = { botManager };
