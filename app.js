'use strict';

(() => {
  const API_URL = 'https://es.wiktionary.org/w/api.php';
  const CACHE_LIMIT = 40;
  const cache = new Map();

  const $ = (id) => document.getElementById(id);
  const form = $('search-form');
  const input = $('word-input');
  const searchButton = $('search-button');
  const clearButton = $('clear-button');
  const results = $('results');
  const emptyState = $('empty-state');
  const loadingState = $('loading-state');
  const errorState = $('error-state');
  const resultContent = $('result-content');

  const POS_PATTERN = /^(adjetivo|sustantivo(?:\s+.+)?|verbo(?:\s+.+)?|adverbio|pronombre(?:\s+.+)?|preposición|conjunción|interjección|artículo(?:\s+.+)?|determinante(?:\s+.+)?|numeral(?:\s+.+)?|abreviatura|símbolo|onomatopeya|prefijo|sufijo|partícula|nombre propio|participio)$/i;
  const RELATION_PATTERN = /^(sinónimos?|antónimos?)\s*:\s*(.*)$/i;

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).toLocaleLowerCase('es');
  }

  function headingText(heading) {
    const headline = heading.querySelector('.mw-headline');
    return normalizeText(headline ? headline.textContent : heading.textContent)
      .replace(/\[editar\]/gi, '')
      .trim();
  }

  function createRangeContents(documentRef, startHeading, endHeading, fallbackEnd) {
    const range = documentRef.createRange();
    range.setStartAfter(startHeading);
    if (endHeading) range.setEndBefore(endHeading);
    else range.setEndAfter(fallbackEnd || startHeading);
    return range.cloneContents();
  }

  function nextHeadingAtSameOrHigher(headings, currentIndex, currentLevel) {
    for (let index = currentIndex + 1; index < headings.length; index += 1) {
      const level = Number(headings[index].tagName.slice(1));
      if (level <= currentLevel) return headings[index];
    }
    return null;
  }

  function cleanDefinitionNode(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll([
      'ul', 'ol', 'dl', 'sup', '.reference', '.mw-editsection',
      '.citation-needed', '.mw-cite-backlink', '.noprint', 'style', 'script'
    ].join(',')).forEach((element) => element.remove());
    return normalizeText(clone.textContent)
      .replace(/^\d+\s*/, '')
      .replace(/\s*\[cita requerida\]\s*/gi, ' ')
      .replace(/\s*\[\d+\]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseRelationTerms(relationText) {
    const match = normalizeText(relationText).match(RELATION_PATTERN);
    if (!match) return null;
    const label = match[1].toLocaleLowerCase('es');
    const kind = label.startsWith('sinónimo') ? 'synonyms' : 'antonyms';
    const rawTerms = match[2]
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[.。]$/, '')
      .replace(/\s+o\s+/gi, ',');

    const terms = rawTerms
      .split(/[;,]/)
      .map((term) => normalizeText(term)
        .replace(/^[-–—•]\s*/, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/^«|»$/g, '')
        .trim())
      .filter((term) => term && term.length <= 48 && !/^véase\b/i.test(term));

    return { kind, terms };
  }

  function collectRelations(container, wordKey) {
    const relationSets = { synonyms: new Set(), antonyms: new Set() };
    const candidates = Array.from(container.querySelectorAll('li, p, dd'));

    for (const candidate of candidates) {
      const parsed = parseRelationTerms(candidate.textContent);
      if (!parsed) continue;
      for (const term of parsed.terms) {
        const key = normalizeKey(term);
        if (!key || key === wordKey || key.length > 48) continue;
        relationSets[parsed.kind].add(term);
      }
    }

    return {
      synonyms: Array.from(relationSets.synonyms),
      antonyms: Array.from(relationSets.antonyms)
    };
  }

  function collectDefinitionsFromBlock(block, category) {
    const definitions = [];
    const orderedLists = Array.from(block.querySelectorAll('ol'))
      .filter((list) => !list.parentElement.closest('ol'));

    for (const list of orderedLists) {
      for (const item of Array.from(list.children).filter((child) => child.tagName === 'LI')) {
        const text = cleanDefinitionNode(item);
        if (!text || text.length < 2) continue;

        const exampleNode = Array.from(item.querySelectorAll('li, p, dd'))
          .find((node) => /^ejemplo\s*:/i.test(normalizeText(node.textContent)));
        let example = '';
        if (exampleNode) {
          example = normalizeText(exampleNode.textContent).replace(/^ejemplo\s*:\s*/i, '');
        }

        definitions.push({ text, category, example });
      }
    }
    return definitions;
  }

  function parseSpanishEntry(html, requestedWord) {
    const documentRef = new DOMParser().parseFromString(html, 'text/html');
    const root = documentRef.querySelector('.mw-parser-output') || documentRef.body;
    const allHeadings = Array.from(root.querySelectorAll('h2, h3, h4, h5, h6'));
    const spanishIndex = allHeadings.findIndex((heading) =>
      heading.tagName === 'H2' && normalizeKey(headingText(heading)) === 'español'
    );

    if (spanishIndex < 0) {
      return { foundSpanish: false, definitions: [], synonyms: [], antonyms: [] };
    }

    const spanishHeading = allHeadings[spanishIndex];
    let spanishEndIndex = allHeadings.findIndex((heading, index) =>
      index > spanishIndex && heading.tagName === 'H2'
    );
    if (spanishEndIndex < 0) spanishEndIndex = allHeadings.length;
    const spanishEndHeading = allHeadings[spanishEndIndex] || null;
    const spanishContent = createRangeContents(documentRef, spanishHeading, spanishEndHeading, root.lastChild);
    const definitions = [];
    const relationSets = { synonyms: new Set(), antonyms: new Set() };
    const spanishWordKey = normalizeKey(requestedWord);

    const languageHeadings = allHeadings.slice(spanishIndex + 1, spanishEndIndex);
    for (let index = 0; index < languageHeadings.length; index += 1) {
      const heading = languageHeadings[index];
      const title = headingText(heading);
      if (!POS_PATTERN.test(title)) continue;

      const level = Number(heading.tagName.slice(1));
      const nextHeading = nextHeadingAtSameOrHigher(languageHeadings, index, level) || spanishEndHeading;
      const block = createRangeContents(documentRef, heading, nextHeading, root.lastChild);
      definitions.push(...collectDefinitionsFromBlock(block, title));
      const relations = collectRelations(block, spanishWordKey);
      relations.synonyms.forEach((term) => relationSets.synonyms.add(term));
      relations.antonyms.forEach((term) => relationSets.antonyms.add(term));
    }

    // Some entries attach the relation list directly to a grammatical section without a nested definition list.
    // Scan only the already-isolated Spanish section; never inspect other language sections.
    if (!definitions.length) {
      const sectionElement = documentRef.createElement('div');
      sectionElement.append(spanishContent.cloneNode(true));
      const relations = collectRelations(sectionElement, spanishWordKey);
      relations.synonyms.forEach((term) => relationSets.synonyms.add(term));
      relations.antonyms.forEach((term) => relationSets.antonyms.add(term));
    }

    const dedupeDefinitions = [];
    const definitionKeys = new Set();
    for (const definition of definitions) {
      const key = `${normalizeKey(definition.category)}|${normalizeKey(definition.text)}`;
      if (definitionKeys.has(key)) continue;
      definitionKeys.add(key);
      dedupeDefinitions.push(definition);
    }

    return {
      foundSpanish: true,
      definitions: dedupeDefinitions,
      synonyms: Array.from(relationSets.synonyms),
      antonyms: Array.from(relationSets.antonyms)
    };
  }

  async function fetchEntry(word) {
    const cacheKey = normalizeKey(word);
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const params = new URLSearchParams({
      action: 'parse',
      page: word.toLocaleLowerCase('es').replace(/\s+/g, '_'),
      prop: 'text',
      format: 'json',
      formatversion: '2',
      origin: '*',
      disableeditsection: '1'
    });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 16000);

    try {
      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);

      const payload = await response.json();
      if (payload.error) {
        if (payload.error.code === 'missingtitle' || payload.error.code === 'invalidtitle') {
          const missing = new Error('WORD_NOT_FOUND');
          missing.code = 'WORD_NOT_FOUND';
          throw missing;
        }
        throw new Error(payload.error.info || 'API_ERROR');
      }

      const rawHtml = payload.parse && payload.parse.text;
      const html = typeof rawHtml === 'string' ? rawHtml : (rawHtml && rawHtml['*']);
      if (typeof html !== 'string' || !html.trim()) {
        const missing = new Error('WORD_NOT_FOUND');
        missing.code = 'WORD_NOT_FOUND';
        throw missing;
      }

      const entry = parseSpanishEntry(html, word);
      if (!entry.foundSpanish) {
        const noSpanish = new Error('NO_SPANISH_ENTRY');
        noSpanish.code = 'NO_SPANISH_ENTRY';
        throw noSpanish;
      }
      entry.title = payload.parse.title || word;
      entry.sourceUrl = `https://es.wiktionary.org/wiki/${encodeURIComponent(entry.title.replace(/ /g, '_'))}`;

      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, entry);
      return entry;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error('REQUEST_TIMEOUT');
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function setView(view) {
    emptyState.hidden = view !== 'empty';
    loadingState.hidden = view !== 'loading';
    errorState.hidden = view !== 'error';
    resultContent.hidden = view !== 'result';
    results.setAttribute('aria-busy', view === 'loading' ? 'true' : 'false');
  }

  function setLoading(isLoading) {
    searchButton.disabled = isLoading;
    searchButton.innerHTML = isLoading ? 'Buscando…' : 'Buscar <span aria-hidden="true">→</span>';
    input.disabled = isLoading;
  }

  function renderDefinitions(definitions) {
    const list = $('definitions-list');
    list.replaceChildren();
    $('definitions-empty').hidden = definitions.length > 0;
    list.hidden = definitions.length === 0;

    definitions.slice(0, 24).forEach((definition) => {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.className = 'definition-text';
      text.textContent = definition.text;
      item.append(text);

      if (definition.category) {
        const category = document.createElement('span');
        category.className = 'definition-category';
        category.textContent = definition.category;
        item.append(category);
      }
      if (definition.example) {
        const example = document.createElement('span');
        example.className = 'definition-example';
        example.textContent = `Ejemplo: ${definition.example}`;
        item.append(example);
      }
      list.append(item);
    });
  }

  function renderWordChips(containerId, emptyId, values) {
    const container = $(containerId);
    container.replaceChildren();
    const cleanValues = values.slice(0, 70);
    $(emptyId).hidden = cleanValues.length > 0;
    container.hidden = cleanValues.length === 0;

    cleanValues.forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-chip';
      button.textContent = value;
      button.addEventListener('click', () => search(value));
      container.append(button);
    });
  }

  function renderEntry(entry, searchedWord) {
    $('result-word').textContent = entry.title || searchedWord;
    const count = entry.definitions.length;
    $('result-meta').textContent = count
      ? `${count} ${count === 1 ? 'definición encontrada' : 'definiciones encontradas'} · Español`
      : 'Entrada en español · Sin definiciones registradas';

    renderDefinitions(entry.definitions);
    renderWordChips('synonyms-list', 'synonyms-empty', entry.synonyms);
    renderWordChips('antonyms-list', 'antonyms-empty', entry.antonyms);
    $('source-link').href = entry.sourceUrl;
    $('source-note').textContent = 'Definiciones y relaciones léxicas de Wikcionario en español.';
    setView('result');
  }

  function showError(error) {
    const title = $('error-title');
    const copy = $('error-copy');

    switch (error.code) {
      case 'WORD_NOT_FOUND':
        title.textContent = 'No encontramos esa palabra.';
        copy.textContent = 'Probá revisar la escritura o intentá con la forma singular del término.';
        break;
      case 'NO_SPANISH_ENTRY':
        title.textContent = 'Esta entrada no tiene una sección en español.';
        copy.textContent = 'Probá con otra palabra escrita en español.';
        break;
      case 'REQUEST_TIMEOUT':
        title.textContent = 'La búsqueda está tardando demasiado.';
        copy.textContent = 'El diccionario no respondió a tiempo. Revisá tu conexión e intentá otra vez.';
        break;
      default:
        title.textContent = 'No pudimos consultar el diccionario.';
        copy.textContent = 'Puede ser un problema momentáneo de conexión. Volvé a intentarlo en unos segundos.';
    }
    setView('error');
  }

  async function search(rawWord) {
    const word = normalizeText(rawWord);
    if (!word) {
      input.focus();
      return;
    }
    input.value = word;
    clearButton.hidden = false;
    setLoading(true);
    setView('loading');

    try {
      const entry = await fetchEntry(word);
      renderEntry(entry, word);
    } catch (error) {
      console.error('[Brújula Verbal] Error de búsqueda:', error);
      showError(error);
    } finally {
      setLoading(false);
      input.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    search(input.value);
  });

  input.addEventListener('input', () => {
    clearButton.hidden = input.value.length === 0;
  });

  clearButton.addEventListener('click', () => {
    input.value = '';
    clearButton.hidden = true;
    input.focus();
    setView('empty');
  });

  document.querySelectorAll('.suggestion').forEach((button) => {
    button.addEventListener('click', () => search(button.dataset.word || button.textContent));
  });

  // Expuesto solo para facilitar pruebas locales del parser desde la consola del navegador.
  window.BrujulaVerbal = Object.freeze({ parseSpanishEntry });
})();
