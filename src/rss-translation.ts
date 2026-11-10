const endpoint = 'https://translate.googleapis.com/translate_a/single';

export class RssTitleTranslator {
  private readonly cache = new Map<string, string>();
  private retryAt = 0;

  constructor(private readonly request: typeof fetch = fetch,
              private readonly now = Date.now,
              private readonly timeoutMs = 2000) {}

  async translate(titles: readonly string[]): Promise<string[]> {
    const translations = new Map<string, string>();
    const missing: string[] = [];
    for (const title of new Set(titles)) {
      const cached = this.cache.get(title);
      if (cached === undefined) missing.push(title);
      else translations.set(title, cached);
    }

    if (missing.length && this.now() >= this.retryAt) {
      const signal = AbortSignal.timeout(this.timeoutMs);
      let next = 0;
      const worker = async () => {
        while (!signal.aborted && this.now() >= this.retryAt && next < missing.length) {
          const title = missing[next++]!;
          const translated = await this.translateTitle(title, signal);
          if (!translated) continue;
          if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
          this.cache.set(title, translated);
          translations.set(title, translated);
        }
      };
      await Promise.all(Array.from({length: Math.min(3, missing.length)}, worker));
    }
    return titles.map(title => translations.get(title) ?? title);
  }

  private async translateTitle(title: string, signal: AbortSignal): Promise<string> {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({client: 'gtx', sl: 'auto', tl: 'zh-TW', dt: 't', q: title}).toString();
    try {
      const response = await this.request(url, {signal, redirect: 'error'});
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')?.trim() ?? '';
        const now = this.now();
        const retryAt = /^\d+$/.test(retryAfter) ? now + Number(retryAfter) * 1000 : Date.parse(retryAfter);
        this.retryAt = Math.max(this.retryAt, now + 15 * 60_000, Number.isFinite(retryAt) ? retryAt : 0);
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return '';
      }
      const data: unknown = await response.json();
      if (signal.aborted || !Array.isArray(data) || !Array.isArray(data[0])) return '';
      return data[0].map((part: unknown) =>
        Array.isArray(part) && typeof part[0] === 'string' ? part[0] : '').join('').trim();
    } catch {
      return '';
    }
  }
}
