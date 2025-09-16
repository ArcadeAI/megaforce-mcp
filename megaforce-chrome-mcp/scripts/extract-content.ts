// Lightweight content extraction without external dependencies.
// If the page provides Readability globals, use them; otherwise, fall back.

function canBeParsed(document: Document): boolean {
  const textLength = document.body && document.body.innerText
    ? document.body.innerText.length
    : 0;
  return textLength >= 100;
}

function extractWithReadability(document: Document): string | null {
  try {
    if (typeof Readability === 'function') {
      const documentClone = document.cloneNode(true) as Document;
      const article = new (Readability as any)(documentClone).parse();
      if (article && article.textContent) return article.textContent as string;
    }
  } catch {
    // ignore and fall back
  }
  return null;
}

function extractHeuristic(document: Document): string {
  const candidates: Element[] = [];
  const selectors = ['article', 'main', '#content', '.content', '.article', '.post'];
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => candidates.push(el));
  });
  let best: Element | null = null;
  let bestScore = 0;
  const evaluate = (el: Element) => ((el as HTMLElement).innerText || '').trim().length;
  if (!candidates.length && document.body) candidates.push(document.body);
  candidates.forEach((el) => {
    const score = evaluate(el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  });
  const text = best ? (best as HTMLElement).innerText : '';
  return (text || '').trim();
}

function parse(document: Document): string | false {
  if (!canBeParsed(document)) return false;
  const readabilityText = extractWithReadability(document);
  if (readabilityText && readabilityText.trim()) return readabilityText.trim();
  return extractHeuristic(document);
}

// Ensure the last evaluated expression returns the extracted text to chrome.scripting.executeScript
(() => parse(window.document))();


