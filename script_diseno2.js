// === LOG de búsquedas a Google Sheets (Apps Script Web App) ===
const REPORT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyeY-1yE4zo6Yq55PLcsOsKMDgdQ9pqX115liHiTjzkjk6nGDKwDlIufzkvxuLwbIdT/exec';

function logBusquedaToSheets(busqueda, numResultados, cobraPrestacion, inscritoAnteriormente){
  const payload = {
    busqueda: busqueda,
    num_resultados: Number.isFinite(numResultados) ? numResultados : null,
    cobra_prestacion: cobraPrestacion,            // 'si' | 'no'
    inscrito_anteriormente: inscritoAnteriormente, // 'si' | 'no'
    fecha_hora: new Date().toISOString()
  };

  fetch(REPORT_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {

  // --- Elementos ---
  const chkInscrito = document.getElementById('chkInscrito');
  const chkPrestacion = document.getElementById('chkPrestacion');
  const chkNada = document.getElementById('chkNada');
  
  function getContextoChecksSiNo(){    //----------------------------------ver si esto funciona aquí, antes estaba antesd el document.addEventListener('DOMContentLoaded', () => {
    // Devuelve { cobra: 'si'|'no', inscrito: 'si'|'no' }
    // Priorizamos chkNada como estado “limpio”
    if (chkNada.checked){
      return { cobra: 'no', inscrito: 'no' };
    }
  
    const cobra = chkPrestacion.checked ? 'si' : 'no';
    const inscrito = chkInscrito.checked ? 'si' : 'no';
  
    return { cobra, inscrito };
  }
  
  const estadoChecks = document.getElementById('inscritoEstado');

  const searchInput = document.getElementById('searchInput');
  const btnSearch = document.getElementById('btnSearch');
  const resultsEl = document.getElementById('results');
  const countResults = document.getElementById('countResults');

  const modalDetalle = document.getElementById('modalDetalle');  
  const modalDetalleTitulo = document.getElementById('modalDetalleTitulo');
  const modalDetalleContent = document.getElementById('modalDetalleContent');
  const btnVolverDetalle = document.getElementById('btnVolverDetalle');
  
  const modalPreguntas = document.getElementById('modalPreguntas');
  const modalPreguntasTitulo = document.getElementById('modalPreguntasTitulo');
  const modalPreguntasContent = document.getElementById('modalPreguntasContent');
  const btnCancelarPreguntas = document.getElementById('btnCancelarPreguntas');
  const btnContinuarPreguntas = document.getElementById('btnContinuarPreguntas');
  
  const clearSearchInline = document.getElementById('clearSearchInline');
  if (clearSearchInline) {
    clearSearchInline.addEventListener('click', () => {
      searchInput.value = '';
      resultsEl.innerHTML = '';
      countResults.textContent = '0';
      searchInput.focus();
    });
  }

  let db = [];
  let userInscritoAnswer = null;

  // --- Utilidades ---
  function getField(obj, possibleNames){
    if (!obj) return undefined; // proteger por si obj es null/undefined
    const keys = Object.keys(obj);
    for(const n of possibleNames){
      const normN = n.trim().toLowerCase();
      for(const key of keys){
        if(key.trim().toLowerCase() === normN) return obj[key];
      }
    }
    return undefined;
  }

function normalizeYesNo(v){
  // devuelve: 'si' | 'no' | ''  (vacío o no interpretable)
  if (v === undefined || v === null) return '';
  const s = String(v).trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,''); // quita tildes

  if (!s) return '';
  if (s === 'si' || s === 'sí' || s === 's') return 'si';
  if (s === 'no' || s === 'n') return 'no';
  return '';
}

function recordPassesSilaFilters(rec){
  const cobra = normalizeYesNo(getField(rec, ['¿Cobra prestación?', 'Cobra prestación', '¿Cobra prestacion?']));
  const inscr = normalizeYesNo(getField(rec, ['¿Inscrito anteriormente?', '¿Inscrito anteriormente', 'Inscrito anteriormente?']));

  // 1) Si marca "Ninguna de las anteriores":
  //    cobra vacío o 'no' AND inscr vacío o 'no'
  if (chkNada.checked){
    const okCobra = (cobra === '' || cobra === 'no');
    const okInscr = (inscr === '' || inscr === 'no');
    return okCobra && okInscr;
  }

  // 2) Si marca "Cobra prestación o subsidio":
  //    SOLO registros con cobra='si' (ignora inscrito)
  if (chkPrestacion.checked){
    const okCobra = (cobra === 'si');
    const okInscr = (inscr === '' || inscr === 'no');
    return okCobra && okInscr;
  }
  
  if (chkInscrito.checked){
    const okCobra = (cobra === '' || cobra === 'no');
    const okInscr = (inscr === 'si'|| inscr === '');
    return okCobra && okInscr;
  } else {
    const okCobra = (cobra === '' || cobra === 'no');
    const okInscr = (inscr === '' || inscr === 'no');
    return okCobra && okInscr;
  }   
}

  
// --- MODAL DETALLE ----------------------------------------------------------------------
// ✅ convierte **texto** a <strong>texto</strong>
function renderBoldMarkdown(text){
  if (text === undefined || text === null) return '';

  // 1) A string
  let s = String(text);

  // 2) Escape básico
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 3) Negritas **texto**
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 4) Markdown links: [texto](url)  (permitiendo espacios)
  s = s.replace(
    /\[([^\]]+)\]\(\s*((?:https?:\/\/|www\.)[^\s)]+)\s*\)/g,
    (m, label, url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
  );

  // 5) Linkificar URLs SUELTAS, pero solo fuera de tags HTML
  //    (para NO tocar href="...")
  const parts = s.split(/(<[^>]+>)/g); // separa texto y tags
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) continue; // es una etiqueta, no tocar
    parts[i] = parts[i].replace(
      /((?:https?:\/\/|www\.)[^\s<]+[^\s<\.)])/g,
      (m) => {
        const href = m.startsWith('http') ? m : `https://${m}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${m}</a>`;
      }
    );
  }
  s = parts.join('');

  // 6) Saltos de línea
  s = s.replace(/(\r\n|\r|\n|\\n|\/n|\|\|)/g, '<br>');

  return s;
}

// ===== RESALTADO de tokens dentro de "Mostrar" (solo en lista) =====

// Escape para usar tokens en regex sin romper por caracteres raros
function escapeRegExp(str){
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenMatchesWord(wordRaw, token, tolerant=false){
  const w = normalizeText(wordRaw);   // usa tu normalizeText (quita tildes y normaliza)
  const t = normalizeText(token);

  if (!w || !t) return false;

  if (!tolerant) return w === t;

  // tolerancia = exacta OR prefijo OR levenshtein <= 20%
  if (w === t) return true;
  if (t.length >= 3 && w.startsWith(t)) return true;

  if (t.length >= 4 && w.length >= 4) {
    const maxLen = Math.max(w.length, t.length);
    const threshold = Math.max(1, Math.ceil(maxLen * 0.2));
    return levenshtein(w, t) <= threshold;
  }

  return false;
}

// Resalta tokens dentro de una parte de texto "plano" (sin tags)
function highlightTextPart(part, tokens, tolerant=false){
  if (!part || tokens.length === 0) return part;

  // separamos por espacios para mantenerlos (no rompe el layout)
  const chunks = part.split(/(\s+)/);

  return chunks.map(chunk => {
    if (!chunk || /^\s+$/.test(chunk)) return chunk;

    // quitamos puntuación para comparar, pero mantenemos el chunk original al pintar
    const chunkComparable = chunk.replace(/[^\p{L}\p{N}]+/gu, '');

    for (const tok of tokens){
      if (tokenMatchesWord(chunkComparable, tok, tolerant)){
        return `<span class="kw-hit">${chunk}</span>`;
      }
    }
    return chunk;
  }).join('');
}

// Versión de tu renderBoldMarkdown que además resalta tokens (exacto o tolerante)
function renderBoldMarkdownWithHighlights(text, highlightTokens = [], tolerant=false){
  if (text === undefined || text === null) return '';

  // 1) A string
  let s = String(text);

  // 2) Escape básico
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 3) Negritas **texto**
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 4) Links markdown [texto](url)
  s = s.replace(
    /\[([^\]]+)\]\(\s*((?:https?:\/\/|www\.)[^\s)]+)\s*\)/g,
    (m, label, url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
  );

  // 5) Linkificar URLs sueltas (sin tocar tags)
  const parts = s.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) continue;
    parts[i] = parts[i].replace(
      /((?:https?:\/\/|www\.)[^\s<]+[^\s<\.)])/g,
      (m) => {
        const href = m.startsWith('http') ? m : `https://${m}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${m}</a>`;
      }
    );
  }
  s = parts.join('');

  // 6) ✅ Resaltado (solo en partes de texto, no dentro de tags)
  const parts2 = s.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts2.length; i++) {
    if (parts2[i].startsWith('<')) continue;
    parts2[i] = highlightTextPart(parts2[i], highlightTokens, tolerant);
  }
  s = parts2.join('');

  // 7) Saltos de línea
  s = s.replace(/(\r\n|\r|\n|\\n|\/n|\|\|)/g, '<br>');

  return s;
}


  
// Normaliza solo para comparar (no para renderizar):
// - quita tildes, baja a minúsculas, deja espacios
function normalizeForMatch(s){
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu,'')
    .toLowerCase();
}

// Aplica <mark class="hit">...</mark> sobre el HTML ya renderizado,
// pero SOLO en partes de texto (no dentro de tags <a ...>, <strong>, etc.)
function highlightTokensInHtml(html, tokens){
  if (!html || !tokens || tokens.length === 0) return html;

  // Separar en [texto, tag, texto, tag...]
  const parts = String(html).split(/(<[^>]+>)/g);

  // Preparamos tokens: sin stopwords (ya vienen), y filtramos tokens cortos
  const toks = tokens
    .map(t => String(t || '').trim())
    .filter(Boolean)
    .filter(t => t.length >= 2); // evita pintar "a", "y", etc

  if (toks.length === 0) return html;

  // Para cada parte que sea texto (no tag), hacemos reemplazos
  for (let i = 0; i < parts.length; i++){
    const chunk = parts[i];
    if (!chunk || chunk.startsWith('<')) continue; // es tag, no tocar

    // Para no liarla con tildes: trabajamos en modo "búsqueda tolerante de tildes":
    // estrategia: como no podemos normalizar manteniendo índices fácilmente,
    // hacemos un resaltado "simple" por palabra exacta en el texto visible.
    //
    // Esto resalta tokens tal cual aparezcan (con o sin tildes),
    // y además intenta casar si el token no lleva tilde y el texto sí.
    let out = chunk;

    toks.forEach(tok => {
      const tokNorm = normalizeForMatch(tok);
      if (!tokNorm) return;

      // Patrón por límites de palabra.
      // NOTA: usamos un grupo que captura la palabra candidata y luego comprobamos normalización.
      const re = new RegExp(`\\b([\\p{L}\\p{N}]+)\\b`, 'gu');

      out = out.replace(re, (word) => {
        // Si ya está marcado, no lo vuelvas a marcar
        if (word.includes('hit')) return word;

        const wNorm = normalizeForMatch(word);
        if (wNorm === tokNorm) return `<mark class="hit">${word}</mark>`;
        return word;
      });
    });

    parts[i] = out;
  }

  return parts.join('');
}

// Renderiza tu markdown (negritas + links) y luego resalta tokens en el HTML resultante
function renderBoldMarkdownWithHighlights(text, tokens){
  const html = renderBoldMarkdown(text);
  return highlightTokensInHtml(html, tokens);
}

// --- MODAL DETALLE (con sufijo) ----------------------------------------------------------------------
function openModalDetalle(rec, suffix = ''){
  // limpiar contenido previo
  modalDetalleContent.innerHTML = '';
  modalDetalleTitulo.innerHTML = '';

  // título del modal
  const tituloMostrar = getField(rec, ['Mostrar', 'mostrar']) || '';
  modalDetalleTitulo.innerHTML = renderBoldMarkdown(tituloMostrar);

  function valueOf(names){
    const v = getField(rec, names);
    return (v === undefined || v === null) ? '' : String(v).trim();
  }

  // helper: construye el nombre de columna con sufijo
  function col(base){
    return suffix ? `${base} ${suffix}` : base;
  }

  // campos a mostrar (según rama)
  const fields = [
    { label: 'Código de inscripción en SILA', names: [ col('Código de inscripción en SILA') ] },
    { label: 'Modalidad de inscripción',     names: [ col('Modalidad de inscripción') ] },
    { label: 'Alcance de la Autorización',   names: [ col('Alcance de la Autorización') ] },
    { label: 'Observaciones',                names: [ col('Observaciones') ], boldTitle: true }
  ];

  let anyField = false;

  fields.forEach(f => {
    const val = valueOf(f.names);
    if(val){
      anyField = true;

      const row = document.createElement('div');
      row.className = 'field';

      const strongTitle = document.createElement(f.boldTitle ? 'strong' : 'span');
      strongTitle.textContent = f.label + ': ';
      row.appendChild(strongTitle);

      const valueElement = document.createElement(f.boldTitle ? 'span' : 'strong');
      valueElement.innerHTML = renderBoldMarkdown(val);

      row.appendChild(valueElement);
      modalDetalleContent.appendChild(row);
    }
  });

  // Documentación (según rama)
  const docKey = col('Documentación');
  const docVal = valueOf([docKey, docKey.replace('ó','o')]); // mini tolerancia

  if(docVal){
    anyField = true;

    const row = document.createElement('div');
    row.className = 'field';

    const title = document.createElement('span');
    title.textContent = 'Documentación: ';
    row.appendChild(title);

    const valStrong = document.createElement('strong');

    if(/^https?:\/\//i.test(docVal) || docVal.includes('/') || /\.(pdf|docx?|xlsx?)$/i.test(docVal)) {
      const a = document.createElement('a');
      a.href = docVal;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Acceder a la documentación oficial';
      valStrong.appendChild(a);
    } else {
      valStrong.innerHTML = renderBoldMarkdown(docVal);
    }

    row.appendChild(valStrong);
    modalDetalleContent.appendChild(row);
  }

  if(!anyField){
    const none = document.createElement('div');
    none.className = 'small';
    none.textContent = 'No hay datos para mostrar en este registro.';
    modalDetalleContent.appendChild(none);
  }

  modalDetalle.style.display = 'flex';
  modalDetalle.setAttribute('aria-hidden','false');
}
  
function closeModalPreguntas(){
  modalPreguntas.style.display = 'none';
  modalPreguntas.setAttribute('aria-hidden','true');
  modalPreguntasContent.innerHTML = '';
}

btnCancelarPreguntas.addEventListener('click', closeModalPreguntas);

// Decide qué modal abrir
function openRecord(rec){
  const tipo = (getField(rec, ['Opciones_Pregunta','opciones_pregunta']) || '').trim().toLowerCase();
  const p1 = (getField(rec, ['Pregunta1','pregunta1']) || '').trim();

  // si no hay tipo o no hay pregunta, abrimos directamente rama A (normal)
  if(!tipo || !p1){
    openModalDetalle(rec, ''); // A
    return;
  }

  openModalPreguntas(rec, tipo);
}

  function parseDateInputToDate(value){
  // value esperado: "YYYY-MM-DD"
  if(!value) return null;
  const d = new Date(value + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}
function addYears(date, years){
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}
function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

let _pregState = { rec:null, tipo:'', selectedBranch:null, phase:'initial', fecha1:null };

function getKeywordsRaw(rec){
  return (getField(rec, ['Palabras_Clave','palabras_clave','PALABRAS_CLAVE']) || '').toString();
}

function normalizeText(s){
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .toLowerCase()
    .trim();
}

function splitKeywordsToList(raw){
  // admite coma, punto y coma, pipes, saltos, /n, ||
  return String(raw || '')
    .replace(/(\r\n|\r|\n|\\n|\/n|\|\|)/g, ';')
    .split(/[;,|]+/g)
    .map(x => normalizeText(x))
    .filter(Boolean);
}

function keywordsBlob(rec){
  // “blob” de keywords normalizado para buscar dentro
  // (unimos con espacios para reutilizar containsTokenExact/Tolerant)
  const list = splitKeywordsToList(getKeywordsRaw(rec));
  return list.join(' ');
}

function keywordsMatchAll(rec, tokens, tolerant=false){
  const blob = keywordsBlob(rec);
  if (!blob) return false;

  for (const tok of tokens){
    // reutilizamos tu lógica especial autoriza/no autoriza si te interesa también aquí
    if (tolerant){
      if (!containsTokenTolerant(blob, tok)) return false;
    } else {
      if (!containsTokenExact(blob, tok)) return false;
    }
  }
  return true;
}

function keywordsMatchAny(rec, tokens, tolerant=false){
  const blob = keywordsBlob(rec);
  if (!blob) return false;

  for (const tok of tokens){
    if (tolerant){
      if (containsTokenTolerant(blob, tok)) return true;
    } else {
      if (containsTokenExact(blob, tok)) return true;
    }
  }
  return false;
}
  
function getMatchedTokensInKeywords(rec, tokens, tolerant=false){
  const blob = keywordsBlob(rec);
  if (!blob) return [];

  const hits = [];
  for (const tok of tokens){
    const ok = tolerant ? containsTokenTolerant(blob, tok) : containsTokenExact(blob, tok);
    if (ok) hits.push(tok);
  }
  return hits;
}

// Para pintar sugerencias: mostramos Mostrar + TODAS las palabras clave (originales)
function renderKeywordSuggestionItem(rec, highlightTokens = [], tolerant=false){
  const mostrar = getField(rec, ['Mostrar','mostrar']) || 'Registro';
  const titleHtml = renderBoldMarkdownWithHighlights(mostrar, highlightTokens, tolerant);

  return `
    <div class="result-item" style="cursor:pointer">
      <h4 style="margin:0">${titleHtml}</h4>
    </div>
  `;
}

function normalizeSimple(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .trim();
}

// Intenta sacar el tipo desde el JSON (si tienes una columna tipo_doc / tipo_documento / documento / etc.)
function getDocTypeFromRecord(rec){
  const raw =
    getField(rec, ['Tipo_Documento','Tipo documento','TipoDocumento','Tipo','Documento','Tipo_doc','tipo_documento','tipo']) || '';
  return normalizeSimple(raw);
}

// Clasifica en las 4 categorías pedidas
function classifyDocType(rec){
  // 1) si existe campo tipo en el JSON, úsalo
  const t = getDocTypeFromRecord(rec);

  // normaliza algunas variantes comunes
  if (t){
    if (t.includes('resol') || t.includes('tie')) return 'res_tie';
    if (t.includes('solic')) return 'solicitud';
    if (t.includes('recur')) return 'recurso';
    return 'otros';
  }

  // 2) si NO existe campo tipo, inferimos por texto
  const mostrar = normalizeSimple(getField(rec, ['Mostrar','mostrar']) || '');
  const anverso = normalizeSimple(getField(rec, ['ANVERSO','Anverso','anverso']) || '');
  const reverso = normalizeSimple(getField(rec, ['REVERSO','Reverso','reverso']) || '');
  const hay = `${mostrar} ${anverso} ${reverso}`;

  if (/\btie\b/.test(hay) || hay.includes('tarjeta') || hay.includes('resoluc')) return 'res_tie';
  if (hay.includes('solicitud') || hay.includes('solicita')) return 'solicitud';
  if (hay.includes('recurso')) return 'recurso';
  return 'otros';
}

// --- 1) Clasificación (ajusta según tu JSON) ---
function classifyDocType(rec){
  // ✅ Ejemplo: intenta deducir por "Mostrar" o por un campo tipo si existe
  const mostrar = String(getField(rec, ['Mostrar','mostrar']) || '').toLowerCase();

  // Si tienes un campo específico en el JSON, úsalo mejor:
  // const tipo = String(getField(rec, ['Tipo_Documento','tipo_documento','Tipo documento']) || '').toLowerCase();

  if (/\btie\b/.test(mostrar) || /\bresoluci/.test(mostrar)) return 'res_tie';
  if (/\bsolicitud\b/.test(mostrar)) return 'solicitud';
  if (/\brecurso\b/.test(mostrar)) return 'recurso';
  return 'otros';
}

// --- 2) Construye item "normal" reutilizando tu UI actual ---
function buildResultItem(x, tokens){
  const rec = x.rec;

  const wrapper = document.createElement('div');
  wrapper.className = 'result-item';
  wrapper.style.cursor = 'pointer';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';

  // Checkbox
  const chkWrap = document.createElement('div');
  chkWrap.className = 'check';
  chkWrap.style.display = 'flex';
  chkWrap.style.alignItems = 'center';

  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.name = 'selectRec';
  chk.dataset.index = x.idx;
  chkWrap.appendChild(chk);

  // Contenido
  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.gap = '4px';

  const title = document.createElement('h4');
  title.style.margin = '0';

  const mostrarTxt = getField(rec, ['Mostrar','mostrar']) || 'Registro sin campo Mostrar';
  title.innerHTML = renderBoldMarkdownWithHighlights(mostrarTxt, tokens);

  content.appendChild(title);

  wrapper.appendChild(chkWrap);
  wrapper.appendChild(content);

  // Eventos
  wrapper.addEventListener('click', e => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    const all = Array.from(document.querySelectorAll('input[name="selectRec"]'));
    all.forEach(inp => inp.checked = false);
    chk.checked = true;
    openRecord(rec);
  });

  chk.addEventListener('change', e => {
    const all = Array.from(document.querySelectorAll('input[name="selectRec"]'));
    all.forEach(inp => { if (inp !== e.target) inp.checked = false; });
    if (e.target.checked) openRecord(rec);
  });

  return wrapper;
}

// --- 3) Item sugerencia (B1/B2) reutiliza tu renderKeywordSuggestionItem ---
function buildSuggestionItem(x, highlightTokens = [], tolerant = false){
  const tmp = document.createElement('div');
  tmp.innerHTML = renderKeywordSuggestionItem(x.rec, highlightTokens, tolerant);
  const item = tmp.firstElementChild;

  item.addEventListener('click', () => openRecord(x.rec));
  return item;
}

// --- 4) Panel ayuda (item) como nodo ---
function buildHelpItem(){
  const tmp = document.createElement('div');
  tmp.innerHTML = `
    <div class="result-item help-item" style="cursor:pointer">
      <div style="flex:1">
        <h4>¿No encuentras lo que buscas?
          <a href="ayuda.html" target="_blank" rel="noopener noreferrer">Pulsa aquí y te ayudo a buscar</a>
        </h4>
        <div class="small">Te guío para encontrar la situación correcta.</div>
      </div>
    </div>
  `;
  const item = tmp.firstElementChild;

  item.addEventListener('click', (e) => {
    if (e.target.tagName.toLowerCase() === 'a') return;
    window.open('ayuda.html', '_blank', 'noopener,noreferrer');
  });

  return item;
}

// --- 5) Motor ÚNICO de render: normal + B1 + B2 ---
function renderResultsUnified({
  items = [],                // [{rec, idx}, ...]
  tokens = [],               // tokens del buscador (para resaltar)
  mode = 'normal',           // 'normal' | 'b1' | 'b2'
  noteHtml = '',             // texto superior opcional (B1/B2)
  suggestion = null,         // { kind:'keywords', tolerantUsed:boolean, hitTokensFn:(x)=>[] }
  includeHelp = true
}){
  resultsEl.innerHTML = '';

  const frag = document.createDocumentFragment();

  // Nota superior (solo si quieres)
  if (noteHtml){
    const note = document.createElement('div');
    note.className = 'small';
    note.innerHTML = noteHtml;
    frag.appendChild(note);
  }

  // Agrupar
  const groups = { res_tie: [], solicitud: [], recurso: [], otros: [] };
  items.forEach(x => {
    const cat = classifyDocType(x.rec);
    (groups[cat] || groups.otros).push(x);
  });

  const order = [
    ['res_tie', 'Resoluciones / TIE'],
    ['solicitud', 'Solicitudes'],
    ['recurso', 'Recursos'],
    ['otros', 'Otros']
  ];

  order.forEach(([key, label]) => {
    const arr = groups[key];
    if (!arr || arr.length === 0) return;

    const section = document.createElement('section');
    section.className = 'result-section';
    section.dataset.cat = key;

    const header = document.createElement('div');
    header.className = 'result-section-header';
    header.innerHTML = `
      <span>${label}</span>
      <span class="result-section-count">${arr.length}</span>
    `;

    const body = document.createElement('div');
    body.className = 'result-section-body';

    // Pintado según modo:
    arr.forEach(x => {
      if (mode === 'normal'){
        body.appendChild(buildResultItem(x, tokens));
      } else {
        // B1/B2: sugerencias
        const tolerant = suggestion?.tolerantUsed || false;
        const hitTokens = suggestion?.hitTokensFn ? suggestion.hitTokensFn(x) : [];
        body.appendChild(buildSuggestionItem(x, hitTokens, tolerant));
      }
    });

    section.appendChild(header);
    section.appendChild(body);
    frag.appendChild(section);
  });

  // Si no hay ningún grupo (items vacíos), lo dejamos sin grupos.
  // Aun así puedes poner ayuda siempre:
  if (includeHelp){
    const helpSection = document.createElement('section');
    helpSection.className = 'result-section';
    helpSection.dataset.cat = 'help';

    const header = document.createElement('div');
    header.className = 'result-section-header';
    header.innerHTML = `<span>Ayuda</span>`;

    const body = document.createElement('div');
    body.className = 'result-section-body';
    body.appendChild(buildHelpItem());

    helpSection.appendChild(header);
    helpSection.appendChild(body);
    frag.appendChild(helpSection);
  }

  resultsEl.appendChild(frag);
}
  
// Crea un wrapper result-item (reutiliza tu UI actual)
function buildResultItem({ rec, idx }, tokens){
  const wrapper = document.createElement('div');
  wrapper.className = 'result-item';
  wrapper.style.cursor = 'pointer';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';

  // Checkbox
  const chkWrap = document.createElement('div');
  chkWrap.className = 'check';
  chkWrap.style.display = 'flex';
  chkWrap.style.alignItems = 'center';

  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.name = 'selectRec';
  chk.dataset.index = idx;
  chkWrap.appendChild(chk);

  // Contenido
  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.gap = '4px';

  const title = document.createElement('h4');
  title.style.margin = '0';

  const mostrarTxt = getField(rec, ['Mostrar','mostrar']) || 'Registro sin campo Mostrar';
  title.innerHTML = renderBoldMarkdownWithHighlights(mostrarTxt, tokens);

  content.appendChild(title);

  wrapper.appendChild(chkWrap);
  wrapper.appendChild(content);

  // Eventos
  wrapper.addEventListener('click', e => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    const all = Array.from(document.querySelectorAll('input[name="selectRec"]'));
    all.forEach(inp => inp.checked = false);
    chk.checked = true;
    openRecord(rec);
  });

  chk.addEventListener('change', e => {
    const all = Array.from(document.querySelectorAll('input[name="selectRec"]'));
    all.forEach(inp => { if (inp !== e.target) inp.checked = false; });
    if (e.target.checked) openRecord(rec);
  });

  return wrapper;
}

// Pinta secciones por tipo, en el orden pedido
function renderGroupedResults(items, tokens, { includeHelp = true } = {}){
  // 🔒 Limpieza total: nada debe sobrevivir fuera de grupos
  resultsEl.innerHTML = '';

  const groups = {
    res_tie: [],
    solicitud: [],
    recurso: [],
    otros: []
  };

  items.forEach(x => {
    const cat = classifyDocType(x.rec);
    (groups[cat] || groups.otros).push(x);
  });

  const order = [
    ['res_tie', 'Resoluciones / TIE'],
    ['solicitud', 'Solicitudes'],
    ['recurso', 'Recursos'],
    ['otros', 'Otros']
  ];

  const frag = document.createDocumentFragment();

  order.forEach(([key, label]) => {
    const arr = groups[key];
    if (!arr || arr.length === 0) return;

    const section = document.createElement('section');
    section.className = 'result-section';
    section.dataset.cat = key; // ✅ para colorear por CSS

    const header = document.createElement('div');
    header.className = 'result-section-header';
    header.innerHTML = `
      <span>${label}</span>
      <span class="result-section-count">${arr.length}</span>
    `;

    const body = document.createElement('div');
    body.className = 'result-section-body';

    arr.forEach(x => body.appendChild(buildResultItem(x, tokens)));

    section.appendChild(header);
    section.appendChild(body);
    frag.appendChild(section);
  });

  // ✅ Panel de ayuda independiente (si quieres que SIEMPRE salga como “otro resultado”)
  if (includeHelp){
    const helpSection = document.createElement('section');
    helpSection.className = 'result-section';
    helpSection.dataset.cat = 'help';

    const header = document.createElement('div');
    header.className = 'result-section-header';
    header.innerHTML = `<span>¿No encuentras lo que buscas?</span>`;

    const body = document.createElement('div');
    body.className = 'result-section-body';

    // Reutilizamos tu help-item pero lo metemos dentro del panel
    const tmp = document.createElement('div');
    tmp.innerHTML = `
      <div class="result-item help-item" style="cursor:pointer">
        <div style="flex:1">
          <h4>¿No encuentras lo que buscas?
            <a href="ayuda.html" target="_blank" rel="noopener noreferrer">Pulsa aquí y te ayudo a buscar</a>
          </h4>
          <div class="small">Te guío para encontrar la situación correcta.</div>
        </div>
      </div>
    `;
    const item = tmp.firstElementChild;

    item.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'a') return;
      window.open('ayuda.html', '_blank', 'noopener,noreferrer');
    });

    body.appendChild(item);
    helpSection.appendChild(header);
    helpSection.appendChild(body);
    frag.appendChild(helpSection);
  }

  resultsEl.appendChild(frag);
}


  
function appendHelpResult(){
  const tmp = document.createElement('div');
  tmp.innerHTML = `
    <div class="result-item help-item" style="cursor:pointer">
      <div style="flex:1">
        <h4>¿No encuentras lo que buscas? <a href="ayuda.html" target="_blank" rel="noopener noreferrer">Pulsa aquí y te ayudo a buscar</a></h4>
      </div>
    </div>
  `;
  const item = tmp.firstElementChild;

  // si quieres que al clicar en cualquier parte abra la ayuda:
  item.addEventListener('click', (e) => {
    // si clican el link, ya abre él solo
    if (e.target.tagName.toLowerCase() === 'a') return;
    window.open('ayuda.html', '_blank', 'noopener,noreferrer');
  });

  resultsEl.appendChild(item);
}
  function containsTokenExact(text, token) {
    const words = text.split(/\s+/).map(w => w.toLowerCase());
    token = token.toLowerCase();
    if (token === 'autoriza') {
      for (let i = 0; i < words.length; i++) {
        if (words[i] === 'autoriza' && (i === 0 || words[i-1] !== 'no')) return true;
      }
      return false;
    }
    if (token === 'no autoriza') {
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === 'no' && words[i+1] === 'autoriza') return true;
      }
      return false;
    }
    return words.includes(token);
  }

function containsTokenTolerant(text, token) {
  const words = text.split(/\s+/);
  token = token.toLowerCase();

  for (const w of words) {
    const word = w.toLowerCase();

    // 1. Exacta
    if (word === token) return true;

    // 2. Prefijo (inicio de palabra)
    if (word.startsWith(token) && token.length >= 3) return true;

    // 3. Tolerancia por Levenshtein
    if (token.length >= 4 && word.length >= 4) {
      const maxLen = Math.max(word.length, token.length);
      const threshold = Math.max(1, Math.ceil(maxLen * 0.2)); // ahora 20% en vez de 10%
      if (levenshtein(word, token) <= threshold) return true;
    }
  }

  return false;
}  

  // --- Levenshtein para tolerancia ---
  function levenshtein(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (__, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }  
  
function normRule(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/\s+/g,' ')
    .trim();
}

function parseExpr(expr, d1, d2){
  // expr ejemplos: "fecha1", "fecha2", "hoy", "fecha1 + 30 dias", "fecha2 + 16 anos"
  let s = normRule(expr);

  let base;
  if (/^fecha\s*1\b|^fecha1\b/.test(s)) base = new Date(d1);
  else if (/^fecha\s*2\b|^fecha2\b/.test(s)) base = new Date(d2);
  else if (/^hoy\b|^now\b/.test(s)) base = new Date();
  else return null;

  // aplicar +N dias / +N anos (soporta también "-")
  const m = s.match(/(fecha\s*1|fecha1|fecha\s*2|fecha2|hoy|now)\s*([+-])\s*(\d+)\s*(dias|dia|anos|ano|years|year|days|day)\b/);
  if (m){
    const sign = m[2] === '-' ? -1 : 1;
    const n = parseInt(m[3], 10) * sign;
    const unit = m[4];

    if (unit.startsWith('dia') || unit.startsWith('day')) {
      base.setDate(base.getDate() + n);
    } else {
      base.setFullYear(base.getFullYear() + n);
    }
  }

  return base;
}

function evalSimpleComparison(ruleText, d1, d2){
  // Soporta: <, >, <=, >=, = y equivalentes en texto "antes de", "despues de", "igual a"
  const s0 = normRule(ruleText);

  // Normaliza comparadores “textuales” a símbolos
  let s = s0
    .replace(/\banterior a\b|\bantes de\b/g, '<')
    .replace(/\bposterior a\b|\bdespues de\b/g, '>')
    .replace(/\bigual a\b|\bigual\b/g, '=');

  // Permite "fecha1 <= fecha2 + 30 dias"
  const m = s.match(/(.+?)(<=|>=|<|>|=)(.+)/);
  if(!m) return null;

  const left = parseExpr(m[1], d1, d2);
  const op = m[2];
  const right = parseExpr(m[3], d1, d2);

  if(!left || !right) return null;

  const L = left.getTime();
  const R = right.getTime();

  if (op === '<') return L < R;
  if (op === '>') return L > R;
  if (op === '<=') return L <= R;
  if (op === '>=') return L >= R;
  if (op === '=') return L === R;
  return null;
}

function evalRule(ruleText, d1, d2){
  // Soporta condiciones compuestas con "y" / "and"
  const s = normRule(ruleText);
  if(!s) return null;

  const parts = s.split(/\s+y\s+|\s+and\s+/).map(p => p.trim()).filter(Boolean);
  if(parts.length === 0) return null;

  for(const p of parts){
    const r = evalSimpleComparison(p, d1, d2);
    if(r === null) return null;     // si no se puede interpretar, abortamos
    if(r === false) return false;   // una condición falla => toda la regla falla
  }
  return true; // todas true
}
function addQuestion(text){
  if(!text) return;
  const q = document.createElement('div');
  q.className = 'field';
  q.innerHTML = `<strong>${renderBoldMarkdown(text)}</strong>`;
  modalPreguntasContent.appendChild(q);
}  
function addABCRadios({ onlyAB = false } = {}){
  const recLocal = _pregState?.rec; // <- clave

  if (!recLocal) {
    console.error('addABCRadios: _pregState.rec no está definido');
    return;
  }

  const oa = (getField(recLocal, ['Opción a','Opcion a']) || 'Opción A').trim();
  const ob = (getField(recLocal, ['Opción b','Opcion b']) || 'Opción B').trim();
  const oc = (getField(recLocal, ['Opción c','Opcion c']) || '').trim();

  const box = document.createElement('div');
  box.className = 'field';
  box.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <label style="display:flex;gap:8px;align-items:center">
        <input type="radio" name="branchABC" value="a"> <strong>A</strong>: ${renderBoldMarkdown(oa)}
      </label>
      <label style="display:flex;gap:8px;align-items:center">
        <input type="radio" name="branchABC" value="b"> <strong>B</strong>: ${renderBoldMarkdown(ob)}
      </label>
      ${(!onlyAB && oc) ? `
      <label style="display:flex;gap:8px;align-items:center">
        <input type="radio" name="branchABC" value="c"> <strong>C</strong>: ${renderBoldMarkdown(oc)}
      </label>` : ``}
    </div>
    <div class="small" style="margin-top:8px">Selecciona una opción para continuar.</div>
  `;
  modalPreguntasContent.appendChild(box);
}

function openModalPreguntas(rec, tipo){
  _pregState = { rec, tipo, selectedBranch: null, phase: 'initial', fecha1: null, fecha2: null };

  modalPreguntasContent.innerHTML = '';
  modalPreguntasTitulo.innerHTML = renderBoldMarkdown((getField(rec, ['Mostrar','mostrar']) || '').trim());

  const p1 = (getField(rec, ['Pregunta1']) || '').trim();
  const p2 = (getField(rec, ['Pregunta2']) || '').trim();

  // helpers de render


  function addDateInput(id, labelText){
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <label><strong>${labelText}</strong> <input id="${id}" type="date"></label>
      </div>
    `;
    modalPreguntasContent.appendChild(wrap);
  }
  // --- Construcción del modal según tipo ---
  if(tipo === 'fecha'){
    // Si hay pregunta, la ponemos y luego el input
    addQuestion(p1 || 'Introduce la fecha:');
    addDateInput('pregFecha1', 'Fecha:');
  }
  else if (tipo === 'fecha+ab') {
    addQuestion(p1 || 'Introduce la fecha:');
    addDateInput('pregFecha1', 'Fecha:');
    // Nota opcional
    const rule = (getField(rec, ['PreguntaABC','preguntaabc']) || '').trim();
    if(rule){
      const hint = document.createElement('div');
      hint.className = 'small';
      hint.style.marginTop = '6px';
      modalPreguntasContent.appendChild(hint);
    }
  
    _pregState.phase = 'date';     // importante
    _pregState.fecha1 = null;
  }    
  else if (tipo === 'dosfechas+ab') {
    addQuestion(p1 || 'Introduce la fecha 1:');
    addDateInput('pregFecha1', 'Fecha 1:');
  
    addQuestion(p2 || 'Introduce la fecha 2:');
    addDateInput('pregFecha2', 'Fecha 2:');
  
    const rule = (getField(rec, ['PreguntaABC','preguntaabc']) || '').trim();
    if(rule){
      const hint = document.createElement('div');
      hint.className = 'small';
      hint.style.marginTop = '6px';
      modalPreguntasContent.appendChild(hint);
    }
  
    _pregState.phase = 'dates';
  }    
  else if(tipo === 'dosfechas'){
    // Pregunta 1 -> Fecha1
    addQuestion(p1 || 'Introduce la fecha 1:');
    addDateInput('pregFecha1', 'Fecha 1:');

    // Pregunta 2 -> Fecha2 (si no existe, ponemos genérico)
    addQuestion(p2 || 'Introduce la fecha 2:');
    addDateInput('pregFecha2', 'Fecha 2:');
  }
  else if(tipo === 'abc'){
    // Aquí mantenemos tu comportamiento: preguntas arriba + radios
    if(p1) addQuestion(p1);
    if(p2) addQuestion(p2);
    addABCRadios();
  }
  else {
    const box = document.createElement('div');
    box.className = 'field';
    box.innerHTML = `<div class="small">Tipo de pregunta no soportado: <strong>${tipo}</strong></div>`;
    modalPreguntasContent.appendChild(box);
  }

  modalPreguntas.style.display = 'flex';
  modalPreguntas.setAttribute('aria-hidden','false');
}
// continuar: decide rama y abre detalle con sufijo
btnContinuarPreguntas.addEventListener('click', () => {
  const rec = _pregState.rec;
  const tipo = _pregState.tipo;
  if(!rec) return;

  let branch = null; // 'a' | 'b' | 'c'

  if(tipo === 'abc'){
    const checked = document.querySelector('input[name="branchABC"]:checked');
    if(!checked){
      alert('Selecciona una opción (A/B/C).');
      return;
    }
    branch = checked.value;
  }
    
  else if (tipo === 'fecha+ab') {
  
    // Fase 1: pedir fecha y decidir si pasamos a la pregunta A/B o saltamos a C
    if (_pregState.phase === 'date') {
      const v = document.getElementById('pregFecha1')?.value || '';
      const fecha = parseDateInputToDate(v);
      if(!fecha){
        alert('Introduce una fecha válida.');
        return;
      }
  
      const cond = (getField(rec, ['PreguntaABC','preguntaabc']) || '').trim();
      if(!cond){
        alert('Falta la condición en PreguntaABC.');
        return;
      }
  
      // Evaluamos la condición usando tu motor (fecha1 + hoy)
      const ok = evalRule(cond, fecha, fecha); // d2 no se usa, pero tu parser entiende hoy/fecha1
      if (ok !== true){
        // No cumple => rama C directamente
        branch = 'c';
      } else {
        // Cumple => mostramos Pregunta2 con radios A/B
        modalPreguntasContent.innerHTML = '';
        addQuestion((getField(rec, ['Pregunta2']) || '').trim() || 'Selecciona una opción:');
        addABCRadios({ onlyAB: true });
  
        _pregState.phase = 'ab';
        _pregState.fecha1 = fecha;
        return; // IMPORTANTE: no cerramos modal aún, esperamos la elección A/B
      }
    }
  
    // Fase 2: elegir A/B
    if (_pregState.phase === 'ab') {
      const checked = document.querySelector('input[name="branchABC"]:checked');
      if(!checked){
        alert('Selecciona una opción (A/B).');
        return;
      }
      branch = checked.value; // a o b
    }
  }

  else if (tipo === 'dosfechas+ab') {
  
    // Fase 1: pedir fechas y decidir si pasamos a la pregunta A/B o saltamos a C
    if (_pregState.phase === 'dates') {
      const v1 = document.getElementById('pregFecha1')?.value || '';
      const v2 = document.getElementById('pregFecha2')?.value || '';
  
      const d1 = parseDateInputToDate(v1);
      const d2 = parseDateInputToDate(v2);
  
      if(!d1 || !d2){
        alert('Introduce ambas fechas.');
        return;
      }
  
      const cond = (getField(rec, ['PreguntaABC','preguntaabc']) || '').trim();
      if(!cond){
        alert('Falta la condición en PreguntaABC.');
        return;
      }
  
      const ok = evalRule(cond, d1, d2);
  
      if (ok !== true){
        // No cumple => rama C directa
        branch = 'c';
      } else {
        // Cumple => mostramos Pregunta3 con radios A/B
        modalPreguntasContent.innerHTML = '';
        const p3 = (getField(rec, ['Pregunta3','pregunta3']) || '').trim();
        addQuestion(p3 || 'Selecciona una opción:');
        addABCRadios({ onlyAB: true });
  
        _pregState.phase = 'ab';
        _pregState.fecha1 = d1;
        _pregState.fecha2 = d2;
        return; // esperamos el click siguiente con A/B
      }
    }
  
    // Fase 2: elegir A/B
    if (_pregState.phase === 'ab') {
      const checked = document.querySelector('input[name="branchABC"]:checked');
      if(!checked){
        alert('Selecciona una opción (A/B).');
        return;
      }
      branch = checked.value; // a o b
    }
  }
    
  else if(tipo === 'fecha'){
    const v = document.getElementById('pregFecha1')?.value || '';
    const fecha = parseDateInputToDate(v);
    if(!fecha){
      alert('Introduce una fecha válida.');
      return;
    }

    const hoy = new Date();
    const plus30  = addDays(fecha, 30);
    const plus180 = addDays(fecha, 180);

    if(hoy > plus180) branch = 'a';
    else if(hoy >= plus30 && hoy <= plus180) branch = 'b';
    else branch = 'c';
  }
  else if(tipo === 'dosfechas'){
    const v1 = document.getElementById('pregFecha1')?.value || '';
    const v2 = document.getElementById('pregFecha2')?.value || '';

    const d1 = parseDateInputToDate(v1);
    const d2 = parseDateInputToDate(v2);

    if(!d1 || !d2){
      alert('Introduce ambas fechas.');
      return;
    }

    const ruleA = (getField(rec, ['Opción a','Opcion a']) || '').trim();
    const ruleB = (getField(rec, ['Opción b','Opcion b']) || '').trim();
    const ruleC = (getField(rec, ['Opción c','Opcion c']) || '').trim();

    const okA = evalRule(ruleA, d1, d2);
    const okB = evalRule(ruleB, d1, d2);
    const okC = ruleC ? evalRule(ruleC, d1, d2) : false;

    if(okA === true) branch = 'a';
    else if(okB === true) branch = 'b';
    else if(okC === true) branch = 'c';
    else {
      alert('No se ha podido determinar A/B/C con las reglas de Opción a/b/c. Revisa el formato de las reglas.');
      return;
    }
  } else {
    alert('Tipo de pregunta no soportado: ' + tipo);
    return;
  }

  const suffix = (branch === 'a') ? '' : (branch === 'b') ? 'OPCIONAL' : 'OPCIONAL2';

  closeModalPreguntas();
  openModalDetalle(rec, suffix);
});



  function closeModalDetalle(){
    modalDetalle.style.display='none';
    modalDetalle.setAttribute('aria-hidden','true');
  }

  btnVolverDetalle.addEventListener('click', closeModalDetalle);

  // --- Carga JSON ---
  async function loadJSON(){
    try{
      const res = await fetch('./SituacionesAdministrativas.json', {cache:'no-store'});
      if(!res.ok) throw new Error('No se pudo cargar SituacionesAdministrativas.json');
      db = await res.json();
      console.log('Registros cargados:', db.length);
    }catch(err){
      resultsEl.innerHTML =
        `<div class="small" style="color:#c62828">Error al cargar JSON: ${err.message}</div>`;
    }
  }
  loadJSON();

const searchWrapper = document.querySelector('.search-input-wrapper');

searchWrapper.addEventListener('click', e => {
  if (searchInput.disabled) {
    // mostrar mensaje
    msgDisabled.classList.add('show');
    setTimeout(() => msgDisabled.classList.remove('show'), 3000);

    // opcional: evitar que se haga focus
    searchInput.blur();
  }
});

  
  // --- Filtros SILA ---
  function syncNadaLogic(changed){
    if(changed==='nada' && chkNada.checked){
      chkInscrito.checked=false;
      chkPrestacion.checked=false;
    }
    if((changed==='inscrito'||changed==='prestacion') &&
       (chkInscrito.checked||chkPrestacion.checked)){
      chkNada.checked=false;
    }
  }

function actualizarChecks(){
  syncNadaLogic();

  const anyChecked = (chkInscrito.checked || chkPrestacion.checked || chkNada.checked);

  if (anyChecked) {

      // habilitar
      searchInput.disabled = false;
      btnSearch.disabled = false;

      // borrar texto SIEMPRE al desbloquear
      searchInput.value = '';

      // activar estilo de campo activo
      searchInput.classList.add("enabled");

      // activar la animación
      searchInput.classList.add("flash");
      setTimeout(() => searchInput.classList.remove("flash"), 400);

      // llevar el cursor al input
      searchInput.focus();

  } else {

      searchInput.disabled = true;
      btnSearch.disabled = true;

      searchInput.value = '';
      resultsEl.innerHTML = '';
      countResults.textContent = '0';

      // quitar estilos
      searchInput.classList.remove("enabled");
      searchInput.classList.remove("flash");
  }
}



  chkInscrito.addEventListener('change', ()=>{ syncNadaLogic('inscrito'); actualizarChecks(); });
  chkPrestacion.addEventListener('change', ()=>{ syncNadaLogic('prestacion'); actualizarChecks(); });
  chkNada.addEventListener('change', ()=>{ syncNadaLogic('nada'); actualizarChecks(); });

  actualizarChecks();

 
function doSearch() {
  resultsEl.innerHTML = '';
  const rawQuery = searchInput.value.trim();
  if (!rawQuery) {
    resultsEl.innerHTML = '<div class="small">Escribe una o varias palabras para buscar.</div>';
    countResults.textContent = '0';
    return;
  }

  // --- Normalización ---
  function normalize(s) {
    if (!s) return '';
    return String(s)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu,'')
      .replace(/[^\p{L}\p{N}]+/gu,' ')
      .toLowerCase()
      .trim();
  }
  

  // --- Tokenización ---
  const STOPWORDS = new Set(['a','la','el','los','las','de','del','y','o','en','por','para','con','sin','que','un','una','al','se','su','sus']);
  function tokenizeQuery(q) {
    const norm = normalize(q);
    if (!norm) return [];
    const toks = Array.from(new Set(norm.split(/\s+/).filter(Boolean)));
    const filtered = toks.filter(t => !STOPWORDS.has(t));
    const merged = [];
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i] === 'no' && filtered[i + 1] === 'autoriza') {
        merged.push('no autoriza');
        i++;
      } else {
        merged.push(filtered[i]);
      }
    }
    return merged.length > 0 ? merged : filtered;
  }



  function extractQuotedPhrases(text) {
    const quotes = [];
    for (const m of text.matchAll(/"([^"]+)"/g)) {
      quotes.push(normalize(m[1]));
    }
    const normalizedText = normalize(text);
    return { quotes, normalizedText };
  }

  const tokens = tokenizeQuery(rawQuery);
  if (tokens.length === 0) {
    resultsEl.innerHTML = '<div class="small">Escribe una o varias palabras para buscar.</div>';
    countResults.textContent = '0';
    return;
  }
  const queryNorm = normalize(rawQuery);


  
  // --- Función central de coincidencia ---
  function recordMatches(rec, tokens, queryNorm, tolerant=false) {
    const anversoRaw = getField(rec, ['ANVERSO','Anverso','anverso']) || '';
    const reversoRaw = getField(rec, ['REVERSO','Reverso','reverso']) || '';
    const combinedRaw = `${anversoRaw} ${reversoRaw}`.trim();
    const { quotes: quotedPhrases, normalizedText: combinedNorm } = extractQuotedPhrases(combinedRaw);

    // frases entre comillas
    for (const qp of quotedPhrases) {
      if (!queryNorm.includes(qp)) {
        const qpWords = qp.split(/\s+/).filter(Boolean);
        for (const tok of tokens) {
          if (qpWords.includes(tok)) return false;
        }
      }
    }

    // validar tokens
    for (const tok of tokens) {
      if (tok === 'autoriza') {
        if (!combinedNorm.includes('autoriza') || combinedNorm.includes('no autoriza')) return false;
      } else if (tok === 'no autoriza') {
        if (!combinedNorm.includes('no autoriza')) return false;
      } else if (quotedPhrases.includes(tok)) {
        continue;
      } else {
        if (tolerant) {
          if (!containsTokenTolerant(combinedNorm, tok)) return false;
        } else {
          if (!containsTokenExact(combinedNorm, tok)) return false;
        }
      }
    }

    return true;
  }

  // 0) Filtro SILA (según checks) ---
  const dbFiltrada = db
    .map((rec, idx) => ({ rec, idx }))
    .filter(x => recordPassesSilaFilters(x.rec));
  
  // 1) Filtro por Palabras_Clave (primero estricto, si no hay, tolerante)
  let kwCandidates = dbFiltrada.filter(x => keywordsMatchAll(x.rec, tokens, false));
  if (kwCandidates.length === 0) {
    kwCandidates = dbFiltrada.filter(x => keywordsMatchAll(x.rec, tokens, true));
  }

  // 2) Si hay candidatos por keywords, SOLO buscamos texto completo dentro de ellos.
  //    Si no hay candidatos, puedes decidir:
  //    - buscar en todo (como antes), o
  //    - directamente ir a sugerencias.
  //    Te propongo: si no hay kwCandidates, no restringes y sigues como antes.
  const baseParaBuscar = (kwCandidates.length > 0) ? kwCandidates : dbFiltrada;
  
  // 3) búsqueda estricta ---
  let matches = baseParaBuscar
    .map(x => recordMatches(x.rec, tokens, queryNorm, false) ? x : null)
    .filter(Boolean);
  
  // --- búsqueda tolerante ---
  if (matches.length === 0) {
    matches = baseParaBuscar
      .map(x => recordMatches(x.rec, tokens, queryNorm, true) ? x : null)
      .filter(Boolean);
  }

  const ctx = getContextoChecksSiNo();
  // --- Mostrar resultados ---
  if (matches.length === 0) {
    countResults.textContent = '0';
  
    // B1) Si el filtro de Palabras_Clave encontró filas pero el texto completo no,
    //     mostramos esas filas como sugerencias (con TODAS sus keywords)
    if (kwCandidates.length > 0) {
      renderResultsUnified({
        items: kwCandidates.slice(0, 20),
        tokens,
        mode: 'b1',
        noteHtml: `No se han encontrado coincidencias en el texto completo con el filtro aplicado, pero sí hay situaciones sugeridas por <strong>Palabras_Clave</strong>:`,
        // en B1 normalmente no necesitas resaltar hits (porque son ALL tokens), pero puedes si quieres:
        suggestion: {
          tolerantUsed: false,
          hitTokensFn: (x) => [] // o tokens si quieres marcar todo
        },
        includeHelp: true
      });
    
      logBusquedaToSheets(rawQuery, 0, ctx.cobra, ctx.inscrito);
      return;
    }
  
    // B2) Si no hubo ni siquiera candidatos por “ALL tokens” en keywords,
    //     mostramos coincidencias parciales (ANY token) como sugerencias.
    //     Primero exactas, si no hay, tolerantes.
    let kwAnyTolerantUsed = false;
    
    let kwAny = dbFiltrada.filter(x => keywordsMatchAny(x.rec, tokens, false));
    if (kwAny.length === 0) {
      kwAny = dbFiltrada.filter(x => keywordsMatchAny(x.rec, tokens, true));
      kwAnyTolerantUsed = true;
    }

    if (kwAny.length > 0) {
      renderResultsUnified({
        items: kwAny.slice(0, 20),
        tokens,
        mode: 'b2',
        noteHtml: `No hay coincidencias exactas, pero he encontrado situaciones con alguna palabra clave coincidente:`,
        suggestion: {
          tolerantUsed: kwAnyTolerantUsed,
          hitTokensFn: (x) => getMatchedTokensInKeywords(x.rec, tokens, kwAnyTolerantUsed)
        },
        includeHelp: true
      });
    
      logBusquedaToSheets(rawQuery, 0, ctx.cobra, ctx.inscrito);
      return;
    }
  
    // B3) Nada de nada
    renderResultsUnified({
      items: [],
      tokens,
      mode: 'b2',
      noteHtml: `No se han encontrado registros con el filtro aplicado.`,
      includeHelp: true
    });
    logBusquedaToSheets(rawQuery, 0, ctx.cobra, ctx.inscrito);
    return;
  }

  // --- Si hay un único resultado, abrir directamente el modal ---
  if (matches.length === 1) {
    countResults.textContent = '1';
    const único = matches[0].rec;
    // Abrimos modal
    openRecord(único);
    // Limpiamos la lista (ya que no vamos a mostrar resultados)
    resultsEl.innerHTML = '';
    logBusquedaToSheets(rawQuery, 1, ctx.cobra, ctx.inscrito);
    return; // Muy importante para que NO siga creando la lista
  }

  countResults.textContent = String(matches.length);
  logBusquedaToSheets(rawQuery, matches.length, ctx.cobra, ctx.inscrito);
  
  renderResultsUnified({
    items: matches,
    tokens,
    mode: 'normal',
    includeHelp: true
  });

}

  btnSearch.addEventListener('click', doSearch);
  
  const msgDisabled = document.getElementById('msgDisabled');
  
  searchInput.addEventListener('keydown', e => {
    if (searchInput.disabled) {
      e.preventDefault(); // evita que escriba
      
      // Mostrar mensaje
      msgDisabled.classList.add('show');
  
      // Ocultar mensaje después de 3 segundos
      setTimeout(() => {
        msgDisabled.classList.remove('show');
      }, 3000);
  
    } else if (e.key === 'Enter') {
      doSearch();
    }
  });
});
