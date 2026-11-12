const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Opens the print dialog once the receipt logo (if any) has loaded.
export async function printWhenReady(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (
    document.querySelector('[data-logo-state="loading"]') &&
    Date.now() < deadline
  ) {
    await sleep(100);
  }
  const img = document.querySelector(".receipt__logo img");
  if (img && !img.complete) {
    try {
      await Promise.race([
        img.decode(),
        sleep(Math.max(deadline - Date.now(), 0)),
      ]);
    } catch {
      // A failed logo must never block printing.
    }
  }
  window.print();
}
