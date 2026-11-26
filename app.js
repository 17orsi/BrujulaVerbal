'use strict';

(() => {
  const DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/es/';
  const WIKTIONARY_API = 'https://es.wiktionary.org/w/api.php';
  const REQUEST_TIMEOUT_MS = 14000;
  const MAX_DEFINITIONS = 10;
  const MAX_RELATIONS = 12;
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
  const FAVORITES_KEY = 'brujula-verbal:favorites:v1';
  const HISTORY_KEY = 'brujula-verbal:history:v1';
  const MAX_FAVORITES = 30;
  const MAX_HISTORY = 8;

  const DAILY_WORDS = [
    { word: 'serenidad', hint: 'Calma y equilibrio, incluso cuando algo se complica.' },
    { word: 'efímero', hint: 'Algo que dura muy poco tiempo.' },
    { word: 'valiente', hint: 'Quien enfrenta una dificultad con decisión.' },
    { word: 'generoso', hint: 'Quien comparte sin esperar algo a cambio.' },
    { word: 'sincero', hint: 'Quien habla y actúa sin fingimiento.' },
    { word: 'amor', hint: 'Afecto profundo hacia alguien o algo.' },
    { word: 'fuerte', hint: 'Quien tiene fuerza, resistencia o intensidad.' },
    { word: 'feliz', hint: 'Quien siente o expresa felicidad.' },
    { word: 'tristeza', hint: 'Sentimiento de pena o falta de alegría.' },
    { word: 'libre', hint: 'Quien puede actuar sin estar sometido a otra voluntad.' }
  ];

  let favorites = readStoredWords(FAVORITES_KEY);
  let recentWords = readStoredWords(HISTORY_KEY);
  let currentEntry = null;

  const SPANISH_STOPWORDS = new Set([
    'a','al','algo','alguien','ante','bajo','cada','como','con','contra','cual','cuando','de','del','desde','donde',
    'el','ella','ellas','ellos','en','entre','era','es','esa','ese','eso','esta','está','este','esto','fue','ha',
    'hasta','la','las','lo','los','más','menos','no','o','para','pero','por','que','se','sin','sobre','su','sus',
    'un','una','uno','unos','unas','y','ya','ser','estar','tener','persona','persona','cosa','dicho','dicha','propio'
  ]);
  const ENGLISH_MARKERS = /\b(the|an|of|with|from|for|someone|something|friend|person who|one who|that is|which is|used to|is a|are a)\b/i;
  const ADULT_SENSE_MARKERS = /\b(sexual|sexo|pene|vagina|coito|prostitu|pornogr)\b/i;

  // Selección breve de relaciones revisadas para el sentido más habitual.
  // Para términos que no estén aquí se usan únicamente relaciones por acepción
  // devueltas por el diccionario, sin mezclar listas de sentidos distintos.
  const CURATED_RELATIONS = {
    amigo: { synonyms: ['compañero', 'colega', 'camarada', 'confidente', 'compinche'], antonyms: ['enemigo', 'adversario', 'rival'] },
    amiga: { synonyms: ['compañera', 'colega', 'camarada', 'confidente', 'compinche'], antonyms: ['enemiga', 'adversaria', 'rival'] },
    enemigo: { synonyms: ['adversario', 'rival', 'contrincante', 'antagonista'], antonyms: ['amigo', 'aliado'] },
    enemiga: { synonyms: ['adversaria', 'rival', 'contrincante', 'antagonista'], antonyms: ['amiga', 'aliada'] },
    feliz: { synonyms: ['contento', 'alegre', 'dichoso', 'satisfecho'], antonyms: ['triste', 'desdichado', 'infeliz'] },
    tristeza: { synonyms: ['pena', 'aflicción', 'melancolía', 'pesar'], antonyms: ['alegría', 'felicidad', 'júbilo'] },
    triste: { synonyms: ['apenado', 'afligido', 'melancólico', 'abatido'], antonyms: ['feliz', 'alegre', 'contento'] },
    valiente: { synonyms: ['audaz', 'intrépido', 'valeroso', 'osado'], antonyms: ['cobarde', 'temeroso', 'miedoso'] },
    cobarde: { synonyms: ['miedoso', 'temeroso', 'pusilánime'], antonyms: ['valiente', 'audaz', 'intrépido'] },
    serenidad: { synonyms: ['calma', 'tranquilidad', 'sosiego', 'paz'], antonyms: ['agitación', 'inquietud', 'nerviosismo'] },
    efimero: { synonyms: ['fugaz', 'pasajero', 'transitorio', 'momentáneo'], antonyms: ['duradero', 'permanente', 'perdurable'] },
    bueno: { synonyms: ['bondadoso', 'amable', 'generoso', 'benévolo'], antonyms: ['malo', 'perverso', 'malvado'] },
    malo: { synonyms: ['perjudicial', 'nocivo', 'dañino', 'perverso'], antonyms: ['bueno', 'benéfico', 'bondadoso'] },
    grande: { synonyms: ['enorme', 'vasto', 'amplio', 'gigante'], antonyms: ['pequeño', 'reducido', 'diminuto'] },
    pequeno: { synonyms: ['chico', 'diminuto', 'reducido', 'menudo'], antonyms: ['grande', 'enorme', 'gigante'] },
    rapido: { synonyms: ['veloz', 'ligero', 'ágil', 'pronto'], antonyms: ['lento', 'pausado', 'tardo'] },
    lento: { synonyms: ['pausado', 'tardo', 'parsimonioso'], antonyms: ['rápido', 'veloz', 'ágil'] },
    caliente: { synonyms: ['caluroso', 'ardiente', 'cálido'], antonyms: ['frío', 'helado', 'gélido'] },
    frio: { synonyms: ['helado', 'gélido', 'glacial'], antonyms: ['caliente', 'cálido', 'ardiente'] },
    fuerte: { synonyms: ['robusto', 'resistente', 'poderoso', 'vigoroso'], antonyms: ['débil', 'frágil', 'endeble'] },
    debil: { synonyms: ['frágil', 'endeble', 'flojo', 'vulnerable'], antonyms: ['fuerte', 'robusto', 'resistente'] },
    generoso: { synonyms: ['desprendido', 'dadivoso', 'altruista', 'liberal'], antonyms: ['egoísta', 'avaro', 'mezquino'] },
    egoista: { synonyms: ['interesado', 'egocéntrico', 'individualista'], antonyms: ['generoso', 'altruista', 'desinteresado'] },
    luz: { synonyms: ['claridad', 'iluminación', 'resplandor'], antonyms: ['oscuridad', 'tiniebla', 'sombra'] },
    oscuridad: { synonyms: ['penumbra', 'tiniebla', 'negrura'], antonyms: ['luz', 'claridad', 'iluminación'] },
    amor: { synonyms: ['afecto', 'cariño', 'aprecio', 'devoción'], antonyms: ['odio', 'desprecio', 'aversión'] },
    odio: { synonyms: ['aversión', 'rencor', 'animadversión', 'rechazo'], antonyms: ['amor', 'afecto', 'cariño'] },
    limpio: { synonyms: ['aseado', 'pulcro', 'higiénico'], antonyms: ['sucio', 'mugriento', 'manchado'] },
    sucio: { synonyms: ['mugriento', 'manchado', 'inmundo'], antonyms: ['limpio', 'aseado', 'pulcro'] },
    sincero: { synonyms: ['honesto', 'franco', 'auténtico', 'veraz'], antonyms: ['falso', 'deshonesto', 'mentiroso'] },
    mentira: { synonyms: ['falsedad', 'embuste', 'engaño'], antonyms: ['verdad', 'veracidad', 'realidad'] },
    verdad: { synonyms: ['veracidad', 'realidad', 'certeza'], antonyms: ['mentira', 'falsedad', 'engaño'] },
    libre: { synonyms: ['independiente', 'autónomo', 'suelto'], antonyms: ['preso', 'cautivo', 'sometido'] },
    cerca: { synonyms: ['próximo', 'cercano', 'contiguo'], antonyms: ['lejos', 'distante', 'apartado'] },
    lejos: { synonyms: ['distante', 'apartado', 'remoto'], antonyms: ['cerca', 'próximo', 'cercano'] }
  };

  const LOCAL_DEFINITIONS = {
    amigo: [
      { category: 'Sustantivo', text: 'Persona con quien se mantiene una relación de afecto, confianza y apoyo.' },
      { category: 'Adjetivo', text: 'Que muestra afecto, cercanía o disposición favorable hacia alguien o algo.' }
    ],
    amiga: [
      { category: 'Sustantivo', text: 'Persona con quien se mantiene una relación de afecto, confianza y apoyo.' },
      { category: 'Adjetivo', text: 'Que muestra afecto, cercanía o disposición favorable hacia alguien o algo.' }
    ],
    enemigo: [
      { category: 'Sustantivo', text: 'Persona que siente hostilidad hacia otra o se opone a ella.' },
      { category: 'Adjetivo', text: 'Que se opone o es contrario a alguien o algo.' }
    ],
    enemiga: [
      { category: 'Sustantivo', text: 'Persona que siente hostilidad hacia otra o se opone a ella.' },
      { category: 'Adjetivo', text: 'Que se opone o es contrario a alguien o algo.' }
    ],
    feliz: [{ category: 'Adjetivo', text: 'Que siente felicidad o la manifiesta; que produce satisfacción o alegría.' }],
    triste: [{ category: 'Adjetivo', text: 'Que siente pena o desánimo, o que expresa esos sentimientos.' }],
    tristeza: [{ category: 'Sustantivo', text: 'Sentimiento de pena, aflicción o falta de alegría.' }],
    valiente: [{ category: 'Adjetivo', text: 'Que actúa con valor y decisión frente a una situación difícil o peligrosa.' }],
    cobarde: [{ category: 'Adjetivo', text: 'Que siente miedo ante el peligro o evita afrontarlo por falta de valor.' }],
    serenidad: [{ category: 'Sustantivo', text: 'Estado de calma, tranquilidad y equilibrio emocional.' }],
    efimero: [{ category: 'Adjetivo', text: 'Que dura muy poco tiempo o es pasajero.' }],
    bueno: [{ category: 'Adjetivo', text: 'Que tiene cualidades positivas o produce un resultado favorable.' }],
    malo: [{ category: 'Adjetivo', text: 'Que tiene cualidades negativas o produce un resultado desfavorable.' }],
    grande: [{ category: 'Adjetivo', text: 'Que tiene un tamaño, una cantidad o una importancia superiores a lo habitual.' }],
    pequeno: [{ category: 'Adjetivo', text: 'Que tiene un tamaño, una cantidad o una importancia reducidos.' }],
    rapido: [{ category: 'Adjetivo', text: 'Que se mueve, ocurre o actúa en poco tiempo.' }],
    lento: [{ category: 'Adjetivo', text: 'Que se mueve, ocurre o actúa con poca velocidad.' }],
    caliente: [{ category: 'Adjetivo', text: 'Que tiene o produce una temperatura elevada.' }],
    frio: [{ category: 'Adjetivo', text: 'Que tiene o produce una temperatura baja.' }],
    fuerte: [{ category: 'Adjetivo', text: 'Que tiene fuerza, resistencia o intensidad.' }],
    debil: [{ category: 'Adjetivo', text: 'Que tiene poca fuerza, resistencia o intensidad.' }],
    generoso: [{ category: 'Adjetivo', text: 'Que da o comparte con los demás sin esperar una recompensa.' }],
    egoista: [{ category: 'Adjetivo', text: 'Que antepone su propio interés al de los demás.' }],
    luz: [{ category: 'Sustantivo', text: 'Forma de energía que permite ver los objetos y distinguir sus formas y colores.' }],
    oscuridad: [{ category: 'Sustantivo', text: 'Falta o ausencia de luz.' }],
    amor: [{ category: 'Sustantivo', text: 'Sentimiento de afecto, cariño o inclinación hacia una persona o cosa.' }],
    odio: [{ category: 'Sustantivo', text: 'Sentimiento intenso de rechazo o aversión hacia alguien o algo.' }],
    limpio: [{ category: 'Adjetivo', text: 'Que no tiene suciedad, manchas ni impurezas.' }],
    sucio: [{ category: 'Adjetivo', text: 'Que tiene suciedad, manchas o impurezas.' }],
    sincero: [{ category: 'Adjetivo', text: 'Que expresa lo que piensa o siente sin fingimiento ni engaño.' }],
    mentira: [{ category: 'Sustantivo', text: 'Afirmación contraria a la verdad, hecha con intención de engañar.' }],
    verdad: [{ category: 'Sustantivo', text: 'Conformidad de lo que se dice o piensa con la realidad.' }],
    libre: [{ category: 'Adjetivo', text: 'Que puede actuar o decidir sin estar sometido a la voluntad de otra persona.' }],
    cerca: [{ category: 'Adverbio', text: 'A poca distancia en el espacio o en el tiempo.' }],
    lejos: [{ category: 'Adverbio', text: 'A gran distancia en el espacio o en el tiempo.' }]
  };

  function normalizeText(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  }

  function readStoredWords(key) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || '[]');
      if (!Array.isArray(value)) return [];
      const seen = new Set();
      return value
        .filter((item) => typeof item === 'string')
        .map(normalizeText)
        .filter((item) => {
          const normalized = normalizeKey(item);
          if (!normalized || seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        })
        .slice(0, key === FAVORITES_KEY ? MAX_FAVORITES : MAX_HISTORY);
    } catch (error) {
      console.info('[Brújula Verbal] El almacenamiento local no está disponible.', error.message);
      return [];
    }
  }

  function writeStoredWords(key, words) {
    try {
      window.localStorage.setItem(key, JSON.stringify(words));
    } catch (error) {
      console.info('[Brújula Verbal] No se pudieron guardar las palabras en este navegador.', error.message);
    }
  }

  function renderSavedCollection(containerId, emptyId, countId, words, collectionType) {
    const container = $(containerId);
    const empty = $(emptyId);
    const count = $(countId);
    if (!container || !empty || !count) return;

    container.replaceChildren();
    count.textContent = String(words.length);
    empty.hidden = words.length > 0;

    words.forEach((word) => {
      const item = document.createElement('div');
      item.className = 'saved-word';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'saved-word-link';
      openButton.textContent = word;
      openButton.title = `Buscar «${word}»`;
      openButton.addEventListener('click', () => search(word));
      item.append(openButton);

      if (collectionType === 'favorite') {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'saved-word-remove';
        removeButton.textContent = '×';
        removeButton.setAttribute('aria-label', `Quitar ${word} de favoritas`);
        removeButton.title = 'Quitar de favoritas';
        removeButton.addEventListener('click', () => {
          favorites = favorites.filter((saved) => normalizeKey(saved) !== normalizeKey(word));
          writeStoredWords(FAVORITES_KEY, favorites);
          renderSavedCollections();
          updateFavoriteButton();
        });
        item.append(removeButton);
      }
      container.append(item);
    });
  }

  function renderSavedCollections() {
    renderSavedCollection('favorites-list', 'favorites-empty', 'favorites-count', favorites, 'favorite');
    renderSavedCollection('history-list', 'history-empty', 'history-count', recentWords, 'history');
    const clearHistoryButton = $('clear-history-button');
    if (clearHistoryButton) clearHistoryButton.hidden = recentWords.length === 0;
  }

  function rememberSearch(word) {
    recentWords = [word, ...recentWords.filter((item) => normalizeKey(item) !== normalizeKey(word))].slice(0, MAX_HISTORY);
    writeStoredWords(HISTORY_KEY, recentWords);
    renderSavedCollections();
  }

  function updateFavoriteButton() {
    const button = $('favorite-button');
    if (!button) return;
    const saved = Boolean(currentEntry && favorites.some((word) => normalizeKey(word) === normalizeKey(currentEntry.word)));
    button.disabled = !currentEntry;
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    $('favorite-icon').textContent = saved ? '★' : '☆';
    $('favorite-label').textContent = saved ? 'Guardada' : 'Guardar';
    button.setAttribute('aria-label', saved ? `Quitar ${currentEntry?.word || 'palabra'} de favoritas` : `Guardar ${currentEntry?.word || 'palabra'} en favoritas`);
  }

  function toggleFavorite(word) {
    const index = favorites.findIndex((item) => normalizeKey(item) === normalizeKey(word));
    if (index >= 0) favorites.splice(index, 1);
    else favorites.unshift(word);
    favorites = favorites.slice(0, MAX_FAVORITES);
    writeStoredWords(FAVORITES_KEY, favorites);
    renderSavedCollections();
    updateFavoriteButton();
  }

  function initWordOfDay() {
    const now = new Date();
    const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    const featured = DAILY_WORDS[((dayNumber % DAILY_WORDS.length) + DAILY_WORDS.length) % DAILY_WORDS.length];
    $('word-of-day-text').textContent = featured.word;
    $('word-of-day-hint').textContent = featured.hint;
    $('word-of-day-button').addEventListener('click', () => search(featured.word));
  }

  function looksSpanish(text) {
    const value = normalizeText(text);
    if (!value || ENGLISH_MARKERS.test(value)) return false;
    const words = value.toLocaleLowerCase('es').match(/[a-záéíóúüñ]+/gi) || [];
    if (words.length <= 2) return true;
    let hits = 0;
    for (const word of words) if (SPANISH_STOPWORDS.has(word.toLocaleLowerCase('es'))) hits += 1;
    return hits > 0 || /[áéíóúñ¿¡]/i.test(value);
  }

  function isSafeDefinition(text) {
    const value = normalizeText(text);
    return value.length > 3 && !ADULT_SENSE_MARKERS.test(value) && looksSpanish(value);
  }

  function cleanRelationList(values, searchedWord) {
    if (!Array.isArray(values)) return [];
    const target = normalizeKey(searchedWord);
    const seen = new Set();
    const result = [];
    for (const raw of values) {
      if (typeof raw !== 'string') continue;
      const term = normalizeText(raw).replace(/^[«"'“”]+|[»"'“”]+$/g, '').replace(/[.;:,]+$/g, '');
      const key = normalizeKey(term);
      if (!key || key === target || seen.has(key) || term.length > 32 || term.length < 2) continue;
      if (!/^[\p{L}][\p{L}\s'-]*$/u.test(term)) continue;
      if (term.split(/\s+/).length > 3) continue;
      seen.add(key);
      result.push(term);
      if (result.length >= MAX_RELATIONS) break;
    }
    return result;
  }

  function translatePartOfSpeech(value) {
    const key = normalizeKey(value);
    const labels = {
      noun: 'Sustantivo', adjective: 'Adjetivo', verb: 'Verbo', adverb: 'Adverbio',
      pronoun: 'Pronombre', preposition: 'Preposición', conjunction: 'Conjunción',
      interjection: 'Interjección', determiner: 'Determinante', numeral: 'Numeral',
      article: 'Artículo', proper: 'Nombre propio', participle: 'Participio',
      sustantivo: 'Sustantivo', adjetivo: 'Adjetivo', verbo: 'Verbo', adverbio: 'Adverbio'
    };
    return labels[key] || (normalizeText(value) ? normalizeText(value).charAt(0).toLocaleUpperCase('es') + normalizeText(value).slice(1) : '');
  }

  function parseDictionaryApi(payload, searchedWord) {
    if (!Array.isArray(payload)) return null;
    const definitions = [];
    const senseRelations = [];

    for (const entry of payload) {
      if (!entry || !Array.isArray(entry.meanings)) continue;
      for (const meaning of entry.meanings) {
        if (!meaning || !Array.isArray(meaning.definitions)) continue;
        const category = translatePartOfSpeech(meaning.partOfSpeech);
        for (const item of meaning.definitions) {
          if (!item || !isSafeDefinition(item.definition)) continue;
          definitions.push({
            text: normalizeText(item.definition),
            category,
            example: isSafeDefinition(item.example || '') ? normalizeText(item.example) : ''
          });
          senseRelations.push({
            synonyms: cleanRelationList(item.synonyms, searchedWord),
            antonyms: cleanRelationList(item.antonyms, searchedWord),
            category
          });
        }
      }
    }

    return definitions.length ? { definitions: dedupeDefinitions(definitions).slice(0, MAX_DEFINITIONS), senseRelations, source: 'Free Dictionary API / Wiktionary' } : null;
  }

  function dedupeDefinitions(definitions) {
    const seen = new Set();
    return definitions.filter((item) => {
      const key = `${normalizeKey(item.category)}|${normalizeKey(item.text)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function extractListText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('ul, ol, dl, sup, .reference, .mw-editsection, .citation-needed, style, script').forEach((child) => child.remove());
    return normalizeText(clone.textContent).replace(/^\d+\s*/, '').replace(/\s*\[\d+\]\s*/g, ' ').trim();
  }

  function headingLabel(heading) {
    const headline = heading.querySelector('.mw-headline');
    const text = normalizeText(headline ? headline.textContent : heading.textContent);
    return text.replace(/\[editar\]/gi, '').trim();
  }

  function isPartOfSpeech(label) {
    const value = normalizeKey(label);
    return /^(adjetivo|sustantivo(?:\s+.+)?|verbo(?:\s+.+)?|adverbio|pronombre(?:\s+.+)?|preposicion|conjuncion|interjeccion|articulo(?:\s+.+)?|determinante(?:\s+.+)?|numeral(?:\s+.+)?|participio|locucion adjetiva|locucion adverbial|locucion verbal)$/i.test(value);
  }

  function getHeadingRange(documentRef, heading, nextHeading, fallbackNode) {
    const range = documentRef.createRange();
    range.setStartAfter(heading);
    if (nextHeading) range.setEndBefore(nextHeading);
    else range.setEndAfter(fallbackNode || heading);
    return range.cloneContents();
  }

  function nextHeadingAtSameOrHigher(headings, fromIndex, currentLevel) {
    for (let i = fromIndex + 1; i < headings.length; i += 1) {
      const level = Number(headings[i].tagName.slice(1));
      if (level <= currentLevel) return headings[i];
    }
    return null;
  }

  function readRelationNode(node) {
    const text = normalizeText(node.textContent);
    const match = text.match(/^(sin[oó]nimos?|ant[oó]nimos?)\s*:\s*(.+)$/i);
    if (!match) return null;
    const kind = normalizeKey(match[1]).startsWith('sin') ? 'synonyms' : 'antonyms';
    const linkedTerms = Array.from(node.querySelectorAll('a')).map((anchor) => normalizeText(anchor.textContent)).filter(Boolean);
    const terms = linkedTerms.length ? linkedTerms : match[2].replace(/\.$/, '').split(/[;,]/).map((part) => part.trim());
    return { kind, terms };
  }

  function parseWiktionaryHtml(html, searchedWord) {
    const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    const root = parsedDocument.querySelector('.mw-parser-output') || parsedDocument.body;
    const headings = Array.from(root.querySelectorAll('h2,h3,h4,h5,h6'));
    const spanishIndex = headings.findIndex((heading) => heading.tagName === 'H2' && normalizeKey(headingLabel(heading)) === 'espanol');
    if (spanishIndex < 0) return null;

    let spanishEndIndex = headings.findIndex((heading, index) => index > spanishIndex && heading.tagName === 'H2');
    if (spanishEndIndex < 0) spanishEndIndex = headings.length;
    const spanishEnd = headings[spanishEndIndex] || null;
    const spanishContent = getHeadingRange(parsedDocument, headings[spanishIndex], spanishEnd, root.lastChild);
    const sectionHeadings = headings.slice(spanishIndex + 1, spanishEndIndex);
    const definitions = [];
    const relationCandidates = [];

    for (let i = 0; i < sectionHeadings.length; i += 1) {
      const heading = sectionHeadings[i];
      const category = headingLabel(heading);
      if (!isPartOfSpeech(category)) continue;
      const level = Number(heading.tagName.slice(1));
      const next = nextHeadingAtSameOrHigher(sectionHeadings, i, level) || spanishEnd;
      const block = getHeadingRange(parsedDocument, heading, next, root.lastChild);
      const listItems = Array.from(block.querySelectorAll('ol > li, dl > dd')).filter((node) => {
        if (node.tagName === 'LI') return node.parentElement?.tagName === 'OL';
        return node.tagName === 'DD';
      });

      for (const item of listItems) {
        const text = extractListText(item);
        if (isSafeDefinition(text)) {
          definitions.push({ text, category: translatePartOfSpeech(category), example: '' });
          const nestedRows = Array.from(item.querySelectorAll('ul > li, dl > dd'));
          const senseRelations = { synonyms: [], antonyms: [], category: translatePartOfSpeech(category) };
          for (const row of nestedRows) {
            const relation = readRelationNode(row);
            if (relation) senseRelations[relation.kind].push(...relation.terms);
          }
          if (senseRelations.synonyms.length || senseRelations.antonyms.length) relationCandidates.push(senseRelations);
        }
      }
    }

    // Fallback estructural: ciertas plantillas de Wikcionario no usan una lista <ol>.
    // En ese caso se leen solo las listas numeradas dentro de la sección española.
    if (!definitions.length) {
      const wrapper = parsedDocument.createElement('div');
      wrapper.append(spanishContent.cloneNode(true));
      for (const list of Array.from(wrapper.querySelectorAll('ol'))) {
        for (const item of Array.from(list.children).filter((child) => child.tagName === 'LI')) {
          const text = extractListText(item);
          if (isSafeDefinition(text)) definitions.push({ text, category: 'Definición', example: '' });
        }
      }
    }

    return {
      definitions: dedupeDefinitions(definitions).slice(0, MAX_DEFINITIONS),
      senseRelations: relationCandidates,
      source: 'Wikcionario en español'
    };
  }

  async function fetchWithTimeout(url, signal) {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal
    });
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function fetchDictionaryApi(word, signal) {
    const url = DICTIONARY_API + encodeURIComponent(word.toLocaleLowerCase('es'));
    return fetchWithTimeout(url, signal);
  }

  async function fetchWiktionary(word, signal) {
    const params = new URLSearchParams({
      action: 'parse', page: word.replace(/\s+/g, '_'), prop: 'text',
      format: 'json', formatversion: '2', origin: '*', disableeditsection: '1'
    });
    const payload = await fetchWithTimeout(`${WIKTIONARY_API}?${params.toString()}`, signal);
    const html = typeof payload?.parse?.text === 'string'
      ? payload.parse.text
      : payload?.parse?.text?.['*'];
    if (typeof html !== 'string' || !html.trim()) return null;
    const entry = parseWiktionaryHtml(html, word);
    if (entry) entry.sourceUrl = `https://es.wiktionary.org/wiki/${encodeURIComponent((payload.parse.title || word).replace(/ /g, '_'))}`;
    return entry;
  }

  function curatedRelations(word) {
    return CURATED_RELATIONS[normalizeKey(word)] || null;
  }

  function chooseRelations(word, parsed) {
    const curated = curatedRelations(word);
    if (curated) {
      return {
        synonyms: cleanRelationList(curated.synonyms, word),
        antonyms: cleanRelationList(curated.antonyms, word),
        source: 'Selección revisada para el sentido principal'
      };
    }

    const candidates = Array.isArray(parsed?.senseRelations) ? parsed.senseRelations : [];
    // Se toma la primera acepción que tenga relaciones. No se mezclan listas de
    // acepciones distintas (por ejemplo, uso literal y vocativo).
    const firstUsefulSense = candidates.find((sense) => (sense.synonyms?.length || 0) + (sense.antonyms?.length || 0) > 0);
    if (firstUsefulSense) {
      return {
        synonyms: cleanRelationList(firstUsefulSense.synonyms, word),
        antonyms: cleanRelationList(firstUsefulSense.antonyms, word),
        source: parsed.source
      };
    }
    return { synonyms: [], antonyms: [], source: parsed?.source || 'Sin datos suficientes' };
  }

  function localDefinitions(word) {
    return LOCAL_DEFINITIONS[normalizeKey(word)] || [];
  }

  async function getEntry(rawWord, signal) {
    const key = normalizeKey(rawWord);
    if (cache.has(key)) return cache.get(key);

    let parsed = null;
    let sourceUrl = `https://es.wiktionary.org/wiki/${encodeURIComponent(rawWord.replace(/\s+/g, '_'))}`;

    try {
      const apiPayload = await fetchDictionaryApi(rawWord, signal);
      parsed = parseDictionaryApi(apiPayload, rawWord);
      if (apiPayload?.source?.url) sourceUrl = apiPayload.source.url;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      console.info('[Brújula Verbal] La API estructurada no respondió; se prueba Wikcionario.', error.message);
    }

    if (!parsed || parsed.definitions.length === 0) {
      try {
        const wikiEntry = await fetchWiktionary(rawWord, signal);
        if (wikiEntry && wikiEntry.definitions.length) {
          parsed = wikiEntry;
          sourceUrl = wikiEntry.sourceUrl || sourceUrl;
        }
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.info('[Brújula Verbal] No se pudo consultar Wikcionario.', error.message);
      }
    }

    const local = localDefinitions(rawWord);
    const definitions = parsed?.definitions?.length ? parsed.definitions : local;
    if (!definitions.length) {
      const error = new Error('WORD_NOT_FOUND');
      error.code = 'WORD_NOT_FOUND';
      throw error;
    }

    const relationResult = chooseRelations(rawWord, parsed);
    const entry = {
      word: rawWord,
      definitions: definitions.slice(0, MAX_DEFINITIONS),
      synonyms: relationResult.synonyms,
      antonyms: relationResult.antonyms,
      sourceUrl,
      definitionSource: parsed?.source || 'Definición local de respaldo',
      relationSource: relationResult.source
    };
    cache.set(key, entry);
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    return entry;
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
    searchButton.querySelector('span').textContent = isLoading ? 'Buscando…' : 'Buscar';
    searchButton.querySelector('b').textContent = isLoading ? '·' : '→';
    input.disabled = isLoading;
  }

  function renderDefinitions(definitions) {
    const list = $('definitions-list');
    list.replaceChildren();
    $('definitions-empty').hidden = definitions.length > 0;
    list.hidden = definitions.length === 0;

    definitions.forEach((definition) => {
      const item = document.createElement('li');
      if (definition.category) {
        const category = document.createElement('span');
        category.className = 'definition-category';
        category.textContent = definition.category;
        item.append(category, document.createElement('br'));
      }
      const text = document.createElement('span');
      text.textContent = definition.text;
      item.append(text);
      if (definition.example) {
        const example = document.createElement('span');
        example.className = 'definition-example';
        example.textContent = `Ejemplo: «${definition.example}»`;
        item.append(example);
      }
      list.append(item);
    });
  }

  function renderChips(containerId, emptyId, words) {
    const container = $(containerId);
    container.replaceChildren();
    const cleanWords = words.slice(0, MAX_RELATIONS);
    $(emptyId).hidden = cleanWords.length > 0;
    container.hidden = cleanWords.length === 0;
    cleanWords.forEach((word) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-chip';
      button.textContent = word;
      button.title = `Buscar «${word}»`;
      button.addEventListener('click', () => search(word));
      container.append(button);
    });
  }

  function renderEntry(entry) {
    currentEntry = entry;
    $('result-word').textContent = entry.word;
    const definitionCount = entry.definitions.length;
    $('result-meta').textContent = `${definitionCount} ${definitionCount === 1 ? 'definición' : 'definiciones'} · Español`;
    renderDefinitions(entry.definitions);
    renderChips('synonyms-list', 'synonyms-empty', entry.synonyms);
    renderChips('antonyms-list', 'antonyms-empty', entry.antonyms);
    $('source-link').href = entry.sourceUrl;
    $('source-note').textContent = `Definiciones: ${entry.definitionSource}. Relaciones: ${entry.relationSource}.`;
    updateFavoriteButton();
    rememberSearch(entry.word);
    setView('result');
  }

  function showError(error) {
    $('error-title').textContent = error.code === 'REQUEST_TIMEOUT' ? 'La búsqueda está tardando demasiado.' : 'No encontramos esa palabra.';
    $('error-copy').textContent = error.code === 'REQUEST_TIMEOUT'
      ? 'El diccionario no respondió a tiempo. Revisá tu conexión e intentá otra vez.'
      : 'Revisá la escritura o probá con otra palabra. También podés intentar con la forma singular.';
    setView('error');
  }

  let currentController = null;
  let searchNumber = 0;

  async function search(rawWord) {
    const word = normalizeText(rawWord);
    if (!word) { input.focus(); return; }
    if (!/^[\p{L}][\p{L}\s'-]{0,68}$/u.test(word)) {
      const error = new Error('INVALID_WORD');
      error.code = 'WORD_NOT_FOUND';
      showError(error);
      return;
    }

    if (currentController) currentController.abort();
    currentController = new AbortController();
    const controller = currentController;
    const thisSearch = ++searchNumber;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    input.value = word;
    clearButton.hidden = false;
    setLoading(true);
    setView('loading');

    try {
      const entry = await getEntry(word, controller.signal);
      if (thisSearch !== searchNumber) return;
      renderEntry(entry);
    } catch (error) {
      if (thisSearch !== searchNumber) return;
      console.error('[Brújula Verbal] Error de búsqueda:', error);
      showError(error.name === 'AbortError' ? Object.assign(new Error(), { code: 'REQUEST_TIMEOUT' }) : error);
    } finally {
      window.clearTimeout(timeout);
      if (thisSearch === searchNumber) {
        setLoading(false);
        input.disabled = false;
      }
      if (currentController === controller) currentController = null;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    search(input.value);
  });

  input.addEventListener('input', () => { clearButton.hidden = input.value.length === 0; });
  clearButton.addEventListener('click', () => {
    searchNumber += 1;
    if (currentController) currentController.abort();
    currentController = null;
    input.value = '';
    clearButton.hidden = true;
    input.focus();
    setLoading(false);
    setView('empty');
  });

  document.querySelectorAll('.suggestion').forEach((button) => {
    button.addEventListener('click', () => search(button.dataset.word || button.textContent));
  });

  $('favorite-button').addEventListener('click', () => {
    if (currentEntry) toggleFavorite(currentEntry.word);
  });

  $('clear-history-button').addEventListener('click', () => {
    recentWords = [];
    writeStoredWords(HISTORY_KEY, recentWords);
    renderSavedCollections();
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });

  initWordOfDay();
  renderSavedCollections();

  window.BrujulaVerbal = Object.freeze({
    parseDictionaryApi,
    parseWiktionaryHtml,
    cleanRelationList,
    curatedRelations
  });
})();
