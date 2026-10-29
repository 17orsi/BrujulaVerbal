document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const word = document.getElementById('search-input').value.trim().toLowerCase();
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const resultsDiv = document.getElementById('results');
    
    if (!word) return;

    // Resetear interfaz visual
    loader.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    resultsDiv.classList.add('hidden');

    try {
        // Usamos la API pública de OpenThesaurus / Wiktionary adaptada para español
        const response = await fetch(`https://dictionaryapi.dev{word}`);
        
        if (!response.ok) {
            throw new Error(`No encontramos la palabra "${word}". Intenta con otra.`);
        }

        const data = await response.json();
        
        // La API devuelve un array, tomamos el primer resultado válido
        const entry = data[0];

        // Cambiar título de la palabra en la pantalla
        document.getElementById('word-title').textContent = word.toUpperCase();

        // Extraer la primera definición disponible en los significados
        let definitionText = 'No hay definición disponible para esta acepción.';
        if (entry.meanings && entry.meanings.length > 0) {
            const firstMeaning = entry.meanings[0];
            if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
                definitionText = firstMeaning.definitions[0].definition;
            }
        }
        document.getElementById('definition-text').textContent = definitionText;

        // Recolectar todos los sinónimos y antónimos que vengan en el JSON
        let synonyms = [];
        let antonyms = [];

        if (entry.meanings) {
            entry.meanings.forEach(meaning => {
                if (meaning.synonyms) synonyms.push(...meaning.synonyms);
                if (meaning.antonyms) antonyms.push(...meaning.antonyms);
            });
        }

        // Renderizar los resultados en forma de etiquetas visuales
        renderTags('synonyms-container', synonyms, 'synonym');
        renderTags('antonyms-container', antonyms, 'antonym');

        // Mostrar la sección de resultados en la web
        resultsDiv.classList.remove('hidden');

    } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.classList.remove('hidden');
    } finally {
        loader.classList.add('hidden');
    }
});

function renderTags(containerId, list, typeClass) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // Filtrar elementos repetidos
    const uniqueList = [...new Set(list)];

    if (uniqueList.length === 0) {
        container.innerHTML = '<span style="color: #64748b; font-size: 14px;">No se encontraron resultados en esta categoría.</span>';
        return;
    }

    uniqueList.forEach(item => {
        const span = document.createElement('span');
        span.className = `tag ${typeClass}`;
        span.textContent = item;
        container.appendChild(span);
    });
}
