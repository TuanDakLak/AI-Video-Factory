import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database for Phase 2...");

  // 1. Seed Google Accounts for tracking
  const accountA = await prisma.googleAccount.upsert({
    where: { id: "acc_pro_a" },
    update: {
      profileDir: "account-a",
    },
    create: {
      id: "acc_pro_a",
      name: "Google Pro A",
      label: "Tài khoản 1 (Chính - 1000 Flow Credits/tháng)",
      profileDir: "account-a",
      status: "NOT_CONNECTED",
      notes: "Tài khoản Google One AI Premium chính",
    },
  });

  const accountB = await prisma.googleAccount.upsert({
    where: { id: "acc_pro_b" },
    update: {
      profileDir: "account-b",
    },
    create: {
      id: "acc_pro_b",
      name: "Google Pro B",
      label: "Tài khoản 2 (Phụ - 1000 Flow Credits/tháng)",
      profileDir: "account-b",
      status: "NOT_CONNECTED",
      notes: "Tài khoản Google One AI Premium phụ",
    },
  });

  // 2. Seed Sample Projects if none exist
  const existingGenerations = await prisma.generation.count();
  if (existingGenerations === 0) {
    // Clean slate for projects
    await prisma.project.deleteMany({});

    const project1 = await prisma.project.create({
      data: {
        name: "Bí Ẩn Rừng Amazon",
        description: "Tài liệu ngắn về các loài sinh vật độc đáo và nguy hiểm nhất rừng mưa nhiệt đới Amazon.",
        contentType: "SHORT_VIDEO",
        topic: "5 loài sinh vật kỳ lạ và nguy hiểm nhất rừng rậm Amazon",
      },
    });

    const content1 = await prisma.content.create({
      data: {
        projectId: project1.id,
        title: "5 Sinh Vật Độc Lạ Rừng Amazon",
        concept: "Giới thiệu loài ếch phi tiêu độc màu sắc rực rỡ nhưng chứa độc tố thần kinh cực mạnh.",
        script: "Cảnh 1: Cận cảnh chú ếch phi tiêu vàng óng ánh trên tán lá ẩm ướt.\nCảnh 2: Hạt mưa nhiệt đới rơi chậm làm nổi bật vẻ đẹp chết chóc.",
        videoPrompt: "Cinematic close-up of a vibrant yellow poison dart frog perched on a rain-slicked jungle leaf in the deep Amazon rainforest, raindrops falling in slow motion with cinematic backlight, photorealistic 8k, moody atmosphere, 9:16 vertical video",
        description: "Khám phá loài ếch phi tiêu độc sặc sỡ tại rừng rậm nhiệt đới Amazon.",
        language: "vi",
        style: "Cinematic Documentary",
        duration: "8s",
        aspectRatio: "9:16",
        tags: JSON.stringify(["amazon", "dongvat", "khoahoc", "shorts", "veo3"]),
      },
    });

    await prisma.generation.create({
      data: {
        projectId: project1.id,
        contentId: content1.id,
        googleAccountId: accountA.id,
        prompt: content1.videoPrompt,
        model: "Veo 3.1 Quality",
        aspectRatio: "9:16",
        duration: "8s",
        status: "DRAFT",
        provider: "MANUAL_FLOW",
      },
    });

    const project2 = await prisma.project.create({
      data: {
        name: "Thám Hiểm Sao Hỏa 2099",
        description: "Phim ngắn viễn tưởng về phi hành gia đầu tiên tìm thấy tàn tích cổ trên Sao Hỏa.",
        contentType: "SHORT_FILM",
        topic: "Một phi hành gia đơn độc phát hiện thành phố cổ dưới lòng đất Sao Hỏa",
      },
    });

    const content2 = await prisma.content.create({
      data: {
        projectId: project2.id,
        title: "Dấu Tích Cổ Đại Sao Hỏa",
        concept: "Khoảnh khắc phi hành gia bước qua vòm hẻm núi khổng lồ và nhìn thấy các cột tháp phát quang bí ẩn.",
        script: "Cảnh quay flycam từ xa dần tiến gần bước chân phi hành gia cô độc giữa bão cát đỏ.",
        videoPrompt: "Epic cinematic wide shot of a lone astronaut in a futuristic white spacesuit walking through colossal red canyon arches on Mars, towering ancient alien ruins glowing faintly with blue bioluminescence in distance, cinematic sci-fi movie scene, photorealistic, 16:9",
        description: "Phim ngắn khoa học viễn tưởng khám phá tàn tích ngoài hành tinh trên Sao Hỏa.",
        language: "vi",
        style: "Sci-Fi Cinematic",
        duration: "8s",
        aspectRatio: "16:9",
        tags: JSON.stringify(["scifi", "mars", "space", "veo3"]),
      },
    });

    await prisma.generation.create({
      data: {
        projectId: project2.id,
        contentId: content2.id,
        googleAccountId: accountB.id,
        prompt: content2.videoPrompt,
        model: "Veo 3.1 Quality",
        aspectRatio: "16:9",
        duration: "8s",
        status: "DRAFT",
        provider: "MANUAL_FLOW",
      },
    });
  }

  console.log("Seeding Phase 2 completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
