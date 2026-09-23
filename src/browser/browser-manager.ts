import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "node:fs";

export interface LaunchOptions {
  headless: boolean;
  storageStatePath?: string;
}

export class BrowserManager {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;

  async launch(options: LaunchOptions): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    this.browser = await chromium.launch({ headless: options.headless });
    const hasStoredAuth = options.storageStatePath && existsSync(options.storageStatePath);
    this.context = await this.browser.newContext({
      storageState: hasStoredAuth ? options.storageStatePath : undefined,
      viewport: { width: 1440, height: 900 },
    });
    this.page = await this.context.newPage();
    return { browser: this.browser, context: this.context, page: this.page };
  }

  async saveStorageState(filePath: string): Promise<void> {
    if (!this.context) return;
    await this.context.storageState({ path: filePath });
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }
}
