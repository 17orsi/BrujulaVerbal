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
        // Usamos la API pública pero a través de un proxy que salta el bloqueo de red (CORS)
        const apiUrl = `https://dictionaryapi.dev{word}`;
        const proxyUrl = `https://allorigins.win{encodeURIComponent(apiUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Error al conectar con el servidor.');

        const rawData = await response.json();
        
        // El proxy envuelve la respuesta en un campo 'contents' como texto string
        if (!rawData.contents) throw new Error('No se recibió respuesta del diccionario.');
        
        const data = JSON.parse(rawData.contents);

        // Si la API responde con un error estructurado (ej. palabra no encontrada)
        if (data.title === "No Definitions Found") {
            throw new Error(`No encontramos la palabra "${word}". Intenta con otra.`);
        }

        // Tomamos el primer resultado que devuelve el diccionario
        const entry = data[0];

        // Cambiar título de la palabra en la pantalla
        document.getElementById('word-title').textContent = word.toUpperCase();

        // Extraer la primera definición disponible de forma segura
        let definitionText = 'No hay definición directa disponible.';
        if (entry.meanings && entry.meanings[0] && entry.meanings[0].definitions && entry.meanings[0].definitions[0]) {
            definitionText = entry.meanings[0].definitions[0].definition;
        }
        document.getElementById('definition-text').textContent = definitionText;

        // Recolectar todos los sinónimos y antónimos del array de significados
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
