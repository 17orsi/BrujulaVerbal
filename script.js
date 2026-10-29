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
        // CONEXIÓN A LA BASE DE DATOS: Datamuse en español para sinónimos
        const responseSyn = await fetch(`https://datamuse.com{word}&v=es`);
        // Consulta en paralelo para antónimos
        const responseAnt = await fetch(`https://datamuse.com{word}&v=es`);
        
        if (!responseSyn.ok || !responseAnt.ok) {
            throw new Error('Error al conectar con la base de datos del diccionario.');
        }

        const dataSyn = await responseSyn.json();
        const dataAnt = await responseAnt.json();
        
        // Si no se encuentra ningún tipo de relación con la palabra
        if (dataSyn.length === 0 && dataAnt.length === 0) {
            throw new Error(`No encontramos resultados para "${word}". Intenta con otra palabra.`);
        }

        // Cambiar título en la pantalla
        document.getElementById('word-title').textContent = word.toUpperCase();
        document.getElementById('definition-text').textContent = `Resultados encontrados en la base de datos para la palabra: ${word}.`;

        // Mapear los resultados de la base de datos
        const synonyms = dataSyn.map(item => item.word);
        const antonyms = dataAnt.map(item => item.word);

        // Renderizar las etiquetas en el HTML
        renderTags('synonyms-container', synonyms, 'synonym');
        renderTags('antonyms-container', antonyms, 'antonym');

        // Mostrar contenedor de resultados
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
