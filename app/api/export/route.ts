import { NextRequest } from "next/server";
import { chromium as playwrightChromium, type Browser } from "playwright-core";
import chromium from "@sparticuz/chromium";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const isLocal = process.env.NODE_ENV === "development";
    browserPromise = isLocal
      ? playwrightChromium.launch({
          channel: "chrome",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        })
      : chromium.executablePath().then((executablePath) =>
          playwrightChromium.launch({
            args: chromium.args,
            executablePath,
            headless: chromium.headless,
          })
        );
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    url?: string;
    html?: string;
    width: number;
    height: number;
    selector?: string;
  };

  const { url, html, width, height, selector = "#banner" } = body;

  if ((!url && !html) || !width || !height) {
    return new Response("Missing url/html, width, or height", { status: 400 });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewportSize({ width, height });

    const origin = req.nextUrl.origin;

    if (url) {
      const fullUrl = url.startsWith("http") ? url : `${origin}${url}`;
      await page.goto(fullUrl, { waitUntil: "networkidle" });
    } else if (html) {
      await page.setContent(html, {
        waitUntil: "networkidle",
      });
    }

    // 等字体加载完成
    await page.evaluate(() => document.fonts.ready);

    const target = selector
      ? await page.$(selector).then((el) => el ?? page)
      : page;

    const screenshot = await (target as import("playwright-core").Page | import("playwright-core").ElementHandle).screenshot({
      type: "png",
      scale: "device",
    });

    return new Response(screenshot, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "attachment; filename=template.png",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Export failed:", message);
    return new Response(`Export failed: ${message}`, { status: 500 });
  } finally {
    await page?.close();
  }
}
