import { PAIOSStorage } from '../../storage';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  type: 'task' | 'timeline' | 'capture' | 'journal' | 'medication' | 'studyCard' | 'general';
  raw?: any;
}

/**
 * SearchModeService
 * Dedicated, strictly read-only search service for Universal Command Bar.
 * Enforces zero-mutation invariant: can NEVER trigger transactions, actions, or state modifications.
 */
export class SearchModeService {
  /**
   * Performs read-only search across all local PAIOS storage stores.
   * Treats all inputs as plain text queries with zero side effects.
   */
  static async search(query: string): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const cleanQuery = query.trim();
    const rawResults = PAIOSStorage.globalSearch(cleanQuery);
    const items: SearchResultItem[] = [];

    // Tasks
    if (rawResults.tasks) {
      for (const t of rawResults.tasks) {
        items.push({
          id: `task-${t.id}`,
          title: t.title,
          subtitle: t.category ? `Category: ${t.category}` : undefined,
          category: t.category || 'Tasks',
          type: 'task',
          raw: t,
        });
      }
    }

    // Timeline
    if (rawResults.timeline) {
      for (const tl of rawResults.timeline) {
        items.push({
          id: `timeline-${tl.id}`,
          title: tl.title,
          subtitle: tl.note || undefined,
          category: tl.category || 'Timeline',
          type: 'timeline',
          raw: tl,
        });
      }
    }

    // Captures
    if (rawResults.captures) {
      for (const c of rawResults.captures) {
        items.push({
          id: `capture-${c.id}`,
          title: c.text.slice(0, 60),
          subtitle: c.category || undefined,
          category: c.category || 'Quick Capture',
          type: 'capture',
          raw: c,
        });
      }
    }

    // Journal
    if (rawResults.journal) {
      for (const j of rawResults.journal) {
        items.push({
          id: `journal-${j.id}`,
          title: j.title,
          subtitle: j.content.slice(0, 60),
          category: j.category || 'Journal',
          type: 'journal',
          raw: j,
        });
      }
    }

    // Medications
    if (rawResults.medications) {
      for (const m of rawResults.medications) {
        items.push({
          id: `med-${m.id}`,
          title: m.genericName,
          subtitle: `${m.dosageStrength} ${m.dosageUnit} - ${m.instructions || ''}`,
          category: 'Health',
          type: 'medication',
          raw: m,
        });
      }
    }

    return items;
  }
}
