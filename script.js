'use strict';

// Brújula Verbal obtiene definiciones directamente de la edición en español
// de Wikcionario mediante la API pública de MediaWiki.
const WIKTIONARY_API = 'https://es.wiktionary.org/w/api.php';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_DEFINITIONS = 8;
const MAX_RELATED_WORDS = 32;

const elements = {
  form: document.getElementById('search-form'),
  input: document.getElementById('search-input'),
  button: document.getElementById('search-button'),
  buttonLabel: document.querySelector('#search-button span'),
  loader: document.getElementById('loader'),
  feedback: document.getElementById('feedback'),
  feedbackText: document.getElementById('feedback-text'),
  results: document.getElementById('results'),
  emptyState: document.getElementById('empty-state'),
  wordTitle: document.getElementById('word-title'),
  wordMeta: document.getElementById('word-meta'),
  definitions: document.getElementById('definitions-container'),
  synonyms: document.getElementById('synonyms-container'),
  antonyms: document.getElementById('antonyms-container'),
  sourceLink: document.getElementById('source-link')
};

let activeController = null;
let searchSequence = 0;

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

function uniqueWords(items, searchedWord) {
  const seen = new Set();
  const target = normalizeText(searchedWord);
  const words = [];

  for (const rawItem of items) {
    if (typeof rawItem !== 'string') continue;
    const word = rawItem.trim().replace(/^[«"'“”]+|[»"'“”.,;:]+$/g, '');
    const key = normalizeText(word);
    if (!word || key === target || seen.has(key)) continue;
    if (word.length > 45 || /https?:\/\//i.test(word)) continue;
    seen.add(key);
    words.push(word);
    if (words.length >= MAX_RELATED_WORDS) break;
  }

  return words;
}

function headingText(heading) {
  const copy = heading.cloneNode(true);
  copy.querySelectorAll('.mw-editsection, .mw-editsection-like').forEach((node) => node.remove());
  return copy.textContent.replace(/\[editar\]/gi, '').replace(/\s+/g, ' ').trim();
}

function headingLevel(heading) {
  return Number(heading.tagName.slice(1));
}

function headingContainer(heading) {
  const parent = heading.parentElement;
  return parent && parent.classList.contains('mw-heading') ? parent : heading;
}

function headingInside(element) {
  if (!element) return null;
  if (/^H[1-6]$/.test(element.tagName)) return element;
  return element.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
}

function translatePartOfSpeech(value) {
  const text = String(value || '').trim();
  const normalized = normalizeText(text);
  const labels = [
    [/^(sustantivo|nombre)\b/, 'Sustantivo'],
    [/^verbo\b/, 'Verbo'],
    [/^adjetivo\b/, 'Adjetivo'],
    [/^adverbio\b/, 'Adverbio'],
    [/^pronombre\b/, 'Pronombre'],
    [/^preposicion\b/, 'Preposición'],
    [/^conjuncion\b/, 'Conjunción'],
    [/^interjeccion\b/, 'Interjección'],
    [/^determinante\b/, 'Determinante'],
    [/^articulo\b/, 'Artículo'],
    [/^numeral\b/, 'Numeral'],
    [/^locucion\s+sustantiva\b/, 'Locución sustantiva'],
    [/^locucion\s+verbal\b/, 'Locución verbal'],
    [/^locucion\s+adjetiva\b/, 'Locución adjetiva'],
    [/^locucion\s+adverbial\b/, 'Locución adverbial']
  ];

  const match = labels.find(([pattern]) => pattern.test(normalized));
  return match ? match[1] : '';
}

function nodesAfterHeading(heading, sectionEndHeading) {
  const nodes = [];
  const level = headingLevel(heading);
  let current = headingContainer(heading).nextElementSibling;
  const endContainer = sectionEndHeading ? headingContainer(sectionEndHeading) : null;

  while (current && current !== endContainer) {
    const nestedHeading = headingInside(current);
    if (nestedHeading && headingLevel(nestedHeading) <= level) break;
    nodes.push(current);
    current = current.nextElementSibling;
  }

  return nodes;
}

function cleanDefinitionText(listItem) {
  const copy = listItem.cloneNode(true);
  copy.querySelectorAll('ul, ol, dl, sup, style, script, .mw-editsection, .reference, .citation').forEach((node) => node.remove());
  return copy.textContent.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

function extractExample(nodes) {
  for (const node of nodes) {
    const listItems = node.querySelectorAll('ul li');
    for (const item of listItems) {
      const text = item.textContent.replace(/\s+/g, ' ').trim();
      const match = text.match(/^Ejemplo(?:s)?\s*:\s*(.+)$/i);
      if (match && match[1]) return match[1].trim();
    }
  }
  return '';
}

function collectRelatedWords(nodes, kind) {
  const words = [];
  const labelPattern = kind === 'synonym'
    ? /^Sin[oó]nimos?\s*:/i
    : /^Ant[oó]nimos?\s*:/i;

  for (const node of nodes) {
    node.querySelectorAll('ul li, p').forEach((item) => {
      const line = item.textContent.replace(/\s+/g, ' ').trim();
      if (!labelPattern.test(line)) return;

      const links = Array.from(item.querySelectorAll('a'))
        .filter((link) => !link.closest('sup, .reference, .mw-editsection'))
        .map((link) => link.textContent.trim())
        .filter((label) => label && !/^\[?\d+\]?$/.test(label));
      if (links.length) {
        words.push(...links);
        return;
      }

      const remainder = line.replace(labelPattern, '');
      words.push(...remainder.split(/[,;]|\s+y\s+/i));
    });
  }

  return words;
}

function findSpanishSection(content) {
  const headings = Array.from(content.querySelectorAll('h2, h3, h4, h5, h6'));
  return headings.find((heading) => headingLevel(heading) === 2 && normalizeText(headingText(heading)) === 'espanol') || null;
}

function parseWiktionaryHtml(html, searchedWord, pageTitle) {
  const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
  const content = parsedDocument.querySelector('.mw-parser-output') || parsedDocument.body;
  const spanishHeading = findSpanishSection(content);

  if (!spanishHeading) {
    throw new Error(`No encontramos una entrada en español para «${searchedWord}». Probá con otra palabra.`);
  }

  const allHeadings = Array.from(content.querySelectorAll('h2, h3, h4, h5, h6'));
  const spanishIndex = allHeadings.indexOf(spanishHeading);
  const nextLanguageHeading = allHeadings.slice(spanishIndex + 1)
    .find((heading) => headingLevel(heading) <= 2) || null;
  const spanishEnd = nextLanguageHeading;
  const spanishNodes = nodesAfterHeading(spanishHeading, spanishEnd);

  const partOfSpeechHeadings = allHeadings.slice(spanishIndex + 1, nextLanguageHeading ? allHeadings.indexOf(nextLanguageHeading) : undefined)
    .filter((heading) => translatePartOfSpeech(headingText(heading)));

  const definitions = [];
  const synonyms = [];
  const antonyms = [];
  const definitionKeys = new Set();

  for (const heading of partOfSpeechHeadings) {
    const nodes = nodesAfterHeading(heading, spanishEnd);
    const partOfSpeech = translatePartOfSpeech(headingText(heading));
    const example = extractExample(nodes);

    for (const node of nodes) {
      node.querySelectorAll('ol > li').forEach((listItem) => {
        const definition = cleanDefinitionText(listItem);
        if (!definition) return;
        const key = normalizeText(definition);
        if (definitionKeys.has(key)) return;
        definitionKeys.add(key);
        definitions.push({ definition, partOfSpeech, example });
      });
    }

    synonyms.push(...collectRelatedWords(nodes, 'synonym'));
    antonyms.push(...collectRelatedWords(nodes, 'antonym'));
  }

  // Algunas entradas tienen una estructura más sencilla sin encabezados de
  // categoría gramatical. En ese caso tomamos las listas numeradas de Español.
  if (definitions.length === 0) {
    for (const node of spanishNodes) {
      if (headingInside(node)) continue;
      node.querySelectorAll('ol > li').forEach((listItem) => {
        const definition = cleanDefinitionText(listItem);
        const key = normalizeText(definition);
        if (!definition || definitionKeys.has(key)) return;
        definitionKeys.add(key);
        definitions.push({ definition, partOfSpeech: '', example: '' });
      });
    }
  }

  const finalDefinitions = definitions.slice(0, MAX_DEFINITIONS);
  const finalSynonyms = uniqueWords(synonyms, searchedWord);
  const finalAntonyms = uniqueWords(antonyms, searchedWord);

  if (finalDefinitions.length === 0 && finalSynonyms.length === 0 && finalAntonyms.length === 0) {
    throw new Error(`La entrada «${searchedWord}» no tiene definiciones en español disponibles. Probá con otra palabra.`);
  }

  return {
    word: pageTitle || searchedWord,
    definitions: finalDefinitions,
    synonyms: finalSynonyms,
    antonyms: finalAntonyms,
    sourceUrl: `https://es.wiktionary.org/wiki/${encodeURIComponent(pageTitle || searchedWord.replace(/ /g, '_'))}`
  };
}

async function fetchDictionaryEntry(word) {
  if (activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      action: 'parse',
      page: word,
      prop: 'text',
      format: 'json',
      origin: '*',
      disableeditsection: '1'
    });
    const response = await fetch(`${WIKTIONARY_API}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 404 || payload?.error?.code === 'missingtitle') {
      throw new Error(`No encontramos «${word}» en Wikcionario. Revisá la ortografía e intentá otra vez.`);
    }
    if (response.status === 429) {
      throw new Error('Wikcionario recibió demasiadas consultas. Esperá un momento y volvé a intentar.');
    }
    if (!response.ok || payload?.error || !payload?.parse?.text) {
      throw new Error('El diccionario no está disponible en este momento. Probá de nuevo más tarde.');
    }

    const html = typeof payload.parse.text === 'string'
      ? payload.parse.text
      : payload.parse.text['*'];
    if (!html) throw new Error('No pudimos interpretar la respuesta del diccionario. Intentá nuevamente.');

    return parseWiktionaryHtml(html, word, payload.parse.title);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('La búsqueda tardó demasiado o fue reemplazada por otra. Intentá nuevamente.');
    }
    if (error instanceof TypeError) {
      throw new Error('No pudimos conectar con Wikcionario. Revisá tu conexión a internet e intentá otra vez.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    if (activeController === controller) activeController = null;
  }
}

function createEmptyMessage(message) {
  const paragraph = document.createElement('p');
  paragraph.className = 'no-data';
  paragraph.textContent = message;
  return paragraph;
}

function renderDefinitions(definitions) {
  elements.definitions.replaceChildren();

  if (definitions.length === 0) {
    const item = document.createElement('li');
    item.appendChild(createEmptyMessage('No hay una definición disponible para esta entrada.'));
    elements.definitions.appendChild(item);
    return;
  }

  for (const definition of definitions) {
    const item = document.createElement('li');

    if (definition.partOfSpeech) {
      const label = document.createElement('span');
      label.className = 'definition-note';
      label.textContent = definition.partOfSpeech;
      item.appendChild(label);
      item.appendChild(document.createElement('br'));
    }

    item.appendChild(document.createTextNode(definition.definition));

    if (definition.example) {
      const example = document.createElement('p');
      example.className = 'definition-example';
      example.textContent = `Ejemplo: «${definition.example}»`;
      item.appendChild(example);
    }

    elements.definitions.appendChild(item);
  }
}

function renderTags(container, words, type) {
  container.replaceChildren();

  if (words.length === 0) {
    const message = type === 'synonym'
      ? 'No hay sinónimos registrados para esta palabra.'
      : 'No hay antónimos registrados para esta palabra.';
    container.appendChild(createEmptyMessage(message));
    return;
  }

  for (const word of words) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tag ${type}`;
    button.textContent = word;
    button.title = `Buscar «${word}»`;
    button.addEventListener('click', () => searchWord(word));
    container.appendChild(button);
  }
}

function showFeedback(message) {
  elements.feedbackText.textContent = message;
  elements.feedback.classList.remove('hidden');
}

function setLoading(isLoading) {
  elements.loader.classList.toggle('hidden', !isLoading);
  elements.button.disabled = isLoading;
  elements.buttonLabel.textContent = isLoading ? 'Buscando...' : 'Buscar';
  elements.button.setAttribute('aria-busy', String(isLoading));
}

function displayResults(result) {
  elements.wordTitle.textContent = result.word;
  const definitionCount = result.definitions.length;
  elements.wordMeta.textContent = definitionCount
    ? `${definitionCount} ${definitionCount === 1 ? 'definición' : 'definiciones'} encontradas`
    : 'Información de la palabra';

  renderDefinitions(result.definitions);
  renderTags(elements.synonyms, result.synonyms, 'synonym');
  renderTags(elements.antonyms, result.antonyms, 'antonym');

  elements.sourceLink.href = result.sourceUrl;
  elements.sourceLink.classList.remove('hidden');
  elements.emptyState.classList.add('hidden');
  elements.results.classList.remove('hidden');
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function searchWord(rawWord) {
  const requestId = ++searchSequence;
  const word = String(rawWord || '').trim().replace(/\s+/g, ' ');
  if (!word) {
    elements.input.focus();
    return;
  }

  if (word.length > 70) {
    showFeedback('La búsqueda es demasiado larga. Probá con una palabra o una frase más corta.');
    return;
  }

  elements.input.value = word;
  elements.feedback.classList.add('hidden');
  elements.results.classList.add('hidden');
  elements.emptyState.classList.add('hidden');
  setLoading(true);

  try {
    const result = await fetchDictionaryEntry(word);
    if (requestId !== searchSequence) return;
    displayResults(result);
  } catch (error) {
    if (requestId !== searchSequence) return;
    showFeedback(error.message || 'Ocurrió un error inesperado. Volvé a intentarlo.');
    elements.emptyState.classList.remove('hidden');
  } finally {
    if (requestId === searchSequence) setLoading(false);
  }
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  searchWord(elements.input.value);
});

document.querySelectorAll('.example-word').forEach((button) => {
  button.addEventListener('click', () => searchWord(button.textContent));
});
