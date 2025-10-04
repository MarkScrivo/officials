import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from '../config/environment';

export interface PageContent {
  html: string;
  screenshot?: Buffer;
  url: string;
  title: string;
}

export class PlaywrightFetcher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    console.log('Initializing Playwright browser...');
    const launchOptions: any = {
      headless: config.playwright.headless
    };

    // Use system Chromium in Docker/Alpine Linux
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      launchOptions.args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions'
      ];
      // Increase timeout for slower Cloud Run environment
      launchOptions.timeout = 60000; // 60 seconds to launch browser
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      javaScriptEnabled: true,
      // Bypass CSP that might block scripts
      bypassCSP: true,
      // Accept all permissions
      permissions: ['geolocation']
    });
  }

  async fetchPage(url: string, waitForSelector?: string): Promise<PageContent> {
    if (!this.browser || !this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();
    
    try {
      console.log(`Fetching page: ${url}`);

      // Listen for console messages and errors
      page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));
      page.on('pageerror', error => console.log(`PAGE ERROR: ${error.message}`));

      // Navigate to the page with timeout
      // Use 'load' instead of 'networkidle' which can timeout on busy sites
      await page.goto(url, {
        waitUntil: 'load',
        timeout: config.playwright.timeout
      });

      console.log(`Page loaded, URL is now: ${page.url()}`);

      // Wait for specific selector if provided
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, {
            timeout: 5000
          });
        } catch (error) {
          console.warn(`Selector "${waitForSelector}" not found, continuing anyway`);
        }
      }

      // Wait for any dynamic content to load - increased for better reliability
      await page.waitForTimeout(5000); // Increased from 3000 to 5000
      
      // Try to wait for common schedule elements with longer timeout
      try {
        await page.waitForSelector('table, .schedule, .game, .event, .sidearm-schedule, .schedule-table', { timeout: 8000 });
      } catch {
        // Continue if no common elements found
      }
      
      // Additional wait for schedule pages to ensure dynamic content loads
      if (url.includes('schedule')) {
        console.log('Schedule page detected, waiting for content to fully load...');

        // Scroll down to trigger lazy loading with timeout protection
        console.log('Scrolling page to trigger lazy-loaded content...');
        try {
          await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
              let totalHeight = 0;
              const distance = 200;
              let scrollAttempts = 0;
              const maxAttempts = 50; // Max 50 scrolls = 5 seconds

              const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                scrollAttempts++;

                if (totalHeight >= scrollHeight || scrollAttempts >= maxAttempts) {
                  clearInterval(timer);
                  resolve();
                }
              }, 100);
            });
          });
          console.log('Scroll complete');
        } catch (scrollError) {
          console.warn('Scroll failed, continuing anyway:', scrollError);
        }

        await page.waitForTimeout(2000); // Wait for lazy-loaded content

        // Wait for actual game data to appear (looking for opponent names or game info)
        try {
          await page.waitForFunction(
            () => {
              const text = document.body.innerText;
              // Look for signs of actual game data (vs. just navigation)
              const hasGameContent = text.includes('vs.') ||
                                    text.includes('vs ') ||
                                    text.includes('@') ||
                                    /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text) || // Date pattern
                                    text.toLowerCase().includes('opponent');
              return hasGameContent;
            },
            { timeout: 10000 }
          );
          console.log('Schedule content detected and loaded');
        } catch (error) {
          console.warn('Timeout waiting for schedule content, trying to continue anyway');
        }

        // Debug: Check what content is available
        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log(`DEBUG: Body text length: ${bodyText.length} characters`);

        // Find where schedule content starts (skip navigation)
        const scheduleStartIndex = bodyText.toLowerCase().indexOf('schedule');
        const contentToShow = scheduleStartIndex > 0 ? bodyText.substring(scheduleStartIndex, scheduleStartIndex + 2000) : bodyText.substring(0, 2000);
        console.log(`DEBUG: Schedule section (2000 chars): ${contentToShow}`);

        // Look for any game-related text
        const hasVs = bodyText.includes('vs.') || bodyText.includes('vs ') || bodyText.includes('VS');
        const hasAt = bodyText.includes(' @ ') || bodyText.includes(' at ');
        const hasDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(bodyText);
        const hasOpponent = bodyText.toLowerCase().includes('opponent');
        console.log(`DEBUG: Has 'vs': ${hasVs}, Has '@': ${hasAt}, Has date: ${hasDate}, Has 'opponent': ${hasOpponent}`);
      }
      
      // For boxscore pages, wait for officials data specifically
      if (url.includes('boxscore')) {
        console.log('Boxscore page detected, waiting for officials data...');
        try {
          // Wait for officials content to load
          await page.waitForFunction(
            () => {
              const text = document.body.innerText.toLowerCase();
              return text.includes('referee') || text.includes('umpire') || text.includes('judge');
            },
            { timeout: 10000 }
          );
          console.log('Officials data detected on page');
        } catch (error) {
          console.warn('Officials data not detected, continuing anyway');
        }
      }

      // Get page content
      let html = await page.content();
      const title = await page.title();

      // Debug: Log HTML length for schedule pages
      if (url.includes('schedule')) {
        console.log(`DEBUG: HTML content length: ${html.length} bytes`);
        console.log(`DEBUG: HTML contains schedule table: ${html.includes('schedule')}`);
      }
      
      // For boxscore pages, also extract iframe content for stats
      if (url.includes('boxscore')) {
        console.log('Checking for stats iframes...');
        const iframes = await page.$$('iframe');
        
        for (const iframe of iframes) {
          const src = await iframe.getAttribute('src');
          if (src && src.includes('stats.')) {
            console.log(`Found stats iframe: ${src}`);
            try {
              const frame = await iframe.contentFrame();
              if (frame) {
                await frame.waitForLoadState('networkidle', { timeout: 10000 });
                const frameContent = await frame.content();
                
                // Append iframe content to main HTML
                html += '\n<!-- IFRAME CONTENT FROM ' + src + ' -->\n' + frameContent;
                console.log('Stats iframe content extracted successfully');
              }
            } catch (error) {
              console.warn(`Could not extract iframe content from ${src}:`, (error as Error).message);
            }
          }
        }
      }
      
      // Take screenshot for debugging/verification
      const screenshot = await page.screenshot({
        fullPage: true
      });

      return {
        html,
        screenshot,
        url: page.url(),
        title
      };
    } finally {
      await page.close();
    }
  }

  async fetchWithRetry(
    url: string,
    maxRetries: number = 3,
    waitForSelector?: string
  ): Promise<PageContent> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries} for ${url}`);
        return await this.fetchPage(url, waitForSelector);
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('Browser closed');
  }

  async captureFullPage(url: string): Promise<Buffer> {
    if (!this.browser || !this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();
    
    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: config.playwright.timeout
      });
      
      return await page.screenshot({
        fullPage: true
      });
    } finally {
      await page.close();
    }
  }
}