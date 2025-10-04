import { GoogleGenerativeAI, GenerativeModel, SchemaType } from '@google/generative-ai';
import { config } from '../config/environment';
import { GameOfficials, GameInfo, OFFICIALS_SCHEMA, GameLinkExtractionResult } from '../models/officials';
import { BaseExtractor, ExtractionResult, PdfLinkExtractionResult } from './base-extractor';
import * as cheerio from 'cheerio';

export class GeminiExtractor extends BaseExtractor {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private gameLinkModel: GenerativeModel;

  constructor() {
    super();
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    
    // Model for extracting officials from boxscore pages
    this.model = this.genAI.getGenerativeModel({
      model: config.gemini.model,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            gameFound: {
              type: SchemaType.BOOLEAN,
              description: "Whether a game was found on the specified date"
            },
            game: {
              type: SchemaType.OBJECT,
              properties: {
                date: { type: SchemaType.STRING },
                homeTeam: { type: SchemaType.STRING, nullable: true },
                awayTeam: { type: SchemaType.STRING, nullable: true },
                opponent: { type: SchemaType.STRING },
                location: { type: SchemaType.STRING },
                time: { type: SchemaType.STRING }
              },
              nullable: true
            },
            officials: {
              type: SchemaType.OBJECT,
              properties: {
                referee: { type: SchemaType.STRING, nullable: true },
                lineJudge: { type: SchemaType.STRING, nullable: true },
                sideJudge: { type: SchemaType.STRING, nullable: true },
                umpire: { type: SchemaType.STRING, nullable: true },
                backJudge: { type: SchemaType.STRING, nullable: true },
                centerJudge: { type: SchemaType.STRING, nullable: true },
                linesman: { type: SchemaType.STRING, nullable: true },
                fieldJudge: { type: SchemaType.STRING, nullable: true }
              },
              nullable: true
            }
          },
          required: ["gameFound"]
        } as any
      }
    });

    // Model for extracting game links from schedule pages
    this.gameLinkModel = this.genAI.getGenerativeModel({
      model: config.gemini.model,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            gameFound: {
              type: SchemaType.BOOLEAN,
              description: "Whether a game was found on the specified date"
            },
            game: {
              type: SchemaType.OBJECT,
              properties: {
                date: { type: SchemaType.STRING },
                homeTeam: { type: SchemaType.STRING, nullable: true },
                awayTeam: { type: SchemaType.STRING, nullable: true },
                opponent: { type: SchemaType.STRING },
                location: { type: SchemaType.STRING, nullable: true },
                time: { type: SchemaType.STRING, nullable: true }
              },
              nullable: true
            },
            boxscoreUrl: {
              type: SchemaType.STRING,
              description: "URL to the boxscore or game details page",
              nullable: true
            },
            pdfUrl: {
              type: SchemaType.STRING,
              description: "Direct URL to PDF boxscore if available",
              nullable: true
            }
          },
          required: ["gameFound"]
        } as any
      }
    });
  }

  /**
   * Track token usage from Gemini response
   */
  private trackTokenUsage(response: any, operation: string): void {
    const usageMetadata = response.usageMetadata;
    if (usageMetadata) {
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;
      
      this.tokenTracker.trackUsage(
        inputTokens,
        outputTokens,
        config.gemini.model,
        operation
      );
    } else {
      console.log(`⚠️ No usage metadata available for ${operation}`);
    }
  }

  async extractPdfLink(
    htmlContent: string,
    opponent: string
  ): Promise<PdfLinkExtractionResult> {
    try {
      console.log(`Looking for PDF boxscore link for game vs ${opponent}`);

      // Preprocess HTML to reduce tokens
      const processedHtml = this.preprocessHtml(htmlContent, false);

      const prompt = `
You are analyzing a college football boxscore page looking for a PDF boxscore link.

Your task is to find a link to a PDF boxscore document that would contain detailed game information including officials data.

Look for:
- Links with "PDF", "pdf" in the text or URL
- Links containing words like "boxscore.pdf", "game.pdf", or similar
- Download links for boxscore documents
- Links that end with .pdf
- Common patterns: /pdf/, /downloads/, /boxscore/, with .pdf extension

Important:
- Return the actual PDF URL, not just any PDF link
- The PDF should be related to this specific game vs ${opponent}
- If multiple PDF links exist, prefer ones with "boxscore" in the name

Return a JSON object with:
- pdfFound: true/false
- pdfUrl: the URL to the PDF (if found)
`;

      const result = await this.genAI.getGenerativeModel({
        model: config.gemini.model,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              pdfFound: {
                type: SchemaType.BOOLEAN,
                description: "Whether a PDF boxscore was found"
              },
              pdfUrl: {
                type: SchemaType.STRING,
                description: "URL to the PDF boxscore",
                nullable: true
              }
            },
            required: ["pdfFound"]
          } as any
        }
      }).generateContent([prompt, processedHtml]);
      
      const response = await result.response;
      this.trackTokenUsage(response, 'PDF Link Extraction');
      const text = response.text();
      
      const extractedData = JSON.parse(text);
      
      if (!extractedData.pdfFound) {
        return {
          success: true,
          pdfFound: false
        };
      }

      // Ensure the PDF URL is properly formatted
      let pdfUrl = extractedData.pdfUrl;
      if (pdfUrl && !pdfUrl.startsWith('http')) {
        // Make it absolute if it's relative
        const baseUrl = 'https://purduesports.com'; // We can make this dynamic later
        pdfUrl = new URL(pdfUrl, baseUrl).href;
      }

      return {
        success: true,
        pdfFound: true,
        pdfUrl: pdfUrl
      };
    } catch (error) {
      console.error('PDF link extraction error:', error);
      return {
        success: false,
        pdfFound: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  /**
   * Preprocess HTML to reduce token usage by extracting only relevant content
   */
  private preprocessHtml(html: string, isSchedulePage: boolean = true): string {
    try {
      const originalLength = html.length;
      const $ = cheerio.load(html);

      // Remove script and style tags
      $('script, style, noscript').remove();

      // Remove navigation, header, footer
      $('nav, header, footer').remove();

      // Remove common ad containers
      $('[class*="ad-"], [id*="ad-"], [class*="advertisement"]').remove();

      // Remove SVG icons that take up space
      $('svg').remove();

      if (isSchedulePage) {
        // For schedule pages, try to extract only the schedule content
        let scheduleContent = '';

        // Look for schedule-specific elements
        const scheduleSelectors = [
          'table[class*="schedule"]',
          'div[class*="schedule"]',
          'section[class*="schedule"]',
          '.sidearm-schedule',
          '.schedule-table',
          '.s-table'
        ];

        for (const selector of scheduleSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            console.log(`📊 Found schedule content with selector: ${selector}`);
            scheduleContent = elements.first().html() || '';
            if (scheduleContent.length > 1000) { // Make sure we got meaningful content
              const processed = `<div class="schedule">${scheduleContent}</div>`;
              console.log(`📉 Reduced HTML from ${originalLength} to ${processed.length} bytes (${((1 - processed.length/originalLength) * 100).toFixed(1)}% reduction)`);
              return processed;
            }
          }
        }

        console.log('⚠️ No specific schedule element found, using body text extraction');
      }

      // If we couldn't find a specific schedule section, clean up the full page
      // but extract text content in a structured way
      const bodyText = $('body').text();
      const bodyHtml = $('body').html() || '';

      // Limit to reasonable size
      const maxLength = isSchedulePage ? 100000 : 150000;
      let result = bodyHtml;

      if (result.length > maxLength) {
        console.log(`⚠️ HTML still too large (${result.length} bytes), truncating to ${maxLength} bytes`);
        result = result.substring(0, maxLength);
      }

      console.log(`📉 Reduced HTML from ${originalLength} to ${result.length} bytes (${((1 - result.length/originalLength) * 100).toFixed(1)}% reduction)`);
      return result;

    } catch (error) {
      console.warn('HTML preprocessing failed, using truncated original:', error);
      // Fallback: just truncate
      const maxLength = isSchedulePage ? 100000 : 150000;
      if (html.length > maxLength) {
        console.log(`⚠️ Fallback truncation to ${maxLength} bytes`);
        return html.substring(0, maxLength);
      }
      return html;
    }
  }

  async extractGameLink(
    htmlContent: string,
    targetDate: string,
    schoolDomain: string
  ): Promise<GameLinkExtractionResult> {
    try {
      console.log(`Looking for game link on schedule page for ${targetDate}`);

      // Preprocess HTML to reduce tokens
      const processedHtml = this.preprocessHtml(htmlContent, true);

      const prompt = `
You are analyzing a college football schedule page from ${schoolDomain}.

Your task is to:
1. Find the football game scheduled on ${targetDate} (format might be MM/DD/YY, September 6, 2025, or similar variations)
2. Extract the link to the boxscore, stats, or game details page
3. Also look for direct PDF boxscore links

Look for:
- HTML boxscore links containing words like "boxscore", "stats", "game", "details", "recap"
- PDF boxscore links (ending in .pdf or containing "pdf" in the URL)
- Links that appear to lead to more information about the specific game
- The link might be in href attributes or onclick handlers
- Common patterns: /stats/, /boxscore/, /game/, /recap/, /documents/

For the game on ${targetDate}, extract:
- Basic game information (date, homeTeam, awayTeam, opponent, location, time)
- The URL to the HTML boxscore or game details page
- The direct URL to PDF boxscore (if available)

Important:
- Look for BOTH HTML boxscore links AND PDF boxscore links
- PDF links often end with .pdf and may be in /documents/ folders
- For purduesports.com, PDF URLs might look like: /documents/[uuid].pdf
- If you find multiple links, extract both the HTML boxscore and PDF boxscore
- Look for links associated with the specific game date

Return the data in the structured JSON format with both boxscoreUrl and pdfUrl fields.
`;

      const result = await this.gameLinkModel.generateContent([prompt, processedHtml]);
      const response = await result.response;
      this.trackTokenUsage(response, 'Game Link Extraction');
      const text = response.text();
      
      const extractedData = JSON.parse(text);
      
      if (!extractedData.gameFound) {
        return {
          success: true,
          gameFound: false,
          error: `No game found on ${targetDate}`
        };
      }

      // Ensure URLs are properly formatted
      let boxscoreUrl = extractedData.boxscoreUrl;
      let pdfUrl = extractedData.pdfUrl;
      const baseUrl = schoolDomain.startsWith('http') ? schoolDomain : `https://${schoolDomain}`;
      
      if (boxscoreUrl && !boxscoreUrl.startsWith('http')) {
        boxscoreUrl = new URL(boxscoreUrl, baseUrl).href;
      }
      
      if (pdfUrl && !pdfUrl.startsWith('http')) {
        pdfUrl = new URL(pdfUrl, baseUrl).href;
      }

      return {
        success: true,
        gameFound: true,
        game: extractedData.game,
        boxscoreUrl: boxscoreUrl,
        pdfUrl: pdfUrl
      };
    } catch (error) {
      console.error('Game link extraction error:', error);
      return {
        success: false,
        gameFound: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  async extractOfficials(
    htmlContent: string,
    targetDate: string,
    schoolDomain: string
  ): Promise<ExtractionResult> {
    try {
      console.log(`Extracting officials data for game on ${targetDate}`);

      // Preprocess HTML to reduce tokens
      const processedHtml = this.preprocessHtml(htmlContent, true);

      const prompt = this.buildPrompt(targetDate, schoolDomain);

      // Send HTML content to Gemini for extraction
      const result = await this.model.generateContent([prompt, processedHtml]);
      const response = await result.response;
      this.trackTokenUsage(response, 'Officials Extraction');
      const text = response.text();
      
      // Parse the JSON response
      const extractedData = JSON.parse(text);
      
      if (!extractedData.gameFound) {
        return {
          success: true,
          gameFound: false,
          error: `No game found on ${targetDate}`
        };
      }

      return {
        success: true,
        gameFound: true,
        game: extractedData.game,
        officials: extractedData.officials
      };
    } catch (error) {
      console.error('Extraction error:', error);
      return {
        success: false,
        gameFound: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  async extractWithScreenshot(
    htmlContent: string,
    screenshot: Buffer,
    targetDate: string,
    schoolDomain: string
  ): Promise<ExtractionResult> {
    try {
      console.log(`Extracting with screenshot for game on ${targetDate}`);
      
      const prompt = this.buildPrompt(targetDate, schoolDomain);
      
      // Convert screenshot to base64
      const imageData = {
        inlineData: {
          data: screenshot.toString('base64'),
          mimeType: 'image/png'
        }
      };
      
      // Send both HTML and screenshot to Gemini
      const result = await this.model.generateContent([
        prompt,
        imageData,
        `HTML Content for reference:\n${htmlContent.substring(0, 50000)}` // Limit HTML size
      ]);
      
      const response = await result.response;
      this.trackTokenUsage(response, 'Officials Extraction with Screenshot');
      const text = response.text();
      
      // Parse the JSON response
      const extractedData = JSON.parse(text);
      
      if (!extractedData.gameFound) {
        return {
          success: true,
          gameFound: false,
          error: `No game found on ${targetDate}`
        };
      }

      return {
        success: true,
        gameFound: true,
        game: extractedData.game,
        officials: extractedData.officials
      };
    } catch (error) {
      console.error('Extraction with screenshot error:', error);
      // Fallback to HTML-only extraction
      return this.extractOfficials(htmlContent, targetDate, schoolDomain);
    }
  }

  async extractOfficialsFromBoxscore(
    htmlContent: string,
    opponent: string,
    schoolDomain?: string
  ): Promise<ExtractionResult> {
    try {
      console.log(`Extracting officials from boxscore page for game vs ${opponent}`);

      // Preprocess HTML to reduce tokens
      const processedHtml = this.preprocessHtml(htmlContent, false);

      // First check if this page contains officials data directly
      const hasOfficials = processedHtml.toLowerCase().includes('official') &&
                          (processedHtml.toLowerCase().includes('referee') ||
                           processedHtml.toLowerCase().includes('umpire'));
      
      if (!hasOfficials) {
        // Check for secondary boxscore links
        console.log('No officials found directly, checking for secondary boxscore links...');
        
        const secondaryBoxscorePrompt = `
You are analyzing a college football game center or summary page.

Your task is to find links to more detailed boxscore or stats pages that might contain officials information.

Look for links with text or URLs containing:
- "Boxscore" or "Box Score"
- "Stats" or "Statistics" 
- "Game Stats"
- "Detailed Stats"
- "Full Boxscore"
- URLs containing "/stats/", "/boxscore/", "/game-stats/"

The game is against ${opponent}. Find the most relevant boxscore/stats link for this specific game.

Return a JSON object with:
- foundSecondaryLink: true/false
- boxscoreUrl: the URL to the detailed boxscore page (if found)
- linkText: the text of the link that was found
`;

        try {
          const secondaryLinkResult = await this.genAI.getGenerativeModel({
            model: config.gemini.model,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                  foundSecondaryLink: {
                    type: SchemaType.BOOLEAN,
                    description: "Whether a secondary boxscore link was found"
                  },
                  boxscoreUrl: {
                    type: SchemaType.STRING,
                    description: "URL to the detailed boxscore page",
                    nullable: true
                  },
                  linkText: {
                    type: SchemaType.STRING,
                    description: "Text of the link found",
                    nullable: true
                  }
                },
                required: ["foundSecondaryLink"]
              } as any
            }
          }).generateContent([secondaryBoxscorePrompt, processedHtml]);
          
          const linkResponse = await secondaryLinkResult.response;
          this.trackTokenUsage(linkResponse, 'Secondary Boxscore Link Detection');
          const linkData = JSON.parse(linkResponse.text());
          
          if (linkData.foundSecondaryLink && linkData.boxscoreUrl) {
            // Ensure URL is properly formatted
            let secondaryUrl = linkData.boxscoreUrl;
            if (secondaryUrl && !secondaryUrl.startsWith('http')) {
              // Make it absolute if it's relative
              const baseUrl = schoolDomain ? `https://${schoolDomain}` : `https://utsports.com`;
              secondaryUrl = new URL(secondaryUrl, baseUrl).href;
            }
            
            console.log(`Found secondary boxscore link: ${secondaryUrl} (${linkData.linkText})`);
            return {
              success: true,
              gameFound: true,
              secondaryBoxscoreUrl: secondaryUrl,
              game: { date: '', opponent },
              officials: undefined
            };
          }
          
        } catch (linkError) {
          console.log('Secondary link detection failed:', linkError);
        }
      }
      
      const prompt = `
You are analyzing a college football boxscore/game details page.

Your task is to extract the game officials information from this page.

Look for officials data which is typically found:
- At the bottom of the boxscore page
- In a section labeled "Officials" or "Game Officials"
- As a list with format like "Referee: Name" or "Referee: LastName,FirstName"
- Sometimes in a simple comma-separated list

Extract the following officials (if available):
- Referee
- Line Judge
- Side Judge
- Umpire
- Back Judge
- Center Judge
- Linesman
- Field Judge

Important notes:
- Officials are often listed as "LastName,FirstName" or "FirstName LastName"
- Clean up the formatting to be consistent (prefer "FirstName LastName")
- Some positions might not be listed - return null for those
- Only extract actual names, not numbers or crew designations unless part of the name
- If you see a format like "DeBerry,Darryl" convert it to "Darryl DeBerry"

Return the data in the structured JSON format.
`;

      const result = await this.model.generateContent([prompt, processedHtml]);
      const response = await result.response;
      this.trackTokenUsage(response, 'Boxscore Officials Extraction');
      const text = response.text();
      
      const extractedData = JSON.parse(text);
      
      // Format the officials names properly
      if (extractedData.officials) {
        Object.keys(extractedData.officials).forEach(key => {
          const name = extractedData.officials[key];
          if (name && !name.includes(',') && name.includes(' ')) {
            // Convert "FirstName LastName" to "LastName,FirstName"
            const parts = name.split(' ');
            if (parts.length === 2) {
              extractedData.officials[key] = `${parts[1].trim()},${parts[0].trim()}`;
            }
          }
        });
      }

      return {
        success: true,
        gameFound: true,
        game: extractedData.game || { date: '', opponent },
        officials: extractedData.officials
      };
    } catch (error) {
      console.error('Officials extraction from boxscore error:', error);
      return {
        success: false,
        gameFound: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  private buildPrompt(targetDate: string, schoolDomain: string): string {
    return `
You are analyzing a college football schedule page from ${schoolDomain}.

Your task is to:
1. Find the football game scheduled on ${targetDate} (format might be MM/DD/YY or similar variations)
2. Extract the game officials information if available

For the game on ${targetDate}, extract:
- Game information (date, homeTeam, awayTeam, opponent, location, time)
- Officials data:
  - Referee
  - Line Judge
  - Side Judge
  - Umpire
  - Back Judge
  - Center Judge
  - Linesman
  - Field Judge

Important notes:
- The officials might be listed in various formats (e.g., "Referee: John Smith" or in a table)
- Some official positions might not be listed - that's okay, return null for missing positions
- Make sure to match the exact date ${targetDate}
- If no game is found on this date, set gameFound to false
- Only extract actual names, not titles or descriptions
- If an official's name includes a number or crew designation, include it (e.g., "John Smith #15")

Return the data in the structured JSON format as defined by the schema.
`;
  }
}