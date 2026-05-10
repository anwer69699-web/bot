// ╔════════════════════════════════════════════════════════════════════╗
// ║         NUXUS HUB PREMIUM BOT v3.0 — PRODUCTION EDITION         ║
// ║    متجر سكربتات Nuxus Hub — نظام متكامل احترافي               ║
// ║    SQLite Database • Web Dashboard • 55+ Commands              ║
// ╚════════════════════════════════════════════════════════════════════╝

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField,
  ChannelType, SlashCommandBuilder, REST, Routes, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags,
  AuditLogEvent, PresenceUpdateStatus,
} = require("discord.js");

const { Octokit } = require("@octokit/rest");
const Database = require("better-sqlite3");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════════════
//  HARDCODED CONFIG
// ═══════════════════════════════════════════════════════════════════
const BOT_TOKEN = "MTUwMjc0NDM2MjI5NDA1MTAyNg.G4KFXq.WzzJwgv0iy7j0z3XzNnuzEvxOpUFiuI8oLvYIU";
const CLIENT_ID = "1502744362294051026";
const GITHUB_TOKEN = "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";
const GITHUB_OWNER = "anwer69699-web";
const MASTER_REPO = "Keysstorage";
const MASTER_FILE = "keys.json";
const MAIN_RAW_LINK = "https://raw.githubusercontent.com/anwer69699-web/NuxusHubs/refs/heads/main/Premium";
const WEB_PORT = 3000;
const WEB_USER = "admin";
const WEB_PASS = "nuxus2026";

// ═══════════════════════════════════════════════════════════════════
//  SQLITE DATABASE
// ═══════════════════════════════════════════════════════════════════
const db = new Database("nuxus_data.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    userid TEXT NOT NULL,
    duration TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    redeemed_at TEXT,
    redeemed_by TEXT
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,
    channel_id TEXT NOT NULL,
    prize TEXT NOT NULL,
    winners INTEGER DEFAULT 1,
    end_time TEXT NOT NULL,
    participants TEXT DEFAULT '[]',
    ended INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (guild_id, key)
  );

  CREATE TABLE IF NOT EXISTS levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    total_xp INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS reaction_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    role_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS starboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    message_id TEXT UNIQUE NOT NULL,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT,
    star_count INTEGER DEFAULT 0,
    UNIQUE(guild_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    response TEXT NOT NULL,
    created_by TEXT NOT NULL,
    UNIQUE(guild_id, name)
  );

  CREATE TABLE IF NOT EXISTS modlogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snipes (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS ticket_panels (
    guild_id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS afk (
    user_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Prepared statements
const stmts = {
  // Keys
  createKey: db.prepare("INSERT INTO keys (key, userid, duration, expires_at, created_at) VALUES (?,?,?,?,?)"),
  getKey: db.prepare("SELECT * FROM keys WHERE key = ?"),
  getKeyByUser: db.prepare("SELECT * FROM keys WHERE userid = ? AND (expires_at = 'lifetime' OR expires_at IS NULL OR expires_at > datetime('now'))"),
  getAllKeys: db.prepare("SELECT * FROM keys ORDER BY created_at DESC"),
  revokeKey: db.prepare("DELETE FROM keys WHERE key = ?"),
  redeemKey: db.prepare("UPDATE keys SET redeemed_at = datetime('now'), redeemed_by = ? WHERE key = ?"),
  deleteExpiredKeys: db.prepare("DELETE FROM keys WHERE expires_at IS NOT NULL AND expires_at != 'lifetime' AND expires_at < datetime('now')"),
  countKeys: db.prepare("SELECT COUNT(*) as count FROM keys"),

  // Warnings
  addWarning: db.prepare("INSERT INTO warnings (guild_id, user_id, reason, moderator_id, created_at) VALUES (?,?,?,?,?)"),
  getWarnings: db.prepare("SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC"),
  countWarnings: db.prepare("SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?"),

  // Config
  getConfig: db.prepare("SELECT value FROM config WHERE guild_id = ? AND key = ?"),
  setConfig: db.prepare("INSERT OR REPLACE INTO config (guild_id, key, value) VALUES (?,?,?)"),
  deleteConfig: db.prepare("DELETE FROM config WHERE guild_id = ? AND key = ?"),

  // Levels
  getLevel: db.prepare("SELECT * FROM levels WHERE guild_id = ? AND user_id = ?"),
  addXP: db.prepare("INSERT INTO levels (guild_id, user_id, xp, level, total_xp) VALUES (?,?,?,1,?) ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + ?, total_xp = total_xp + ?"),
  updateLevel: db.prepare("UPDATE levels SET level = ?, xp = ? WHERE guild_id = ? AND user_id = ?"),
  getLeaderboard: db.prepare("SELECT * FROM levels WHERE guild_id = ? ORDER BY total_xp DESC LIMIT 10"),

  // Reaction Roles
  addReactionRole: db.prepare("INSERT INTO reaction_roles (guild_id, message_id, emoji, role_id) VALUES (?,?,?,?)"),
  removeReactionRole: db.prepare("DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?"),
  getReactionRoles: db.prepare("SELECT * FROM reaction_roles WHERE guild_id = ?"),
  getReactionRoleByMsg: db.prepare("SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?"),

  // Starboard
  addStar: db.prepare("INSERT OR IGNORE INTO starboard (guild_id, message_id, channel_id, author_id, content) VALUES (?,?,?,?,?)"),
  updateStarCount: db.prepare("UPDATE starboard SET star_count = ? WHERE guild_id = ? AND message_id = ?"),
  getStarEntry: db.prepare("SELECT * FROM starboard WHERE guild_id = ? AND message_id = ?"),

  // Suggestions
  addSuggestion: db.prepare("INSERT INTO suggestions (guild_id, user_id, content, created_at) VALUES (?,?,?,?)"),
  updateSuggestion: db.prepare("UPDATE suggestions SET status = ? WHERE id = ?"),
  getSuggestion: db.prepare("SELECT * FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC"),

  // Custom Commands
  addCustomCmd: db.prepare("INSERT OR REPLACE INTO custom_commands (guild_id, name, response, created_by) VALUES (?,?,?,?)"),
  removeCustomCmd: db.prepare("DELETE FROM custom_commands WHERE guild_id = ? AND name = ?"),
  getCustomCmd: db.prepare("SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?"),
  getCustomCmds: db.prepare("SELECT * FROM custom_commands WHERE guild_id = ?"),

  // ModLogs
  addModLog: db.prepare("INSERT INTO modlogs (guild_id, user_id, moderator_id, action, reason, created_at) VALUES (?,?,?,?,?,?)"),
  getModLogs: db.prepare("SELECT * FROM modlogs WHERE guild_id = ? ORDER BY created_at DESC LIMIT 20"),

  // Snipe
  setSnipe: db.prepare("INSERT OR REPLACE INTO snipes (guild_id, channel_id, author_id, content, created_at) VALUES (?,?,?,?,?)"),
  getSnipe: db.prepare("SELECT * FROM snipes WHERE guild_id = ? AND channel_id = ?"),

  // Ticket Panels
  setTicketPanel: db.prepare("INSERT OR REPLACE INTO ticket_panels (guild_id, category_id) VALUES (?,?)"),
  getTicketPanel: db.prepare("SELECT * FROM ticket_panels WHERE guild_id = ?"),

  // AFK
  setAfk: db.prepare("INSERT OR REPLACE INTO afk (user_id, guild_id, reason, created_at) VALUES (?,?,?,?)"),
  removeAfk: db.prepare("DELETE FROM afk WHERE user_id = ?"),
  getAfk: db.prepare("SELECT * FROM afk WHERE user_id = ?"),
};

// ═══════════════════════════════════════════════════════════════════
//  GITHUB (Octokit) — Legacy Sync
// ═══════════════════════════════════════════════════════════════════
const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function githubSync() {
  try {
    const keys = stmts.getAllKeys.all();
    const { data } = await octokit.repos.getContent({ owner: GITHUB_OWNER, repo: MASTER_REPO, path: MASTER_FILE });
    const sha = data.sha;
    const content = JSON.stringify({ licenses: keys.map(k => ({ key: k.key, userid: Number(k.userid), createdAt: k.created_at, duration: k.duration, expiresAt: k.expires_at, redeemedAt: k.redeemed_at })) }, null, 2);
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER, repo: MASTER_REPO, path: MASTER_FILE,
      message: `auto sync — ${new Date().toISOString()}`,
      content: Buffer.from(content).toString("base64"), sha,
    });
  } catch (e) { /* silent */ }
}

// ═══════════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════
function generateKey() {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const s = () => Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join("");
  return `${s()}-${s()}-${s()}-${s()}`;
}

function isAdmin(m) {
  return m.permissions.has(PermissionsBitField.Flags.Administrator) || m.id === CLIENT_ID;
}

function isMod(m) {
  return m.permissions.has(PermissionsBitField.Flags.ManageMessages) || isAdmin(m);
}

function fmtDuration(d) {
  return { "3d": "3 أيام", "7d": "7 أيام", lifetime: "مدى الحياة ♾️" }[d] || d;
}

function durColor(d) {
  return { "3d": 0xff9800, "7d": 0x2196f3, lifetime: 0x9b59b6 }[d] || 0x00ff88;
}

function parseDuration(str) {
  const m = str.match(/^(\d+)([hdm])$/);
  if (!m) return null;
  return parseInt(m[1]) * ({ h: 3600000, d: 86400000, m: 60000 }[m[2]] || 60000);
}

function xpForLevel(level) { return Math.floor(50 * Math.pow(level, 1.5)); }

function getGuildConfig(guildId, key, defaultVal = null) {
  const row = stmts.getConfig.get(guildId, key);
  return row ? row.value : defaultVal;
}

function setGuildConfig(guildId, key, value) {
  stmts.setConfig.run(guildId, key, String(value));
}

function embedOk(title) { return new EmbedBuilder().setTitle(title).setColor(0x57f287).setTimestamp(); }
function embedErr(title) { return new EmbedBuilder().setTitle(title).setColor(0xed4245).setTimestamp(); }

function footer() { return { text: "Nuxus Hub — متجر السكربتات" }; }

const startTime = Date.now();

// ═══════════════════════════════════════════════════════════════════
//  PROTECTION SYSTEM
// ═══════════════════════════════════════════════════════════════════
const protection = {
  antiRaid: new Map(),
  antiLink: new Map(),
  antiSpam: new Map(),
  antiCaps: new Map(),
  wordFilter: new Map(),
  joinTimes: new Map(),
  msgCounts: new Map(),
};

function capsRatio(text) {
  if (text.length < 5) return 0;
  const up = (text.match(/[A-Z]/g) || []).length;
  return up / text.length;
}

// ═══════════════════════════════════════════════════════════════════
//  CLIENT SETUP
// ═══════════════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

// ═══════════════════════════════════════════════════════════════════
//  SLASH COMMANDS (55 commands)
// ═══════════════════════════════════════════════════════════════════
const commands = [

  // ──────── KEY SYSTEM (5) ────────
  new SlashCommandBuilder().setName("generate-key").setDescription("🔑 إنشاء مفتاح Premium")
    .addStringOption((o) => o.setName("userid").setDescription("ID المستخدم").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("المدة").setRequired(true)
      .addChoices({ name: "3 أيام", value: "3d" }, { name: "7 أيام", value: "7d" }, { name: "مدى الحياة", value: "lifetime" })),
  new SlashCommandBuilder().setName("redeem").setDescription("✅ تفعيل مفتاح")
    .addStringOption((o) => o.setName("key").setDescription("المفتاح").setRequired(true)),
  new SlashCommandBuilder().setName("revoke").setDescription("🗑️ سحب مفتاح")
    .addStringOption((o) => o.setName("key").setDescription("المفتاح").setRequired(true)),
  new SlashCommandBuilder().setName("keys-list").setDescription("📋 قائمة المفاتيح"),
  new SlashCommandBuilder().setName("key-info").setDescription("🔍 تفاصيل مفتاح")
    .addStringOption((o) => o.setName("key").setDescription("المفتاح").setRequired(true)),

  // ──────── TICKETS (5) ────────
  new SlashCommandBuilder().setName("setup-tickets").setDescription("🎫 إعداد التذاكر")
    .addChannelOption((o) => o.setName("category").setDescription("القسم (Category)").setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
  new SlashCommandBuilder().setName("close-ticket").setDescription("🔒 إغلاق التذكرة"),
  new SlashCommandBuilder().setName("add-user").setDescription("➕ إضافة عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("remove-user").setDescription("➖ إزالة عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("transcript").setDescription("📋 سجل التذكرة"),

  // ──────── MODERATION (12) ────────
  new SlashCommandBuilder().setName("ban").setDescription("🔨 حظر عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("السبب"))
    .addIntegerOption((o) => o.setName("days").setDescription("حذف رسائل (0-7)").setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder().setName("unban").setDescription("✅ فك حظر")
    .addStringOption((o) => o.setName("userid").setDescription("User ID").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("السبب")),
  new SlashCommandBuilder().setName("kick").setDescription("👢 طرد عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("السبب")),
  new SlashCommandBuilder().setName("mute").setDescription("🔇 كتم عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("السبب"))
    .addIntegerOption((o) => o.setName("minutes").setDescription("المدة بالدقائق (1-20160)").setMinValue(1).setMaxValue(20160)),
  new SlashCommandBuilder().setName("unmute").setDescription("🔊 إلغاء كتم")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("warn").setDescription("⚠️ تحذير عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("السبب").setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("📋 تحذيرات عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("🗑️ حذف رسائل")
    .addIntegerOption((o) => o.setName("amount").setDescription("العدد (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName("slowmode").setDescription("⏱️ بطء الإرسال")
    .addIntegerOption((o) => o.setName("seconds").setDescription("الثواني").setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName("lock").setDescription("🔒 قفل القناة"),
  new SlashCommandBuilder().setName("unlock").setDescription("🔓 فتح القناة"),
  new SlashCommandBuilder().setName("nickname").setDescription("✏️ تغيير لقب")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption((o) => o.setName("nickname").setDescription("اللقب").setRequired(true)),

  // ──────── GIVEAWAY (3) ────────
  new SlashCommandBuilder().setName("giveaway").setDescription("🎉 جيف أواي")
    .addStringOption((o) => o.setName("prize").setDescription("الجائزة").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("المدة (1h, 30m, 1d)").setRequired(true))
    .addIntegerOption((o) => o.setName("winners").setDescription("الفائزين").setMinValue(1).setMaxValue(10)),
  new SlashCommandBuilder().setName("reroll").setDescription("🎲 إعادة سحب")
    .addStringOption((o) => o.setName("messageid").setDescription("رسالة الجيف أواي").setRequired(true)),
  new SlashCommandBuilder().setName("end-giveaway").setDescription("🏁 إنهاء جيف أواي")
    .addStringOption((o) => o.setName("messageid").setDescription("رسالة الجيف أواي").setRequired(true)),

  // ──────── WELCOME / LEAVE (4) ────────
  new SlashCommandBuilder().setName("set-welcome").setDescription("👋 تعيين قناة الترحيب")
    .addChannelOption((o) => o.setName("channel").setDescription("القناة").setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName("message").setDescription("رسالة الترحيب ({user} {membercount} {server})")),
  new SlashCommandBuilder().setName("set-leave").setDescription("👋 تعيين قناة المغادرة")
    .addChannelOption((o) => o.setName("channel").setDescription("القناة").setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName("message").setDescription("رسالة المغادرة ({user})")),
  new SlashCommandBuilder().setName("disable-welcome").setDescription("❌ تعطيل الترحيب"),
  new SlashCommandBuilder().setName("disable-leave").setDescription("❌ تعطيل المغادرة"),

  // ──────── AUTO-ROLE (2) ────────
  new SlashCommandBuilder().setName("set-autorole").setDescription("🏷️ تعيين رتبة تلقائية")
    .addRoleOption((o) => o.setName("role").setDescription("الرتبة").setRequired(true)),
  new SlashCommandBuilder().setName("remove-autorole").setDescription("❌ إزالة الرتبة التلقائية"),

  // ──────── LEVELS (3) ────────
  new SlashCommandBuilder().setName("rank").setDescription("📊 مستواك")
    .addUserOption((o) => o.setName("user").setDescription("العضو")),
  new SlashCommandBuilder().setName("leaderboard").setDescription("🏆 لوحة المتصدرين"),
  new SlashCommandBuilder().setName("set-xp").setDescription("⚙️ تعيين XP (admin)")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption((o) => o.setName("amount").setDescription("الكمية").setRequired(true)),

  // ──────── REACTION ROLES (3) ────────
  new SlashCommandBuilder().setName("reaction-role").setDescription("🎭 إدارة رتب التفاعل")
    .addStringOption((o) => o.setName("action").setDescription("الإجراء").setRequired(true)
      .addChoices({ name: "➕ إضافة", value: "add" }, { name: "➖ إزالة", value: "remove" }, { name: "📋 قائمة", value: "list" }))
    .addStringOption((o) => o.setName("messageid").setDescription("رسالة ID"))
    .addStringOption((o) => o.setName("emoji").setDescription("الإيموجي"))
    .addRoleOption((o) => o.setName("role").setDescription("الرتبة")),

  // ──────── STARBOARD (2) ────────
  new SlashCommandBuilder().setName("set-starboard").setDescription("⭐ تعيين قناة ستاربورد")
    .addChannelOption((o) => o.setName("channel").setDescription("القناة").setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("disable-starboard").setDescription("❌ تعطيل ستاربورد"),

  // ──────── SUGGESTIONS (2) ────────
  new SlashCommandBuilder().setName("suggest").setDescription("💡 اقتراح")
    .addStringOption((o) => o.setName("text").setDescription("الاقتراح").setRequired(true)),
  new SlashCommandBuilder().setName("suggestion-decision").setDescription("✅/❌ قبول/رفض اقتراح")
    .addIntegerOption((o) => o.setName("id").setDescription("رقم الاقتراح").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("status").setDescription("الحالة").setRequired(true)
      .addChoices({ name: "✅ مقبول", value: "accepted" }, { name: "❌ مرفوض", value: "denied" }, { name: "🔄 قيد المراجعة", value: "pending" })),

  // ──────── MESSAGES (6) ────────
  new SlashCommandBuilder().setName("say").setDescription("💬 البوت يرسل")
    .addStringOption((o) => o.setName("message").setDescription("الرسالة").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("القناة")),
  new SlashCommandBuilder().setName("embed").setDescription("📝 رسالة مضمنة")
    .addStringOption((o) => o.setName("title").setDescription("العنوان").setRequired(true))
    .addStringOption((o) => o.setName("description").setDescription("الوصف").setRequired(true))
    .addStringOption((o) => o.setName("color").setDescription("اللون (hex)"))
    .addStringOption((o) => o.setName("image").setDescription("رابط صورة"))
    .addStringOption((o) => o.setName("footer").setDescription("التذييل")),
  new SlashCommandBuilder().setName("announce").setDescription("📢 إعلان")
    .addStringOption((o) => o.setName("title").setDescription("العنوان").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("الرسالة").setRequired(true))
    .addStringOption((o) => o.setName("ping").setDescription("المنشن")
      .addChoices({ name: "@everyone", value: "everyone" }, { name: "@here", value: "here" }, { name: "بدون", value: "none" })),
  new SlashCommandBuilder().setName("dm").setDescription("📧 رسالة خاصة")
    .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("الرسالة").setRequired(true)),
  new SlashCommandBuilder().setName("poll").setDescription("📊 تصويت")
    .addStringOption((o) => o.setName("question").setDescription("السؤال").setRequired(true))
    .addStringOption((o) => o.setName("option1").setDescription("خيار 1").setRequired(true))
    .addStringOption((o) => o.setName("option2").setDescription("خيار 2").setRequired(true))
    .addStringOption((o) => o.setName("option3").setDescription("خيار 3"))
    .addStringOption((o) => o.setName("option4").setDescription("خيار 4"))
    .addStringOption((o) => o.setName("option5").setDescription("خيار 5")),
  new SlashCommandBuilder().setName("nuke").setDescription("💣 تجديد القناة"),

  // ──────── UTILITY (14) ────────
  new SlashCommandBuilder().setName("ping").setDescription("🏓 السرعة"),
  new SlashCommandBuilder().setName("bot-info").setDescription("🤖 معلومات البوت"),
  new SlashCommandBuilder().setName("server-info").setDescription("📋 معلومات السيرفر"),
  new SlashCommandBuilder().setName("user-info").setDescription("👤 معلومات عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو")),
  new SlashCommandBuilder().setName("whois").setDescription("🔍 معلومات مفصلة")
    .addUserOption((o) => o.setName("user").setDescription("العضو")),
  new SlashCommandBuilder().setName("avatar").setDescription("🖼️ صورة عضو")
    .addUserOption((o) => o.setName("user").setDescription("العضو")),
  new SlashCommandBuilder().setName("server-icon").setDescription("🖼️ صورة السيرفر"),
  new SlashCommandBuilder().setName("uptime").setDescription("⏱️ مدة التشغيل"),
  new SlashCommandBuilder().setName("member-count").setDescription("📊 عدد الأعضاء"),
  new SlashCommandBuilder().setName("role-info").setDescription("🏷️ معلومات رتبة")
    .addRoleOption((o) => o.setName("role").setDescription("الرتبة").setRequired(true)),
  new SlashCommandBuilder().setName("channel-info").setDescription("📢 معلومات قناة")
    .addChannelOption((o) => o.setName("channel").setDescription("القناة").setRequired(true)),
  new SlashCommandBuilder().setName("snipe").setDescription("🎯 آخر رسالة محذوفة"),
  new SlashCommandBuilder().setName("remind").setDescription("⏰ تذكير")
    .addStringOption((o) => o.setName("time").setDescription("المدة (30m, 1h, 1d)").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("التذكير").setRequired(true)),
  new SlashCommandBuilder().setName("invite").setDescription("🔗 رابط دعوة السيرفر"),
  new SlashCommandBuilder().setName("help").setDescription("❓ قائمة الأوامر"),

  // ──────── AFK (2) ────────
  new SlashCommandBuilder().setName("afk").setDescription("🌙 ضبط حالة AFK")
    .addStringOption((o) => o.setName("reason").setDescription("السبب")),
  new SlashCommandBuilder().setName("unafk").setDescription("☀️ إلغاء AFK"),

  // ──────── PROTECTION (5) ────────
  new SlashCommandBuilder().setName("anti-raid").setDescription("🛡️ حماية من الرايد")
    .addStringOption((o) => o.setName("action").setDescription("تشغيل/إيقاف").setRequired(true)
      .addChoices({ name: "ON", value: "on" }, { name: "OFF", value: "off" })),
  new SlashCommandBuilder().setName("anti-link").setDescription("🔗 حماية من الروابط")
    .addStringOption((o) => o.setName("action").setDescription("تشغيل/إيقاف").setRequired(true)
      .addChoices({ name: "ON", value: "on" }, { name: "OFF", value: "off" })),
  new SlashCommandBuilder().setName("anti-spam").setDescription("💬 حماية من السبام")
    .addStringOption((o) => o.setName("action").setDescription("تشغيل/إيقاف").setRequired(true)
      .addChoices({ name: "ON", value: "on" }, { name: "OFF", value: "off" })),
  new SlashCommandBuilder().setName("anti-caps").setDescription("🔠 حماية من الأحرف الكبيرة")
    .addStringOption((o) => o.setName("action").setDescription("تشغيل/إيقاف").setRequired(true)
      .addChoices({ name: "ON", value: "on" }, { name: "OFF", value: "off" })),
  new SlashCommandBuilder().setName("word-filter").setDescription("🚫 فلتر كلمات")
    .addStringOption((o) => o.setName("action").setDescription("تشغيل/إيقاف").setRequired(true)
      .addChoices({ name: "ON", value: "on" }, { name: "OFF", value: "off" }))
    .addStringOption((o) => o.setName("words").setDescription("الكلمات الممنوعة (مفصولة بفاصلة)")),

  // ──────── MOD LOG (1) ────────
  new SlashCommandBuilder().setName("set-modlog").setDescription("📝 تعيين قناة السجلات")
    .addChannelOption((o) => o.setName("channel").setDescription("القناة").setRequired(true).addChannelTypes(ChannelType.GuildText)),
];

// ═══════════════════════════════════════════════════════════════════
//  REGISTER COMMANDS
// ═══════════════════════════════════════════════════════════════════
const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

async function registerCommands() {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map((c) => c.toJSON()) });
    console.log(`✅ ${commands.length} commands registered!`);
  } catch (err) {
    console.error("❌ Registration failed:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MOD LOG HELPER
// ═══════════════════════════════════════════════════════════════════
async function sendModLog(guild, action, userId, moderatorId, reason) {
  const channelId = getGuildConfig(guild.id, "modlog_channel");
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (!ch || !ch.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${action}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "👤 العضو", value: `<@${userId}>`, inline: true },
      { name: "👮 المشرف", value: `<@${moderatorId}>`, inline: true },
      { name: "📝 السبب", value: reason || "No reason", inline: true },
    )
    .setFooter(footer())
    .setTimestamp();

  try { await ch.send({ embeds: [embed] }); } catch (e) {}

  stmts.addModLog.run(guild.id, userId, moderatorId, action, reason, new Date().toISOString());
}

// ═══════════════════════════════════════════════════════════════════
//  GIVEAWAY STORAGE (in-memory for active, DB for persistence)
// ═══════════════════════════════════════════════════════════════════
const activeGiveaways = new Map();

function loadGiveawaysFromDB() {
  const rows = db.prepare("SELECT * FROM giveaways WHERE ended = 0").all();
  for (const row of rows) {
    const endTime = new Date(row.end_time).getTime();
    if (endTime > Date.now()) {
      activeGiveaways.set(row.message_id, {
        ...row,
        participants: JSON.parse(row.participants),
        ended: false,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PROTECTION DATA FROM DB
// ═══════════════════════════════════════════════════════════════════
function loadProtectionFromDB(guildId) {
  for (const key of ["anti_raid", "anti_link", "anti_spam", "anti_caps", "word_filter"]) {
    const val = getGuildConfig(guildId, key);
    if (val === "on") {
      const mapKey = key.replace("anti_", "anti").replace("_filter", "Filter");
      if (protection[mapKey]) protection[mapKey].set(guildId, true);
    }
    if (key === "word_filter" && val && val !== "on") {
      protection.wordFilter.set(guildId, val.split(",").map((w) => w.trim().toLowerCase()));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  BOT EVENTS
// ═══════════════════════════════════════════════════════════════════
client.on("ready", async () => {
  console.log(`\n✅ ${client.user.tag} is online`);
  console.log(`🆔 ID: ${client.user.id}  |  🌐 ${client.guilds.cache.size} servers`);
  console.log(`📅 ${new Date().toLocaleString()}`);
  console.log(`📦 Database: SQLite  |  🌐 Web Dashboard: http://localhost:${WEB_PORT}`);

  await registerCommands();

  // Delete expired keys
  const delResult = stmts.deleteExpiredKeys.run();
  if (delResult.changes > 0) console.log(`🗑️  Cleaned ${delResult.changes} expired key(s)`);

  // Load giveaways from DB
  loadGiveawaysFromDB();

  // Load protection settings for all guilds
  for (const [, guild] of client.guilds.cache) {
    loadProtectionFromDB(guild.id);
  }

  // Sync keys to GitHub
  await githubSync();

  console.log("\n🤖 All systems operational\n");
});

// ── Welcome / Leave ──
client.on("guildMemberAdd", async (member) => {
  const guild = member.guild;
  const now = Date.now();

  // Load protection for new guilds
  loadProtectionFromDB(guild.id);

  // Anti-Raid
  if (protection.antiRaid.get(guild.id)) {
    if (!protection.joinTimes.has(guild.id)) protection.joinTimes.set(guild.id, []);
    const times = protection.joinTimes.get(guild.id);
    times.push(now);
    const recent = times.filter((t) => now - t < 20000);
    protection.joinTimes.set(guild.id, recent);

    if (recent.length >= 5) {
      const raidMembers = guild.members.cache.filter((m) => now - (m.joinedTimestamp || 0) < 20000 && !m.user.bot);
      for (const [, m] of raidMembers) { try { await m.kick("Anti-Raid"); } catch (e) {} }
      times.length = 0;
      const log = guild.systemChannel;
      if (log) {
        try {
          log.send({ embeds: [new EmbedBuilder().setTitle("🚨 RAID DETECTED!").setDescription(`Kicked **${raidMembers.size}** members.`).setColor(0xff0000).setTimestamp()] });
        } catch (e) {}
      }
      return;
    }
  }

  // Welcome message
  const welcomeChId = getGuildConfig(guild.id, "welcome_channel");
  if (welcomeChId) {
    const ch = guild.channels.cache.get(welcomeChId);
    if (ch) {
      let msg = getGuildConfig(guild.id, "welcome_message") || "مرحباً {user} في {server}! 🎉";
      msg = msg.replace(/{user}/g, `${member}`).replace(/{server}/g, guild.name).replace(/{membercount}/g, `${guild.memberCount}`);
      try { await ch.send(msg); } catch (e) {}
    }
  }

  // Auto-role
  const autoroleId = getGuildConfig(guild.id, "autorole");
  if (autoroleId) {
    try { await member.roles.add(autoroleId); } catch (e) {}
  }
});

client.on("guildMemberRemove", async (member) => {
  const leaveChId = getGuildConfig(member.guild.id, "leave_channel");
  if (leaveChId) {
    const ch = member.guild.channels.cache.get(leaveChId);
    if (ch) {
      let msg = getGuildConfig(member.guild.id, "leave_message") || "{user} غادر السيرفر. 👋";
      msg = msg.replace(/{user}/g, `${member.user.tag}`);
      try { await ch.send(msg); } catch (e) {}
    }
  }
});

// ── Message Events ──
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const gid = message.guild.id;
  const member = message.member;
  if (!member) return;

  // AFK check
  if (message.mentions.users.size > 0) {
    for (const [, mentioned] of message.mentions.users) {
      const afk = stmts.getAfk.get(mentioned.id);
      if (afk) {
        await message.reply({ content: `🌙 ${mentioned.tag} غير متاح: **${afk.reason}**` });
      }
    }
  }

  // Remove AFK if sender is AFK
  const myAfk = stmts.getAfk.get(message.author.id);
  if (myAfk) {
    stmts.removeAfk.run(message.author.id);
    await message.reply({ content: `☀️ مرحباً بعودتك ${message.author}! تم إلغاء حالة AFK.` });
  }

  // Anti-Link
  if (protection.antiLink.get(gid) && !isAdmin(member)) {
    if (/(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li)\/[^\s]+)/gi.test(message.content)) {
      try {
        await message.delete();
        const w = await message.channel.send(`⚠️ ${message.author} — روابط غير مسموحة!`);
        setTimeout(() => w.delete().catch(() => {}), 3000);
      } catch (e) {}
      return;
    }
  }

  // Anti-Spam
  if (protection.antiSpam.get(gid)) {
    const key = `${gid}-${message.author.id}`;
    if (!protection.msgCounts.has(key)) protection.msgCounts.set(key, []);
    const msgs = protection.msgCounts.get(key);
    const now = Date.now();
    msgs.push(now);
    const recent = msgs.filter((t) => now - t < 5000);
    protection.msgCounts.set(key, recent);
    if (recent.length >= 7) {
      try {
        await member.timeout(30000, "Anti-Spam");
        const w = await message.channel.send(`🔇 ${message.author} تم كتمك 30 ثانية بسبب السبام`);
        setTimeout(() => w.delete().catch(() => {}), 5000);
      } catch (e) {}
      msgs.length = 0;
      return;
    }
  }

  // Anti-Caps
  if (protection.antiCaps.get(gid) && !isAdmin(member)) {
    if (capsRatio(message.content) > 0.7) {
      try {
        await message.delete();
        const w = await message.channel.send(`🔠 ${message.author} — لا تكتب بأحرف كبيرة فقط!`);
        setTimeout(() => w.delete().catch(() => {}), 3000);
      } catch (e) {}
      return;
    }
  }

  // Word Filter
  const filteredWords = protection.wordFilter.get(gid);
  if (Array.isArray(filteredWords) && filteredWords.length > 0 && !isAdmin(member)) {
    const lowerMsg = message.content.toLowerCase();
    for (const word of filteredWords) {
      if (word && lowerMsg.includes(word)) {
        try {
          await message.delete();
          const w = await message.channel.send(`🚫 ${message.author} — كلمة ممنوعة!`);
          setTimeout(() => w.delete().catch(() => {}), 3000);
        } catch (e) {}
        return;
      }
    }
  }

  // XP System
  if (!getGuildConfig(gid, "xp_disabled")) {
    const row = stmts.getLevel.get(gid, message.author.id);
    const currentXp = row ? row.xp + Math.floor(Math.random() * 10) + 5 : Math.floor(Math.random() * 10) + 5;
    const currentLevel = row ? row.level : 1;
    const totalXp = row ? row.total_xp + currentXp : currentXp;
    const neededXp = xpForLevel(currentLevel);

    stmts.addXP.run(gid, message.author.id, currentXp, currentLevel, totalXp, currentXp, currentXp);

    if (currentXp >= neededXp) {
      const newLevel = currentLevel + 1;
      const remainingXp = currentXp - neededXp;
      stmts.updateLevel.run(newLevel, remainingXp, gid, message.author.id);
      const lvlMsg = getGuildConfig(gid, "levelup_message") || null;
      if (lvlMsg) {
        const ch2 = message.channel;
        try {
          await ch2.send(lvlMsg.replace(/{user}/g, `${message.author}`).replace(/{level}/g, `${newLevel}`));
        } catch (e) {}
      }
    }
  }

  // Custom Commands
  if (message.content.startsWith("/")) {
    const cmdName = message.content.slice(1).split(" ")[0].toLowerCase();
    const cmd = stmts.getCustomCmd.get(gid, cmdName);
    if (cmd) {
      let resp = cmd.response.replace(/{user}/g, `${message.author}`).replace(/{server}/g, message.guild.name);
      try { await message.channel.send(resp); } catch (e) {}
    }
  }
});

// ── Message Delete (Snipe) ──
client.on("messageDelete", async (message) => {
  if (!message.guild || message.author.bot) return;
  stmts.setSnipe.run(message.guild.id, message.channel.id, message.author.id, message.content || "(media/embed)", new Date().toISOString());
});

// ── Starboard ──
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot || !reaction.message.guild) return;
  if (reaction.emoji.name !== "⭐") return;

  const guild = reaction.message.guild;
  const starboardChId = getGuildConfig(guild.id, "starboard_channel");
  if (!starboardChId) return;

  const existing = stmts.getStarEntry.get(guild.id, reaction.message.id);
  const count = reaction.count;

  if (existing) {
    stmts.updateStarCount.run(count, guild.id, reaction.message.id);
    // Update existing starboard message
    try {
      const ch = guild.channels.cache.get(existing.channel_id);
      if (ch) {
        const msgs = await ch.messages.fetch({ limit: 50 });
        const msg = msgs.find((m) => m.embeds[0]?.footer?.text?.includes(reaction.message.id));
        if (msg) {
          await msg.edit({ embeds: [msg.embeds[0].setFooter({ text: `⭐ ${count} | ${reaction.message.id}` })] });
        }
      }
    } catch (e) {}
  } else if (count >= 3) {
    stmts.addStar.run(guild.id, reaction.message.id, reaction.message.channel.id, reaction.message.author.id, reaction.message.content || "(embed)");
    const ch = guild.channels.cache.get(starboardChId);
    if (ch) {
      const embed = new EmbedBuilder()
        .setTitle("⭐ رسالة مميزة!")
        .setDescription(reaction.message.content?.substring(0, 1024) || "(embed)")
        .setAuthor({ name: reaction.message.author.tag, iconURL: reaction.message.author.displayAvatarURL() })
        .setColor(0xffd700)
        .setFooter({ text: `⭐ ${count} | ${reaction.message.id}` })
        .setTimestamp();
      try { await ch.send({ embeds: [embed] }); } catch (e) {}
    }
  }

  // Reaction Roles
  const rr = stmts.getReactionRoleByMsg.get(reaction.message.id, reaction.emoji.name);
  if (rr) {
    try {
      const role = guild.roles.cache.get(rr.role_id);
      if (role) await reaction.message.guild.members.cache.get(user.id).roles.add(role);
    } catch (e) {}
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot || !reaction.message.guild) return;

  const rr = stmts.getReactionRoleByMsg.get(reaction.message.id, reaction.emoji.name);
  if (rr) {
    try {
      const role = reaction.message.guild.roles.cache.get(rr.role_id);
      if (role) await reaction.message.guild.members.cache.get(user.id).roles.remove(role);
    } catch (e) {}
  }
});

// ═══════════════════════════════════════════════════════════════════
//  MAIN INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════
client.on("interactionCreate", async (interaction) => {

  // ──── SELECT MENUS ────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticket_menu") {
      const type = interaction.values[0];
      const cfg = {
        purchase: { label: "🎫 شراء سكربت", desc: "طلبات الشراء والاستفسارات عن الأسعار والمنتجات", color: 0x5865f2, topic: "تذكرة شراء — Nuxus Hub" },
        support: { label: "🔧 دعم فني", desc: "مشاكل تقنية وأخطاء في السكربتات", color: 0x57f287, topic: "تذكرة دعم فني — Nuxus Hub" },
        partnership: { label: "💼 شراكة", desc: "العروض التجارية والشراكات", color: 0xf1c40f, topic: "تذكرة شراكة — Nuxus Hub" },
        other: { label: "📝 أخرى", desc: "أي استفسار أو طلب عام", color: 0x9b59b6, topic: "تذكرة عامة — Nuxus Hub" },
      }[type];
      if (!cfg) return;

      const guild = interaction.guild;
      const member = interaction.member;
      const panel = stmts.getTicketPanel.get(guild.id);
      const catId = panel ? panel.category_id : null;

      const existing = guild.channels.cache.find((ch) => ch.name === `ticket-${type}-${member.user.username.toLowerCase()}`);
      if (existing) return interaction.reply({ content: "⚠️ لديك تذكرة مفتوحة بالفعل!", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const ch = await guild.channels.create({
          name: `ticket-${type}-${member.user.username.toLowerCase()}`,
          type: ChannelType.GuildText,
          topic: cfg.topic,
          parent: catId || null,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ],
        });

        await ch.send({
          embeds: [new EmbedBuilder().setTitle(cfg.label)
            .setDescription(`مرحباً ${member}!\n\n${cfg.desc}\n\nفريق **Nuxus Hub** سيرد في أقرب وقت.\nشرح طلبك بالتفصيل.`)
            .setColor(cfg.color).setFooter(footer()).setTimestamp()],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("close_ticket_confirm").setLabel("🔒 إغلاق التذكرة").setStyle(ButtonStyle.Danger)
          )],
        });
        await interaction.editReply({ content: `✅ تذكرتك: ${ch}` });
      } catch (err) {
        console.error("Ticket error:", err.message);
        await interaction.editReply({ content: "❌ حدث خطأ!" });
      }
    }
    return;
  }

  // ──── BUTTONS ────
  if (interaction.isButton()) {
    if (interaction.customId === "close_ticket_confirm") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_yes").setLabel("✅ نعم").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("close_no").setLabel("❌ إلغاء").setStyle(ButtonStyle.Success),
      );
      await interaction.reply({ content: "هل أنت متأكد؟", components: [row] });
    }
    if (interaction.customId === "close_yes") {
      const ch = interaction.channel;
      try {
        await ch.send({ embeds: [new EmbedBuilder().setTitle("🔒 تذكرة مغلقة").setColor(0xed4245).setFooter(footer()).setTimestamp()] });
        setTimeout(() => ch.delete().catch(() => {}), 5000);
      } catch (e) {}
    }
    if (interaction.customId === "close_no") {
      await interaction.update({ content: "تم الإلغاء.", components: [] });
    }

    if (interaction.customId === "giveaway_join") {
      const gw = activeGiveaways.get(interaction.message.id);
      if (!gw || gw.ended) return interaction.reply({ content: "❌ منتهي!", flags: MessageFlags.Ephemeral });
      if (gw.participants.includes(interaction.user.id)) return interaction.reply({ content: "✅ مشارك بالفعل!", flags: MessageFlags.Ephemeral });
      gw.participants.push(interaction.user.id);

      // Save to DB
      db.prepare("UPDATE giveaways SET participants = ? WHERE message_id = ?").run(JSON.stringify(gw.participants), interaction.message.id);

      await interaction.reply({ content: `✅ تم المشاركة! (${gw.participants.length} مشارك)`, flags: MessageFlags.Ephemeral });

      // Update embed live
      try {
        const ch = client.channels.cache.get(gw.channel_id);
        const msg = await ch.messages.fetch(gw.message_id);
        if (msg?.embeds[0]) {
          await msg.edit({ embeds: [EmbedBuilder.from(msg.embeds[0]).setDescription(
            `**🎁 الجائزة:** ${gw.prize}\n**👥 الفائزين:** ${gw.winners}\n**🎯 المشاركين:** \`${gw.participants.length}\`\n**⏰ ينتهي:** <t:${Math.floor(new Date(gw.end_time).getTime() / 1000)}:R>`
          )] });
        }
      } catch (e) {}
    }

    // Suggestion buttons
    if (interaction.customId.startsWith("suggest_")) {
      if (!isAdmin(interaction.member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
      const id = interaction.customId.split("_")[1];
      const status = interaction.customId.split("_")[2];
      const statusMap = { accept: "accepted", deny: "denied", pending: "pending" };
      const colorMap = { accepted: 0x57f287, denied: 0xed4245, pending: 0xfee75c };
      const labelMap = { accepted: "✅ مقبول", denied: "❌ مرفوض", pending: "🔄 قيد المراجعة" };

      stmts.updateSuggestion.run(statusMap[status], id);
      try {
        await interaction.message.edit({
          embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(colorMap[status])],
          components: [],
        });
        await interaction.reply({ content: `✅ الاقتراح #${id}: ${labelMap[status]}` });
      } catch (e) {}
    }
    return;
  }

  // ──── SLASH COMMANDS ────
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, guild, channel, user } = interaction;

  // ═════════════ KEY COMMANDS ═════════════

  if (commandName === "generate-key") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    try {
      const userid = options.getString("userid");
      const duration = options.getString("duration");
      const createdAt = new Date().toISOString();
      const key = generateKey();
      const expiresAt = duration === "lifetime" ? "lifetime" : new Date(Date.now() + (duration === "3d" ? 3 : 7) * 86400000).toISOString();

      const existing = stmts.getKeyByUser.get(userid);
      if (existing) return interaction.editReply({ content: `⚠️ <@${userid}> لديه مفتاح نشط: \`${existing.key}\`` });

      stmts.createKey.run(key, userid, duration, expiresAt, createdAt);
      await githubSync();

      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🔑 مفتاح Premium جديد!")
        .setColor(durColor(duration)).setFooter(footer()).setTimestamp()
        .addFields(
          { name: "🔑 المفتاح", value: `\`${key}\``, inline: true },
          { name: "👤 المستخدم", value: `<@${userid}>`, inline: true },
          { name: "⏳ المدة", value: fmtDuration(duration), inline: true },
          { name: "🏁 الانتهاء", value: expiresAt === "lifetime" ? "♾️" : `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`, inline: true },
        )] });

      try {
        const target = await client.users.fetch(userid);
        await target.send({ embeds: [new EmbedBuilder().setTitle("🎁 مفتاح Premium!").setDescription(`المدة: **${fmtDuration(duration)}**\nالمفتاح: \`${key}\`\n\nاستخدم \`/redeem\` لتفعيله.`).setColor(durColor(duration)).setFooter(footer())] });
      } catch (e) {}
    } catch (err) { await interaction.editReply({ content: `❌ خطأ: ${err.message}` }); }
  }

  if (commandName === "redeem") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const keyInput = options.getString("key");
      const license = stmts.getKey.get(keyInput);
      if (!license) return interaction.editReply({ content: "❌ المفتاح غير صالح!" });
      if (license.userid !== user.id) return interaction.editReply({ content: "❌ ليس لحسابك!" });
      if (license.expires_at !== "lifetime" && new Date(license.expires_at) < new Date()) return interaction.editReply({ content: "❌ منتهي!" });
      if (license.redeemed_at) return interaction.editReply({ content: "✅ مفعّل بالفعل!" });
      stmts.redeemKey.run(user.id, keyInput);
      await githubSync();
      await interaction.editReply({ content: `✅ تم التفعيل! المدة: **${fmtDuration(license.duration)}**` });
    } catch (e) { await interaction.editReply({ content: "❌ خطأ!" }); }
  }

  if (commandName === "revoke") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const keyInput = options.getString("key");
    const license = stmts.getKey.get(keyInput);
    if (!license) return interaction.reply({ content: "❌ غير موجود!", flags: MessageFlags.Ephemeral });
    stmts.revokeKey.run(keyInput);
    await githubSync();
    await interaction.reply({ embeds: [embedErr("🗑️ تم سحب المفتاح").addFields({ name: "المفتاح", value: `\`${keyInput}\`` }, { name: "المستخدم", value: `<@${license.userid}>` })] });
  }

  if (commandName === "keys-list") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const keys = stmts.getAllKeys.all();
      const now = new Date();
      const active = keys.filter((k) => k.expires_at === "lifetime" || new Date(k.expires_at) > now);
      if (!active.length) return interaction.editReply({ content: "📋 لا توجد مفاتيح نشطة." });
      const list = active.slice(0, 20).map((k) => {
        const st = k.redeemed_at ? "✅" : "⏳";
        const exp = k.expires_at === "lifetime" ? "♾️" : `<t:${Math.floor(new Date(k.expires_at).getTime() / 1000)}:R>`;
        return `${st} \`${k.key}\` — <@${k.userid}> — ${fmtDuration(k.duration)} — ${exp}`;
      }).join("\n");
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🔑 المفاتيح").setDescription(list).addFields(
        { name: "نشطة", value: `${active.length}`, inline: true }, { name: "المجموع", value: `${keys.length}`, inline: true }
      ).setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
    } catch (e) { await interaction.editReply({ content: "❌ خطأ!" }); }
  }

  if (commandName === "key-info") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const license = stmts.getKey.get(options.getString("key"));
    if (!license) return interaction.editReply({ content: "❌ غير موجود!" });
    const expired = license.expires_at !== "lifetime" && new Date(license.expires_at) < new Date();
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🔍 تفاصيل المفتاح").setColor(expired ? 0xed4245 : durColor(license.duration))
      .addFields(
        { name: "🔑 المفتاح", value: `\`${license.key}\`` },
        { name: "👤 المستخدم", value: `<@${license.userid}>` },
        { name: "⏳ المدة", value: fmtDuration(license.duration) },
        { name: "🏁 الانتهاء", value: license.expires_at === "lifetime" ? "♾️" : `<t:${Math.floor(new Date(license.expires_at).getTime() / 1000)}:F>` },
        { name: "📊 الحالة", value: expired ? "❌ منتهي" : license.redeemed_at ? "✅ مفعّل" : "⏳ غير مفعّل" },
      ).setFooter(footer()).setTimestamp()] });
  }

  // ═════════════ TICKET COMMANDS ═════════════

  if (commandName === "setup-tickets") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const category = options.getChannel("category");
    if (category.type !== ChannelType.GuildCategory) return interaction.reply({ content: "❌ اختر قسم (Category)!", flags: MessageFlags.Ephemeral });
    stmts.setTicketPanel.run(guild.id, category.id);

    const embed = new EmbedBuilder()
      .setTitle("🛒 مرحباً بك في متجر Nuxus Hub!")
      .setDescription("أفضل السكربتات بأعلى جودة وأسعار منافسة.\n\nاختر نوع التذكرة:")
      .setColor(0x5865f2).setThumbnail(client.user.displayAvatarURL()).setFooter(footer()).setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId("ticket_menu").setPlaceholder("🛒 اختر نوع التذكرة...")
        .addOptions([
          { label: "🎫 شراء سكربت", description: "طلبات الشراء والأسعار", value: "purchase" },
          { label: "🔧 دعم فني", description: "مشاكل تقنية وأخطاء", value: "support" },
          { label: "💼 شراكة", description: "العروض التجارية", value: "partnership" },
          { label: "📝 أخرى", description: "استفسار عام", value: "other" },
        ])
    );
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ تم الإعداد! القسم: ${category.name}`, flags: MessageFlags.Ephemeral });
  }

  if (commandName === "close-ticket") {
    if (!channel.name.startsWith("ticket-")) return interaction.reply({ content: "❌ للتذاكر فقط!", flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: "هل أنت متأكد؟", components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket_confirm").setLabel("🔒 إغلاق").setStyle(ButtonStyle.Danger)
    )] });
  }

  if (commandName === "add-user") {
    if (!channel.name.startsWith("ticket-")) return interaction.reply({ content: "❌ للتذاكر!", flags: MessageFlags.Ephemeral });
    const t = options.getUser("user");
    await channel.permissionOverwrites.edit(t.id, { ViewChannel: true, SendMessages: true });
    await interaction.reply({ content: `✅ تمت إضافة ${t}` });
  }

  if (commandName === "remove-user") {
    if (!channel.name.startsWith("ticket-")) return interaction.reply({ content: "❌ للتذاكر!", flags: MessageFlags.Ephemeral });
    const t = options.getUser("user");
    await channel.permissionOverwrites.edit(t.id, { ViewChannel: false, SendMessages: false });
    await interaction.reply({ content: `✅ تمت إزالة ${t}` });
  }

  if (commandName === "transcript") {
    if (!channel.name.startsWith("ticket-")) return interaction.reply({ content: "❌ للتذاكر!", flags: MessageFlags.Ephemeral });
    const msgs = await channel.messages.fetch({ limit: 100 });
    await interaction.reply({ embeds: [embedOk("📋 Transcript").setDescription(`حُفظ **${msgs.size}** رسالة`).setFooter(footer())] });
  }

  // ═════════════ MODERATION ═════════════

  if (commandName === "ban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: "❌ Ban权限!", flags: MessageFlags.Ephemeral });
    const target = options.getUser("user");
    const reason = options.getString("reason") || "No reason";
    const days = options.getInteger("days") || 0;
    try {
      await guild.members.ban(target, { deleteMessageSeconds: days * 86400, reason });
      await sendModLog(guild, "🔨 Ban", target.id, user.id, reason);
      await interaction.reply({ embeds: [embedOk("🔨 تم حظر العضو").addFields({ name: "العضو", value: `${target.tag}`, inline: true }, { name: "السبب", value: reason, inline: true }).setFooter(footer())] });
    } catch (e) { await interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "unban") {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: "❌ Unban权限!", flags: MessageFlags.Ephemeral });
    const userid = options.getString("userid");
    const reason = options.getString("reason") || "No reason";
    try {
      await guild.members.unban(userid, reason);
      await sendModLog(guild, "✅ Unban", userid, user.id, reason);
      await interaction.reply({ embeds: [embedOk("✅ تم فك الحظر").addFields({ name: "ID", value: userid }, { name: "السبب", value: reason }).setFooter(footer())] });
    } catch (e) { await interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "kick") {
    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return interaction.reply({ content: "❌ Kick权限!", flags: MessageFlags.Ephemeral });
    const target = options.getUser("user");
    const reason = options.getString("reason") || "No reason";
    try {
      await guild.members.kick(target, reason);
      await sendModLog(guild, "👢 Kick", target.id, user.id, reason);
      await interaction.reply({ embeds: [embedOk("👢 تم الطرد").addFields({ name: "العضو", value: `${target.tag}`, inline: true }, { name: "السبب", value: reason, inline: true }).setFooter(footer())] });
    } catch (e) { await interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "mute") {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: "❌ Mute权限!", flags: MessageFlags.Ephemeral });
    const target = options.getMember("user");
    const reason = options.getString("reason") || "No reason";
    const minutes = options.getInteger("minutes") || 60;
    try {
      await target.timeout(Math.min(minutes * 60000, 2419200000), reason);
      await sendModLog(guild, "🔇 Mute", target.id, user.id, `${reason} (${minutes}m)`);
      await interaction.reply({ embeds: [embedOk("🔇 تم الكتم").addFields({ name: "العضو", value: `${target.user.tag}` }, { name: "المدة", value: `${minutes} دقيقة` }, { name: "السبب", value: reason }).setFooter(footer())] });
    } catch (e) { await interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "unmute") {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: "❌ Unmute权限!", flags: MessageFlags.Ephemeral });
    const target = options.getMember("user");
    try {
      await target.timeout(null);
      await sendModLog(guild, "🔊 Unmute", target.id, user.id, "Unmuted");
      await interaction.reply({ embeds: [embedOk("🔊 تم إلغاء الكتم").addFields({ name: "العضو", value: `${target.user.tag}` }).setFooter(footer())] });
    } catch (e) { await interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "warn") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const target = options.getUser("user");
    const reason = options.getString("reason");
    stmts.addWarning.run(guild.id, target.id, reason, user.id, new Date().toISOString());
    const count = stmts.countWarnings.get(guild.id, target.id).count;
    await sendModLog(guild, "⚠️ Warn", target.id, user.id, reason);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("⚠️ تحذير").setColor(0xfee75c)
      .addFields({ name: "العضو", value: `${target.tag}`, inline: true }, { name: "السبب", value: reason, inline: true }, { name: "المجموع", value: `${count}/5`, inline: true }).setFooter(footer()).setTimestamp()] });
    if (count >= 5) {
      try { await guild.members.ban(target, { reason: "5 warnings auto-ban" }); await channel.send(`🔨 تم حظر ${target} — 5 تحذيرات!`); } catch (e) {}
    }
  }

  if (commandName === "warnings") {
    const target = options.getUser("user");
    const warns = stmts.getWarnings.all(guild.id, target.id);
    if (!warns.length) return interaction.reply({ content: "✅ لا تحذيرات.", flags: MessageFlags.Ephemeral });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⚠️ تحذيرات ${target.tag}`).setDescription(warns.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(new Date(w.created_at).getTime() / 1000)}:R>`).join("\n")).setColor(0xfee75c).setFooter({ text: `المجموع: ${warns.length}/5` })] });
  }

  if (commandName === "clear") {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: "❌ ManageMessages权限!", flags: MessageFlags.Ephemeral });
    try {
      const del = await channel.bulkDelete(options.getInteger("amount"), true);
      await interaction.reply({ content: `🗑️ حُذف ${del.size} رسالة.`, flags: MessageFlags.Ephemeral });
    } catch (e) { await interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "slowmode") {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return interaction.reply({ content: "❌ ManageChannels权限!", flags: MessageFlags.Ephemeral });
    await channel.setRateLimitPerUser(options.getInteger("seconds"));
    await interaction.reply({ content: `⏱️ Slowmode: **${options.getInteger("seconds")}s**` });
  }

  if (commandName === "lock") {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return interaction.reply({ content: "❌ ManageChannels权限!", flags: MessageFlags.Ephemeral });
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
    await sendModLog(guild, "🔒 Lock", "N/A", user.id, channel.name);
    await interaction.reply({ embeds: [embedOk("🔒 تم القفل").setDescription(channel.toString()).setFooter(footer())] });
  }

  if (commandName === "unlock") {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return interaction.reply({ content: "❌ ManageChannels权限!", flags: MessageFlags.Ephemeral });
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: true });
    await interaction.reply({ embeds: [embedOk("🔓 تم الفتح").setDescription(channel.toString()).setFooter(footer())] });
  }

  if (commandName === "nickname") {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames))
      return interaction.reply({ content: "❌ ManageNicknames权限!", flags: MessageFlags.Ephemeral });
    const target = options.getMember("user");
    try {
      await target.setNickname(options.getString("nickname"));
      await interaction.reply({ embeds: [embedOk("✏️ تم تغيير اللقب").addFields({ name: "العضو", value: `${target.user.tag}`, inline: true }, { name: "اللقب", value: options.getString("nickname"), inline: true }).setFooter(footer())] });
    } catch (e) { await interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
  }

  // ═════════════ GIVEAWAY ═════════════

  if (commandName === "giveaway") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const prize = options.getString("prize");
    const ms = parseDuration(options.getString("duration"));
    if (!ms || ms < 60000) return interaction.reply({ content: "❌ صيغة خاطئة!", flags: MessageFlags.Ephemeral });
    const winCount = options.getInteger("winners") || 1;
    const endTime = new Date(Date.now() + ms).toISOString();

    const embed = new EmbedBuilder().setTitle("🎉 جيف أواي جديد!")
      .setDescription(`**🎁 الجائزة:** ${prize}\n**👥 الفائزين:** ${winCount}\n**🎯 المشاركين:** \`0\`\n**⏰ ينتهي:** <t:${Math.floor(Date.now() + ms) / 1000}:R>`)
      .setColor(0x9b59b6).setFooter(footer()).setTimestamp();

    const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("giveaway_join").setLabel("🎉 المشاركة").setStyle(ButtonStyle.Success).setEmoji("🎉")
    )] });

    const gwData = { message_id: msg.id, channel_id: channel.id, prize, winners: winCount, end_time: endTime, participants: [], ended: false };
    db.prepare("INSERT OR REPLACE INTO giveaways (message_id, channel_id, prize, winners, end_time, participants, ended) VALUES (?,?,?,?,?,?,'0')")
      .run(msg.id, channel.id, prize, winCount, endTime, "[]");
    activeGiveaways.set(msg.id, gwData);

    await interaction.reply({ content: "✅ تم!", flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      const gw = activeGiveaways.get(msg.id);
      if (!gw || gw.ended) return;
      gw.ended = true;
      db.prepare("UPDATE giveaways SET ended = 1, participants = ? WHERE message_id = ?").run(JSON.stringify(gw.participants), msg.id);
      if (!gw.participants.length) {
        try { await msg.edit({ embeds: [EmbedBuilder.from(embed).setTitle("❌ انتهى بدون مشاركين").setColor(0xed4245)], components: [] }); } catch (e) {}
        return;
      }
      const winners = [...gw.participants].sort(() => Math.random() - 0.5).slice(0, gw.winners);
      const tags = winners.map((id) => `<@${id}>`).join(", ");
      try {
        await msg.edit({ embeds: [EmbedBuilder.from(embed).setTitle("🎊 انتهى!").setDescription(`**🎁** ${prize}\n**🏆** ${tags}\n**🎯** ${gw.participants.length}`).setColor(0x57f287)], components: [] });
      } catch (e) {}
      await channel.send(`🎊 ${tags} فزتم بـ **${prize}**! 🎁`);
    }, ms);
  }

  if (commandName === "reroll") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const gw = activeGiveaways.get(options.getString("messageid"));
    if (!gw || !gw.participants.length) return interaction.reply({ content: "❌!", flags: MessageFlags.Ephemeral });
    const winner = [...gw.participants].sort(() => Math.random() - 0.5)[0];
    await interaction.reply({ content: `🎲 الفائز: <@${winner}> — ${gw.prize}` });
  }

  if (commandName === "end-giveaway") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const gw = activeGiveaways.get(options.getString("messageid"));
    if (!gw || gw.ended) return interaction.reply({ content: "❌!", flags: MessageFlags.Ephemeral });
    gw.ended = true;
    if (!gw.participants.length) return interaction.reply({ content: "❌ لا مشاركين!" });
    const tags = [...gw.participants].sort(() => Math.random() - 0.5).slice(0, gw.winners).map((id) => `<@${id}>`).join(", ");
    await interaction.reply({ content: `🏁 الفائزون: ${tags}` });
  }

  // ═════════════ WELCOME / LEAVE ═════════════

  if (commandName === "set-welcome") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const ch = options.getChannel("channel");
    setGuildConfig(guild.id, "welcome_channel", ch.id);
    if (options.getString("message")) setGuildConfig(guild.id, "welcome_message", options.getString("message"));
    await interaction.reply({ embeds: [embedOk("👋 تم تعيين قناة الترحيب").addFields({ name: "القناة", value: `${ch}` }).setFooter(footer())] });
  }

  if (commandName === "set-leave") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const ch = options.getChannel("channel");
    setGuildConfig(guild.id, "leave_channel", ch.id);
    if (options.getString("message")) setGuildConfig(guild.id, "leave_message", options.getString("message"));
    await interaction.reply({ embeds: [embedOk("👋 تم تعيين قناة المغادرة").addFields({ name: "القناة", value: `${ch}` }).setFooter(footer())] });
  }

  if (commandName === "disable-welcome") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    stmts.deleteConfig.run(guild.id, "welcome_channel");
    await interaction.reply({ content: "✅ تم تعطيل الترحيب." });
  }

  if (commandName === "disable-leave") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    stmts.deleteConfig.run(guild.id, "leave_channel");
    await interaction.reply({ content: "✅ تم تعطيل المغادرة." });
  }

  // ═════════════ AUTO-ROLE ═════════════

  if (commandName === "set-autorole") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const role = options.getRole("role");
    setGuildConfig(guild.id, "autorole", role.id);
    await interaction.reply({ embeds: [embedOk("🏷️ تم تعيين الرتبة التلقائية").addFields({ name: "الرتبة", value: `${role}` }).setFooter(footer())] });
  }

  if (commandName === "remove-autorole") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    stmts.deleteConfig.run(guild.id, "autorole");
    await interaction.reply({ content: "✅ تم إزالة الرتبة التلقائية." });
  }

  // ═════════════ LEVELS ═════════════

  if (commandName === "rank") {
    const target = options.getUser("user") || user;
    const row = stmts.getLevel.get(guild.id, target.id);
    const xp = row ? row.xp : 0;
    const lvl = row ? row.level : 1;
    const total = row ? row.total_xp : 0;
    const needed = xpForLevel(lvl);
    const pct = Math.min(Math.floor((xp / needed) * 100), 100);
    const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));

    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 مستوى ${target.tag}`)
      .setDescription(`**المستوى:** ${lvl}\n**XP:** ${xp}/${needed}\n**Total XP:** ${total}\n\n[${bar}] ${pct}%`)
      .setThumbnail(target.displayAvatarURL()).setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "leaderboard") {
    const rows = stmts.getLeaderboard.all(guild.id);
    if (!rows.length) return interaction.reply({ content: "📊 لا توجد بيانات بعد!", flags: MessageFlags.Ephemeral });
    const list = rows.map((r, i) => {
      const medals = ["🥇", "🥈", "🥉"];
      const medal = medals[i] || `**${i + 1}.**`;
      const member2 = guild.members.cache.get(r.user_id);
      const name = member2 ? member2.user.tag : `<@${r.user_id}>`;
      return `${medal} ${name} — **Lvl ${r.level}** (${r.total_xp} XP)`;
    }).join("\n");
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏆 لوحة المتصدرين").setDescription(list).setColor(0xffd700).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "set-xp") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const target = options.getUser("user");
    const amount = options.getInteger("amount");
    stmts.updateLevel.run(1, Math.max(amount, 0), guild.id, target.id);
    await interaction.reply({ content: `✅ XP لـ <@${target.id}> = ${amount}` });
  }

  // ═════════════ REACTION ROLES ═════════════

  if (commandName === "reaction-role") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const action = options.getString("action");

    if (action === "add") {
      const msgId = options.getString("messageid");
      const emoji = options.getString("emoji");
      const role = options.getRole("role");
      if (!msgId || !emoji) return interaction.reply({ content: "❌ احتاج message ID و emoji!", flags: MessageFlags.Ephemeral });
      stmts.addReactionRole.run(guild.id, msgId, emoji, role.id);
      try { await channel.messages.fetch(msgId).then((m) => m.react(emoji)); } catch (e) {}
      await interaction.reply({ content: `✅ تم! ردة فعل ${emoji} = ${role}` });
    } else if (action === "remove") {
      const msgId = options.getString("messageid");
      const emoji = options.getString("emoji");
      stmts.removeReactionRole.run(guild.id, msgId, emoji);
      await interaction.reply({ content: "✅ تمت الإزالة." });
    } else {
      const rows = stmts.getReactionRoles.all(guild.id);
      if (!rows.length) return interaction.reply({ content: "📋 لا توجد رتب تفاعل.", flags: MessageFlags.Ephemeral });
      await interaction.reply({ content: rows.map((r) => `${r.emoji} → <@&${r.role_id}> (${r.message_id})`).join("\n") });
    }
  }

  // ═════════════ STARBOARD ═════════════

  if (commandName === "set-starboard") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const ch = options.getChannel("channel");
    setGuildConfig(guild.id, "starboard_channel", ch.id);
    await interaction.reply({ embeds: [embedOk("⭐ ستاربورد").addFields({ name: "القناة", value: `${ch}` }).setFooter(footer())] });
  }

  if (commandName === "disable-starboard") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    stmts.deleteConfig.run(guild.id, "starboard_channel");
    await interaction.reply({ content: "✅ تم تعطيل ستاربورد." });
  }

  // ═════════════ SUGGESTIONS ═════════════

  if (commandName === "suggest") {
    const text = options.getString("text");
    const result = stmts.addSuggestion.run(guild.id, user.id, text, new Date().toISOString());
    const id = result.lastInsertRowid;

    const embed = new EmbedBuilder().setTitle(`💡 اقتراح #${id}`)
      .setDescription(text).setColor(0x3498db)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setFooter(footer()).setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`suggest_${id}_accept`).setLabel("✅ قبول").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`suggest_${id}_deny`).setLabel("❌ رفض").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`suggest_${id}_pending`).setLabel("🔄 مراجعة").setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    await interaction.channel.send(`<@${user.id}>`).then((m) => setTimeout(() => m.delete().catch(() => {}), 1000));
  }

  if (commandName === "suggestion-decision") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const id = options.getInteger("id");
    const status = options.getString("status");
    stmts.updateSuggestion.run(status, id);
    await interaction.reply({ content: `✅ الاقتراح #${id}: ${status === "accepted" ? "✅ مقبول" : status === "denied" ? "❌ مرفوض" : "🔄 قيد المراجعة"}` });
  }

  // ═════════════ MESSAGES ═════════════

  if (commandName === "say") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const target = options.getChannel("channel") || channel;
    await target.send(options.getString("message"));
    await interaction.reply({ content: "✅ تم!", flags: MessageFlags.Ephemeral });
  }

  if (commandName === "embed") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder()
      .setTitle(options.getString("title")).setDescription(options.getString("description"))
      .setColor(parseInt(options.getString("color") || "5865f2", 16) || 0x5865f2)
      .setFooter(options.getString("footer") ? { text: options.getString("footer") } : footer()).setTimestamp();
    if (options.getString("image")) embed.setImage(options.getString("image"));
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: "✅ تم!", flags: MessageFlags.Ephemeral });
  }

  if (commandName === "announce") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const ping = options.getString("ping") || "none";
    const content = ping !== "none" ? `@${ping === "everyone" ? "everyone" : "here"}\n\n` : "";
    await channel.send({ content,
      embeds: [new EmbedBuilder().setTitle(`📢 ${options.getString("title")}`).setDescription(options.getString("message")).setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
    await interaction.reply({ content: "✅ تم الإعلان!", flags: MessageFlags.Ephemeral });
  }

  if (commandName === "dm") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    try {
      await options.getUser("user").send({ embeds: [new EmbedBuilder().setTitle("📧 رسالة من Nuxus Hub").setDescription(options.getString("message")).setColor(0x5865f2).setFooter({ text: guild.name })] });
      await interaction.reply({ content: "✅ تم الإرسال!", flags: MessageFlags.Ephemeral });
    } catch (e) { await interaction.reply({ content: "❌ DM مغلق!", flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "poll") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const q = options.getString("question");
    const opts = [options.getString("option1"), options.getString("option2"), options.getString("option3"), options.getString("option4"), options.getString("option5")].filter(Boolean);
    const emojis = ["🇦", "🇧", "🇨", "🇩", "🇪"];
    const msg = await channel.send({ embeds: [new EmbedBuilder().setTitle(`📊 ${q}`).setDescription(opts.map((o, i) => `${emojis[i]} ${o}`).join("\n")).setColor(0x3498db).setFooter(footer()).setTimestamp()] });
    for (let i = 0; i < opts.length; i++) await msg.react(emojis[i]);
    await interaction.reply({ content: "✅ تم!", flags: MessageFlags.Ephemeral });
  }

  if (commandName === "nuke") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: "💣 جاري..." });
    try {
      const newCh = await channel.clone({ name: channel.name, topic: channel.topic, rateLimitPerUser: channel.rateLimitPerUser });
      await newCh.setPosition(channel.position);
      if (channel.parentId) await newCh.setParent(channel.parentId);
      await channel.delete();
      await newCh.send({ embeds: [new EmbedBuilder().setTitle("💣 تم التجديد!").setColor(0xed4245).setFooter(footer()).setTimestamp()] });
    } catch (e) { console.error("Nuke:", e.message); }
  }

  // ═════════════ UTILITY ═════════════

  if (commandName === "ping") {
    const sent = await interaction.reply({ content: "🏓 ...", fetchReply: true });
    await interaction.editReply(`🏓 **Pong!**\n🔴 البوت: **${sent.createdTimestamp - interaction.createdTimestamp}ms**\n🟢 API: **${client.ws.ping}ms**`);
  }

  if (commandName === "bot-info") {
    const up = Date.now() - startTime;
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🤖 معلومات البوت").setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: "الاسم", value: client.user.tag, inline: true }, { name: "ID", value: client.user.id, inline: true },
        { name: "السيرفرات", value: `${client.guilds.cache.size}`, inline: true }, { name: "الأوامر", value: `${commands.length}`, inline: true },
        { name: "Uptime", value: `${Math.floor(up / 86400000)}d ${Math.floor((up % 86400000) / 3600000)}h`, inline: true },
        { name: "Ping", value: `${client.ws.ping}ms`, inline: true }, { name: "المطور", value: `<@${CLIENT_ID}>`, inline: true },
        { name: "قاعدة البيانات", value: "SQLite", inline: true }, { name: "اللوحة", value: `localhost:${WEB_PORT}`, inline: true },
      ).setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "server-info") {
    const online = guild.members.cache.filter((m) => m.presence?.status === "online").size;
    const bots = guild.members.cache.filter((m) => m.user.bot).size;
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 ${guild.name}`).setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: "الاسم", value: guild.name, inline: true }, { name: "ID", value: guild.id, inline: true },
        { name: "المالك", value: `<@${guild.ownerId}>`, inline: true }, { name: "الأعضاء", value: `${guild.memberCount}`, inline: true },
        { name: "متصلين", value: `${online}`, inline: true }, { name: "بوتات", value: `${bots}`, inline: true },
        { name: "قنوات", value: `${guild.channels.cache.size}`, inline: true }, { name: "رتب", value: `${guild.roles.cache.size}`, inline: true },
        { name: "الإنشاء", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
      ).setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "user-info") {
    const target = options.getUser("user") || user;
    const tm = options.getMember("user") || member;
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${target.tag}`).setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "ID", value: target.id, inline: true }, { name: "الحساب", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:F>`, inline: true },
        { name: "الانضمام", value: tm.joinedAt ? `<t:${Math.floor(tm.joinedTimestamp / 1000)}:F>` : "?", inline: true },
        { name: "بوت", value: target.bot ? "نعم" : "لا", inline: true }, { name: "الحالة", value: tm.presence?.status || "Offline", inline: true },
      ).setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "whois") {
    const target = options.getUser("user") || user;
    const tm = options.getMember("user") || member;
    const roles = tm.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => `${r}`).join(", ") || "لا توجد";
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 WHOIS — ${target.tag}`).setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 }))
      .setColor(0x3498db).addFields(
        { name: "📌 ID", value: target.id, inline: true }, { name: "🗓️ حساب", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "📥 انضم", value: tm.joinedAt ? `<t:${Math.floor(tm.joinedTimestamp / 1000)}:R>` : "?", inline: true },
        { name: "🏷️ الرتب", value: roles.substring(0, 1024) },
        { name: "🎨 أعلى رتبة", value: tm.roles.highest.name, inline: true }, { name: "🎨 اللون", value: tm.displayHexColor, inline: true },
      ).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "avatar") {
    const target = options.getUser("user") || user;
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${target.tag}`).setImage(target.displayAvatarURL({ size: 1024, dynamic: true, extension: "png" })).setColor(0x5865f2).setFooter(footer())] });
  }

  if (commandName === "server-icon") {
    const icon = guild.iconURL({ size: 1024, dynamic: true });
    if (!icon) return interaction.reply({ content: "❌ لا صورة!", flags: MessageFlags.Ephemeral });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${guild.name}`).setImage(icon).setColor(0x5865f2).setFooter(footer())] });
  }

  if (commandName === "uptime") {
    const up = Date.now() - startTime;
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("⏱️ مدة التشغيل")
      .setDescription(`**${Math.floor(up / 86400000)}** يوم — **${Math.floor((up % 86400000) / 3600000)}** ساعة — **${Math.floor((up % 3600000) / 60000)}** دقيقة — **${Math.floor((up % 60000) / 1000)}** ثانية`)
      .setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "member-count") {
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("📊 الأعضاء")
      .addFields(
        { name: "المجموع", value: `${guild.memberCount}`, inline: true },
        { name: "أشخاص", value: `${guild.members.cache.filter((m) => !m.user.bot).size}`, inline: true },
        { name: "بوتات", value: `${guild.members.cache.filter((m) => m.user.bot).size}`, inline: true },
      ).setColor(0x57f287).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "role-info") {
    const role = options.getRole("role");
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏷️ ${role.name}`)
      .addFields(
        { name: "ID", value: role.id, inline: true }, { name: "اللون", value: role.hexColor, inline: true },
        { name: "الأعضاء", value: `${role.members.size}`, inline: true }, { name: "الموضع", value: `${role.position}`, inline: true },
        { name: "منشن", value: `<@&${role.id}>`, inline: true }, { name: "منفصل", value: role.hoist ? "نعم" : "لا", inline: true },
      ).setColor(role.color || 0x5865f2).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "channel-info") {
    const ch = options.getChannel("channel");
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📢 ${ch.name}`)
      .addFields(
        { name: "ID", value: ch.id, inline: true }, { name: "النوع", value: ChannelType[ch.type], inline: true },
        { name: "القسم", value: ch.parentId ? `<#${ch.parentId}>` : "لا يوجد", inline: true },
        { name: "أنشئت", value: `<t:${Math.floor(ch.createdTimestamp / 1000)}:F>`, inline: true },
      ).setColor(0x5865f2).setFooter(footer()).setTimestamp()] });
  }

  if (commandName === "snipe") {
    const snipe = stmts.getSnipe.get(guild.id, channel.id);
    if (!snipe) return interaction.reply({ content: "❌ لا توجد رسالة محذوفة!", flags: MessageFlags.Ephemeral });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🎯 آخر رسالة محذوفة")
      .setDescription(snipe.content.substring(0, 2000))
      .setAuthor({ name: `<@${snipe.author_id}>`, iconURL: (await client.users.fetch(snipe.author_id).catch(() => null))?.displayAvatarURL() || null })
      .setColor(0x5865f2).setFooter(footer())
      .setTimestamp(new Date(snipe.created_at))] });
  }

  if (commandName === "remind") {
    const ms = parseDuration(options.getString("time"));
    if (!ms || ms < 60000) return interaction.reply({ content: "❌ صيغة خاطئة!", flags: MessageFlags.Ephemeral });
    const reason = options.getString("reason");
    await interaction.reply({ embeds: [embedOk("⏰ تذكير").addFields({ name: "المدة", value: options.getString("time") }, { name: "التذكير", value: reason }).setFooter(footer())] });
    setTimeout(async () => {
      try { await user.send({ embeds: [new EmbedBuilder().setTitle("⏰ تذكير!").setDescription(`**${reason}**\n*(منذ ${options.getString("time")})*`).setColor(0x3498db).setFooter(footer())] }); } catch (e) {}
    }, ms);
  }

  if (commandName === "invite") {
    try {
      const invite = await channel.createInvite({ maxAge: 86400, maxUses: 0, reason: "Bot invite" });
      await interaction.reply({ content: `🔗 https://discord.gg/${invite.code}` });
    } catch (e) { await interaction.reply({ content: "❌ لا أستطيع إنشاء دعوة!", flags: MessageFlags.Ephemeral }); }
  }

  if (commandName === "help") {
    const cats = {
      "🔑 المفاتيح": ["generate-key", "redeem", "revoke", "keys-list", "key-info"],
      "🎫 التذاكر": ["setup-tickets", "close-ticket", "add-user", "remove-user", "transcript"],
      "🔨 الإشراف": ["ban", "unban", "kick", "mute", "unmute", "warn", "warnings", "clear", "slowmode", "lock", "unlock", "nickname"],
      "🎉 الجيف أواي": ["giveaway", "reroll", "end-giveaway"],
      "👋 الترحيب/المغادرة": ["set-welcome", "set-leave", "disable-welcome", "disable-leave"],
      "🏷️ الرتب التلقائية": ["set-autorole", "remove-autorole"],
      "📊 المستويات": ["rank", "leaderboard", "set-xp"],
      "🎭 رتب التفاعل": ["reaction-role"],
      "⭐ ستاربورد": ["set-starboard", "disable-starboard"],
      "💡 الاقتراحات": ["suggest", "suggestion-decision"],
      "💬 الرسائل": ["say", "embed", "announce", "dm", "poll", "nuke"],
      "🛡️ الحماية": ["anti-raid", "anti-link", "anti-spam", "anti-caps", "word-filter"],
      "🌙 الأخرى": ["ping", "bot-info", "server-info", "user-info", "whois", "avatar", "server-icon", "uptime", "member-count", "role-info", "channel-info", "snipe", "remind", "invite", "afk", "unafk", "set-modlog", "help"],
    };
    const embed = new EmbedBuilder().setTitle("🤖 أوامر Nuxus Hub Bot").setDescription(`**${commands.length} أمر** — متجر سكربتات Nuxus Hub`)
      .setColor(0x5865f2).setThumbnail(client.user.displayAvatarURL()).setFooter(footer()).setTimestamp();
    for (const [cat, cmds] of Object.entries(cats)) embed.addFields({ name: cat, value: cmds.map((c) => `\`/${c}\``).join(" "), inline: false });
    await interaction.reply({ embeds: [embed] });
  }

  // ═════════════ AFK ═════════════

  if (commandName === "afk") {
    const reason = options.getString("reason") || "غير متاح حالياً";
    stmts.setAfk.run(user.id, guild.id, reason, new Date().toISOString());
    await interaction.reply({ content: `🌙 تم ضبط AFK: **${reason}**` });
  }

  if (commandName === "unafk") {
    stmts.removeAfk.run(user.id);
    await interaction.reply({ content: "☀️ تم إلغاء AFK!" });
  }

  // ═════════════ PROTECTION ═════════════

  if (commandName === "anti-raid") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const a = options.getString("action");
    protection.antiRaid.set(guild.id, a === "on");
    setGuildConfig(guild.id, "anti_raid", a);
    await interaction.reply({ content: `🛡️ حماية الرايد: **${a === "on" ? "ON ✅" : "OFF ❌"}**` });
  }

  if (commandName === "anti-link") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const a = options.getString("action");
    protection.antiLink.set(guild.id, a === "on");
    setGuildConfig(guild.id, "anti_link", a);
    await interaction.reply({ content: `🔗 حماية الروابط: **${a === "on" ? "ON ✅" : "OFF ❌"}**` });
  }

  if (commandName === "anti-spam") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const a = options.getString("action");
    protection.antiSpam.set(guild.id, a === "on");
    setGuildConfig(guild.id, "anti_spam", a);
    await interaction.reply({ content: `💬 حماية السبام: **${a === "on" ? "ON ✅" : "OFF ❌"}**` });
  }

  if (commandName === "anti-caps") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const a = options.getString("action");
    protection.antiCaps.set(guild.id, a === "on");
    setGuildConfig(guild.id, "anti_caps", a);
    await interaction.reply({ content: `🔠 حماية الأحرف الكبيرة: **${a === "on" ? "ON ✅" : "OFF ❌"}**` });
  }

  if (commandName === "word-filter") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const a = options.getString("action");
    if (a === "on") {
      const words = options.getString("words");
      if (words) {
        protection.wordFilter.set(guild.id, words.split(",").map((w) => w.trim().toLowerCase()));
        setGuildConfig(guild.id, "word_filter", words);
      }
      await interaction.reply({ content: `🚫 فلتر الكلمات: **ON ✅**${words ? `\nالكلمات: ${words}` : ""}` });
    } else {
      protection.wordFilter.delete(guild.id);
      setGuildConfig(guild.id, "word_filter", "off");
      await interaction.reply({ content: `🚫 فلتر الكلمات: **OFF ❌**` });
    }
  }

  // ═════════════ MOD LOG ═════════════

  if (commandName === "set-modlog") {
    if (!isAdmin(member)) return interaction.reply({ content: "❌ للمشرفين!", flags: MessageFlags.Ephemeral });
    const ch = options.getChannel("channel");
    setGuildConfig(guild.id, "modlog_channel", ch.id);
    await interaction.reply({ embeds: [embedOk("📝 سجل الإشراف").addFields({ name: "القناة", value: `${ch}` }).setFooter(footer())] });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  WEB DASHBOARD
// ═══════════════════════════════════════════════════════════════════
const dashboardHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nuxus Hub — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#fff;min-height:100vh}
.header{background:linear-gradient(135deg,#667eea,#764ba2);padding:20px 30px;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:24px}.header span{opacity:.8;font-size:14px}
.container{max-width:1200px;margin:30px auto;padding:0 20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:30px}
.stat{background:#16213e;border-radius:12px;padding:20px;text-align:center}
.stat h3{font-size:32px;color:#667eea}.stat p{opacity:.7;margin-top:5px}
.section{background:#16213e;border-radius:12px;padding:25px;margin-bottom:20px}
.section h2{margin-bottom:15px;font-size:18px;color:#667eea}
table{width:100%;border-collapse:collapse}
th,td{padding:10px;text-align:right;border-bottom:1px solid #2a2a4a}
th{color:#667eea;font-weight:600}
.btn{background:#667eea;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;transition:.2s}
.btn:hover{background:#764ba2}.btn-danger{background:#ed4245}.btn-danger:hover{background:#c73e3e}
.badge{padding:3px 10px;border-radius:20px;font-size:12px}
.badge-active{background:#57f28730;color:#57f287}
.badge-expired{background:#ed424530;color:#ed4245}
.badge-redeemed{background:#5865f230;color:#5865f2}
.login{position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1a2e;display:flex;justify-content:center;align-items:center;z-index:999}
.login-box{background:#16213e;padding:40px;border-radius:16px;text-align:center;min-width:350px}
.login-box input{width:100%;padding:12px;margin:10px 0;border:2px solid #2a2a4a;background:#1a1a2e;color:#fff;border-radius:8px;font-size:15px}
.login-box input:focus{border-color:#667eea;outline:none}
.login-box button{width:100%;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);border:none;color:#fff;border-radius:8px;font-size:16px;cursor:pointer;margin-top:10px}
.login-box button:hover{opacity:.9}
</style></head><body>
<div class="login" id="loginBox">
<div class="login-box">
<h2>Nuxus Hub</h2><p style="opacity:.6;margin:10px 0">لوحة التحكم</p>
<input type="password" id="pass" placeholder="كلمة المرور" onkeydown="if(event.key==='Enter')doLogin()">
<button onclick="doLogin()">دخول</button><p id="loginErr" style="color:#ed4245;display:none;margin-top:10px"></p>
</div></div>
<div id="app" style="display:none">
<div class="header"><h1>Nuxus Hub Dashboard</h1><span id="botInfo"></span></div>
<div class="container">
<div class="stats" id="stats"></div>
<div class="section"><h2>🔑 المفاتيح</h2>
<div style="margin-bottom:15px"><input type="text" id="searchKey" placeholder="بحث..." oninput="loadKeys()" style="padding:8px;background:#1a1a2e;border:1px solid #2a2a4a;color:#fff;border-radius:6px;width:200px"></div>
<table><thead><tr><th>المفتاح</th><th>المستخدم</th><th>المدة</th><th>الانتهاء</th><th>الحالة</th><th>إجراء</th></tr></thead>
<tbody id="keysBody"></tbody></table></div>
<div class="section"><h2>📋 سجل الإجراءات</h2>
<table><thead><tr><th>الإجراء</th><th>العضو</th><th>المشرف</th><th>السبب</th><th>التاريخ</th></tr></thead>
<tbody id="logsBody"></tbody></table></div>
</div></div>
<script>
let token=localStorage.getItem('nuxus_token');
const API='/api';
function doLogin(){const p=document.getElementById('pass').value;fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})}).then(r=>r.json()).then(d=>{if(d.token){localStorage.setItem('nuxus_token',d.token);token=d.token;showApp();}else{document.getElementById('loginErr').textContent='كلمة المرور خاطئة!';document.getElementById('loginErr').style.display='block';}});}
function api(endpoint){return fetch(API+endpoint,{headers:{'Authorization':'Bearer '+token}}).then(r=>{if(r.status===401){token=null;localStorage.removeItem('nuxus_token');document.getElementById('loginBox').style.display='flex';document.getElementById('app').style.display='none';return null;}return r.json();});}
function showApp(){document.getElementById('loginBox').style.display='none';document.getElementById('app').style.display='block';loadStats();loadKeys();loadLogs();}
async function loadStats(){const d=await api('/stats');if(!d)return;document.getElementById('botInfo').textContent=d.bot+' | '+d.uptime;
document.getElementById('stats').innerHTML=
'<div class="stat"><h3>'+d.servers+'</h3><p>سيرفرات</p></div>'+
'<div class="stat"><h3>'+d.total_keys+'</h3><p>مفاتيح</p></div>'+
'<div class="stat"><h3>'+d.active_keys+'</h3><p>نشطة</p></div>'+
'<div class="stat"><h3>'+d.users+'</h3><p>مستخدمين</p></div>';}
async function loadKeys(){const d=await api('/keys');if(!d)return;const q=(document.getElementById('searchKey').value||'').toLowerCase();
const filtered=d.filter(k=>k.key.toLowerCase().includes(q)||k.userid.includes(q));
document.getElementById('keysBody').innerHTML=filtered.map(k=>{const now=new Date();const exp=k.expires_at==='lifetime'?null:new Date(k.expires_at);const expired=exp&&exp<now;const status=expired?'<span class="badge badge-expired">منتهي</span>':k.redeemed_at?'<span class="badge badge-redeemed">مفعّل</span>':'<span class="badge badge-active">نشط</span>';
return '<tr><td><code>'+k.key+'</code></td><td>'+k.userid+'</td><td>'+k.duration+'</td><td>'+(k.expires_at==='lifetime'?'∞':k.expires_at||'—')+'</td><td>'+status+'</td><td><button class="btn btn-danger" onclick="revokeKey(\\''+k.key+'\\')">سحب</button></td></tr>';}).join('');}
async function loadLogs(){const d=await api('/logs');if(!d)return;
document.getElementById('logsBody').innerHTML=d.slice(0,20).map(l=>'<tr><td>'+l.action+'</td><td>'+l.user_id+'</td><td>'+l.moderator_id+'</td><td>'+(l.reason||'—')+'</td><td>'+new Date(l.created_at).toLocaleString('ar')+'</td></tr>').join('');}
async function revokeKey(key){if(!confirm('سحب المفتاح '+key+'؟'))return;await fetch(API+'/revoke',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({key})});loadKeys();loadStats();}
if(token)showApp();
</script></body></html>`;

const webSessions = new Set();

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(dashboardHTML);
    return;
  }

  if (req.method === "POST" && req.url === "/api/login") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { password } = JSON.parse(body);
        if (password === WEB_PASS) {
          const token = Math.random().toString(36).substring(2);
          webSessions.add(token);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ token }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Wrong password" }));
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad request" }));
      }
    });
    return;
  }

  // API routes
  if (req.url?.startsWith("/api/")) {
    const auth = req.headers.authorization?.replace("Bearer ", "");
    if (!webSessions.has(auth)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });

    if (req.url === "/api/stats") {
      const keys = stmts.getAllKeys.all();
      const now = new Date();
      const active = keys.filter((k) => k.expires_at === "lifetime" || new Date(k.expires_at) > now);
      const up = Date.now() - startTime;
      res.end(JSON.stringify({
        servers: client.guilds.cache.size,
        users: client.users.cache.size,
        total_keys: keys.length,
        active_keys: active.length,
        bot: client.user?.tag || "Nuxus Hub",
        uptime: `${Math.floor(up / 86400000)}d ${Math.floor((up % 86400000) / 3600000)}h ${Math.floor((up % 3600000) / 60000)}m`,
      }));
    } else if (req.url === "/api/keys") {
      res.end(JSON.stringify(stmts.getAllKeys.all()));
    } else if (req.url === "/api/logs") {
      const allLogs = [];
      for (const [, guild] of client.guilds.cache) {
        const logs = stmts.getModLogs.all(guild.id);
        allLogs.push(...logs);
      }
      allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      res.end(JSON.stringify(allLogs.slice(0, 50)));
    } else if (req.url === "/api/revoke" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { key } = JSON.parse(body);
          stmts.revokeKey.run(key);
          githubSync();
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    } else {
      res.end(JSON.stringify({ error: "Not found" }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}).listen(WEB_PORT, () => {
  console.log(`🌐 Web Dashboard: http://localhost:${WEB_PORT}`);
});

// ═══════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════
client.login(BOT_TOKEN).then(() => console.log("🚀 Connecting...")).catch((err) => {
  console.error("❌ Login failed:", err.message);
  process.exit(1);
});
