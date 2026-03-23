export async function saveTestResult(run_id, test_id, output, is_passed, results) {
  await prisma.testResult.create({
    data: {
      id: test_id,
      run_id: run_id,
      prompt: "...", // прокинь из конфига
      output,
      is_passed,
      results: results as any, 
    }
  });
}
