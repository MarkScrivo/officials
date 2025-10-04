import fs from 'fs';
import path from 'path';
import axios from 'axios';
import pdfParse from 'pdf-parse';
import { chromium, Browser, Page } from 'playwright';
const pdf2json = require('pdf2json');

export interface PdfProcessingResult {
  success: boolean;
  text?: string;
  error?: string;
}

export class PdfProcessor {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async downloadAndExtractPdf(pdfUrl: string, usePlaywright: boolean = false): Promise<PdfProcessingResult> {
    let tempFilePath: string | null = null;
    
    try {
      console.log(`Downloading PDF: ${pdfUrl}`);
      
      // Check if this looks like a document viewer URL that might need special handling
      if (pdfUrl.includes('/documents/') && pdfUrl.includes('.pdf')) {
        console.log('Detected possible document viewer, trying direct download first');
        
        // For URLs like https://domain.com/documents/uuid.pdf, try direct download first
        try {
          console.log('Attempting direct PDF download...');
          // Continue with direct download approach below
        } catch (viewerError) {
          console.log(`Direct download failed, will try browser approach: ${viewerError}`);
        }
      }
      
      // Download the PDF directly
      const response = await axios({
        method: 'GET',
        url: pdfUrl,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,application/octet-stream,*/*'
        }
      });

      // Save to temporary file
      const fileName = `boxscore_${Date.now()}.pdf`;
      tempFilePath = path.join(this.tempDir, fileName);
      fs.writeFileSync(tempFilePath, response.data as Buffer);

      console.log(`Response downloaded to: ${tempFilePath}`);
      
      // Check if we actually got HTML instead of PDF
      const fileContent = fs.readFileSync(tempFilePath, 'utf8');
      if (fileContent.includes('<!DOCTYPE html') || fileContent.includes('<html')) {
        console.log('Downloaded content is HTML (PDF viewer wrapper), extracting actual PDF URL...');
        
        // Look for the actual PDF URL in the HTML
        const pdfUrlMatch = fileContent.match(/src="([^"]*\.pdf[^"]*)"/i) || 
                           fileContent.match(/href="([^"]*\.pdf[^"]*)"/i) ||
                           fileContent.match(/url\(([^)]*\.pdf[^)]*)\)/i) ||
                           fileContent.match(/"([^"]*\/documents\/[^"]*\.pdf[^"]*)"/);
        
        if (pdfUrlMatch) {
          let actualPdfUrl = pdfUrlMatch[1];
          
          // Make it absolute if it's relative
          if (actualPdfUrl.startsWith('/')) {
            const baseUrl = new URL(pdfUrl).origin;
            actualPdfUrl = baseUrl + actualPdfUrl;
          }
          
          console.log(`Found potential PDF URL in HTML: ${actualPdfUrl}`);
          
          // Try downloading what we think is the actual PDF
          try {
            const pdfResponse = await axios({
              method: 'GET',
              url: actualPdfUrl,
              responseType: 'arraybuffer',
              timeout: 30000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/pdf,application/octet-stream,*/*'
              }
            });
            
            // Check if this is also HTML (nested wrapper)
            const downloadedContent = (pdfResponse.data as Buffer).toString('utf8', 0, 200);
            if (downloadedContent.includes('<!DOCTYPE html') || downloadedContent.includes('<html')) {
              console.log(`Extracted URL is also HTML (nested wrapper), using browser automation instead`);
              
              // Skip to browser automation for nested wrappers
              try {
                const viewerResult = await this.extractFromPdfViewer(pdfUrl);
                if (viewerResult.success && viewerResult.text) {
                  return viewerResult;
                }
              } catch (viewerError) {
                console.log(`Browser extraction also failed: ${viewerError}`);
              }
              
              return {
                success: false,
                error: 'Nested HTML wrappers detected, browser extraction failed'
              };
            }
            
            // Overwrite the temp file with actual PDF content
            fs.writeFileSync(tempFilePath, pdfResponse.data as Buffer);
            console.log(`Actual PDF downloaded successfully`);
            
          } catch (pdfDownloadError) {
            console.log(`Failed to download extracted PDF URL: ${pdfDownloadError}`);
            
            // Fall back to browser automation
            try {
              const viewerResult = await this.extractFromPdfViewer(pdfUrl);
              if (viewerResult.success && viewerResult.text) {
                return viewerResult;
              }
            } catch (viewerError) {
              console.log(`Browser extraction also failed: ${viewerError}`);
            }
            
            return {
              success: false,
              error: 'Could not download actual PDF content'
            };
          }
        } else {
          console.log('Could not find actual PDF URL in HTML wrapper');
          
          // Fall back to browser automation
          try {
            const viewerResult = await this.extractFromPdfViewer(pdfUrl);
            if (viewerResult.success && viewerResult.text) {
              return viewerResult;
            }
          } catch (viewerError) {
            console.log(`Browser extraction also failed: ${viewerError}`);
          }
          
          return {
            success: false,
            error: 'Could not find PDF in HTML wrapper'
          };
        }
      }
      
      // Try pdf-parse first
      try {
        const pdfBuffer = fs.readFileSync(tempFilePath);
        const pdfData = await pdfParse(pdfBuffer);
        
        if (pdfData.text && pdfData.text.length > 100) {
          console.log(`Extracted ${pdfData.text.length} characters from PDF using pdf-parse`);
          return {
            success: true,
            text: pdfData.text
          };
        }
      } catch (parseError) {
        console.log(`pdf-parse failed: ${parseError}`);
      }
      
      // Fallback to pdf2json
      try {
        const text = await this.extractWithPdf2Json(tempFilePath);
        if (text && text.length > 100) {
          console.log(`Extracted ${text.length} characters from PDF using pdf2json`);
          return {
            success: true,
            text: text
          };
        }
      } catch (pdf2jsonError) {
        console.log(`pdf2json also failed: ${pdf2jsonError}`);
      }
      
      return {
        success: false,
        error: 'Could not parse PDF with any available parser'
      };
    } catch (error) {
      console.error('PDF processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown PDF processing error'
      };
    } finally {
      // Clean up temporary file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`Cleaned up temporary file: ${tempFilePath}`);
        } catch (cleanupError) {
          console.warn('Failed to clean up temporary file:', cleanupError);
        }
      }
    }
  }

  private async extractWithPdf2Json(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const pdfParser = new pdf2json();
      
      pdfParser.on('pdfParser_dataError', (errData: any) => {
        reject(new Error(`PDF2Json parsing error: ${errData.parserError}`));
      });
      
      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          let text = '';
          
          // Extract text from all pages
          if (pdfData.formImage && pdfData.formImage.Pages) {
            for (const page of pdfData.formImage.Pages) {
              if (page.Texts) {
                for (const textItem of page.Texts) {
                  if (textItem.R) {
                    for (const run of textItem.R) {
                      if (run.T) {
                        // Decode URI encoded text
                        text += decodeURIComponent(run.T) + ' ';
                      }
                    }
                  }
                }
                text += '\n'; // New line between pages
              }
            }
          }
          
          resolve(text);
        } catch (error) {
          reject(error);
        }
      });
      
      // Load and parse the PDF
      pdfParser.loadPDF(filePath);
    });
  }

  private async extractFromPdfViewer(pdfUrl: string): Promise<PdfProcessingResult> {
    console.log('Attempting to extract PDF content using Playwright browser automation');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // Set a global timeout for the entire extraction process
    page.setDefaultTimeout(30000);
    
    try {
      // Navigate to the PDF URL
      console.log(`Navigating to PDF URL: ${pdfUrl}`);
      await page.goto(pdfUrl, {
        waitUntil: 'load',
        timeout: 60000
      });
      
      // Wait for PDF viewer to load - this is critical
      console.log('Waiting for PDF viewer to initialize...');
      await page.waitForTimeout(10000);
      
      // Check what actually loaded
      const pageTitle = await page.title();
      const pageUrl = await page.url();
      console.log(`Page loaded: ${pageTitle}`);
      console.log(`Final URL: ${pageUrl}`);
      
      // Look for PDF-specific elements first
      const hasPdfElements = await page.evaluate(() => {
        // Check for common PDF viewer indicators
        const indicators = [
          'canvas', // PDF.js renders to canvas
          'embed[type="application/pdf"]',
          'object[type="application/pdf"]',
          'iframe[src*="pdf"]',
          '.pdf-viewer',
          '.pdfViewer',
          '#viewer'
        ];
        
        return indicators.some(selector => document.querySelector(selector) !== null);
      });
      
      console.log(`PDF elements found: ${hasPdfElements}`);
      
      // If it's actually a PDF viewer, wait longer for content to render
      if (hasPdfElements) {
        console.log('PDF viewer detected, waiting for content rendering...');
        await page.waitForTimeout(12000); // Increased for better PDF rendering
        
        // Debug: Check what the page actually contains
        const pageContent = await page.content();
        console.log('Page content sample (first 500 chars):');
        console.log(pageContent.substring(0, 500));
        
        // Also look for any PDF-related iframes or embeds that might have loaded
        const pdfElements = await page.$$('iframe[src*="pdf"], embed[type*="pdf"], object[type*="pdf"], embed[src*="pdf"]');
        console.log(`Found ${pdfElements.length} PDF-specific elements after waiting`);
        
        // Debug: Log details about PDF elements
        for (let i = 0; i < pdfElements.length; i++) {
          const element = pdfElements[i];
          const tagName = await element.evaluate(el => el.tagName);
          const src = await element.getAttribute('src') || await element.getAttribute('data') || '';
          console.log(`PDF element ${i + 1}: ${tagName} with src: ${src}`);
        }
      }
      
      // Try to find and extract text from the PDF viewer
      let extractedText = '';
      
      // Method 0: First try to extract from embedded PDF viewer
      try {
        console.log('Looking for embedded PDF viewer first...');
        
        // Look for embedded PDF elements specifically
        const embeddedPDFs = await page.$$('iframe[src*="pdf"], embed[src*="pdf"], object[data*="pdf"]');
        console.log(`Found ${embeddedPDFs.length} embedded PDF elements`);
        
        for (const pdfElement of embeddedPDFs) {
          const tagName = await pdfElement.evaluate(el => el.tagName);
          const src = await pdfElement.getAttribute('src') || await pdfElement.getAttribute('data') || '';
          console.log(`Trying to extract from embedded ${tagName} with src: ${src}`);
          
          if (src && src.includes('.pdf')) {
            // Try to access the embedded PDF content
            try {
              if (tagName.toLowerCase() === 'iframe') {
                // For iframe, try to get its contentDocument
                const frame = await pdfElement.contentFrame();
                if (frame) {
                  console.log('Accessing embedded PDF iframe content...');
                  await frame.waitForTimeout(3000);
                  
                  // Try to extract text from the PDF iframe
                  const frameText = await frame.evaluate(() => {
                    // Try multiple approaches to get PDF text
                    const textLayers = document.querySelectorAll('.textLayer');
                    if (textLayers.length > 0) {
                      return Array.from(textLayers).map(layer => layer.textContent).join('\n');
                    }
                    
                    // Try to get all text content
                    return document.body.textContent || '';
                  });
                  
                  if (frameText && frameText.length > 1000 && frameText.toLowerCase().includes('official')) {
                    extractedText = frameText;
                    console.log(`Extracted ${frameText.length} characters from embedded PDF iframe`);
                    break;
                  }
                }
              } else if (tagName.toLowerCase() === 'embed' || tagName.toLowerCase() === 'object') {
                // For embed/object, the PDF might be rendered differently
                console.log(`Found ${tagName} element with PDF, trying direct download approach...`);
                
                // Try to download the actual PDF directly instead of navigating to it
                if (src !== pdfUrl && src.includes('.pdf')) {
                  console.log(`Found actual PDF URL in embedded object: ${src}`);
                  
                  try {
                    // Download the PDF directly using axios
                    const axios = require('axios');
                    const fs = require('fs');
                    const path = require('path');
                    
                    const pdfResponse = await axios({
                      method: 'GET',
                      url: src,
                      responseType: 'arraybuffer',
                      timeout: 30000,
                      headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/pdf,application/octet-stream,*/*'
                      }
                    });
                    
                    // Save the PDF temporarily
                    const tempPdfPath = path.join(this.tempDir, `embedded_${Date.now()}.pdf`);
                    fs.writeFileSync(tempPdfPath, pdfResponse.data as Buffer);
                    console.log(`Downloaded embedded PDF to: ${tempPdfPath}`);
                    
                    // Try to parse the downloaded PDF
                    try {
                      const pdfParse = require('pdf-parse');
                      const pdfBuffer = fs.readFileSync(tempPdfPath);
                      const pdfData = await pdfParse(pdfBuffer);
                      
                      if (pdfData.text && pdfData.text.length > 100) {
                        extractedText = pdfData.text;
                        console.log(`Extracted ${pdfData.text.length} characters from downloaded embedded PDF`);
                        
                        // Clean up temp file
                        try {
                          fs.unlinkSync(tempPdfPath);
                        } catch (cleanupError) {
                          console.warn('Failed to clean up embedded PDF temp file:', cleanupError);
                        }
                        
                        break;
                      }
                    } catch (parseError) {
                      console.log(`Failed to parse downloaded embedded PDF: ${parseError}`);
                      
                      // Clean up temp file
                      try {
                        fs.unlinkSync(tempPdfPath);
                      } catch (cleanupError) {
                        console.warn('Failed to clean up embedded PDF temp file:', cleanupError);
                      }
                    }
                    
                  } catch (downloadError) {
                    console.log(`Failed to download embedded PDF: ${downloadError}`);
                  }
                }
              }
            } catch (embeddedError) {
              console.log(`Failed to extract from embedded element: ${embeddedError}`);
            }
          }
        }
      } catch (embeddedError) {
        console.log('Embedded PDF extraction failed:', embeddedError);
      }
      
      // Method 1: Try main page PDF.js extraction if embedded extraction failed
      if (!extractedText) {
        try {
          console.log('Embedded extraction failed, trying main page PDF.js extraction...');
        
          // Look for PDF.js text layers directly on main page
          const mainPageTextLayers = await page.$$('.textLayer');
          if (mainPageTextLayers.length > 0) {
            const mainPageText = await page.$$eval('.textLayer', layers => 
              layers.map(layer => layer.textContent).filter(t => t).join('\n')
            );
            if (mainPageText && mainPageText.length > 1000) {
              extractedText = mainPageText;
              console.log(`Extracted ${mainPageText.length} characters from main page PDF.js text layers`);
            }
          }
          
          // Try other main page selectors if text layers didn't work
          if (!extractedText) {
            const mainPageSelectors = [
              '.page .textLayer span',
              '.pdfViewer .page',
              '[data-page-number] .textLayer',
              'span[data-canvas-width]'
            ];
            
            for (const selector of mainPageSelectors) {
              try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                  const selectorText = await page.$$eval(selector, els => 
                    els.map(el => el.textContent).filter(t => t && t.trim().length > 2).join(' ')
                  );
                  if (selectorText && selectorText.length > 1000) {
                    extractedText = selectorText;
                    console.log(`Extracted ${selectorText.length} characters from main page using selector: ${selector}`);
                    break;
                  }
                }
              } catch (e) {
                // Continue to next selector
              }
            }
          }
        } catch (mainPageError) {
          console.log('Main page extraction failed:', mainPageError);
        }
      }
      
      // Method 2: Look for iframe containing the PDF (only if previous methods failed)
      if (!extractedText) {
        try {
          console.log('Previous methods failed, checking for iframes...');
          const frames = page.frames();
          console.log(`Found ${frames.length} frames`);
        
        for (const frame of frames) {
          try {
            const frameUrl = frame.url();
            console.log(`Checking frame: ${frameUrl}`);
            
            // If frame URL contains PDF or looks like a PDF viewer (be more specific for actual PDF content)
            if ((frameUrl.includes('.pdf') && !frameUrl.includes('documents/') && !frameUrl.includes('bridge')) || 
                (frameUrl.includes('pdf') && frameUrl.includes('googleapis')) ||
                (frameUrl.includes('documents/') && frameUrl.includes('.pdf') && frameUrl !== pdfUrl)) {
              console.log(`Found potential PDF frame with different URL: ${frameUrl}`);
              
              // Wait for PDF content to render in iframe
              await frame.waitForTimeout(5000);
              
              // Try to find PDF.js text layers in the frame
              try {
                await frame.waitForSelector('.textLayer, .page, canvas', { timeout: 5000 });
                console.log('Found PDF rendering elements in frame');
                
                // Extract from text layers first
                const textLayers = await frame.$$('.textLayer');
                if (textLayers.length > 0) {
                  const layerText = await frame.$$eval('.textLayer', layers => 
                    layers.map(layer => layer.textContent).filter(t => t).join('\n')
                  );
                  if (layerText && layerText.length > 500) {
                    extractedText = layerText;
                    console.log(`Extracted ${layerText.length} characters from PDF.js text layers in iframe`);
                    break;
                  }
                }
                
                // Try other PDF.js selectors in frame
                const pdfSelectors = [
                  '.page .textLayer span',
                  '.pdfViewer .page',
                  '[data-page-number] .textLayer',
                  'span[data-canvas-width]'
                ];
                
                for (const selector of pdfSelectors) {
                  try {
                    const elements = await frame.$$(selector);
                    if (elements.length > 0) {
                      const selectorText = await frame.$$eval(selector, els => 
                        els.map(el => el.textContent).filter(t => t && t.trim().length > 2).join(' ')
                      );
                      if (selectorText && selectorText.length > extractedText.length && selectorText.length > 1000) {
                        extractedText = selectorText;
                        console.log(`Extracted ${selectorText.length} characters using selector: ${selector} in iframe`);
                        break;
                      }
                    }
                  } catch (e) {
                    // Continue to next selector
                  }
                }
              } catch (pdfWaitError) {
                console.log(`PDF elements not found in frame, trying general text extraction: ${pdfWaitError}`);
                
                // Fallback to general body text if no PDF.js elements found
                try {
                  await frame.waitForSelector('body', { timeout: 5000 });
                  const frameText = await frame.textContent('body');
                  
                  // Only use if it's substantial content and not just metadata
                  if (frameText && frameText.length > 1000 && !frameText.includes('Official Athletics Website')) {
                    extractedText = frameText;
                    console.log(`Extracted ${frameText.length} characters from iframe body (fallback)`);
                  }
                } catch (bodyError) {
                  console.log(`Frame body extraction failed: ${bodyError}`);
                }
              }
            }
          } catch (frameError) {
            console.log(`Frame extraction error: ${frameError}`);
          }
        }
        } catch (iframeError) {
          console.log('Iframe extraction failed:', iframeError);
        }
      }
      
      // Method 3: Look for text content in main page if iframe failed
      if (!extractedText) {
        try {
          await page.waitForSelector('body', { timeout: 10000 });
          const textContent = await page.textContent('body');
          if (textContent && textContent.length > 200) {
            extractedText = textContent;
          }
        } catch (textError) {
          console.log('Text content extraction failed:', textError);
        }
      }
      
      // Method 4: Try to access PDF.js viewer if it exists
      if (!extractedText) {
        try {
          // Look for PDF.js text layers
          const textLayers = await page.$$('.textLayer');
          console.log(`Found ${textLayers.length} text layers`);
          
          if (textLayers.length > 0) {
            const texts = await page.$$eval('.textLayer', layers => 
              layers.map(layer => layer.textContent).join('\n')
            );
            if (texts) {
              extractedText = texts;
              console.log(`Extracted ${texts.length} characters from PDF.js text layers`);
            }
          }
          
          // Also try other PDF.js selectors
          if (!extractedText) {
            const altSelectors = [
              '.page .textLayer',
              '.pdfViewer .page',
              '#viewer .page',
              'span[data-canvas-width]', // PDF.js text spans
            ];
            
            for (const selector of altSelectors) {
              try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                  const text = await page.$$eval(selector, els => 
                    els.map(el => el.textContent).filter(t => t).join(' ')
                  );
                  if (text && text.length > extractedText.length) {
                    extractedText = text;
                    console.log(`Extracted ${text.length} characters using selector: ${selector}`);
                  }
                }
              } catch (e) {
                // Continue to next selector
              }
            }
          }
          
        } catch (pdfJsError) {
          console.log('PDF.js extraction failed:', pdfJsError);
        }
      }
      
      // Method 5: Try to extract directly from embedded PDF object/embed tags
      if (!extractedText) {
        try {
          console.log('Looking for embedded PDF objects...');
          
          // Check for embed or object tags with PDF
          const embedElements = await page.$$('embed[type="application/pdf"], object[type="application/pdf"], iframe[src*="pdf"]');
          
          if (embedElements.length > 0) {
            console.log(`Found ${embedElements.length} embedded PDF elements`);
            
            // Wait a bit more for PDF to render
            await page.waitForTimeout(5000);
            
            // Try to access the PDF content through the embed/object
            for (const element of embedElements) {
              try {
                const src = await element.getAttribute('src') || await element.getAttribute('data');
                console.log(`Embedded PDF source: ${src}`);
                
                // If it's a direct PDF URL, we might need to fetch it differently
                if (src && src.includes('.pdf')) {
                  console.log('Found direct PDF embed, this might need separate handling');
                }
              } catch (e) {
                console.log('Error accessing embed element:', e);
              }
            }
          }
        } catch (embedError) {
          console.log('Embed extraction failed:', embedError);
        }
      }
      
      // Method 6: Try to find specific content patterns (enhanced)
      if (!extractedText) {
        try {
          console.log('Trying enhanced content pattern extraction...');
          
          // Look for all visible text elements, but be smarter about it
          const viewerContent = await page.evaluate(() => {
            // Get all text-containing elements
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: (node) => {
                  const text = node.textContent?.trim();
                  if (!text || text.length < 3) return NodeFilter.FILTER_REJECT;
                  
                  // Skip common navigation/header elements
                  const parent = node.parentElement;
                  if (!parent) return NodeFilter.FILTER_REJECT;
                  
                  const parentTag = parent.tagName?.toLowerCase();
                  if (['script', 'style', 'nav', 'header', 'footer'].includes(parentTag)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  
                  const parentClass = parent.className?.toLowerCase() || '';
                  if (parentClass.includes('navigation') || parentClass.includes('header') || parentClass.includes('menu')) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );
            
            let text = '';
            let node;
            while (node = walker.nextNode()) {
              const parent = node.parentElement;
              if (parent) {
                const style = getComputedStyle(parent);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                  text += node.textContent + ' ';
                }
              }
            }
            
            return text.trim();
          });
          
          // Only use if it's substantial content and looks like game data
          if (viewerContent && viewerContent.length > 1000) {
            // Look for game-related keywords to validate this is actual content
            const gameKeywords = ['referee', 'official', 'umpire', 'judge', 'purdue', 'boilermaker', 'score', 'quarter', 'yard', 'down'];
            const hasGameContent = gameKeywords.some(keyword => 
              viewerContent.toLowerCase().includes(keyword)
            );
            
            if (hasGameContent) {
              extractedText = viewerContent;
              console.log(`Extracted ${viewerContent.length} characters using enhanced pattern matching`);
            }
          }
        } catch (extractError) {
          console.log('Enhanced content extraction failed:', extractError);
        }
      }
      
      if (extractedText && extractedText.length > 100) {
        console.log(`Extracted ${extractedText.length} characters using browser automation`);
        return {
          success: true,
          text: extractedText
        };
      } else {
        return {
          success: false,
          error: 'No sufficient text content found in PDF viewer'
        };
      }
      
    } finally {
      await browser.close();
    }
  }

  async extractOfficialsFromPdfText(
    pdfText: string,
    opponent: string
  ): Promise<{ [key: string]: string }> {
    console.log(`\n=== PDF TEXT ANALYSIS ===`);
    console.log(`Total text length: ${pdfText.length} characters`);
    
    // Log a sample of the text to understand the format
    const sampleStart = Math.max(0, pdfText.toLowerCase().indexOf('official') - 100);
    const sampleEnd = Math.min(pdfText.length, sampleStart + 500);
    console.log(`Sample text around 'officials':`);
    console.log(pdfText.substring(sampleStart, sampleEnd));
    
    // Look for the word "officials" to find the section
    const officialsIndex = pdfText.toLowerCase().indexOf('officials');
    if (officialsIndex !== -1) {
      const officialsSection = pdfText.substring(officialsIndex, officialsIndex + 1000);
      console.log(`\n=== OFFICIALS SECTION ===`);
      console.log(officialsSection);
    }
    
    // Common patterns for officials in PDF boxscores
    const officialsPatterns = [
      /Referee[:\s]+([A-Za-z\s,\.]+)/i,
      /Line Judge[:\s]+([A-Za-z\s,\.]+)/i,
      /Side Judge[:\s]+([A-Za-z\s,\.]+)/i,
      /Umpire[:\s]+([A-Za-z\s,\.]+)/i,
      /Back Judge[:\s]+([A-Za-z\s,\.]+)/i,
      /Center Judge[:\s]+([A-Za-z\s,\.]+)/i,
      /Linesman[:\s]+([A-Za-z\s,\.]+)/i,
      /Field Judge[:\s]+([A-Za-z\s,\.]+)/i
    ];

    const officials: { [key: string]: string } = {};
    
    // Try to find officials section in the PDF text
    const lines = pdfText.split('\n');
    let officialsSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for officials section header
      if (line.toLowerCase().includes('officials') || 
          line.toLowerCase().includes('referee') ||
          line.toLowerCase().includes('game officials')) {
        officialsSection = true;
        
        // Process the next several lines for official names
        for (let j = i; j < Math.min(i + 15, lines.length); j++) {
          const officialLine = lines[j];
          
          // Try each pattern
          if (officialLine.toLowerCase().includes('referee')) {
            const match = officialLine.match(/referee[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.referee = this.cleanOfficialName(match[1]);
          }
          
          if (officialLine.toLowerCase().includes('line judge')) {
            const match = officialLine.match(/line judge[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.lineJudge = this.cleanOfficialName(match[1]);
          }
          
          if (officialLine.toLowerCase().includes('side judge')) {
            const match = officialLine.match(/side judge[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.sideJudge = this.cleanOfficialName(match[1]);
          }
          
          if (officialLine.toLowerCase().includes('umpire')) {
            const match = officialLine.match(/umpire[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.umpire = this.cleanOfficialName(match[1]);
          }
          
          if (officialLine.toLowerCase().includes('back judge')) {
            const match = officialLine.match(/back judge[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.backJudge = this.cleanOfficialName(match[1]);
          }
          
          if (officialLine.toLowerCase().includes('center judge')) {
            const match = officialLine.match(/center judge[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.centerJudge = this.cleanOfficialName(match[1]);
          }
          
          if (officialLine.toLowerCase().includes('linesman')) {
            const match = officialLine.match(/linesman[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.linesman = this.cleanOfficialName(match[1]);
          }
          
          if (officialLine.toLowerCase().includes('field judge')) {
            const match = officialLine.match(/field judge[:\s]+([A-Za-z\s,\.]+)/i);
            if (match) officials.fieldJudge = this.cleanOfficialName(match[1]);
          }
        }
        
        break;
      }
    }
    
    return officials;
  }

  private cleanOfficialName(name: string): string {
    // Remove everything after the next position title
    const stopWords = ['Referee', 'Line Judge', 'Side Judge', 'Umpire', 'Back Judge', 
                       'Center Judge', 'Linesman', 'Field Judge', 'Score Keeper', 'Clock'];
    
    let cleanName = name;
    for (const stopWord of stopWords) {
      const idx = cleanName.indexOf(stopWord);
      if (idx > 0) {
        cleanName = cleanName.substring(0, idx);
      }
    }
    
    // Clean up the extracted name
    cleanName = cleanName
      .trim()
      .replace(/[^\w\s,.-]/g, '') // Remove special characters except common name chars
      .replace(/\s+/g, ' '); // Normalize spaces
    
    // Handle "LastName,FirstName" format (no space after comma)
    if (cleanName.includes(',')) {
      const parts = cleanName.split(',');
      if (parts.length === 2) {
        // Reverse to "FirstName LastName"
        cleanName = `${parts[1].trim()} ${parts[0].trim()}`;
      }
    }
    
    return cleanName.trim();
  }

  cleanup(): void {
    // Clean up temp directory
    if (fs.existsSync(this.tempDir)) {
      try {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
        fs.rmdirSync(this.tempDir);
        console.log('Temp directory cleaned up');
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error);
      }
    }
  }
}