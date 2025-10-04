import { GameOfficials, GameInfo, GameLinkExtractionResult } from '../models/officials';
import { TokenTracker } from '../utils/token-tracker';

export interface PdfLinkExtractionResult {
  success: boolean;
  pdfFound: boolean;
  pdfUrl?: string;
  error?: string;
}

export interface ExtractionResult {
  success: boolean;
  gameFound: boolean;
  game?: GameInfo;
  officials?: GameOfficials;
  secondaryBoxscoreUrl?: string;
  error?: string;
}

/**
 * Abstract base class for AI extractors (Gemini, OpenAI, etc.)
 */
export abstract class BaseExtractor {
  public tokenTracker: TokenTracker;

  constructor() {
    this.tokenTracker = new TokenTracker();
  }

  /**
   * Extract game link from schedule page HTML
   */
  abstract extractGameLink(
    htmlContent: string,
    targetDate: string,
    schoolDomain: string
  ): Promise<GameLinkExtractionResult>;

  /**
   * Extract officials from a game page HTML
   */
  abstract extractOfficials(
    htmlContent: string,
    targetDate: string,
    schoolDomain: string
  ): Promise<ExtractionResult>;

  /**
   * Extract officials from boxscore page HTML
   */
  abstract extractOfficialsFromBoxscore(
    htmlContent: string,
    opponent: string,
    schoolDomain: string
  ): Promise<ExtractionResult>;

  /**
   * Extract PDF link from boxscore page HTML
   */
  abstract extractPdfLink(
    htmlContent: string,
    opponent: string
  ): Promise<PdfLinkExtractionResult>;

  /**
   * Helper method to ensure URL is properly formatted
   */
  protected ensureAbsoluteUrl(url: string | undefined, baseUrl: string): string | undefined {
    if (!url) return undefined;
    
    // If it's already a full URL, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // If it starts with //, add https:
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    
    // If it's a relative URL, combine with base URL
    const base = new URL(baseUrl);
    if (url.startsWith('/')) {
      return `${base.origin}${url}`;
    }
    
    // For relative paths without leading slash
    return `${base.origin}/${url}`;
  }

  /**
   * Clean HTML content for processing
   */
  protected cleanHtml(html: string): string {
    // Remove script tags and their content
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove style tags and their content
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove excessive whitespace
    html = html.replace(/\s+/g, ' ');
    
    return html;
  }
}