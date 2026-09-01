import * as pdfjsLib from '../../vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdf.worker.mjs';

// PDF 파일을 교체하거나 외부 스토리지 URL로 바꿀 때는 이 목록만 수정합니다.
const episodes = [
  { number: 1, title: '1화', imagePaths: Array.from({ length: 32 }, (_, index) => `../../episodes/episode-01/${String(index + 1).padStart(3, '0')}.jpg`), imageHeights: Array.from({ length: 32 }, (_, index) => index === 31 ? 6485 : 8000) },
  { number: 2, title: '2화', imagePaths: Array.from({ length: 22 }, (_, index) => `../../episodes/episode-02/${String(index + 1).padStart(3, '0')}.jpg`), imageHeights: Array.from({ length: 22 }, (_, index) => index === 21 ? 4244 : 8000) },
  { number: 3, title: '3화', imagePaths: Array.from({ length: 20 }, (_, index) => `../../episodes/episode-03/${String(index + 1).padStart(3, '0')}.jpg`), imageHeights: Array.from({ length: 20 }, (_, index) => index === 19 ? 4805 : 8000) },
];

const $ = (selector) => document.querySelector(selector);
const coverScreen = $('#cover-screen'), episodesScreen = $('#episodes-screen'), viewerScreen = $('#viewer-screen');
const pages = $('#pages'), loading = $('#loading'), error = $('#error'), viewerUI = $('#viewer-ui');
const revealMask = $('#reveal-mask');
const coverRevealMask = $('#cover-reveal-mask');
let currentIndex = 0, zoom = 1, renderId = 0, hideTimer, lastViewportWidth = window.innerWidth;

function showScreen(screen) {
  [coverScreen, episodesScreen, viewerScreen].forEach(item => item.hidden = item !== screen);
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (screen === coverScreen && coverScreen.classList.contains('is-ready')) playCoverReveal();
}
function playCoverReveal() { coverRevealMask.classList.remove('revealing'); void coverRevealMask.offsetWidth; coverRevealMask.classList.add('revealing'); }
async function preloadImage(src) {
  const image = new Image();
  image.src = src;
  try { await image.decode(); }
  catch { await new Promise((resolve) => { image.onload = image.onerror = resolve; }); }
}
async function prepareCover() {
  // 배경과 로고가 모두 준비된 뒤 표지를 한 번에 노출합니다.
  await Promise.all([preloadImage('../../assets/cover.jpg'), preloadImage('../../assets/logo.png')]);
  coverScreen.classList.remove('is-loading');
  coverScreen.classList.add('is-ready');
  requestAnimationFrame(playCoverReveal);
}
function buildEpisodeList() {
  $('#episode-list').replaceChildren(...episodes.map((episode, index) => {
    const button = document.createElement('button');
    button.className = 'episode-row';
    button.innerHTML = `<span class="episode-number">${String(episode.number).padStart(2, '0')}</span><span class="episode-name">${episode.title}</span><span class="episode-arrow">→</span>`;
    button.addEventListener('click', () => selectEpisode(index));
    return button;
  }));
}
async function openEpisodes() {
  // 목차가 대체 폰트로 한 번 나타났다 바뀌지 않도록 폰트 준비 뒤에 표시합니다.
  if (document.fonts?.ready) await document.fonts.ready;
  buildEpisodeList(); showScreen(episodesScreen);
}
function selectEpisode(index) {
  currentIndex = index;
  document.querySelectorAll('.episode-row').forEach((row, rowIndex) => row.classList.toggle('selected', rowIndex === index));
  // 선택 색상을 인지할 수 있게 짧게 보여 준 후 감상 화면으로 진입합니다.
  window.setTimeout(() => openEpisode(index), 420);
}
function updateControls() {
  const episode = episodes[currentIndex];
  $('#current-title').textContent = episode.title;
  $('#current-count').textContent = `${String(episode.number).padStart(2, '0')} / ${String(episodes.length).padStart(2, '0')}`;
  $('#prev-button').disabled = currentIndex === 0;
  $('#next-button').disabled = currentIndex === episodes.length - 1;
  $('#zoom-value').textContent = `${Math.round(zoom * 100)}%`;
}
function showUI() { viewerUI.classList.add('visible'); viewerUI.setAttribute('aria-hidden','false'); scheduleHide(); }
function hideUI() { viewerUI.classList.remove('visible'); viewerUI.setAttribute('aria-hidden','true'); }
function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideUI, 3200); }
function viewerTap(event) { if (event.target.closest('button')) return; viewerUI.classList.contains('visible') ? hideUI() : showUI(); }
function pageWidth() { return Math.min(window.innerWidth, 720) * zoom; }
function waitForImage(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
}
function revealFirstPage(token) {
  loading.hidden = true;
  requestAnimationFrame(() => {
    if (token !== renderId) return;
    pages.classList.remove('is-preparing'); pages.classList.remove('reveal');
    void revealMask.offsetWidth;
    revealMask.classList.add('revealing');
  });
}
async function openImageEpisode(episode, token) {
  for (const [index, imagePath] of episode.imagePaths.entries()) {
    if (token !== renderId) return;
    const shell = document.createElement('div'); shell.className = 'page-shell';
    const image = new Image();
    image.className = 'episode-image'; image.alt = `${episode.title} ${index + 1}페이지`;
    // 이미지가 아직 내려받아지기 전에도 높이를 확보해 스크롤 위치가 밀리지 않게 합니다.
    image.width = 1080; image.height = episode.imageHeights[index];
    image.decoding = 'async'; image.loading = index === 0 ? 'eager' : 'lazy'; image.src = imagePath;
    shell.append(image); pages.append(shell);
    if (index === 0) {
      await waitForImage(image);
      if (token !== renderId) return;
      revealFirstPage(token);
    }
  }
}
async function openEpisode(index, resetZoom = true) {
  currentIndex = index; if (resetZoom) zoom = 1; updateControls(); showScreen(viewerScreen); hideUI();
  const token = ++renderId; revealMask.classList.remove('revealing'); pages.replaceChildren(); pages.style.width = `${pageWidth()}px`; pages.classList.remove('reveal'); pages.classList.add('is-preparing');
  loading.hidden = false; error.hidden = true;
  try {
    const episode = episodes[index];
    if (episode.imagePaths) { await openImageEpisode(episode, token); return; }
    const pdf = await pdfjsLib.getDocument(episode.pdfPath).promise;
    if (token !== renderId) return;
    const targetWidth = pageWidth();
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number); if (token !== renderId) return;
      const source = page.getViewport({ scale: 1 }); const scale = targetWidth / source.width;
      const viewport = page.getViewport({ scale });
      const shell = document.createElement('div'); shell.className = 'page-shell'; shell.style.height = `${viewport.height}px`;
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); canvas.setAttribute('aria-label', `${episodes[index].title} ${number}페이지`);
      shell.append(canvas); pages.append(shell);
      await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
      shell.style.height = 'auto';
      if (number === 1) {
        revealFirstPage(token);
      }
    }
    loading.hidden = true;
  } catch (cause) {
    if (token !== renderId) return; loading.hidden = true; error.hidden = false; error.textContent = '원고를 불러오지 못했습니다.\n파일 경로를 확인해 주세요.'; console.error(cause);
  }
}
function changeZoom(delta) {
  const next = Math.max(.75, Math.min(1.5, Number((zoom + delta).toFixed(2))));
  if (next === zoom) return; zoom = next; updateControls(); openEpisode(currentIndex, false);
}
$('#start-button').addEventListener('click', openEpisodes);
document.querySelector('[data-go="cover"]').addEventListener('click', () => showScreen(coverScreen));
$('#viewer-back').addEventListener('click', openEpisodes); $('#episode-menu').addEventListener('click', openEpisodes);
$('#prev-button').addEventListener('click', () => currentIndex && openEpisode(currentIndex - 1));
$('#next-button').addEventListener('click', () => currentIndex < episodes.length - 1 && openEpisode(currentIndex + 1));
$('#zoom-in').addEventListener('click', () => changeZoom(.1)); $('#zoom-out').addEventListener('click', () => changeZoom(-.1));
viewerScreen.addEventListener('click', viewerTap); viewerUI.addEventListener('pointerdown', () => clearTimeout(hideTimer)); viewerUI.addEventListener('pointerup', scheduleHide); viewerUI.addEventListener('pointercancel', scheduleHide);
window.addEventListener('resize', () => {
  // 모바일 브라우저의 주소창이 접히고 펴질 때는 높이만 변합니다.
  // 이때 원고를 다시 열면 스크롤이 첫 페이지로 돌아가므로, 가로 폭 변화만 처리합니다.
  const widthChanged = Math.abs(window.innerWidth - lastViewportWidth) > 20;
  lastViewportWidth = window.innerWidth;
  if (!viewerScreen.hidden && widthChanged) openEpisode(currentIndex, false);
});
showScreen(coverScreen);
prepareCover();
