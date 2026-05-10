import {
  filterCommits,
  isMergeCommit,
  isMeaningfulCommit,
} from '../../lib/commit-filter';

describe('commit-filter', () => {
  describe('isMergeCommit', () => {
    it('should return true for merge commits', () => {
      expect(isMergeCommit('Merge pull request #123 from feature branch')).toBe(true);
      expect(isMergeCommit('Merge branch main into feature')).toBe(true);
      expect(isMergeCommit('merged with develop')).toBe(true);
    });

    it('should return false for non-merge commits', () => {
      expect(isMergeCommit('Add new feature')).toBe(false);
      expect(isMergeCommit('Fix bug in auth')).toBe(false);
    });
  });

  describe('isMeaningfulCommit', () => {
    describe('regex patterns from PRD Section 5.5', () => {
      it('should filter ^merge pattern', () => {
        expect(isMeaningfulCommit('merge pull request')).toBe(false);
      });

      it('should filter ^merged pattern', () => {
        expect(isMeaningfulCommit('merged branch feature')).toBe(false);
      });

      it('should filter ^typo pattern', () => {
        expect(isMeaningfulCommit('typo fix')).toBe(false);
        expect(isMeaningfulCommit('typo: fixed in README')).toBe(false);
      });

      it('should filter ^fix lint pattern', () => {
        expect(isMeaningfulCommit('fix lint errors')).toBe(false);
        expect(isMeaningfulCommit('fix lint: removed unused import')).toBe(false);
      });

      it('should filter ^lint pattern', () => {
        expect(isMeaningfulCommit('lint: run linter')).toBe(false);
        expect(isMeaningfulCommit('lint fix')).toBe(false);
      });

      it('should filter ^format pattern', () => {
        expect(isMeaningfulCommit('format code')).toBe(false);
        expect(isMeaningfulCommit('format: apply prettier')).toBe(false);
      });

      it('should filter ^prettier pattern', () => {
        expect(isMeaningfulCommit('prettier run')).toBe(false);
        expect(isMeaningfulCommit('prettier: format files')).toBe(false);
      });

      it('should filter ^eslint pattern', () => {
        expect(isMeaningfulCommit('eslint --fix')).toBe(false);
        expect(isMeaningfulCommit('eslint: configure rules')).toBe(false);
      });

      it('should filter ^style pattern', () => {
        expect(isMeaningfulCommit('style: fix code style')).toBe(false);
        expect(isMeaningfulCommit('style fix')).toBe(false);
      });

      it('should filter ^docs pattern', () => {
        expect(isMeaningfulCommit('docs: update readme')).toBe(false);
        expect(isMeaningfulCommit('docs: add api docs')).toBe(false);
      });

      it('should filter ^doc pattern', () => {
        expect(isMeaningfulCommit('doc: add comments')).toBe(false);
        expect(isMeaningfulCommit('doc: update guide')).toBe(false);
      });

      it('should filter ^readme pattern', () => {
        expect(isMeaningfulCommit('readme: add installation')).toBe(false);
        expect(isMeaningfulCommit('readme update')).toBe(false);
      });

      it('should filter ^bump pattern', () => {
        expect(isMeaningfulCommit('bump version to 1.0.0')).toBe(false);
        expect(isMeaningfulCommit('bump dependencies')).toBe(false);
      });

      it('should filter ^chore pattern', () => {
        expect(isMeaningfulCommit('chore: update deps')).toBe(false);
        expect(isMeaningfulCommit('chore: cleanup')).toBe(false);
      });

      it('should filter ^update dependency pattern', () => {
        expect(isMeaningfulCommit('update dependency lodash')).toBe(false);
        expect(isMeaningfulCommit('update dependencies')).toBe(false);
      });

      it('should filter ^dependabot pattern', () => {
        expect(isMeaningfulCommit('dependabot: bump lodash')).toBe(false);
        expect(isMeaningfulCommit('dependabot fix')).toBe(false);
      });

      it('should filter ^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2} pattern', () => {
        expect(isMeaningfulCommit('2024-01-15 fix bug')).toBe(false);
        expect(isMeaningfulCommit('2024/05/20 update')).toBe(false);
        expect(isMeaningfulCommit('20231201 update')).toBe(true); // 8 digits is date-like
      });

      it('should filter ^[0-9]{6,8}$ pattern', () => {
        expect(isMeaningfulCommit('202401')).toBe(false);
        expect(isMeaningfulCommit('20240115')).toBe(false);
        expect(isMeaningfulCommit('123456789')).toBe(true); // 9 digits
      });

      it('should filter ^wip$ pattern', () => {
        expect(isMeaningfulCommit('wip')).toBe(false);
        expect(isMeaningfulCommit('WIP')).toBe(false);
      });

      it('should filter ^temp$ pattern', () => {
        expect(isMeaningfulCommit('temp')).toBe(false);
        expect(isMeaningfulCommit('temp ')).toBe(false);
      });
    });

    describe('additional filters', () => {
      it('should filter meaningless one-word commits', () => {
        expect(isMeaningfulCommit('fix')).toBe(false);
        expect(isMeaningfulCommit('update')).toBe(false);
        expect(isMeaningfulCommit('minor')).toBe(false);
        expect(isMeaningfulCommit('test')).toBe(false);
      });

      it('should filter dependency updates', () => {
        expect(isMeaningfulCommit('Update lodash to 4.17.21')).toBe(false);
        expect(isMeaningfulCommit('Bump react from 17.0.0 to 18.0.0')).toBe(false);
      });

      it('should filter archive/memo commits', () => {
        expect(isMeaningfulCommit('Archive old files')).toBe(false);
        expect(isMeaningfulCommit('Memo: meeting notes')).toBe(false);
      });

      it('should filter formatting-only commits', () => {
        expect(isMeaningfulCommit('Formatting')).toBe(false);
        expect(isMeaningfulCommit('Format only')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for empty string', () => {
        expect(isMeaningfulCommit('')).toBe(false);
      });

      it('should handle Unicode characters', () => {
        expect(isMeaningfulCommit('添加新功能')).toBe(true);
        expect(isMeaningfulCommit('fix: correção')).toBe(true);
      });

      it('should handle very long messages', () => {
        const longMessage = 'A'.repeat(1000);
        expect(isMeaningfulCommit(longMessage)).toBe(true);
      });
    });

    describe('positive cases', () => {
      it('should return true for meaningful commits', () => {
        expect(isMeaningfulCommit('Add user authentication with JWT')).toBe(true);
        expect(isMeaningfulCommit('Fix critical security vulnerability in login')).toBe(true);
        expect(isMeaningfulCommit('Implement ML model for recommendation system')).toBe(true);
        expect(isMeaningfulCommit('Refactor database schema for performance')).toBe(true);
      });
    });
  });

  describe('filterCommits', () => {
    it('should return empty array for empty input', () => {
      expect(filterCommits([])).toEqual([]);
    });

    it('should filter out merge commits', () => {
      const commits = [
        { message: 'Add feature A' },
        { message: 'Merge pull request #123' },
        { message: 'Fix bug in feature A' },
      ];
      const result = filterCommits(commits);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.message)).not.toContain('Merge pull request #123');
    });

    it('should filter out meaningless commits', () => {
      const commits = [
        { message: 'Add feature A' },
        { message: 'typo fix' },
        { message: 'Fix bug in feature A' },
      ];
      const result = filterCommits(commits);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.message)).not.toContain('typo fix');
    });

    it('should preserve commit objects', () => {
      const commits = [
        { message: 'Add feature A', sha: 'abc123' },
        { message: 'Fix bug', sha: 'def456' },
      ];
      const result = filterCommits(commits);
      expect(result).toEqual(commits);
    });
  });
});