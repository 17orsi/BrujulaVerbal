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
        // Consultamos la API pública de OpenThesaurus en español
        const response = await fetch(`https://openthesaurus.de{word}&format=application/json`);
        
        if (!response.ok) {
            throw new Error('Error al conectar con el servidor.');
        }

        const data = await response.json();
        
        // Validar si la API encontró resultados para esa palabra
        if (!data.synsets || data.synsets.length === 0) {
            throw new Error(`No encontramos sinónimos para "${word}". Intenta con otra palabra.`);
        }

        // Cambiar título de la palabra buscada
        document.getElementById('word-title').textContent = word.toUpperCase();

        // Extraer la primera categoría/definición conceptual que devuelve la API
        const firstSet = data.synsets[0];
        const categoryText = firstSet.categories && firstSet.categories.length > 0 
            ? `Categoría: ${firstSet.categories[0].name}` 
            : `Concepto asociado a la búsqueda de "${word}".`;
            
        document.getElementById('definition-text').textContent = categoryText;

        // Recolectar los sinónimos del primer grupo de resultados
        let synonyms = [];
        firstSet.term.forEach(item => {
            // Evitamos agregar la misma palabra buscada a la lista de sinónimos
            if (item.term.toLowerCase() !== word) {
                synonyms.push(item.term);
            }
        });

        // OpenThesaurus no devuelve antónimos directos en el mismo JSON, 
        // dejamos una lista vacía controlada si no hay datos
        let antonyms = [];

        // Renderizar las etiquetas en la interfaz
        renderTags('synonyms-container', synonyms, 'synonym');
        renderTags('antonyms-container', antonyms, 'antonym');

        // Mostrar la caja de resultados
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

    // Filtrar elementos duplicados
    const uniqueList = [...new Set(list)];

    if (uniqueList.length === 0) {
        container.innerHTML = '<span style="color: #64748b; font-size: 14px;">No se encontraron resultados para esta sección.</span>';
        return;
    }

    uniqueList.forEach(item => {
        const span = document.createElement('span');
        span.className = `tag ${typeClass}`;
        span.textContent = item;
        container.appendChild(span);
    });
}
