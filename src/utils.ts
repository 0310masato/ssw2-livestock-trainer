namespace LivestockApp {
  export function escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  export function uid(prefix = 'id'): string {
    const random = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  export function nowIso(): string {
    return new Date().toISOString();
  }

  export function dateKey(value: string | number | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }

  export function addDaysIso(base: Date, days: number): string {
    return new Date(base.getTime() + days * 86_400_000).toISOString();
  }

  export function addMinutesIso(base: Date, minutes: number): string {
    return new Date(base.getTime() + minutes * 60_000).toISOString();
  }

  export function withinDays(iso: string, days: number): boolean {
    return new Date(iso).getTime() >= Date.now() - days * 86_400_000;
  }

  export function formatDuration(milliseconds: number): string {
    const total = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, '0')}秒` : `${seconds}秒`;
  }

  export function formatClock(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  export function shuffle<T>(items: readonly T[], seed = Date.now()): T[] {
    const result = [...items];
    let state = seed >>> 0;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  export function unique<T>(items: readonly T[]): T[] {
    return [...new Set(items)];
  }

  export function downloadText(filename: string, text: string, mime = 'application/json'): void {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  export function csvCell(value: unknown): string {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  export function textWithFurigana(text: string, enabled: boolean): string {
    if (!enabled) return escapeHtml(text);
    const terms = [...GLOSSARY]
      .filter((item) => item.termJa.length >= 2 && text.includes(item.termJa))
      .sort((left, right) => right.termJa.length - left.termJa.length);
    if (terms.length === 0) return escapeHtml(text);

    const tokenMap = new Map<string, GlossaryItem>();
    let working = text;
    terms.forEach((item, index) => {
      const token = `\u0000${index}\u0000`;
      if (!working.includes(item.termJa)) return;
      working = working.split(item.termJa).join(token);
      tokenMap.set(token, item);
    });

    let escaped = escapeHtml(working);
    for (const [token, item] of tokenMap) {
      escaped = escaped.split(escapeHtml(token)).join(
        `<ruby>${escapeHtml(item.termJa)}<rt>${escapeHtml(item.reading)}</rt></ruby>`,
      );
    }
    return escaped;
  }

  export function questionById(id: string): Question | undefined {
    return QUESTIONS.find((question) => question.id === id);
  }

  export function activeQuestions(state: AppState): Question[] {
    if (state.settings.reviewContentEnabled) {
      return QUESTIONS.filter((question) => ['source_checked', 'language_checked', 'approved'].includes(question.status));
    }
    return QUESTIONS.filter((question) => question.status === 'approved');
  }

  export function renderLocalizedText(text: LocalizedText, settings: UserSettings, mode: 'question' | 'choice' | 'explanation'): string {
    const primary = textWithFurigana(text.ja, settings.showFurigana);
    if (mode === 'choice') {
      const supplements: string[] = [];
      if (settings.showEasyJapanese && text.easyJa && text.easyJa !== text.ja) {
        supplements.push(`<span class="choice-support">${escapeHtml(text.easyJa)}</span>`);
      }
      if (settings.showIndonesian && text.id) {
        supplements.push(`<span class="choice-support id">${escapeHtml(text.id)}</span>`);
      }
      return `${primary}${supplements.join('')}`;
    }
    return primary;
  }

  export function assetPath(assetId: string): string {
    const embedded = (window as Window & { __ASSET_DATA__?: Record<string, string> }).__ASSET_DATA__?.[assetId];
    return embedded ?? `assets/${encodeURIComponent(assetId)}.svg`;
  }

  export function announce(message: string): void {
    const live = document.querySelector<HTMLElement>('[data-live-region]');
    if (live) live.textContent = message;
  }
}
