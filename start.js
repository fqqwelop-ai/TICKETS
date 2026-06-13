process.on("unhandledRejection", e => console.error("[UnhandledRejection]", e?.message || e));
process.on("uncaughtException",  e => console.error("[UncaughtException]",  e?.message || e));

const { initDB } = require("./db.js");

async function main() {
  console.log("🚀 بدء التشغيل...");
  await initDB();
  console.log("✅ قاعدة البيانات جاهزة");
  require("./server.js");
  setTimeout(() => require("./bot.js"), 2000);
}

main().catch(e => console.error("[Startup Error]", e.message));
