let libheifInstance = null;

async function getLibheif() {
  if (libheifInstance) return libheifInstance;

  if (!window.libheif) {
    throw new Error('Библиотека libheif не загружена');
  }

  libheifInstance = await window.libheif();
  return libheifInstance;
}

export class HeicConverter {
  static async convert(file, options = {}) {
    const {
      format = 'jpeg',
      quality = 0.9,
      maxWidth = null,
      maxHeight = null
    } = options;

    if (!file) throw new Error('Файл не передан');

    const libheif = await getLibheif();

    const arrayBuffer = await file.arrayBuffer();
    const decoder = new libheif.HeifDecoder();
    const data = decoder.decode(arrayBuffer);

    if (!data || !data.length) {
      throw new Error('Не удалось декодировать HEIC/HEIF файл');
    }

    const image = data[0];
    const width = image.get_width();
    const height = image.get_height();

    const imageData = await new Promise((resolve, reject) => {
      const buffer = new Uint8ClampedArray(width * height * 4);
      image.display({ data: buffer, width, height }, (res) => {
        if (!res) return reject(new Error('Ошибка при чтении пикселей'));
        resolve(res);
      });
    });

    let targetWidth = width;
    let targetHeight = height;

    if (maxWidth || maxHeight) {
      const ratio = Math.min(
        maxWidth ? maxWidth / width : Infinity,
        maxHeight ? maxHeight / height : Infinity
      );
      if (ratio < 1) {
        targetWidth = Math.round(width * ratio);
        targetHeight = Math.round(height * ratio);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (targetWidth === width && targetHeight === height) {
      ctx.putImageData(new ImageData(imageData.data, width, height), 0, 0);
    } else {
      const temp = document.createElement('canvas');
      temp.width = width;
      temp.height = height;
      temp.getContext('2d').putImageData(new ImageData(imageData.data, width, height), 0, 0);
      ctx.drawImage(temp, 0, 0, targetWidth, targetHeight);
    }

    return new Promise((resolve, reject) => {
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const q = format === 'jpeg' ? quality : undefined;
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Ошибка при создании Blob'));
        resolve(blob);
      }, mime, q);
    });
  }

  static async download(file, options = {}) {
    const blob = await this.convert(file, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ext = options.format === 'png' ? 'png' : 'jpg';
    const base = file.name.replace(/\.heic$/i, '').replace(/\.heif$/i, '');
    a.href = url;
    a.download = `${base}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
