const {
  Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  REST, Routes,
} = require("discord.js");

const db = require("./db.js");

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
      if (action === "open_ticket") await handleOpenTicket(interaction, lic, rest[0]);
      if (action === "close_ticket") await handleCloseTicket(interaction, lic);
      if (action === "claim_ticket") await handleClaimTicket(interaction, lic);
      if (action === "confirm_close") await handleConfirmClose(interaction, lic);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("close_reason:")) {
        await handleCloseModal(interaction, lic);
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
    const logChannelId = lic.log_channel_id;
    if (!logChannelId) return;
    const ch = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!ch) return;

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
        .setURL(dashUrl ? `${dashUrl}/dashboard/transcript/${transcriptId}` : "https://example.com")
        .setStyle(ButtonStyle.Link)
    );

    await ch.send({ embeds: [embed], components: row ? [row] : [] });
  } catch(e) { console.error("[Log Error]", e.message); }
}

// ─── DM على إغلاق التيكت ──────────────────────────────────────────────────────
async function dmOnClose(client, ticket, reason, transcriptId, dashUrl) {
  try {
    const user = await client.users.fetch(ticket.user_id).catch(() => null);
    if (!user) return;
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    const embed = new EmbedBuilder()
      .setTitle("🔒 تم إغلاق تيكتك")
      .setColor(0xed4245)
      .setDescription(`تم إغلاق تيكتك **#${ticket.num}**`)
      .addFields(
        { name: "📝 السبب", value: reason || "—", inline: false },
        { name: "🕐 وقت الإغلاق", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false },
      );

    const row = dashUrl ? new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("📄 عرض المحادثة")
        .setURL(`${dashUrl}/dashboard/transcript/${transcriptId}`)
        .setStyle(ButtonStyle.Link)
    ) : null;

    await user.send({ embeds: [embed], ...(row ? { components: [row] } : {}) });
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
      { name: "📋 الباقل", value: panel.name || panelId, inline: true },
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
  if (saved) {
    await sendCloseLog(interaction.guild, lic, ticket, interaction.user.username, reason, saved.id, dashUrl);
    await dmOnClose(interaction.client, ticket, reason, saved.id, dashUrl);
  }

  await interaction.editReply({ content: "🔒 جاري إغلاق التيكت..." });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
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
  if (saved2) {
    await sendCloseLog(interaction.guild, lic, ticket, interaction.user.username, reason, saved2.id, dashUrl2);
    await dmOnClose(interaction.client, ticket, reason, saved2.id, dashUrl2);
  }

  await interaction.reply({ content: `🔒 تم إغلاق التيكت بواسطة ${interaction.user} — السبب: ${reason}` });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
}

// ─── Claim Ticket ──────────────────────────────────────────────────────────────
// تتبع الكلايمات المؤقتة لمنع الضغط المزدوج
const claimCooldown = new Map(); // channelId → { userId, timeout }

async function handleClaimTicket(interaction, lic) {
  const ticket = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ غير موجود", flags: 64 });

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
  await db.claimTicket(interaction.channelId, interaction.user.username);
  // 1. اسم القناة: 🟡username-num
  try { await interaction.channel.setName(`🟡${interaction.user.username}-${ticket.num}`); } catch {}
  await interaction.reply({ content: `✋ تم كلايم التيكت بواسطة ${interaction.user}` });

  // 3. بعد 6 ثواني يُسمح بالـ unclaim
  const t = setTimeout(() => claimCooldown.delete(interaction.channelId), 6000);
  claimCooldown.set(interaction.channelId, { userId: interaction.user.id, timeout: t });
}

async function cmdClaimTicket(interaction, lic) {
  await handleClaimTicket(interaction, lic);
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

module.exports = { botManager };
