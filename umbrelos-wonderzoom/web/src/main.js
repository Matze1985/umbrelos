import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import './style.css';

const root = document.querySelector('#app');
root.innerHTML = `
  <header class="top">
    <div class="brand"><div class="mark">W</div><div><b>WonderZoom</b><small>AMD Viewer Edition · umbrelOS</small></div></div>
    <span class="pill"><i></i> Browser-GPU Rendering</span>
  </header>
  <main>
    <section class="intro">
      <div><p class="eyebrow">3D SCENE EXPLORER</p><h1>Erkunde deine<br><em>3D-Welten.</em></h1>
      <p class="sub">Lade eine Gaussian-Splat-Szene hoch und erkunde sie direkt im Browser. Die Radeon-GPU des Anzeigegeräts übernimmt das Rendering – der Server braucht kein CUDA.</p></div>
      <div class="upload" id="drop">
        <div class="uploadIcon">＋</div><b>Szene hier ablegen</b><span>.splat · .spz · .ply · .ksplat</span>
        <label class="choose">Datei auswählen<input id="file" type="file" accept=".splat,.spz,.ply,.ksplat"></label>
      </div>
    </section>
    <section class="workspace">
      <div class="viewerHead"><div><b>3D-Ansicht</b><small id="viewerStatus">Noch keine Szene geladen</small></div><button id="reset" class="ghost">Ansicht zurücksetzen</button></div>
      <div id="viewer" class="viewer"><div class="empty"><div class="cube">◇</div><b>Deine Szene wartet</b><span>Wähle eine gespeicherte Szene oder lade eine Datei hoch.</span></div></div>
      <div class="controls"><span>Linke Maustaste: Blick drehen</span><span>Rechte Maustaste: Verschieben</span><span>Scrollrad: Zoomen</span><span>W/A/S/D: Bewegen</span></div>
    </section>
    <section class="library">
      <div class="libraryHead"><div><p class="eyebrow">DEINE SAMMLUNG</p><h2>Gespeicherte Szenen</h2></div><button id="refresh" class="ghost">Aktualisieren ↻</button></div>
      <div id="scenes" class="sceneGrid"><p class="muted">Lade Szenen …</p></div>
    </section>
    <footer><span>WonderZoom Viewer Edition</span><span>Keine KI-Generierung · lokale Szenenverwaltung</span></footer>
  </main>
  <div id="toast" role="status"></div>
`;

const viewerEl = document.querySelector('#viewer');
const statusEl = document.querySelector('#viewerStatus');
const toastEl = document.querySelector('#toast');
let viewer = null;
let currentObjectUrl = null;
let activeName = '';

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3500);
}
function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n/1024**2).toFixed(1)} MB`;
  return `${(n/1024**3).toFixed(2)} GB`;
}
function resetViewer() {
  if (viewer) {
    try { viewer.stop(); viewer.dispose(); } catch {}
    viewer = null;
  }
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
  viewerEl.innerHTML = '<div class="empty"><div class="cube">◇</div><b>Deine Szene wartet</b><span>Wähle eine gespeicherte Szene oder lade eine Datei hoch.</span></div>';
  statusEl.textContent = 'Noch keine Szene geladen';
  activeName = '';
}
async function showScene(url, name) {
  resetViewer();
  viewerEl.innerHTML = '<div class="loading">3D-Szene wird geladen …</div>';
  statusEl.textContent = name;
  activeName = name;
  try {
    viewer = new GaussianSplats3D.Viewer({
      rootElement: viewerEl,
      cameraUp: [0, -1, 0],
      initialCameraPosition: [0, 0, 5],
      initialCameraLookAt: [0, 0, 0],
      sharedMemoryForWorkers: false,
      useBuiltInControls: true,
      gpuAcceleratedSort: true
    });
    await viewer.addSplatScene(url, {
      showLoadingUI: true,
      splatAlphaRemovalThreshold: 5,
      progressiveLoad: true
    });
    viewer.start();
    statusEl.textContent = `Geladen: ${name}`;
  } catch (e) {
    resetViewer();
    statusEl.textContent = 'Laden fehlgeschlagen';
    toast(`Viewer-Fehler: ${e.message}`);
    console.error(e);
  }
}
async function refreshScenes() {
  const box = document.querySelector('#scenes');
  try {
    const scenes = await fetch('/api/scenes').then(r => r.json());
    if (!scenes.length) {
      box.innerHTML = '<p class="muted">Noch keine Szenen gespeichert. Lade oben eine .splat-, .spz- oder .ply-Datei hoch.</p>';
      return;
    }
    box.innerHTML = scenes.map(s => `<article class="scene" data-name="${encodeURIComponent(s.name)}">
      <div class="sceneIcon">◈</div><div class="sceneInfo"><b title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</b><small>${bytes(s.size)}</small></div>
      <button class="open">Öffnen</button><button class="delete" title="Löschen" aria-label="Löschen">×</button>
    </article>`).join('');
    box.querySelectorAll('.scene').forEach(card => {
      const name = decodeURIComponent(card.dataset.name);
      const scene = scenes.find(s => s.name === name);
      card.querySelector('.open').addEventListener('click', () => showScene(scene.url, name));
      card.querySelector('.delete').addEventListener('click', async () => {
        if (!confirm(`Szene "${name}" wirklich löschen?`)) return;
        const r = await fetch(`/api/scenes/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (r.ok) { if (activeName === name) resetViewer(); refreshScenes(); toast('Szene gelöscht.'); }
        else toast('Löschen fehlgeschlagen.');
      });
    });
  } catch { box.innerHTML = '<p class="muted">Szenenliste konnte nicht geladen werden.</p>'; }
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function upload(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (!['splat','spz','ply','ksplat'].includes(ext)) return toast('Format nicht unterstützt.');
  const data = new FormData();
  data.append('scene', file);
  toast('Upload läuft …');
  const response = await fetch('/api/scenes', { method: 'POST', body: data });
  const result = await response.json();
  if (!response.ok) return toast(result.error || 'Upload fehlgeschlagen.');
  await refreshScenes();
  showScene(`/scenes/${encodeURIComponent(result.name)}`, result.name);
  toast('Szene gespeichert.');
}
document.querySelector('#file').addEventListener('change', e => {
  if (e.target.files[0]) upload(e.target.files[0]);
  e.target.value = '';
});
const drop = document.querySelector('#drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('drag');
  if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
});
document.querySelector('#refresh').addEventListener('click', refreshScenes);
document.querySelector('#reset').addEventListener('click', () => {
  if (viewer && viewer.resetCamera) viewer.resetCamera();
  else resetViewer();
});
refreshScenes();
