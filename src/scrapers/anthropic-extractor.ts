import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/environment';
import { GameOfficials, GameInfo, GameLinkExtractionResult } from '../models/officials';
import { BaseExtractor, ExtractionResult, PdfLinkExtractionResult } from './base-extractor';

export class AnthropicExtractor extends BaseExtractor {
  private client: Anthropic;
  private model: string;

  constructor() {
    super();
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
    this.model = config.anthropic.model;
  }

  /**
   * Track token usage from Anthropic response
   */
  private trackTokenUsage(usage: Anthropic.Usage | undefined, operation: string): void {
    if (usage) {
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      this.tokenTracker.trackUsage(inputTokens, outputTokens, this.model, operation);
    }
  }

  /**
   * Extract game link from schedule page HTML
   */
  async extractGameLink(
    htmlContent: string,
    targetDate: string,
    schoolDomain: string
  ): Promise<GameLinkExtractionResult> {
    try {
      console.log(`Looking for game link on schedule page for ${targetDate}`);
      
      const prompt = `You are analyzing a college football schedule page from ${schoolDomain}.

Your task is to:
1. Find the football game scheduled on ${targetDate} (format might be MM/DD/YY, September 6, 2025, 09/06/25, 9/6/25, or similar variations)
2. Extract the link to the boxscore, stats, or game details page
3. Also look for direct PDF boxscore links

IMPORTANT DATE MATCHING:
- The date ${targetDate} might appear as:
  - 09/06/25, 9/6/25, 09/06/2025, 9/6/2025
  - September 6, Sep 6, Saturday September 6
  - Sat, Sep 6
- Be flexible with date formats and look for partial matches
- If the date has leading zeros (09/06/25), also check without them (9/6/25)

Look for:
- HTML boxscore links containing words like "boxscore", "stats", "game", "details", "recap"
- PDF boxscore links (ending in .pdf or containing "pdf" in the URL)
- Links that appear to lead to more information about the specific game
- The link might be in href attributes or onclick handlers
- Common patterns: /stats/, /boxscore/, /game/, /recap/, /documents/

For the game on ${targetDate}, extract:
- Basic game information (date, opponent, location, time)
- The URL to the HTML boxscore or game details page
- The direct URL to PDF boxscore (if available)

Important:
- Look for BOTH HTML boxscore links AND PDF boxscore links
- PDF links often end with .pdf and may be in /documents/ folders
- If you find multiple links, extract both the HTML boxscore and PDF boxscore
- Look for links associated with the specific game date
- Be VERY flexible with date matching - dates can appear in many formats

Return the data as JSON with this structure:
{
  "gameFound": boolean,
  "date": string,
  "opponent": string,
  "location": string,
  "time": string,
  "boxscoreUrl": string (HTML boxscore URL),
  "pdfUrl": string (PDF boxscore URL if available)
}`;

      const cleanedHtml = this.cleanHtml(htmlContent);
      
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nHTML Content:\n${cleanedHtml.substring(0, 500000)}`
          }
        ]
      });

      this.trackTokenUsage(response.usage, 'Game Link Extraction');
      
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response format from Anthropic');
      }
      
      // Extract JSON from Claude's response (it might have extra text)
      let jsonText = content.text.trim();
      
      // Look for JSON between triple backticks
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      } else {
        // Look for JSON object directly
        const directJsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (directJsonMatch) {
          jsonText = directJsonMatch[0];
        }
      }
      
      const extractedData = JSON.parse(jsonText);
      
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

      if (boxscoreUrl) {
        boxscoreUrl = this.ensureAbsoluteUrl(boxscoreUrl, `https://${schoolDomain}`);
      }
      
      if (pdfUrl) {
        pdfUrl = this.ensureAbsoluteUrl(pdfUrl, `https://${schoolDomain}`);
      }

      return {
        success: true,
        gameFound: true,
        game: {
          date: extractedData.date,
          opponent: extractedData.opponent,
          location: extractedData.location,
          time: extractedData.time
        },
        boxscoreUrl,
        pdfUrl
      };

    } catch (error) {
      console.error('Game link extraction error:', error);
      return {
        success: false,
        gameFound: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract officials from a game page HTML
   */
  async extractOfficials(
    htmlContent: string,
    targetDate: string,
    schoolDomain: string
  ): Promise<ExtractionResult> {
    try {
      const prompt = `You are analyzing a college football page from ${schoolDomain}.

Extract the officials data for the game on ${targetDate}. Look for:
- Referee
- Line Judge
- Side Judge
- Umpire
- Back Judge
- Center Judge
- Linesman
- Field Judge

The officials might be listed in various formats (e.g., "Referee: John Smith" or in a table).
Some positions might not be listed - return null for missing positions.
Only extract actual names, not titles or descriptions.
If an official's name includes a number or crew designation, include it (e.g., "John Smith #15").

Return JSON with this structure:
{
  "gameFound": boolean,
  "officials": {
    "referee": string or null,
    "lineJudge": string or null,
    "sideJudge": string or null,
    "umpire": string or null,
    "backJudge": string or null,
    "centerJudge": string or null,
    "linesman": string or null,
    "fieldJudge": string or null
  }
}`;

      const cleanedHtml = this.cleanHtml(htmlContent);
      
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nHTML Content:\n${cleanedHtml.substring(0, 500000)}`
          }
        ]
      });

      this.trackTokenUsage(response.usage, 'Officials Extraction');
      
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response format from Anthropic');
      }
      
      // Extract JSON from Claude's response (it might have extra text)
      let jsonText = content.text.trim();
      
      // Look for JSON between triple backticks
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      } else {
        // Look for JSON object directly
        const directJsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (directJsonMatch) {
          jsonText = directJsonMatch[0];
        }
      }
      
      const extractedData = JSON.parse(jsonText);
      
      return {
        success: true,
        gameFound: extractedData.gameFound || false,
        officials: extractedData.officials
      };

    } catch (error) {
      console.error('Officials extraction error:', error);
      return {
        success: false,
        gameFound: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract officials from boxscore page HTML
   */
  async extractOfficialsFromBoxscore(
    htmlContent: string,
    opponent: string,
    schoolDomain: string
  ): Promise<ExtractionResult> {
    try {
      console.log(`Extracting officials from boxscore page for game vs ${opponent}`);
      
      // First check if officials are present
      const checkPrompt = `Check if this boxscore page contains officials data.
Look for sections mentioning "Officials", "Referee", "Umpire", "Judge", etc.
Also check if there are any links to secondary boxscore pages.

Look for links with text like:
- "Box Score"
- "Complete Box Score"
- "Full Stats"
- "Game Details"
- "PDF Box Score"
- Links to external stats sites (e.g., wmt.games, stats.ncaa.org)

Return JSON:
{
  "hasOfficials": boolean,
  "secondaryBoxscoreUrl": string or null (if found),
  "secondaryBoxscoreLinkText": string or null (the text of the link)
}`;

      const cleanedHtml = this.cleanHtml(htmlContent);
      
      const checkResponse = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `${checkPrompt}\n\nHTML Content:\n${cleanedHtml.substring(0, 500000)}`
          }
        ]
      });

      this.trackTokenUsage(checkResponse.usage, 'Secondary Boxscore Link Detection');
      
      const checkContent = checkResponse.content[0];
      if (checkContent.type !== 'text') {
        throw new Error('Unexpected response format from Anthropic');
      }
      
      const checkResult = JSON.parse(checkContent.text);
      
      // If there's a secondary boxscore URL, format it properly
      if (checkResult.secondaryBoxscoreUrl) {
        let secondaryUrl = checkResult.secondaryBoxscoreUrl;
        
        // Handle various URL formats
        if (!secondaryUrl.startsWith('http')) {
          // If it's a relative URL, build the full URL
          if (secondaryUrl.startsWith('/')) {
            const baseUrl = new URL(`https://${schoolDomain}`);
            secondaryUrl = `${baseUrl.origin}${secondaryUrl}`;
          } else if (secondaryUrl.startsWith('//')) {
            secondaryUrl = `https:${secondaryUrl}`;
          } else {
            // It might be a complete URL without protocol
            secondaryUrl = `https://${secondaryUrl}`;
          }
        }
        
        console.log(`Found secondary boxscore link: ${secondaryUrl} (${checkResult.secondaryBoxscoreLinkText})`);
        
        return {
          success: true,
          gameFound: true,
          secondaryBoxscoreUrl: secondaryUrl
        };
      }
      
      // If no secondary link but officials might be present, try to extract them
      if (checkResult.hasOfficials) {
        const extractPrompt = `Extract the officials data from this boxscore page for the game vs ${opponent}.

Look for:
- Referee
- Line Judge
- Side Judge
- Umpire
- Back Judge
- Center Judge
- Linesman
- Field Judge

Return JSON:
{
  "officials": {
    "referee": string or null,
    "lineJudge": string or null,
    "sideJudge": string or null,
    "umpire": string or null,
    "backJudge": string or null,
    "centerJudge": string or null,
    "linesman": string or null,
    "fieldJudge": string or null
  }
}`;

        const extractResponse = await this.client.messages.create({
          model: this.model,
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: `${extractPrompt}\n\nHTML Content:\n${cleanedHtml.substring(0, 500000)}`
            }
          ]
        });

        this.trackTokenUsage(extractResponse.usage, 'Boxscore Officials Extraction');
        
        const extractContent = extractResponse.content[0];
        if (extractContent.type !== 'text') {
          throw new Error('Unexpected response format from Anthropic');
        }
        
        const extractedData = JSON.parse(extractContent.text);
        
        return {
          success: true,
          gameFound: true,
          officials: extractedData.officials
        };
      }
      
      console.log('No officials found directly, checking for secondary boxscore links...');
      return {
        success: true,
        gameFound: true
      };

    } catch (error) {
      console.error('Boxscore officials extraction error:', error);
      return {
        success: false,
        gameFound: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract PDF link from boxscore page HTML
   */
  async extractPdfLink(
    htmlContent: string,
    opponent: string
  ): Promise<PdfLinkExtractionResult> {
    try {
      const prompt = `Find a PDF boxscore link on this page for the game vs ${opponent}.

Look for:
- Links ending in .pdf
- Links with "pdf" in the URL
- Links with text like "PDF", "Download", "Box Score (PDF)"
- Links in /documents/ folders
- iframe or embed tags with PDF sources

Return JSON:
{
  "pdfFound": boolean,
  "pdfUrl": string or null
}`;

      const cleanedHtml = this.cleanHtml(htmlContent);
      
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nHTML Content:\n${cleanedHtml.substring(0, 500000)}`
          }
        ]
      });

      this.trackTokenUsage(response.usage, 'PDF Link Extraction');
      
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response format from Anthropic');
      }
      
      // Extract JSON from Claude's response (it might have extra text)
      let jsonText = content.text.trim();
      
      // Look for JSON between triple backticks
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      } else {
        // Look for JSON object directly
        const directJsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (directJsonMatch) {
          jsonText = directJsonMatch[0];
        }
      }
      
      const extractedData = JSON.parse(jsonText);
      
      if (!extractedData.pdfFound) {
        return {
          success: true,
          pdfFound: false
        };
      }

      return {
        success: true,
        pdfFound: true,
        pdfUrl: extractedData.pdfUrl
      };

    } catch (error) {
      console.error('PDF link extraction error:', error);
      return {
        success: false,
        pdfFound: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}