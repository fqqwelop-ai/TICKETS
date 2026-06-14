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
  const msgs = [...messages.values()].reverse();
  const transcript = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>Ticket #${ticket.num}</title>
<style>body{font-family:sans-serif;background:#0f1117;color:#e2e8f0;padding:24px;direction:rtl}
.msg{background:#1a1d27;border-radius:8px;padding:12px 16px;margin-bottom:8px}
.author{font-weight:700;color:#5865f2;margin-bottom:4px}.time{font-size:12px;color:#8892a4}
h2{color:#fff;margin-bottom:16px}</style></head><body>
<h2>🎫 تيكت #${ticket.num} — ${ticket.username || ticket.user_id}</h2>
${msgs.map(m=>`<div class="msg"><div class="author">${m.author.username} <span class="time">${new Date(m.createdTimestamp).toLocaleString("ar-SA")}</span></div><div>${m.content||"[مرفق]"}</div></div>`).join("")}
</body></html>`;

  await db.saveClosedTicket({
    licenseKey: lic.license_key, channelId, userId: ticket.user_id, username: ticket.username,
    panelId: ticket.panel_id, num: ticket.num, closedBy: interaction.user.username, reason, transcript,
  });
  await db.closeTicket(channelId);

  await interaction.editReply({ content: "🔒 جاري إغلاق التيكت..." });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
}

async function cmdCloseTicket(interaction, lic) {
  const reason  = interaction.options.getString("reason") || "تم الحل";
  const ticket  = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ هذا الأمر يعمل داخل تيكت فقط", flags: 64 });

  const messages = await interaction.channel.messages.fetch({ limit: 100 });
  const msgs2 = [...messages.values()].reverse();
  const transcript = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>Ticket #${ticket.num}</title>
<style>body{font-family:sans-serif;background:#0f1117;color:#e2e8f0;padding:24px;direction:rtl}
.msg{background:#1a1d27;border-radius:8px;padding:12px 16px;margin-bottom:8px}
.author{font-weight:700;color:#5865f2;margin-bottom:4px}.time{font-size:12px;color:#8892a4}
h2{color:#fff;margin-bottom:16px}</style></head><body>
<h2>🎫 تيكت #${ticket.num} — ${ticket.username || ticket.user_id}</h2>
${msgs2.map(m=>`<div class="msg"><div class="author">${m.author.username} <span class="time">${new Date(m.createdTimestamp).toLocaleString("ar-SA")}</span></div><div>${m.content||"[مرفق]"}</div></div>`).join("")}
</body></html>`;

  await db.saveClosedTicket({
    licenseKey: lic.license_key, channelId: interaction.channelId, userId: ticket.user_id,
    username: ticket.username, panelId: ticket.panel_id, num: ticket.num,
    closedBy: interaction.user.username, reason, transcript,
  });
  await db.closeTicket(interaction.channelId);
  await interaction.reply({ content: `🔒 تم إغلاق التيكت بواسطة ${interaction.user} — السبب: ${reason}` });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
}

// ─── Claim Ticket ──────────────────────────────────────────────────────────────
async function handleClaimTicket(interaction, lic) {
  const ticket = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ غير موجود", flags: 64 });
  if (ticket.claimed_by) return interaction.reply({ content: `❌ التيكت مكلايم بالفعل بواسطة **${ticket.claimed_by}**`, flags: 64 });
  await db.claimTicket(interaction.channelId, interaction.user.username);
  // تغيير اسم القناة
  try { await interaction.channel.setName(`claimed-${ticket.num}`); } catch {}
  await interaction.reply({ content: `✋ تم كلايم التيكت بواسطة ${interaction.user}` });
}

async function cmdClaimTicket(interaction, lic) {
  const ticket = await db.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ هذا الأمر يعمل داخل تيكت فقط", flags: 64 });
  if (ticket.claimed_by) return interaction.reply({ content: `❌ التيكت مكلايم بالفعل بواسطة **${ticket.claimed_by}**`, flags: 64 });
  await db.claimTicket(interaction.channelId, interaction.user.username);
  try { await interaction.channel.setName(`claimed-${ticket.num}`); } catch {}
  await interaction.reply({ content: `✋ تم كلايم التيكت بواسطة ${interaction.user}` });
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
