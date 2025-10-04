import { PlaywrightFetcher } from './playwright-fetcher';
import { GeminiExtractor } from './gemini-extractor';
import { OpenAIExtractor } from './openai-extractor';
import { AnthropicExtractor } from './anthropic-extractor';
import { BaseExtractor } from './base-extractor';
import { SchoolConfigManager } from '../config/school-config';
import { ScrapeRequest, ScrapeResult } from '../models/officials';
import { PdfProcessor } from '../utils/pdf-processor';
import { config } from '../config/environment';

export class OfficialsScraper {
  private fetcher: PlaywrightFetcher;
  public extractor: BaseExtractor; // Made public for token tracking access
  private configManager: SchoolConfigManager;
  private pdfProcessor: PdfProcessor;

  constructor() {
    this.fetcher = new PlaywrightFetcher();
    
    // Select extractor based on provider configuration
    if (config.ai.provider === 'openai') {
      this.extractor = new OpenAIExtractor();
    } else if (config.ai.provider === 'anthropic') {
      this.extractor = new AnthropicExtractor();
    } else {
      this.extractor = new GeminiExtractor();
    }
    
    this.configManager = new SchoolConfigManager();
    this.pdfProcessor = new PdfProcessor();
  }

  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const startTime = Date.now();
    
    try {
      console.log(`\nStarting two-phase scrape for ${request.schoolDomain} - Game on ${request.gameDate}`);
      
      // PHASE 1: Find game and boxscore link on schedule page
      const scheduleUrl = this.configManager.buildScheduleUrl(
        request.schoolDomain,
        request.sport || 'football'
      );
      
      console.log(`Phase 1: Fetching schedule page: ${scheduleUrl}`);
      
      const waitSelector = this.configManager.getWaitSelector(request.schoolDomain);
      const schedulePageContent = await this.fetcher.fetchWithRetry(
        scheduleUrl,
        3,
        waitSelector
      );
      
      console.log(`Schedule page fetched: ${schedulePageContent.title}`);
      
      // Extract game link from schedule page
      const gameLinkResult = await this.extractor.extractGameLink(
        schedulePageContent.html,
        request.gameDate,
        request.schoolDomain
      );
      
      if (!gameLinkResult.success || !gameLinkResult.gameFound) {
        return {
          success: true,
          error: `No game found on ${request.gameDate} for ${request.schoolDomain}`
        };
      }
      
      const gameInfo = gameLinkResult.game!;
      let officialsData = null;
      
      // Check if we have a direct PDF link from the schedule page
      if (gameLinkResult.pdfUrl) {
        console.log(`Found direct PDF link from schedule page: ${gameLinkResult.pdfUrl}`);
        console.log(`Processing PDF directly...`);
        
        try {
          const pdfResult = await this.pdfProcessor.downloadAndExtractPdf(
            gameLinkResult.pdfUrl
          );
          
          if (pdfResult.success && pdfResult.text) {
            const pdfOfficials = await this.pdfProcessor.extractOfficialsFromPdfText(
              pdfResult.text,
              gameInfo.opponent || ''
            );
            
            if (Object.keys(pdfOfficials).length > 0) {
              officialsData = pdfOfficials;
              console.log(`Officials data extracted from PDF successfully`);
            } else {
              console.log(`No officials data found in PDF`);
            }
          } else {
            console.log(`Failed to extract text from PDF: ${pdfResult.error}`);
          }
        } catch (pdfError) {
          console.error(`PDF processing failed:`, pdfError);
        }
      }
      
      // PHASE 2: Navigate to boxscore page and extract officials (if no PDF data found)
      if (!officialsData && gameLinkResult.boxscoreUrl) {
        console.log(`Phase 2: Found boxscore URL: ${gameLinkResult.boxscoreUrl}`);
        console.log(`Fetching boxscore page...`);
        
        try {
          const boxscorePageContent = await this.fetcher.fetchWithRetry(
            gameLinkResult.boxscoreUrl,
            2
          );
          
          console.log(`Boxscore page fetched: ${boxscorePageContent.title}`);
          
          // Extract officials from boxscore page
          const officialsResult = await this.extractor.extractOfficialsFromBoxscore(
            boxscorePageContent.html,
            gameInfo.opponent || '',
            request.schoolDomain
          );
          
          if (officialsResult.success && officialsResult.officials) {
            officialsData = officialsResult.officials;
            console.log(`Officials data extracted successfully`);
          } else if (officialsResult.secondaryBoxscoreUrl) {
            // Found a secondary boxscore link - fetch and extract from there
            console.log(`Found secondary boxscore link, fetching: ${officialsResult.secondaryBoxscoreUrl}`);
            
            try {
              const secondaryBoxscoreContent = await this.fetcher.fetchWithRetry(
                officialsResult.secondaryBoxscoreUrl,
                2
              );
              
              console.log(`Secondary boxscore page fetched: ${secondaryBoxscoreContent.title}`);
              
              // Extract officials from the secondary boxscore page
              const secondaryOfficialsResult = await this.extractor.extractOfficialsFromBoxscore(
                secondaryBoxscoreContent.html,
                gameInfo.opponent || '',
                request.schoolDomain
              );
              
              if (secondaryOfficialsResult.success && secondaryOfficialsResult.officials) {
                officialsData = secondaryOfficialsResult.officials;
                console.log(`Officials data extracted from secondary boxscore successfully`);
              } else {
                console.log(`No officials data found on secondary boxscore page either`);
              }
              
            } catch (secondaryError) {
              console.error(`Failed to fetch secondary boxscore page:`, secondaryError);
            }
          } else {
            console.log(`No officials data found on boxscore page, looking for PDF...`);
            
            // PHASE 3: Look for PDF boxscore if no officials found on main page
            const pdfLinkResult = await this.extractor.extractPdfLink(
              boxscorePageContent.html,
              gameInfo.opponent || ''
            );
            
            if (pdfLinkResult.success && pdfLinkResult.pdfFound && pdfLinkResult.pdfUrl) {
              console.log(`Phase 3: Found PDF boxscore: ${pdfLinkResult.pdfUrl}`);
              console.log(`Downloading and processing PDF...`);
              
              try {
                const pdfResult = await this.pdfProcessor.downloadAndExtractPdf(
                  pdfLinkResult.pdfUrl
                );
                
                if (pdfResult.success && pdfResult.text) {
                  // Extract officials from PDF text using regex patterns
                  const pdfOfficials = await this.pdfProcessor.extractOfficialsFromPdfText(
                    pdfResult.text,
                    gameInfo.opponent || ''
                  );
                  
                  if (Object.keys(pdfOfficials).length > 0) {
                    officialsData = pdfOfficials;
                    console.log(`Officials data extracted from PDF successfully`);
                  } else {
                    console.log(`No officials data found in PDF`);
                  }
                } else {
                  console.log(`Failed to extract text from PDF: ${pdfResult.error}`);
                }
              } catch (pdfError) {
                console.error(`PDF processing failed:`, pdfError);
              }
            } else {
              console.log(`No PDF boxscore found`);
            }
          }
        } catch (boxscoreError) {
          console.error(`Failed to fetch/extract from boxscore page:`, boxscoreError);
          // Continue without officials data
        }
      } else if (!officialsData) {
        console.log(`No boxscore URL found and no PDF data, attempting to extract from schedule page...`);
        
        // Fallback: Try to extract officials from schedule page
        const scheduleExtraction = await this.extractor.extractOfficials(
          schedulePageContent.html,
          request.gameDate,
          request.schoolDomain
        );
        
        if (scheduleExtraction.success && scheduleExtraction.officials) {
          officialsData = scheduleExtraction.officials;
        }
      }
      
      // Get school name
      const schoolName = this.configManager.getSchoolName(request.schoolDomain);
      
      // Build result
      const result: ScrapeResult = {
        success: true,
        data: {
          game: {
            ...gameInfo,
            boxscoreUrl: gameLinkResult.boxscoreUrl
          },
          officials: officialsData || {},
          school: schoolName,
          scrapedAt: new Date().toISOString()
        },
        metadata: {
          url: gameLinkResult.pdfUrl || gameLinkResult.boxscoreUrl || scheduleUrl,
          processingTime: Date.now() - startTime
        }
      };
      
      console.log(`Scrape completed in ${result.metadata?.processingTime}ms`);
      
      // Print token usage summary
      this.extractor.tokenTracker.printSummary();
      
      return result;
      
    } catch (error) {
      console.error('Scrape error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          url: this.configManager.buildScheduleUrl(request.schoolDomain),
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  async close(): Promise<void> {
    await this.fetcher.close();
    this.pdfProcessor.cleanup();
  }

  // Helper method to format date consistently
  formatDate(date: string): string {
    // Handle various date formats and convert to MM/DD/YY
    const parts = date.split(/[\/\-\.]/);
    
    if (parts.length === 3) {
      let month = parts[0].padStart(2, '0');
      let day = parts[1].padStart(2, '0');
      let year = parts[2];
      
      // Handle 4-digit year
      if (year.length === 4) {
        year = year.substring(2);
      }
      
      return `${month}/${day}/${year}`;
    }
    
    return date; // Return as-is if format is unrecognized
  }

  // Method to scrape multiple games
  async scrapeMultiple(
    schoolDomain: string,
    gameDates: string[]
  ): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    for (const date of gameDates) {
      console.log(`\nProcessing game on ${date}...`);
      
      const result = await this.scrape({
        schoolDomain,
        gameDate: this.formatDate(date)
      });
      
      results.push(result);
      
      // Add delay between requests to be respectful
      if (gameDates.indexOf(date) < gameDates.length - 1) {
        console.log('Waiting 2 seconds before next request...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return results;
  }
}