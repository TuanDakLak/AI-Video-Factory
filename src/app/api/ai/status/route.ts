import { NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai";

export async function GET() {
  return NextResponse.json({
    isConfigured: aiProvider.isConfigured(),
    provider: aiProvider.name,
  });
}
