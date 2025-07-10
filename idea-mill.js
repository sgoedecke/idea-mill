// idea‑mill.js
const fs = require("fs/promises");
const YAML = require("yaml");
const { OpenAI } = require("openai");

/* ────────── config ────────── */
const TOKEN     = process.env.GITHUB_TOKEN;
const ENDPOINT  = "https://models.github.ai/inference";
const MODEL     = "openai/gpt-4o";
const PRIMER_YAML = "./primer.yaml";   // 500‑1000 trusted snippets
const N_SAMPLES = 6;                   // snippets per round
/* ──────────────────────────── */

const client = new OpenAI({ baseURL: ENDPOINT, apiKey: TOKEN });

/* util: pick k random elements of an array (no replacement) */
const sample = (arr, k) =>
  arr
    .map(v => ({ v, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, k)
    .map(o => o.v);

async function ask(messages, temperature = 0.7, responseFormat = null) {
  const requestOptions = {
    model: MODEL,
    temperature,
    top_p: 1.0,
    messages,
  };
  
  if (responseFormat === "json_object") {
    requestOptions.response_format = { type: "json_object" };
  }
  
  const res = await client.chat.completions.create(requestOptions);
  return res.choices[0].message.content.trim();
}

async function spinOnce(primerPool, targetProblem) {
  const primer = sample(primerPool, N_SAMPLES).join("\n• ");
  
  /* 1️⃣ identify interesting connections between mechanisms */
  console.log("🔍 Analyzing mechanism connections...");
  const question = await ask([
    {
      role: "system",
      content:
        "Given these mechanism snippets, identify ONE interesting connection, tension, or pattern across them. Focus on:\n" +
        "- Shared principles that work differently across domains\n" +
        "- Complementary strengths/weaknesses between mechanisms\n" +
        "- Unexpected similarities in how different systems handle constraints\n\n" +
        "Frame as: 'What's interesting about how X and Y both handle...' or 'Why do X and Y take opposite approaches to...' " +
        "Do NOT mention the target problem."
    },
    { 
      role: "user", 
      content: `Available mechanisms:\n• ${primer}` 
    },
  ]);

  /* 2️⃣ generate specific solutions using the mechanistic insights */
  console.log("💭 Generating solution ideas...");
  const ideas = await ask([
    {
      role: "system",
      content:
        "Given this observation about different mechanisms and a specific target problem, generate FIVE ways the mechanistic insights could address the problem. Be specific about implementation details."
    },
    {
      role: "user",
      content: `Target problem: ${targetProblem}\n\nMechanistic observation: ${question}\n\nAvailable mechanisms:\n• ${primer}`
    },
  ], 0.8);

  // console.log("ideas:", ideas);

  /* 3️⃣ rank them for relevance + plausibility, return JSON */
  console.log("📊 Ranking and evaluating ideas...");
  const rankingJSON = await ask(
    [
      {
        role: "system",
        content: 
          "Extract each complete idea from the previous response and rate it. For each idea, include the FULL description (not just a title) in the 'idea' field. " +
          "Rate 1-10 for:\n" +
          `- Relevance: How directly does this answer ${targetProblem}?\n` +
          "- Plausibility: How technically feasible given current knowledge?\n\n" +
          "Return valid JSON array format:\n" +
          '[{"idea":"[complete full description of idea 1]","relevance":7,"plausibility":4,"reasoning":"brief explanation"}, ' +
          '{"idea":"[complete full description of idea 2]","relevance":3,"plausibility":9,"reasoning":"brief explanation"}]'
      },
      { role: "user", content: ideas },
    ],
    0.2,
    "json_object"
  );

  let best;
  try {
    const parsed = JSON.parse(rankingJSON);
    
    // Handle different response formats
    let ideasArray;
    if (Array.isArray(parsed)) {
      ideasArray = parsed;
    } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
      ideasArray = parsed.ideas;
    } else if (parsed.results && Array.isArray(parsed.results)) {
      ideasArray = parsed.results;
    } else {
      // If it's a single object with idea properties, wrap it in an array
      ideasArray = [parsed];
    }
    
    // Sort ideas by (relevance + plausibility) descending, then take top 3
    const ranked = ideasArray
      .sort((a, b) => (b.relevance + b.plausibility) - (a.relevance + a.plausibility))
      .slice(0, 3)
      .map(item => item.idea + "Score: " + (item.relevance + item.plausibility)); // Append score for clarity
    best = ranked;
  } catch (error) {
    best = "(failed to parse ranking JSON), output was " + rankingJSON;
  }

  /* 4️⃣ publish (here we just log) */
  // console.log("\n� Mechanistic observation:", question);
  console.log("💡 Best ideas:", best);
}

async function main() {
  const primerText = await fs.readFile(PRIMER_YAML, "utf8");
  const primerPool = YAML.parse(primerText); // expects a YAML sequence
  
  // Usage examples:
  await spinOnce(primerPool, "Finding new ways to integrate LLM inference with GitHub - in particular, simple ideas that will resonate with many GitHub users");
  // await spinOnce(primerPool, "reducing latency in distributed database queries");  
  // await spinOnce(primerPool, "making CI/CD pipelines more resilient to failures");
}

main().catch((err) => {
  console.error("Idea‑mill encountered an error:", err);
});

