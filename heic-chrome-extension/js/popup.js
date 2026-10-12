import { HeicConverter } from './heicConverter.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const convertBtn = document.getElementById('convertBtn');
const formatSelect = document.getElementById('format');
const qualityRow = document.getElementById('qualityRow');
const qualityRange = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const resizeCheck = document.getElementById('resizeCheck');
const resizeRow = document.getElementById('resizeRow');
const maxWidth = document.getElementById('maxWidth');
const maxHeight = document.getElementById('maxHeight');
const results = document.getElementById('results');

let files = [];

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFiles);

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('active');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('active');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('active');
  handleFiles({ target: { files: e.dataTransfer.files } });
});

formatSelect.addEventListener('change', () => {
  qualityRow.style.display = formatSelect.value === 'jpeg' ? 'flex' : 'none';
  qualityRow.style.flexDirection = formatSelect.value === 'jpeg' ? 'column' : 'row';
  qualityRow.style.alignItems = formatSelect.value === 'jpeg' ? 'stretch' : 'center';
});

qualityRange.addEventListener('input', () => {
  qualityValue.textContent = Math.round(qualityRange.value * 100) + '%';
});

resizeCheck.addEventListener('change', () => {
  resizeRow.classList.toggle('hidden', !resizeCheck.checked);
});

function handleFiles(e) {
  const selected = Array.from(e.target.files).filter((f) => {
    const name = f.name.toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif');
  });

  if (selected.length === 0) {
    alert('Выбери файлы с расширением .HEIC или .HEIF');
    return;
  }

  files = selected;
  renderList();
  convertBtn.disabled = false;
}

function renderList() {
  results.innerHTML = '';
  files.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="result-name" title="${file.name}">${file.name}</div>
      <div class="result-meta">${(file.size / 1024 / 1024).toFixed(2)} МБ</div>
      <div class="status" id="status-${idx}">Ожидает</div>
    `;
    results.appendChild(item);
  });
}

convertBtn.addEventListener('click', async () => {
  convertBtn.disabled = true;
  convertBtn.textContent = 'Конвертация...';

  const format = formatSelect.value;
  const quality = parseFloat(qualityRange.value);
  const useResize = resizeCheck.checked;
  const mw = useResize && maxWidth.value ? parseInt(maxWidth.value) : null;
  const mh = useResize && maxHeight.value ? parseInt(maxHeight.value) : null;

  for (let i = 0; i < files.length; i++) {
    const el = document.getElementById(`status-${i}`);
    el.textContent = 'Конвертирую...';
    el.classList.add('processing');
    try {
      await HeicConverter.download(files[i], {
        format,
        quality,
        maxWidth: mw,
        maxHeight: mh
      });
      el.textContent = 'Скачано ✓';
      el.classList.remove('processing');
      el.classList.add('done');
    } catch (err) {
      console.error(err);
      el.textContent = 'Ошибка ✗';
      el.classList.remove('processing');
      el.classList.add('error');
    }
  }

  convertBtn.disabled = false;
  convertBtn.textContent = 'Конвертировать все';
});
