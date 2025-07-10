#!/usr/bin/env node
// idea‑mill.js
const fs = require("fs/promises");
const YAML = require("yaml");
const { OpenAI } = require("openai");

/* ────────── default config ────────── */
const DEFAULT_TOKEN     = process.env.GITHUB_TOKEN;
const DEFAULT_ENDPOINT  = "https://models.github.ai/inference";
const DEFAULT_MODEL     = "openai/gpt-4o";
const DEFAULT_PRIMER_YAML = "./primer.yaml";   // 500‑1000 trusted snippets
const DEFAULT_N_SAMPLES = 6;                   // snippets per round
/* ──────────────────────────────────── */

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    token: DEFAULT_TOKEN,
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    primerFile: DEFAULT_PRIMER_YAML,
    samples: DEFAULT_N_SAMPLES,
    problem: null,
    temperature: 0.7,
    help: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        config.help = true;
        break;
      case '-v':
      case '--verbose':
        config.verbose = true;
        break;
      case '-m':
      case '--model':
        if (!nextArg) {
          console.error('Error: --model requires a value');
          process.exit(1);
        }
        config.model = nextArg;
        i++;
        break;
      case '-p':
      case '--problem':
        if (!nextArg) {
          console.error('Error: --problem requires a value');
          process.exit(1);
        }
        config.problem = nextArg;
        i++;
        break;
      case '-f':
      case '--primer-file':
        if (!nextArg) {
          console.error('Error: --primer-file requires a value');
          process.exit(1);
        }
        config.primerFile = nextArg;
        i++;
        break;
      case '-s':
      case '--samples':
        if (!nextArg || isNaN(parseInt(nextArg))) {
          console.error('Error: --samples requires a numeric value');
          process.exit(1);
        }
        config.samples = parseInt(nextArg);
        i++;
        break;
      case '-t':
      case '--temperature':
        if (!nextArg || isNaN(parseFloat(nextArg))) {
          console.error('Error: --temperature requires a numeric value');
          process.exit(1);
        }
        config.temperature = parseFloat(nextArg);
        i++;
        break;
      case '--token':
        if (!nextArg) {
          console.error('Error: --token requires a value');
          process.exit(1);
        }
        config.token = nextArg;
        i++;
        break;
      case '--endpoint':
        if (!nextArg) {
          console.error('Error: --endpoint requires a value');
          process.exit(1);
        }
        config.endpoint = nextArg;
        i++;
        break;
      default:
        // If it doesn't start with -, treat it as the problem statement
        if (!arg.startsWith('-') && !config.problem) {
          config.problem = arg;
        } else {
          console.error(`Error: Unknown option ${arg}`);
          process.exit(1);
        }
    }
  }

  return config;
}

function showHelp() {
  console.log(`
idea-mill - Generate innovative solutions by combining different mechanisms

USAGE:
    idea-mill [OPTIONS] [PROBLEM]

ARGUMENTS:
    PROBLEM    The problem statement to generate ideas for

OPTIONS:
    -h, --help                Show this help message
    -v, --verbose             Show detailed output including intermediate steps
    -m, --model MODEL         AI model to use (default: ${DEFAULT_MODEL})
    -p, --problem PROBLEM     Problem statement (alternative to positional argument)
    -f, --primer-file FILE    Path to primer YAML file (default: ${DEFAULT_PRIMER_YAML})
    -s, --samples N           Number of mechanism samples per round (default: ${DEFAULT_N_SAMPLES})
    -t, --temperature N       AI temperature 0.0-1.0 (default: 0.7)
    --token TOKEN             API token (default: GITHUB_TOKEN env var)
    --endpoint URL            API endpoint (default: ${DEFAULT_ENDPOINT})

EXAMPLES:
    idea-mill "improving developer productivity"
    idea-mill --model gpt-3.5-turbo --samples 8 "reducing cloud costs"
    idea-mill -p "making CI/CD more resilient" --temperature 0.9
    idea-mill --primer-file ./custom-primers.yaml "optimizing database queries"

ENVIRONMENT:
    GITHUB_TOKEN    Default API token for GitHub Models
`);
}

const config = parseArgs();

if (config.help) {
  showHelp();
  process.exit(0);
}

if (!config.problem) {
  console.error('Error: Problem statement is required. Use --help for usage information.');
  process.exit(1);
}

if (!config.token) {
  console.error('Error: API token is required. Set GITHUB_TOKEN environment variable or use --token.');
  process.exit(1);
}

const client = new OpenAI({ baseURL: config.endpoint, apiKey: config.token });

/* util: pick k random elements of an array (no replacement) */
const sample = (arr, k) =>
  arr
    .map(v => ({ v, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, k)
    .map(o => o.v);

async function ask(messages, temperature = config.temperature, responseFormat = null) {
  const requestOptions = {
    model: config.model,
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
  const primer = sample(primerPool, config.samples).join("\n• ");
  
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

  if (config.verbose) {
    console.log("🐛 Generated ideas:", ideas);
  }

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
    } else if (parsed.result && Array.isArray(parsed.result)) {
      ideasArray = parsed.result;
    } else {
      // If it's a single object with idea properties, wrap it in an array
      ideasArray = [parsed];
    }
    
    // Filter out items that don't have the required properties
    const validIdeas = ideasArray.filter(item => 
      item && 
      typeof item.idea === 'string' && 
      typeof item.relevance === 'number' && 
      typeof item.plausibility === 'number' &&
      !isNaN(item.relevance) &&
      !isNaN(item.plausibility)
    );
    
    if (validIdeas.length === 0) {
      best = ["No valid ideas found in response. Raw output: " + rankingJSON];
    } else {
      // Sort ideas by (relevance + plausibility) descending, then take top 3
      const ranked = validIdeas
        .sort((a, b) => (b.relevance + b.plausibility) - (a.relevance + a.plausibility))
        .slice(0, 3)
        .map(item => {
          const score = item.relevance + item.plausibility;
          const reasoning = item.reasoning ? ` (${item.reasoning})` : '';
          return `${item.idea} [Score: ${score}/20]${reasoning}`;
        });
      best = ranked;
    }
  } catch (error) {
    best = [`Failed to parse ranking JSON: ${error.message}. Raw output: ${rankingJSON}`];
  }

  if (config.verbose) {
    console.log("🐛 Raw ranking JSON:", rankingJSON);
    console.log("🐛 Mechanistic observation:", question);
  }

  /* 4️⃣ publish (here we just log) */
  console.log("\n💡 Best ideas:");
  if (Array.isArray(best)) {
    best.forEach((idea, index) => {
      console.log(`\n${index + 1}. ${idea}`);
    });
  } else {
    console.log(best);
  }
  console.log("\n");
}

async function main() {
  try {
    const primerText = await fs.readFile(config.primerFile, "utf8");
    const primerPool = YAML.parse(primerText); // expects a YAML sequence
    
    if (!Array.isArray(primerPool)) {
      console.error(`Error: Primer file should contain a YAML array/sequence`);
      process.exit(1);
    }
    
    console.log(`📚 Loaded ${primerPool.length} primer mechanisms\n`);
    
    await spinOnce(primerPool, config.problem);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Error: Primer file '${config.primerFile}' not found`);
    } else if (error.name === 'YAMLParseError') {
      console.error(`Error: Invalid YAML in primer file '${config.primerFile}'`);
    } else {
      console.error(`Error reading primer file: ${error.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Idea‑mill encountered an error:", err);
});

