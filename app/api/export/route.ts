import { NextRequest } from "next/server";
import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const REMOTE_CHROMIUM_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const isLocal = process.env.NODE_ENV === "development";
    browserPromise = isLocal
      ? puppeteer.launch({
          channel: "chrome",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        })
      : chromium.executablePath(REMOTE_CHROMIUM_URL).then((executablePath) =>
          puppeteer.launch({
            args: chromium.args,
            executablePath,
            headless: true,
          }),
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
    params?: Record<string, string>;
    width: number;
    height: number;
    selector?: string;
  };

  const { url, html, params, width, height, selector = "#banner" } = body;

  if ((!url && !html) || !width || !height) {
    return new Response("Missing url/html, width, or height", { status: 400 });
  }

  let page: Awaited<ReturnType<Browser["newPage"]>> | undefined;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    const origin = req.nextUrl.origin;

    if (url) {
      const fullUrl = url.startsWith("http") ? url : `${origin}${url}`;
      await page.goto(fullUrl, { waitUntil: "networkidle0" });
    } else if (html) {
      await page.setContent(html, {
        waitUntil: "networkidle0",
      });
    }

    if (params && Object.keys(params).length > 0) {
      const searchStr = new URLSearchParams(params).toString();
      await page.evaluate((s: string) => {
        window.postMessage({ type: "mtds:update", search: s }, "*");
      }, searchStr);
      await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
    }

    await page.evaluate(() => document.fonts.ready);

    const el = selector ? await page.$(selector) : null;
    const target = el ?? page;

    const screenshot = await target.screenshot({ type: "png" });

    return new Response(Buffer.from(screenshot), {
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
