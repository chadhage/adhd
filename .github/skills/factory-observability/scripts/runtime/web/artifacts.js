export function createArtifactLibrary({ api, element }) {
  const $ = (id) => document.getElementById(id);
  const state = { offset: 0, next: null, selected: null, revision: 'working', position: 0, history: [], nextPosition: null };
  let listRequest = 0;
  let detailRequest = 0;
  let previewRequest = 0;
  let searchTimer;
  let loading = false;

  function error(message) {
    $('artifacts-error').textContent = message;
    $('artifacts-error').hidden = !message;
  }

  function downloadLink(enabled) {
    const link = $('artifact-download');
    link.setAttribute('aria-disabled', String(!enabled));
    if (enabled) link.href = `/api/v1/artifacts/${state.selected}/download?${new URLSearchParams({ revision: state.revision })}`;
    else link.removeAttribute('href');
  }

  async function preview() {
    const request = ++previewRequest;
    const id = state.selected;
    $('artifact-preview').textContent = '';
    $('artifact-preview-status').textContent = 'Loading a sanitized text section...';
    downloadLink(false);
    $('artifact-next-section').disabled = true;
    $('artifact-previous-section').disabled = true;
    try {
      const data = await api(`/api/v1/artifacts/${id}/content`, { revision: state.revision, offset: state.position });
      if (request !== previewRequest || id !== state.selected) return;
      state.nextPosition = data.next_offset;
      $('artifact-preview').textContent = data.content;
      $('artifact-preview-status').textContent = `UTF-8 bytes ${data.offset}–${data.next_offset ?? data.total_preview_bytes} of ${data.total_preview_bytes}. ${data.sanitized ? 'Sanitized/redacted text; not original bytes.' : 'No text transformations detected.'}`;
      $('artifact-hash').textContent = `Original SHA-256: ${data.original_sha256}`;
      $('artifact-next-section').disabled = data.next_offset === null;
      $('artifact-previous-section').disabled = !state.history.length;
      $('artifact-download').textContent = 'Download sanitized text';
      downloadLink(true);
    } catch (failure) {
      if (request !== previewRequest || id !== state.selected) return;
      $('artifact-preview-status').textContent = failure.message;
      $('artifact-hash').textContent = '';
      if (failure.status === 415) {
        $('artifact-download').textContent = 'Download untrusted file';
        downloadLink(true);
      }
    }
  }

  async function select(id) {
    const request = ++detailRequest;
    state.selected = id;
    previewRequest += 1;
    $('artifact-empty-selection').hidden = true;
    $('artifact-reader').hidden = false;
    $('artifact-title').textContent = 'Loading artifact...';
    $('artifact-path').textContent = '';
    $('artifact-access').textContent = '';
    $('artifact-provenance').textContent = '';
    $('artifact-version').disabled = true;
    $('artifact-previous-section').disabled = true;
    $('artifact-next-section').disabled = true;
    $('artifact-preview').textContent = '';
    $('artifact-preview-status').textContent = '';
    $('artifact-hash').textContent = '';
    downloadLink(false);
    try {
      const data = await api(`/api/v1/artifacts/${id}`);
      if (request !== detailRequest) return;
      const artifact = data.artifact;
      $('artifact-title').textContent = artifact.title;
      $('artifact-path').textContent = artifact.path;
      $('artifact-access').textContent = data.content_access;
      $('artifact-provenance').textContent = JSON.stringify(data, null, 2);
      $('artifact-version').replaceChildren(...data.versions.map((revision) => {
        const option = element('option', revision === 'working' ? 'Current working file (may be uncommitted)' : `${revision} / recorded commit`);
        option.value = revision;
        return option;
      }));
      state.revision = 'working';
      state.position = 0;
      state.history = [];
      $('artifact-version').disabled = !artifact.cataloged;
      $('artifact-previous-section').disabled = true;
      $('artifact-next-section').disabled = true;
      if (artifact.cataloged) await preview();
      else $('artifact-preview-status').textContent = 'This output was reported by the Factory, but its path is not in the reviewed content catalog. The designated catalog writer must register it before the viewer can read it.';
      for (const button of $('artifact-list').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.artifactId === id));
    } catch (failure) {
      if (request === detailRequest) {
        $('artifact-title').textContent = 'Artifact unavailable';
        $('artifact-preview-status').textContent = failure.message;
      }
    }
  }

  async function refresh() {
    const request = ++listRequest;
    loading = true;
    $('artifacts-status').textContent = 'Refreshing the Factory artifact inventory...';
    const query = { offset: state.offset, limit: 50 };
    if ($('artifact-search').value.trim()) query.q = $('artifact-search').value.trim();
    if ($('artifact-category').value) query.category = $('artifact-category').value;
    try {
      const data = await api('/api/v1/artifacts', query);
      if (request !== listRequest) return;
      state.next = data.next_offset;
      const focused = document.activeElement?.dataset?.artifactId;
      $('artifact-list').replaceChildren(...data.artifacts.map((artifact) => {
        const row = element('li');
        const button = element('button', undefined, 'artifact-row');
        button.type = 'button';
        button.dataset.artifactId = artifact.id;
        button.setAttribute('aria-pressed', String(artifact.id === state.selected));
        button.append(
          element('span', artifact.title, 'entity-title'),
          element('span', artifact.path, 'entity-subtitle mono'),
          element('span', `${artifact.category} / ${artifact.cataloged ? 'Cataloged' : 'Reported only'} / ${artifact.recorded_versions} recorded versions`, 'entity-subtitle'),
        );
        button.addEventListener('click', () => select(artifact.id));
        row.append(button);
        return row;
      }));
      if (focused) [...$('artifact-list').querySelectorAll('button')].find((button) => button.dataset.artifactId === focused)?.focus({ preventScroll: true });
      $('artifacts-empty').hidden = data.artifacts.length > 0;
      $('artifacts-status').textContent = `${data.total} matching artifacts / showing ${state.offset + (data.artifacts.length ? 1 : 0)}–${state.offset + data.artifacts.length}.`;
      $('artifacts-coverage').textContent = `Catalog ${data.catalog.status}; ${data.coverage.cataloged} cataloged, ${data.coverage.reported_only} reported-only, ${data.coverage.excluded_unsafe_reports} unsafe reports excluded. This is not a repository scan or proof of complete capture.`;
      $('artifacts-previous').disabled = state.offset === 0;
      $('artifacts-next').disabled = data.next_offset === null;
      error(data.coverage.ingestion_errors.map((entry) => `${entry.file}: ${entry.error}`).join(' / '));
    } catch (failure) {
      if (request === listRequest) {
        error(`Artifact inventory unavailable: ${failure.message}`);
        $('artifacts-status').textContent = 'Inventory could not be refreshed. Any displayed rows may be stale.';
      }
    } finally { if (request === listRequest) loading = false; }
  }

  $('artifact-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.offset = 0; refresh(); }, 200);
  });
  $('artifact-category').addEventListener('change', () => { state.offset = 0; refresh(); });
  $('artifacts-refresh').addEventListener('click', refresh);
  $('artifacts-previous').addEventListener('click', () => { state.offset = Math.max(0, state.offset - 50); refresh(); });
  $('artifacts-next').addEventListener('click', () => { state.offset = state.next; refresh(); });
  $('artifact-version').addEventListener('change', () => {
    state.revision = $('artifact-version').value;
    state.position = 0;
    state.history = [];
    preview();
  });
  $('artifact-next-section').addEventListener('click', () => {
    state.history.push(state.position);
    state.position = state.nextPosition;
    preview();
  });
  $('artifact-previous-section').addEventListener('click', () => {
    state.position = state.history.pop();
    preview();
  });
  const timer = setInterval(() => {
    if (!loading && !$('artifacts-view').hidden && document.visibilityState === 'visible') refresh();
  }, 5000);
  return { refresh, stop() { clearTimeout(searchTimer); clearInterval(timer); } };
}
