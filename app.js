import * as pdfjsLib from './vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';

// PDF 파일을 교체하거나 외부 스토리지 URL로 바꿀 때는 이 목록만 수정합니다.
const episodes = [
  { number: 1, title: '1화', pdfPath: 'episodes/episode-01.pdf' },
  { number: 2, title: '2화', pdfPath: 'episodes/episode-02.pdf' },
  { number: 3, title: '3화', pdfPath: 'episodes/episode-03.pdf' },
];

const $ = (selector) => document.querySelector(selector);
const coverScreen = $('#cover-screen'), episodesScreen = $('#episodes-screen'), viewerScreen = $('#viewer-screen');
const pages = $('#pages'), loading = $('#loading'), error = $('#error'), viewerUI = $('#viewer-ui');
const revealMask = $('#reveal-mask');
const coverRevealMask = $('#cover-reveal-mask');
let currentIndex = 0, zoom = 1, renderId = 0, hideTimer;

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
  await Promise.all([preloadImage('assets/cover.jpg'), preloadImage('assets/logo.png')]);
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
function openEpisodes() { buildEpisodeList(); showScreen(episodesScreen); }
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
async function openEpisode(index, resetZoom = true) {
  currentIndex = index; if (resetZoom) zoom = 1; updateControls(); showScreen(viewerScreen); hideUI();
  const token = ++renderId; revealMask.classList.remove('revealing'); pages.replaceChildren(); pages.style.width = `${pageWidth()}px`; pages.classList.remove('reveal'); pages.classList.add('is-preparing');
  loading.hidden = false; error.hidden = true;
  try {
    const pdf = await pdfjsLib.getDocument(episodes[index].pdfPath).promise;
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
        loading.hidden = true;
        requestAnimationFrame(() => {
          if (token !== renderId) return;
          pages.classList.remove('is-preparing'); pages.classList.remove('reveal');
          // 검정 레이어가 상단부터 아래로 열리며 첫 원고를 드러냅니다.
          void revealMask.offsetWidth;
          revealMask.classList.add('revealing');
        });
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
window.addEventListener('resize', () => { if (!viewerScreen.hidden) openEpisode(currentIndex, false); });
showScreen(coverScreen);
prepareCover();
