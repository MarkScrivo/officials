import fs from 'fs';
import path from 'path';

export interface SchoolConfig {
  name: string;
  scheduleUrl: string;
  waitForSelector?: string;
  sport?: string;
}

export interface SchoolsConfig {
  schools: Record<string, SchoolConfig>;
  defaultConfig: {
    waitForSelector: string;
    sport: string;
    timeout: number;
  };
}

export class SchoolConfigManager {
  private config!: SchoolsConfig;
  private configPath: string;

  constructor() {
    this.configPath = path.join(__dirname, 'schools.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);
    } catch (error) {
      console.error('Failed to load schools config:', error);
      // Use empty config as fallback
      this.config = {
        schools: {},
        defaultConfig: {
          waitForSelector: '.schedule, table',
          sport: 'football',
          timeout: 30000
        }
      };
    }
  }

  getSchoolConfig(domain: string): SchoolConfig | null {
    // Clean the domain (remove https://, www., etc.)
    const cleanDomain = this.cleanDomain(domain);
    
    // Check if we have a specific config for this school
    if (this.config.schools[cleanDomain]) {
      return this.config.schools[cleanDomain];
    }
    
    // Try to find a partial match
    const partialMatch = Object.keys(this.config.schools).find(key =>
      cleanDomain.includes(key) || key.includes(cleanDomain)
    );
    
    if (partialMatch) {
      return this.config.schools[partialMatch];
    }
    
    return null;
  }

  buildScheduleUrl(domain: string, sport: string = 'football'): string {
    const schoolConfig = this.getSchoolConfig(domain);
    
    if (schoolConfig?.scheduleUrl) {
      return schoolConfig.scheduleUrl;
    }
    
    // Build a generic URL if no config exists
    const cleanDomain = this.cleanDomain(domain);
    const protocol = cleanDomain.startsWith('localhost') ? 'http' : 'https';
    return `${protocol}://${cleanDomain}/sports/${sport}/schedule`;
  }

  getWaitSelector(domain: string): string {
    const schoolConfig = this.getSchoolConfig(domain);
    return schoolConfig?.waitForSelector || this.config.defaultConfig.waitForSelector;
  }

  private cleanDomain(domain: string): string {
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  addSchool(domain: string, config: SchoolConfig): void {
    const cleanDomain = this.cleanDomain(domain);
    this.config.schools[cleanDomain] = config;
    this.saveConfig();
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
      console.log('School configuration saved');
    } catch (error) {
      console.error('Failed to save schools config:', error);
    }
  }

  listSchools(): string[] {
    return Object.keys(this.config.schools);
  }

  getSchoolName(domain: string): string {
    const config = this.getSchoolConfig(domain);
    return config?.name || this.extractSchoolName(domain);
  }

  private extractSchoolName(domain: string): string {
    // Extract school name from domain
    const cleanDomain = this.cleanDomain(domain);
    const parts = cleanDomain.split('.');
    const name = parts[0]
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return name;
  }
}