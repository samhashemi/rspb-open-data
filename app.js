(function () {
  const datasets = window.RSPB_DATASETS || [];
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const chips = document.querySelectorAll('.chip');
  // The top search bar (#q) is now wired to the Felt map in map.js.
  // The dataset grid below filters via the chip row only.

  // Format display order — nicer formats first.
  const FORMAT_ORDER = ['GeoJSON', 'CSV', 'ZIP', 'KML', 'GPKG', 'XLSX', 'GDB', 'TXT', 'ArcGIS GeoServices REST API', 'Web Page'];
  const FORMAT_LABEL = {
    'GeoJSON': 'GeoJSON',
    'CSV': 'CSV',
    'ZIP': 'Shapefile',
    'KML': 'KML',
    'GPKG': 'GeoPackage',
    'XLSX': 'Excel',
    'GDB': 'SQLite',
    'TXT': 'FeatureCollection',
    'ArcGIS GeoServices REST API': 'REST API',
    'Web Page': 'Details',
  };
  // Don't show these as download chips — they're noise on a card.
  const HIDE = new Set(['TXT', 'GDB']);

  function pickTags(ds) {
    const t = new Set();
    const hay = (ds.title + ' ' + (ds.keywords || []).join(' ')).toLowerCase();
    if (/\breserve/.test(hay)) t.add('Reserves');
    if (/seabird|gannet|guillemot|kittiwake|shag|razorbill|tern|puffin|fulmar/.test(hay)) t.add('Seabirds');
    if (/wind|energy|windfarm/.test(hay)) t.add('Wind & energy');
    if (/upland|peat|moor/.test(hay)) t.add('Uplands');
    if (/\biba\b|important bird/.test(hay)) t.add('IBAs');
    if (/persecution|raptor|bird of prey/.test(hay)) t.add('Raptor persecution');
    if (/woodland|forest/.test(hay)) t.add('Woodland');
    if (/carbon|biodiversity/.test(hay)) t.add('Carbon & biodiversity');
    if (/shore|coastal|saltmarsh/.test(hay)) t.add('Coastal');
    return [...t];
  }

  function makeCard(ds) {
    const card = document.createElement('article');
    card.className = 'card';

    const h3 = document.createElement('h3');
    const a = document.createElement('a');
    a.href = ds.landingPage || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = ds.title;
    h3.appendChild(a);
    card.appendChild(h3);

    if (ds.description) {
      const p = document.createElement('p');
      p.textContent = ds.description;
      card.appendChild(p);
    }

    const tags = pickTags(ds);
    if (tags.length) {
      const meta = document.createElement('div');
      meta.className = 'meta';
      tags.forEach(t => {
        const s = document.createElement('span');
        s.className = 'tag';
        s.textContent = t;
        meta.appendChild(s);
      });
      card.appendChild(meta);
    }

    const formats = document.createElement('div');
    formats.className = 'formats';
    const sortedKeys = Object.keys(ds.formats || {}).sort(
      (x, y) => (FORMAT_ORDER.indexOf(x) + 99) - (FORMAT_ORDER.indexOf(y) + 99)
    );
    sortedKeys.forEach((fmt, i) => {
      if (HIDE.has(fmt)) return;
      const link = document.createElement('a');
      link.className = 'fmt' + (fmt === 'GeoJSON' ? ' is-primary' : '');
      link.href = ds.formats[fmt];
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = FORMAT_LABEL[fmt] || fmt;
      formats.appendChild(link);
    });
    card.appendChild(formats);

    // For filtering
    card.dataset.search = (
      ds.title + ' ' + (ds.description || '') + ' ' + (ds.keywords || []).join(' ') + ' ' + tags.join(' ')
    ).toLowerCase();
    card.dataset.tag = tags.join('|').toLowerCase();
    return card;
  }

  function render() {
    grid.innerHTML = '';
    datasets.forEach(ds => grid.appendChild(makeCard(ds)));
    applyFilter();
  }

  let activeTag = '';
  function applyFilter() {
    let visible = 0;
    grid.querySelectorAll('.card').forEach(card => {
      const matchesTag = !activeTag || card.dataset.tag.includes(activeTag);
      card.style.display = matchesTag ? '' : 'none';
      if (matchesTag) visible++;
    });
    empty.hidden = visible !== 0;
  }

  chips.forEach(c => c.addEventListener('click', () => {
    chips.forEach(x => x.classList.remove('is-active'));
    c.classList.add('is-active');
    activeTag = c.dataset.tag.toLowerCase();
    applyFilter();
  }));

  render();
})();
