import "dotenv/config";

async function test() {
  const key = process.env.GEMINI_API_KEY;
  console.log("Key:", key ? "set" : "none"); // never print any part of the key

  const sysInstruction = "You are a film director.";
  const promptText = "Give me a JSON object with title and scenes array.";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Content Factory",
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: sysInstruction },
          { role: "user", content: promptText }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });
    
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text.slice(0, 500));
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

test();
