const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({
    headless: true
    // slowMo: 100 // Uncomment to visualize test
  });
  const page = await browser.newPage();
  page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36"
  );

  for (let i = 0; i < 1000; i++) {
    // testnet "https://testnets.opensea.io/fr/assets/mumbai/0x07a11e9a2d219831d5b0695ab45d86a3af35c023/134"
    await page.goto(
      `https://opensea.io/fr/assets/matic/0x1d6f8ff4c5a4588dc95c8e1913e53a5007ad5378/${i}`
    );

    // Resize window to 1299 x 1282
    await page.setViewport({ width: 1299, height: 1282 });

    // Click on <button> "more_horiz"
    await page.waitForSelector('[aria-label="Plus"]');
    await page.click('[aria-label="Plus"]');

    // Click on <button> "cached Actualiser les mét..."
    await page.waitForSelector(".sc-d8be1725-0:nth-child(1) > .sc-b267fe84-0");
    await page.click(".sc-d8be1725-0:nth-child(1) > .sc-b267fe84-0");

    console.log(`Refreshed for ${i}`);
  }

  await browser.close();
})();
