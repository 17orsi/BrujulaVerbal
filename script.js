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
        // Consultamos la API oficial de Wikcionario en español (Wikipedia de palabras)
        const url = `https://wiktionary.org{word}&format=json&origin=*`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Error al conectar con el servidor de diccionario.');
        }

        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];

        // Si el ID es -1 significa que la palabra no existe en el diccionario
        if (pageId === "-1") {
            throw new Error(`La palabra "${word}" no se encontró en el diccionario. Revisa la ortografía.`);
        }

        const textoCompleto = pages[pageId].extract;

        // Cambiar título de la palabra buscada
        document.getElementById('word-title').textContent = word.toUpperCase();

        // Procesar el texto para extraer la definición (primeras líneas)
        const lineas = textoCompleto.split('\n').filter(l => l.trim() !== '');
        const definicion = lineas[0] || 'Definición disponible en el Wikcionario.';
        document.getElementById('definition-text').textContent = definicion;

        // Extraer Sinónimos y Antónimos buscando palabras clave en el texto de Wikipedia
        const synonyms = [];
        const antonyms = [];

        // Buscador básico mediante expresiones regulares en el texto extraído
        lineas.forEach(linea => {
            const lineaMinuscula = linea.toLowerCase();
            if (lineaMinuscula.includes('sinónimo') || lineaMinuscula.includes('sinónimos')) {
                // Limpiamos y extraemos palabras candidatas de la línea
                const palabras = linea.replace(/^[^\:]*\:/, '').split(/[,;.\s]+/).filter(w => w.length > 2);
                synonyms.push(...palabras);
            }
            if (lineaMinuscula.includes('antónimo') || lineaMinuscula.includes('antónimos')) {
                const palabras = linea.replace(/^[^\:]*\:/, '').split(/[,;.\s]+/).filter(w => w.length > 2);
                antonyms.push(...palabras);
            }
        });

        // Si la extracción automática no pescó etiquetas limpias, dejamos una ayuda estructurada
        if (synonyms.length === 0) synonyms.push("Ver texto de definición para variantes");

        // Renderizar las etiquetas en la pantalla
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
        container.innerHTML = '<span style="color: #64748b; font-size: 14px;">No se encontraron resultados directos.</span>';
        return;
    }

    uniqueList.forEach(item => {
        const span = document.createElement('span');
        span.className = `tag ${typeClass}`;
        span.textContent = item.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ''); // Limpiar símbolos extraños
        if(span.textContent.trim().length > 1) {
            container.appendChild(span);
        }
    });
}
