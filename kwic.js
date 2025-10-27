  let allHits = [];
  let totalHits = 0;
  let currentPage = 0;
  const pageSize = kwic_config.pageSize;
  const ctx_width = kwic_config.ctx_width;
  const ddc_cgi_url = kwic_config.ddc_cgi_url;

  function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  function renderPage() {
    const table = document.createElement('table');
    table.className = 'kwicTable';

    const start = currentPage * pageSize;
    const pageHits = allHits.slice(start, start + pageSize);

    pageHits.forEach((hit, index) => {
      const row = document.createElement('tr');
      row.className = (start + index) % 2 === 0 ? 'hit0' : 'hit1';
      const docId = hit.meta_?.title || '';
      const ctxHit  = hit.ctx_?.[1] || []; // actual tokens

      // to apply ctx width around flag === 1 tokens
      const matchIndexes = ctxHit
                          .map(([flag, word], i) => flag === 1 ? i : -1)
                          .filter(i => i !== -1);

      let ctxLeft = [];
      let ctxMatch = [];
      let ctxRight = [];

      if (matchIndexes.length === 0) {
        ctxHit = ctxHit;
      }
      else {
        const matchIndex = matchIndexes[0];  // first match index

        // Calculate slice window boundaries safely
        const start = Math.max(0, matchIndex - ctx_width);
        const end = Math.min(ctxHit.length, matchIndex + ctx_width + 1);

        // Slice window tokens
        const windowTokens = ctxHit.slice(start, end);

        // Relative position of match in window
        const relativeMatchIndex = matchIndex - start;

        // Split into left, match, right tokens
        ctxLeft = windowTokens.slice(0, relativeMatchIndex);
        ctxMatch = windowTokens.slice(relativeMatchIndex, relativeMatchIndex + 1);
        ctxRight = windowTokens.slice(relativeMatchIndex + 1);
        if (start > 0) {
          ctxLeft = [['', '…'], ...ctxLeft];
        }
        if (end < ctxHit.length) {
          ctxRight = [...ctxRight, ['', '…']];
        }
      }

      function renderContext(tokens) {
        return tokens.map(([flag, word]) => {
          if (flag === 1) {
            return `<span class="matchedToken1">${word}<sub>[1]</sub></span>`;
          } else if (flag === 2) {
            return `<span class="matchedToken2">${word}<sub>[2]</sub></span>`;
          } else {
            return word;
          }
        }).join(' ');
      }

      const contextHtml = `
        <span class="kwicLHS">${renderContext(ctxLeft)}</span>
        <span class="kwicKW">${renderContext(ctxMatch)}</span>
        <span class="kwicRHS">${renderContext(ctxRight)}</span>
      `;

      const docLink = `${docId}`;

      row.innerHTML = `
        <td class="dtaHitNumber">${start + index + 1}:</td>
        <td class="kwicFile dtaHitFile">[${docLink}]</td>
        <td>${contextHtml}</td>
      `;

      table.appendChild(row);
    });

    const container = document.getElementById('results');
    container.innerHTML = '';
    container.appendChild(table);

    const startHit = currentPage * pageSize + 1;
    const endHit = Math.min((currentPage + 1) * pageSize, totalHits);

    document.getElementById('total-hits').textContent =`Hits ${startHit} - ${endHit} of ${totalHits}`;
    // Disable/Enable buttons
    const prevBtn = document.querySelector('.button-prev');
    const nextBtn = document.querySelector('.button-next');
    const maxPage = Math.floor((allHits.length - 1) / pageSize);

    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = currentPage >= maxPage;
  }

  async function loadResults(query = null) {
    const q = query || getQueryParam('q');
    if (!q) {
      document.getElementById('results').innerHTML = '<p>No query provided.</p>';
      return;
    }
    document.getElementById('query-text').value = decodeURIComponent(q);

    const apiUrl = `${ddc_cgi_url}?q=${encodeURIComponent(q)}`;

    try {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      allHits = data.hits_ || [];
      totalHits = data.nhits_ || allHits.length; // total hits count

      if (allHits.length === 0) {
        document.getElementById('results').innerHTML = '<p>No results found.</p>';
        return;
      }

      currentPage = 0;
      renderPage();

    } catch (e) {
      document.getElementById('results').innerHTML = `<p>Error loading results: ${e.message}</p>`;
    }
  }

  // Add listeners after DOM is ready
  window.onload = function () {
    loadResults();
    document.getElementById('page-title').textContent = `DDC/${kwic_config.corpusName} Search`;
    const prevBtn = document.querySelector('.button-prev');
    const nextBtn = document.querySelector('.button-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 0) {
          currentPage--;
          renderPage();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const maxPage = Math.floor((allHits.length - 1) / pageSize);
        if (currentPage < maxPage) {
          currentPage++;
          renderPage();
        }
      });
    }
  };

  document.querySelector('.button-submit').addEventListener('click', () => {
  const newQuery = document.getElementById('query-text').value.trim();

  if (newQuery) {
    // Update URL parameter without reloading the page
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('q', newQuery);
    window.history.replaceState({}, '', newUrl);

    // Call loadResults with new query
    loadResults(newQuery);
  }
});