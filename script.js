'use strict';

// Fuente: Free Dictionary API (datos de Wikcionario, licencia CC BY-SA 4.0).
// Documentación: https://freedictionaryapi.com/api/v1
const API_BASE_URL = 'https://freedictionaryapi.com/api/v1/entries/es/';
const REQUEST_TIMEOUT_MS = 12000;
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

// Normaliza texto para comparar palabras sin distinguir mayúsculas ni tildes.
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
    const word = rawItem.trim();
    const key = normalizeText(word);
    if (!word || key === target || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length >= MAX_RELATED_WORDS) break;
  }

  return words;
}

function collectSenses(senses, output = []) {
  if (!Array.isArray(senses)) return output;

  for (const sense of senses) {
    if (!sense || typeof sense !== 'object') continue;
    output.push(sense);
    if (Array.isArray(sense.subsenses)) {
      collectSenses(sense.subsenses, output);
    }
  }

  return output;
}

function translatePartOfSpeech(value) {
  const labels = {
    noun: 'Sustantivo',
    verb: 'Verbo',
    adjective: 'Adjetivo',
    adverb: 'Adverbio',
    pronoun: 'Pronombre',
    preposition: 'Preposición',
    conjunction: 'Conjunción',
    interjection: 'Interjección',
    determiner: 'Determinante',
    numeral: 'Numeral',
    article: 'Artículo',
    proper: 'Nombre propio',
    sustantivo: 'Sustantivo',
    verbo: 'Verbo',
    adjetivo: 'Adjetivo',
    adverbio: 'Adverbio'
  };

  if (!value) return '';
  const cleaned = String(value).trim();
  return labels[cleaned.toLocaleLowerCase('es')] || cleaned.charAt(0).toLocaleUpperCase('es') + cleaned.slice(1);
}

function parseDictionaryData(data, searchedWord) {
  if (!data || !Array.isArray(data.entries)) {
    throw new Error('El diccionario respondió con un formato inesperado. Probá de nuevo en unos segundos.');
  }

  const entries = data.entries.filter((entry) => {
    const languageCode = entry?.language?.code;
    return !languageCode || languageCode === 'es' || languageCode === 'spa';
  });

  const definitions = [];
  const synonyms = [];
  const antonyms = [];

  for (const entry of entries) {
    const partOfSpeech = translatePartOfSpeech(entry.partOfSpeech);

    if (Array.isArray(entry.synonyms)) synonyms.push(...entry.synonyms);
    if (Array.isArray(entry.antonyms)) antonyms.push(...entry.antonyms);

    const senses = collectSenses(entry.senses);
    for (const sense of senses) {
      if (typeof sense.definition === 'string' && sense.definition.trim()) {
        definitions.push({
          definition: sense.definition.trim(),
          partOfSpeech,
          tags: Array.isArray(sense.tags) ? sense.tags : [],
          example: Array.isArray(sense.examples) ? sense.examples.find((item) => typeof item === 'string' && item.trim()) : ''
        });
      }

      if (Array.isArray(sense.synonyms)) synonyms.push(...sense.synonyms);
      if (Array.isArray(sense.antonyms)) antonyms.push(...sense.antonyms);
    }
  }

  const uniqueDefinitions = [];
  const definitionKeys = new Set();
  for (const item of definitions) {
    const key = normalizeText(item.definition);
    if (definitionKeys.has(key)) continue;
    definitionKeys.add(key);
    uniqueDefinitions.push(item);
    if (uniqueDefinitions.length >= MAX_DEFINITIONS) break;
  }

  const allSynonyms = uniqueWords(synonyms, searchedWord);
  const allAntonyms = uniqueWords(antonyms, searchedWord);

  if (entries.length === 0 || (uniqueDefinitions.length === 0 && allSynonyms.length === 0 && allAntonyms.length === 0)) {
    throw new Error(`No encontramos información para «${searchedWord}». Revisá que esté bien escrita e intentá otra vez.`);
  }

  return {
    definitions: uniqueDefinitions,
    synonyms: allSynonyms,
    antonyms: allAntonyms,
    sourceUrl: typeof data.source?.url === 'string' ? data.source.url : ''
  };
}

async function fetchDictionaryEntry(word) {
  if (activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = API_BASE_URL + encodeURIComponent(word);
    const response = await fetch(url, {
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

    if (response.status === 404) {
      throw new Error(`No encontramos «${word}» en el diccionario. Probá revisar la ortografía o buscar una palabra distinta.`);
    }
    if (response.status === 429) {
      throw new Error('El diccionario recibió demasiadas consultas. Esperá un momento y volvé a intentar.');
    }
    if (!response.ok) {
      throw new Error('El servicio del diccionario no está disponible en este momento. Probá de nuevo más tarde.');
    }

    return parseDictionaryData(payload, word);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('La búsqueda tardó demasiado o fue reemplazada por otra. Intentá nuevamente.');
    }
    if (error instanceof TypeError) {
      throw new Error('No pudimos conectar con el diccionario. Revisá tu conexión a internet e intentá otra vez.');
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
    container.appendChild(createEmptyMessage('No hay resultados disponibles para esta palabra.'));
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

function displayResults(word, result) {
  elements.wordTitle.textContent = word;
  const definitionCount = result.definitions.length;
  elements.wordMeta.textContent = definitionCount
    ? `${definitionCount} ${definitionCount === 1 ? 'definición' : 'definiciones'} encontradas`
    : 'Información de la palabra';

  renderDefinitions(result.definitions);
  renderTags(elements.synonyms, result.synonyms, 'synonym');
  renderTags(elements.antonyms, result.antonyms, 'antonym');

  if (result.sourceUrl) {
    elements.sourceLink.href = result.sourceUrl;
    elements.sourceLink.classList.remove('hidden');
  } else {
    elements.sourceLink.href = 'https://es.wiktionary.org/';
  }

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
    displayResults(word, result);
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
