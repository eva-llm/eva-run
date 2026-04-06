const payload = {
  "run_id": "019d1fca-d42b-777c-b78b-a4e0af6efc96",
  "provider": "openai",
  "model": "gpt-5-mini",
  "prompt": "What is the capital of France?",
  "asserts": [
    {
      "name": "b-eval",
      "provider": "openai",
      "model": "gpt-4.1-mini",
      "criteria": "the answer should be relevant to the question"
    }
  ]
};

const BATCH_SIZE = 1000;
const ENDPOINT = 'http://localhost:3000/eval';

const batch = [];
for (let i = 0; i < BATCH_SIZE; i++) {
  batch.push({ ...payload, prompt: `Question #${i + 1}: What is the capital of France?` });
}

async function main() {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch)
  });

  console.log(await response.text());
}

main();
