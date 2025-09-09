// Lightweight content extraction without external dependencies.
// If the page provides Readability globals, use them; otherwise, fall back.

function canBeParsed(document) {
  const textLength = (document.body && document.body.innerText
    ? document.body.innerText.length
    : 0);
  return textLength >= 100;
}

function extractWithReadability(document) {
  try {
    if (typeof Readability === 'function') {
      const documentClone = document.cloneNode(true);
      const article = new Readability(documentClone).parse();
      if (article && article.textContent) return article.textContent;
    }
  } catch (e) {
    // ignore and fall back
  }
  return null;
}

function extractHeuristic(document) {
  const candidates = [];
  const selectors = ['article', 'main', '#content', '.content', '.article', '.post'];
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => candidates.push(el));
  });
  let best = null;
  let bestScore = 0;
  const evaluate = (el) => (el.innerText || '').trim().length;
  if (!candidates.length && document.body) candidates.push(document.body);
  candidates.forEach((el) => {
    const score = evaluate(el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  });
  const text = best ? best.innerText : '';
  return (text || '').trim();
}

function parse(document) {
  if (!canBeParsed(document)) return false;
  const readabilityText = extractWithReadability(document);
  if (readabilityText && readabilityText.trim()) return readabilityText.trim();
  return extractHeuristic(document);
}

parse(window.document);
