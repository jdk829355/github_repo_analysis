import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('infrastructure setup', () => {
  const rootDir = path.resolve(__dirname, '../..');

  describe('docker-compose.yml', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');

    it('should exist', () => {
      expect(fs.existsSync(composePath)).toBe(true);
    });

    it('should define 4 services: next-app, worker, postgres, redis', () => {
      const content = fs.readFileSync(composePath, 'utf-8');
      expect(content).toContain('next-app:');
      expect(content).toContain('worker:');
      expect(content).toContain('postgres:');
      expect(content).toContain('redis:');
    });

    it('should have redis with appendonly yes', () => {
      const content = fs.readFileSync(composePath, 'utf-8');
      expect(content).toContain('--appendonly yes');
    });

    it('should pass docker compose config validation', () => {
      expect(() => {
        execSync('docker compose config', {
          cwd: rootDir,
          stdio: 'pipe',
          encoding: 'utf-8',
        });
      }).not.toThrow();
    });
  });

  describe('Dockerfile', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');

    it('should exist', () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
    });
  });

  describe('next.config.ts', () => {
    const configPath = path.join(rootDir, 'next.config.ts');

    it('should exist', () => {
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should have output standalone', () => {
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain("output: 'standalone'");
    });
  });

  describe('.env.example', () => {
    const envExamplePath = path.join(rootDir, '.env.example');

    it('should exist', () => {
      expect(fs.existsSync(envExamplePath)).toBe(true);
    });

    it('should contain required environment variables', () => {
      const content = fs.readFileSync(envExamplePath, 'utf-8');
      expect(content).toContain('GITHUB_TOKEN');
      expect(content).toContain('GEMINI_API_KEY');
      expect(content).toContain('DATABASE_URL');
      expect(content).toContain('REDIS_URL');
      expect(content).toContain('NEXT_PUBLIC_APP_URL');
    });
  });

  describe('directory structure', () => {
    const requiredDirs = [
      'app',
      'components',
      'lib',
      'services',
      'prompts',
      'schemas',
      'workers',
      'tests',
      'docker',
    ];

    it.each(requiredDirs)('should have %s directory', (dir) => {
      expect(fs.existsSync(path.join(rootDir, dir))).toBe(true);
    });
  });

  describe('next build', () => {
    it('should succeed', () => {
      expect(() => {
        execSync('npx next build', {
          cwd: rootDir,
          stdio: 'pipe',
          encoding: 'utf-8',
          env: {
            ...process.env,
            NODE_ENV: 'production',
            NEXT_TELEMETRY_DISABLED: '1',
          },
        });
      }).not.toThrow();
    }, 120000);
  });
});
