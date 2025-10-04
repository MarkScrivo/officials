import fs from 'fs';
import path from 'path';
import { ScrapeResult } from '../models/officials';

export class OutputFormatter {
  static formatJSON(result: ScrapeResult, pretty: boolean = true): string {
    if (pretty) {
      return JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result);
  }

  static formatSimpleJSON(result: ScrapeResult): string {
    if (!result.success || !result.data) {
      return JSON.stringify({ error: result.error }, null, 2);
    }

    const output = {
      school: result.data.school,
      game: {
        date: result.data.game.date,
        opponent: result.data.game.opponent,
        location: result.data.game.location,
        time: result.data.game.time
      },
      officials: result.data.officials
    };

    return JSON.stringify(output, null, 2);
  }

  static formatCSV(results: ScrapeResult[]): string {
    const headers = [
      'School',
      'Date',
      'Opponent',
      'Location',
      'Time',
      'Referee',
      'Line Judge',
      'Side Judge',
      'Umpire',
      'Back Judge',
      'Center Judge',
      'Linesman',
      'Field Judge',
      'Scraped At'
    ];

    const rows = results
      .filter(r => r.success && r.data)
      .map(r => {
        const data = r.data!;
        return [
          data.school,
          data.game.date || '',
          data.game.opponent || '',
          data.game.location || '',
          data.game.time || '',
          data.officials.referee || '',
          data.officials.lineJudge || '',
          data.officials.sideJudge || '',
          data.officials.umpire || '',
          data.officials.backJudge || '',
          data.officials.centerJudge || '',
          data.officials.linesman || '',
          data.officials.fieldJudge || '',
          data.scrapedAt
        ].map(field => `"${field}"`).join(',');
      });

    return [headers.join(','), ...rows].join('\n');
  }

  static saveToFile(
    result: ScrapeResult | ScrapeResult[],
    format: 'json' | 'csv' = 'json'
  ): string {
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filename: string;
    let content: string;

    if (format === 'csv') {
      filename = `officials-${timestamp}.csv`;
      const results = Array.isArray(result) ? result : [result];
      content = this.formatCSV(results);
    } else {
      filename = `officials-${timestamp}.json`;
      content = Array.isArray(result) 
        ? JSON.stringify(result, null, 2)
        : this.formatSimpleJSON(result as ScrapeResult);
    }

    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, content, 'utf-8');
    
    return filepath;
  }

  static printResult(result: ScrapeResult): void {
    if (!result.success) {
      console.error('\n❌ Scraping Failed');
      console.error(`Error: ${result.error}`);
      return;
    }

    if (!result.data) {
      console.log('\n⚠️ No game found on the specified date');
      return;
    }

    console.log('\n✅ Scraping Successful');
    console.log('=' .repeat(50));
    
    console.log('\n📅 Game Information:');
    console.log(`   School: ${result.data.school}`);
    console.log(`   Date: ${result.data.game.date || 'N/A'}`);
    console.log(`   Opponent: ${result.data.game.opponent || 'N/A'}`);
    console.log(`   Location: ${result.data.game.location || 'N/A'}`);
    console.log(`   Time: ${result.data.game.time || 'N/A'}`);
    
    console.log('\n👥 Officials:');
    const officials = result.data.officials;
    
    if (!officials || Object.keys(officials).length === 0) {
      console.log('   No officials data available for this game');
    } else {
      const positions = [
        { key: 'referee', label: 'Referee' },
        { key: 'lineJudge', label: 'Line Judge' },
        { key: 'sideJudge', label: 'Side Judge' },
        { key: 'umpire', label: 'Umpire' },
        { key: 'backJudge', label: 'Back Judge' },
        { key: 'centerJudge', label: 'Center Judge' },
        { key: 'linesman', label: 'Linesman' },
        { key: 'fieldJudge', label: 'Field Judge' }
      ];
      
      let hasOfficials = false;
      positions.forEach(pos => {
        const value = officials[pos.key as keyof typeof officials];
        if (value) {
          console.log(`   ${pos.label}: ${value}`);
          hasOfficials = true;
        }
      });
      
      if (!hasOfficials) {
        console.log('   No officials data available for this game');
      }
    }
    
    if (result.metadata) {
      console.log('\n⚙️ Metadata:');
      console.log(`   Processing Time: ${result.metadata.processingTime}ms`);
      console.log(`   URL: ${result.metadata.url}`);
    }
    
    console.log('=' .repeat(50));
  }
}