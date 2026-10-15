import { FlowAutomationService } from "../lib/automation/FlowAutomationService";
import { prisma } from "../lib/db";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log("==========================================");
  console.log("🧪 Google Flow Automation - CLI Test Tool");
  console.log("==========================================");

  // Fetch all connected google accounts
  const accounts = await prisma.googleAccount.findMany({
    where: { status: "CONNECTED" }
  });

  if (accounts.length === 0) {
    console.log("❌ Không tìm thấy tài khoản Google nào có trạng thái CONNECTED.");
    console.log("Vui lòng vào Web UI để thêm và kết nối tài khoản trước.");
    process.exit(1);
  }

  console.log("\nDanh sách tài khoản khả dụng:");
  accounts.forEach((acc, index) => {
    console.log(`[${index + 1}] ${acc.name} (Profile: ${acc.profileDir})`);
  });

  rl.question(`\nChọn tài khoản để test (1-${accounts.length}): `, async (answer) => {
    const choice = parseInt(answer) - 1;
    if (isNaN(choice) || choice < 0 || choice >= accounts.length) {
      console.log("Lựa chọn không hợp lệ.");
      process.exit(1);
    }

    const selectedAccount = accounts[choice];
    console.log(`\nĐã chọn: ${selectedAccount.name}`);

    rl.question(`Bạn muốn làm gì?\n1. Test Connection\n2. Đăng nhập thủ công (Connect)\nChọn hành động (1-2): `, async (action) => {
      try {
        if (action === "1") {
          console.log(`\n⏳ Đang kiểm tra kết nối với ${selectedAccount.name}...`);
          const result = await FlowAutomationService.testConnection(selectedAccount.id);
          console.log("\nKết quả Test Connection:");
          console.log(JSON.stringify(result, null, 2));
        } else if (action === "2") {
          console.log(`\n⏳ Đang khởi chạy trình duyệt để kết nối ${selectedAccount.name}...`);
          const result = await FlowAutomationService.launchLoginSession(selectedAccount.id);
          console.log("\nKết quả Launch Login:");
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("Hành động không hợp lệ.");
        }
      } catch (err: any) {
        console.error("\n❌ Lỗi:", err.message);
      } finally {
        await prisma.$disconnect();
        process.exit(0);
      }
    });
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
