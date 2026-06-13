process.on("unhandledRejection", e => console.error("[UnhandledRejection]", e?.message || e));
process.on("uncaughtException",  e => console.error("[UncaughtException]",  e?.message || e));

const { initDB } = require("./db.js");

async function main() {
  await initDB();
  require("./admin.js");       // /admin  — لوحة الأدمن
  require("./dashboard.js");   // /       — داشبورد العملاء
  setTimeout(() => require("./bot.js"), 1500);
}

main().catch(e => console.error("[Startup Error]", e.message));
