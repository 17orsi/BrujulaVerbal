document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const word = document.getElementById('search-input').value.trim().toLowerCase();
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const resultsDiv = document.getElementById('results');
    
    if (!word) return;

    // Resetear interfaz
    loader.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    resultsDiv.classList.add('hidden');

    try {
        // Usamos una API libre de diccionario en español
        const response = await fetch(`https://dictionaryapi.dev{word}`);
        
        if (!response.ok) {
            throw new Error('No se encontró la palabra o hubo un error.');
        }

        const data = await response.json();
        const entry = data[0];

        // Cambiar título
        document.getElementById('word-title').textContent = word.toUpperCase();

        // Extraer definición
        const definition = entry.meanings[0]?.definitions[0]?.definition || 'No hay definición disponible.';
        document.getElementById('definition-text').textContent = definition;

        // Extraer sinónimos y antónimos de la API
        let synonyms = [];
        let antonyms = [];

        entry.meanings.forEach(meaning => {
            if (meaning.synonyms) synonyms.push(...meaning.synonyms);
            if (meaning.antonyms) antonyms.push(...meaning.antonyms);
        });

        // Renderizar etiquetas
        renderTags('synonyms-container', synonyms, 'synonym');
        renderTags('antonyms-container', antonyms, 'antonym');

        // Mostrar resultados
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

    // Filtrar duplicados
    const uniqueList = [...new Set(list)];

    if (uniqueList.length === 0) {
        container.innerHTML = '<span style="color: #64748b; font-size: 14px;">No se encontraron resultados.</span>';
        return;
    }

    uniqueList.forEach(item => {
        const span = document.createElement('span');
        span.className = `tag ${typeClass}`;
        span.textContent = item;
        container.appendChild(span);
    });
}
